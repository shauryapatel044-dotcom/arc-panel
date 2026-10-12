/**
 * Arc Panel Daemon — File Management Routes
 *
 * All paths are rooted at: DATA_DIR/servers/:serverId/data/
 *
 * GET    /api/files/:serverId              — list directory
 * POST   /api/files/:serverId/upload       — upload file(s)
 * GET    /api/files/:serverId/download     — download (stream) a file
 * DELETE /api/files/:serverId              — delete file or directory
 * PATCH  /api/files/:serverId/rename       — rename / move
 * POST   /api/files/:serverId/decompress   — extract zip or tar archive
 * GET    /api/files/:serverId/content      — get text content (editor)
 * PUT    /api/files/:serverId/content      — write text content (editor)
 */

import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { promisify } from 'util';
import { exec } from 'child_process';
import unzipper from 'unzipper';
import tar from 'tar';
import { config } from '../config';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);
const router = Router();

// ── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Resolve the absolute path for a server's data root.
 */
function serverDataRoot(serverId: string): string {
  return path.join(config.dataDir, 'servers', serverId, 'data');
}

/**
 * Safely resolve a user-supplied relative path inside the server data root.
 * Prevents path-traversal attacks by ensuring the resolved path stays within
 * the server data directory.
 */
function safePath(serverId: string, relativePath: string = '/'): string {
  const root = serverDataRoot(serverId);
  // Normalise the user path — strip leading slashes / dots
  const normalised = path.normalize('/' + relativePath).replace(/\\/g, '/');
  const resolved = path.join(root, normalised);

  if (!resolved.startsWith(root)) {
    throw new Error(`Path traversal detected: ${relativePath}`);
  }
  return resolved;
}

// ── Multer — disk storage configured per-request ─────────────────────────────
//
// We use a factory so each upload knows which server dir to use.
function createUploadMiddleware(destDir: string): multer.Multer {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, destDir),
    filename: (_req, file, cb) => cb(null, file.originalname),
  });
  return multer({ storage });
}

// ── GET /api/files/:serverId — list directory ────────────────────────────────
router.get('/:serverId', (req: Request, res: Response) => {
  const { serverId } = req.params;
  const relativePath = (req.query['path'] as string) ?? '/';

  let target: string;
  try {
    target = safePath(serverId, relativePath);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }

  if (!fs.existsSync(target)) {
    return res.status(404).json({ error: `Path not found: ${relativePath}` });
  }

  const stat = fs.statSync(target);
  if (!stat.isDirectory()) {
    return res.status(400).json({ error: 'Path is not a directory' });
  }

  try {
    const entries = fs.readdirSync(target, { withFileTypes: true });
    const files = entries.map((entry) => {
      const entryPath = path.join(target, entry.name);
      const entryStat = fs.statSync(entryPath);
      return {
        name: entry.name,
        size: entryStat.size,
        isDirectory: entry.isDirectory(),
        modifiedAt: entryStat.mtime.toISOString(),
        permissions: (entryStat.mode & 0o777).toString(8),
      };
    });

    // Directories first, then files — alphabetical within each group.
    files.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ path: relativePath, files });
  } catch (err) {
    logger.error(`GET /files/${serverId} error`, { err });
    res.status(500).json({ error: 'Failed to list directory' });
  }
});

// ── POST /api/files/:serverId/upload — upload file(s) ───────────────────────
router.post('/:serverId/upload', (req: Request, res: Response) => {
  const { serverId } = req.params;
  const relativePath = (req.query['path'] as string) ?? '/';

  let destDir: string;
  try {
    destDir = safePath(serverId, relativePath);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }

  // Ensure destination directory exists.
  fs.mkdirSync(destDir, { recursive: true });

  const upload = createUploadMiddleware(destDir);
  upload.array('files')(req, res, (err) => {
    if (err) {
      logger.error(`Upload error for server ${serverId}`, { err });
      return res.status(500).json({ error: 'Upload failed', message: (err as Error).message });
    }

    const files = (req.files as Express.Multer.File[]) ?? [];
    logger.info(`Uploaded ${files.length} file(s) to server ${serverId}:${relativePath}`);
    res.json({
      uploaded: files.map((f) => ({ name: f.originalname, size: f.size })),
    });
  });
});

