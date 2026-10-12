/**
 * Arc Panel Daemon — Backup Management Routes
 *
 * GET    /api/backups/:serverId                       — list backups
 * POST   /api/backups/:serverId                       — create a new backup (tar+gzip)
 * GET    /api/backups/:serverId/:name/download        — stream backup file
 * POST   /api/backups/:serverId/:name/restore         — restore from backup
 * DELETE /api/backups/:serverId/:name                 — delete a backup
 */

import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import tar from 'tar';
import { config } from '../config';
import { serverStore } from '../utils/serverStore';
import { dockerService } from '../docker/DockerService';
import { logger } from '../utils/logger';

const router = Router();

// ── Path helpers ──────────────────────────────────────────────────────────────

/** Directory where a server's data lives on the host. */
function serverDataDir(serverId: string): string {
  return path.join(config.dataDir, 'servers', serverId, 'data');
}

/** Directory where a server's backups are stored. */
function backupDir(serverId: string): string {
  return path.join(config.backupDir, serverId);
}

/** Generate a timestamped archive name: 2024-07-10T14-35-00.tar.gz */
function timestampedName(): string {
  return `${new Date().toISOString().replace(/[:.]/g, '-')}.tar.gz`;
}

// ── GET /api/backups/:serverId — list backups ──────────────────────────────
router.get('/:serverId', (req: Request, res: Response) => {
  const { serverId } = req.params;
  const dir = backupDir(serverId);

  if (!fs.existsSync(dir)) {
    return res.json({ backups: [] });
  }

  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.tar.gz'))
      .map((name) => {
        const filePath = path.join(dir, name);
        const stat = fs.statSync(filePath);
        return {
          name,
          size: stat.size,
          createdAt: stat.birthtime.toISOString(),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)); // newest first

    res.json({ backups: files });
  } catch (err) {
    logger.error(`GET /backups/${serverId} error`, { err });
    res.status(500).json({ error: 'Failed to list backups' });
  }
});

// ── POST /api/backups/:serverId — create backup ────────────────────────────
router.post('/:serverId', async (req: Request, res: Response) => {
  const { serverId } = req.params;
  const dataDir = serverDataDir(serverId);
  const dest = backupDir(serverId);

  if (!fs.existsSync(dataDir)) {
    return res.status(404).json({ error: `Server data directory not found for: ${serverId}` });
  }

  // Ensure the backup destination directory exists.
  fs.mkdirSync(dest, { recursive: true });

  const archiveName = timestampedName();
  const archivePath = path.join(dest, archiveName);

  try {
    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(archivePath);
      const archive = archiver('tar', { gzip: true, gzipOptions: { level: 6 } });

      output.on('close', resolve);
      archive.on('error', reject);

      archive.pipe(output);
      // Archive the entire data directory, placing it under "data/" in the archive.
      archive.directory(dataDir, 'data');
      archive.finalize();
    });

    const stat = fs.statSync(archivePath);
    logger.info(`Backup created: ${archivePath} (${stat.size} bytes)`);

    res.status(201).json({
      name: archiveName,
      size: stat.size,
      createdAt: stat.birthtime.toISOString(),
    });
  } catch (err) {
    // Clean up partial archive on failure.
    if (fs.existsSync(archivePath)) {
      fs.unlinkSync(archivePath);
    }
    logger.error(`POST /backups/${serverId} error`, { err });
    res.status(500).json({ error: 'Failed to create backup', message: (err as Error).message });
  }
});

// ── GET /api/backups/:serverId/:name/download — stream backup ─────────────
router.get('/:serverId/:name/download', (req: Request, res: Response) => {
  const { serverId, name } = req.params;

  // Basic name validation — prevent path traversal.
  if (!name.endsWith('.tar.gz') || name.includes('/') || name.includes('..')) {
    return res.status(400).json({ error: 'Invalid backup name' });
  }

  const filePath = path.join(backupDir(serverId), name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Backup not found' });
  }

  res.download(filePath, name, (err) => {
    if (err) logger.error(`Backup download error for ${serverId}/${name}`, { err });
  });
});

// ── POST /api/backups/:serverId/:name/restore — restore backup ────────────
router.post('/:serverId/:name/restore', async (req: Request, res: Response) => {
  const { serverId, name } = req.params;

  if (!name.endsWith('.tar.gz') || name.includes('/') || name.includes('..')) {
    return res.status(400).json({ error: 'Invalid backup name' });
  }

  const filePath = path.join(backupDir(serverId), name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Backup not found' });
  }

  const meta = serverStore.get(serverId);
  const dataDir = serverDataDir(serverId);

  try {
    // 1. Stop the container if it exists and is running.
    if (meta) {
      try {
        const state = await dockerService.getContainerState(meta.containerId);
        if (state.Running) {
          await dockerService.getContainer(meta.containerId).stop({ t: 10 });
          logger.info(`Stopped container ${meta.containerId} for restore`);
        }
      } catch {
        // Container might not exist — that's OK.
      }
    }

    // 2. Clear existing data directory.
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
    fs.mkdirSync(dataDir, { recursive: true });

    // 3. Extract the backup.
    //    The archive has a top-level "data/" directory matching what was packed.
    await tar.x({
      file: filePath,
      cwd: path.join(config.dataDir, 'servers', serverId),
      // Strip the top-level "data/" prefix so files land directly in dataDir
      strip: 1,
    });

    logger.info(`Restored backup ${name} to server ${serverId}`);

    // 4. Restart the container if it was known.
    if (meta) {
      try {
        await dockerService.getContainer(meta.containerId).start();
        logger.info(`Restarted container ${meta.containerId} after restore`);
      } catch {
        // Container may not exist after a full reinstall — ignore.
      }
    }

    res.json({ message: 'Restore completed', backup: name });
  } catch (err) {
    logger.error(`POST /backups/${serverId}/${name}/restore error`, { err });
    res.status(500).json({ error: 'Failed to restore backup', message: (err as Error).message });
  }
});

// ── DELETE /api/backups/:serverId/:name — delete backup ──────────────────
router.delete('/:serverId/:name', (req: Request, res: Response) => {
  const { serverId, name } = req.params;

  if (!name.endsWith('.tar.gz') || name.includes('/') || name.includes('..')) {
    return res.status(400).json({ error: 'Invalid backup name' });
  }

  const filePath = path.join(backupDir(serverId), name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Backup not found' });
  }

  try {
    fs.unlinkSync(filePath);
    logger.info(`Deleted backup: ${filePath}`);
    res.json({ message: 'Backup deleted' });
  } catch (err) {
    logger.error(`DELETE /backups/${serverId}/${name} error`, { err });
    res.status(500).json({ error: 'Failed to delete backup', message: (err as Error).message });
  }
});

export default router;