// ── GET /api/files/:serverId/download — stream file ─────────────────────────
router.get('/:serverId/download', (req: Request, res: Response) => {
  const { serverId } = req.params;
  const relativePath = (req.query['path'] as string) ?? '';

  if (!relativePath) {
    return res.status(400).json({ error: 'path query parameter is required' });
  }

  let filePath: string;
  try {
    filePath = safePath(serverId, relativePath);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.download(filePath, path.basename(filePath), (err) => {
    if (err) {
      logger.error(`Download error for server ${serverId}`, { err });
    }
  });
});

// ── DELETE /api/files/:serverId — delete file or directory ──────────────────
router.delete('/:serverId', (req: Request, res: Response) => {
  const { serverId } = req.params;
  const { path: relativePath } = req.body as { path: string };

  if (!relativePath) {
    return res.status(400).json({ error: 'path body field is required' });
  }

  let target: string;
  try {
    target = safePath(serverId, relativePath);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }

  if (path.basename(target).toLowerCase() === 'server.jar') {
    return res.status(403).json({
      error:
        'server.jar is a protected core binary and cannot be deleted. Use Reinstall Server in Settings to switch versions.',
    });
  }

  if (!fs.existsSync(target)) {
    return res.status(404).json({ error: 'Path not found' });
  }

  try {
    fs.rmSync(target, { recursive: true, force: true });
    logger.info(`Deleted ${target} for server ${serverId}`);
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    logger.error(`Delete error for server ${serverId}`, { err });
    res.status(500).json({ error: 'Failed to delete', message: (err as Error).message });
  }
});

// ── PATCH /api/files/:serverId/rename — rename / move ───────────────────────
router.patch('/:serverId/rename', (req: Request, res: Response) => {
  const { serverId } = req.params;
  const { from, to } = req.body as { from: string; to: string };

  if (!from || !to) {
    return res.status(400).json({ error: 'from and to body fields are required' });
  }

  let fromPath: string, toPath: string;
  try {
    fromPath = safePath(serverId, from);
    toPath = safePath(serverId, to);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }

  if (
    path.basename(fromPath).toLowerCase() === 'server.jar' ||
    path.basename(toPath).toLowerCase() === 'server.jar'
  ) {
    return res.status(403).json({
      error: 'server.jar is a protected core binary and cannot be renamed.',
    });
  }

  if (!fs.existsSync(fromPath)) {
    return res.status(404).json({ error: `Source not found: ${from}` });
  }

  try {
    fs.renameSync(fromPath, toPath);
    logger.info(`Renamed ${from} → ${to} for server ${serverId}`);
    res.json({ message: 'Renamed successfully' });
  } catch (err) {
    logger.error(`Rename error for server ${serverId}`, { err });
    res.status(500).json({ error: 'Failed to rename', message: (err as Error).message });
  }
});

// ── POST /api/files/:serverId/decompress — extract archive ──────────────────
router.post('/:serverId/decompress', async (req: Request, res: Response) => {
  const { serverId } = req.params;
  const { path: relativePath } = req.body as { path: string };

  if (!relativePath) {
    return res.status(400).json({ error: 'path body field is required' });
  }

  let archivePath: string;
  try {
    archivePath = safePath(serverId, relativePath);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }

  if (!fs.existsSync(archivePath)) {
    return res.status(404).json({ error: 'Archive not found' });
  }

  const destDir = path.dirname(archivePath);
  const ext = archivePath.toLowerCase();

  try {
    if (ext.endsWith('.zip')) {
      // Use unzipper for .zip files
      await fs
        .createReadStream(archivePath)
        .pipe(unzipper.Extract({ path: destDir }))
        .promise();
    } else if (ext.endsWith('.tar.gz') || ext.endsWith('.tgz')) {
      // Use tar library for .tar.gz / .tgz
      await tar.x({ file: archivePath, cwd: destDir });
    } else if (ext.endsWith('.tar')) {
      await tar.x({ file: archivePath, cwd: destDir });
    } else {
      // Fallback: try system unzip / tar
      if (ext.endsWith('.zip')) {
        await execAsync(`unzip -o "${archivePath}" -d "${destDir}"`);
      } else {
        await execAsync(`tar -xf "${archivePath}" -C "${destDir}"`);
      }
    }

    logger.info(`Extracted ${relativePath} for server ${serverId}`);
    res.json({ message: 'Extracted successfully', path: relativePath });
  } catch (err) {
    logger.error(`Decompress error for server ${serverId}`, { err });
    res.status(500).json({ error: 'Failed to extract archive', message: (err as Error).message });
  }
});

// ── GET /api/files/:serverId/content — read text file (editor) ──────────────
router.get('/:serverId/content', (req: Request, res: Response) => {
  const { serverId } = req.params;
  const relativePath = (req.query['path'] as string) ?? '';

  if (!relativePath) {
    return res.status(400).json({ error: 'path query parameter is required' });
  }

  let filePath: string;
  try {
    filePath = safePath(serverId, relativePath);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  if (fs.statSync(filePath).isDirectory()) {
    return res.status(400).json({ error: 'Path is a directory, not a file' });
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ path: relativePath, content });
  } catch (err) {
    logger.error(`Read content error for server ${serverId}`, { err });
    res.status(500).json({ error: 'Failed to read file', message: (err as Error).message });
  }
});

// ── PUT /api/files/:serverId/content — write text file (editor) ─────────────
router.put('/:serverId/content', (req: Request, res: Response) => {
  const { serverId } = req.params;
  const { path: relativePath, content } = req.body as { path: string; content: string };

  if (!relativePath) {
    return res.status(400).json({ error: 'path body field is required' });
  }
  if (content === undefined || content === null) {
    return res.status(400).json({ error: 'content body field is required' });
  }

  let filePath: string;
  try {
    filePath = safePath(serverId, relativePath);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }

  try {
    // Create parent directories if they don't exist.
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    logger.info(`Wrote content to ${relativePath} for server ${serverId}`);
    res.json({ message: 'File saved', path: relativePath });
  } catch (err) {
    logger.error(`Write content error for server ${serverId}`, { err });
    res.status(500).json({ error: 'Failed to write file', message: (err as Error).message });
  }
});

export default router;
