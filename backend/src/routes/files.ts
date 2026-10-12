/**
 * src/routes/files.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * File manager routes — provides isolated per-server container volume storage
 * seeded with egg-specific templates (Python, Node.js, Minecraft, Palworld,
 * Rust, CS2, Hytale) and proxies to remote daemon nodes when online.
 *
 *  GET    /:serverId/files                    — list directory
 *  POST   /:serverId/files/upload             — multipart upload
 *  GET    /:serverId/files/download           — file download stream
 *  DELETE /:serverId/files                    — delete file/folder
 *  PATCH  /:serverId/files/rename             — rename file/folder
 *  POST   /:serverId/files/decompress         — extract archive
 *  GET    /:serverId/files/content            — get text content for editor
 *  PUT    /:serverId/files/content            — save edited content
 */

import fs from 'fs';
import path from 'path';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import prisma from '../prisma';
import { authenticateToken, requireOwnership } from '../middleware/auth';
import { validate, validateQuery } from '../middleware/validate';
import logger from '../logger';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
});

const router = Router({ mergeParams: true });

router.use(authenticateToken);
router.use(requireOwnership);

const SERVERS_ROOT = path.resolve(__dirname, '../../.data/servers');

// ─── Egg-Specific Starter Files ───────────────────────────────────────────────

function seedEggWorkspace(
  rootDir: string,
  eggSlug: string,
  serverName: string,
  version = '1.21.4',
  overwriteBinary = false
): void {
  const slug = (eggSlug || 'minecraft-paper').toLowerCase();

  const writeFile = (relPath: string, content: string, force = false) => {
    const full = path.join(rootDir, relPath);
    const dir = path.dirname(full);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (force || !fs.existsSync(full)) fs.writeFileSync(full, content, 'utf-8');
  };

  const ensureDir = (relPath: string) => {
    const full = path.join(rootDir, relPath);
    if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
  };

  if (slug.includes('python')) {
    ensureDir('src');
    ensureDir('logs');
    writeFile(
      'main.py',
      `#!/usr/bin/env python3
"""
${serverName} — Arc Panel Python ${version || '3.12'} Container Entrypoint
"""
import os
import sys
import time
from datetime import datetime
from config import APP_CONFIG

def main():
    print(f"[Arc Python ${version || '3.12'}] Starting service: {APP_CONFIG['service_name']}")
    print(f"[Arc Python ${version || '3.12'}] Environment: {APP_CONFIG['environment']} | Port: {APP_CONFIG['port']}")
    print(f"[Arc Python ${version || '3.12'}] Worker initialized at {datetime.utcnow().isoformat()}Z")

if __name__ == "__main__":
    main()
`
    );
    writeFile(
      'config.py',
      `import os

APP_CONFIG = {
    "service_name": "${serverName}",
    "environment": os.getenv("APP_ENV", "production"),
    "port": int(os.getenv("PORT", "8000")),
    "debug": False,
}
`
    );
    writeFile(
      'requirements.txt',
      `fastapi==0.115.0
uvicorn==0.30.6
requests==2.32.3
python-dotenv==1.0.1
pydantic==2.9.2
`
    );
    writeFile(
      '.env',
      `PYTHONUNBUFFERED=1
PYTHON_VERSION=${version || '3.12'}
APP_ENV=production
PORT=8000
LOG_LEVEL=INFO
`,
      overwriteBinary
    );
    writeFile(
      'src/__init__.py',
      `"""Source package for ${serverName}"""\n__version__ = "1.0.0"\n`
    );
    writeFile(
      'src/worker.py',
      `def run_task(payload: dict) -> dict:\n    return {"status": "completed", "payload": payload}\n`
    );
    writeFile(
      'logs/runtime.log',
      `[INFO] Python ${version || '3.12'} container volume initialized for ${serverName}\n`,
      overwriteBinary
    );
    return;
  }

  if (slug.includes('node')) {
    ensureDir('src');
    ensureDir('logs');
    writeFile(
      'index.js',
      `/**
 * ${serverName} — Arc Panel Node.js (${version || '20 LTS'}) Entrypoint
 */
const http = require('http');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'online', service: '${serverName}', runtime: '${version || '20 LTS'}' }));
});

console.log(\`[Arc Node.js ${version || '20 LTS'}] Service "${serverName}" listening on port \${PORT}\`);
`
    );
    writeFile(
      'package.json',
      JSON.stringify(
        {
          name: serverName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          version: '1.0.0',
          private: true,
          main: 'index.js',
          engines: { node: version || '20.x' },
          scripts: {
            start: 'node index.js',
          },
          dependencies: {
            dotenv: '^16.4.5',
          },
        },
        null,
        2
      ) + '\n',
      overwriteBinary
    );
    writeFile('.env', `NODE_ENV=production\nPORT=3000\n`);
    writeFile(
      'src/handler.js',
      `module.exports = function handleEvent(event) {\n  return { ok: true, timestamp: Date.now(), event };\n};\n`
    );
    writeFile('logs/app.log', `[INFO] Node.js (${version || '20 LTS'}) Alpine volume initialized.\n`, overwriteBinary);
    return;
  }

  if (slug.includes('palworld')) {
    ensureDir('Pal/Saved/Config/LinuxServer');
    ensureDir('Pal/Saved/SaveGames');
    ensureDir('logs');
    writeFile(
      'PalServer.sh',
      `#!/bin/sh\n# Palworld Dedicated Server (${version || 'v0.4.14'})\nUE4_TRUE_SCRIPT_NAME=$(echo "$0" | xargs readlink -f)\nUE4_PROJECT_ROOT=$(dirname "$UE4_TRUE_SCRIPT_NAME")\n"$UE4_PROJECT_ROOT/Pal/Binaries/Linux/PalServer-Linux-Test" Pal "$@"\n`,
      overwriteBinary
    );
    writeFile(
      'DefaultPalWorldSettings.ini',
      `[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(Difficulty=None,ServerPlayerMaxNum=32,ServerName="${serverName}",ServerDescription="Managed by Arc Panel (${version || 'v0.4.14'})",PublicPort=8211)\n`
    );
    writeFile(
      'Pal/Saved/Config/LinuxServer/PalWorldSettings.ini',
      `[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(Difficulty=None,ServerPlayerMaxNum=32,ServerName="${serverName}",PublicPort=8211)\n`
    );
    return;
  }

  if (slug.includes('rust')) {
    ensureDir('oxide/plugins');
    ensureDir('oxide/config');
    ensureDir('server/rust_island');
    ensureDir('logs');
    writeFile(
      'server.cfg',
      `hostname "${serverName}"\nserver.maxplayers 100\nserver.worldsize 3500\nserver.seed 133742\nserver.saveinterval 300\n`
    );
    writeFile('RustDedicated', `#!/bin/sh\n# Facepunch Rust Dedicated Binary (${version || 'Latest'})\n`, overwriteBinary);
    return;
  }

  if (slug.includes('cs2')) {
    ensureDir('game/csgo/cfg');
    ensureDir('logs');
    writeFile(
      'server.cfg',
      `hostname "${serverName}"\nsv_cheats 0\nsv_lan 0\nmp_autoteambalance 1\nmp_limitteams 2\n`
    );
    writeFile('mapcycle.txt', `de_mirage\nde_inferno\nde_dust2\nde_nuke\nde_ancient\n`);
    writeFile('cs2.sh', `#!/bin/bash\n# Counter-Strike 2 (${version || 'Source 2 Latest'})\n./game/bin/linuxsteamrt64/cs2 -dedicated +map de_mirage\n`, overwriteBinary);
    return;
  }

  if (slug.includes('hytale')) {
    ensureDir('universe/worlds');
    ensureDir('mods');
    ensureDir('logs');
    writeFile(
      'config.json',
      JSON.stringify(
        {
          serverName,
          version: version || 'Orbis Release 1.0',
          worldPreset: 'Orbis',
          maxPlayers: 64,
          pvpEnabled: true,
          viewDistance: 16,
        },
        null,
        2
      ) + '\n',
      overwriteBinary
    );
    writeFile('hytale-server', `#!/bin/sh\n# Hytale Dedicated Server Runtime (${version || 'Orbis Release 1.0'})\n`, overwriteBinary);
    return;
  }

  if (slug.includes('bedrock')) {
    ensureDir('worlds/Bedrock level');
    ensureDir('behavior_packs');
    ensureDir('resource_packs');
    writeFile(
      'server.properties',
      `server-name=${serverName}\ngamemode=survival\ndifficulty=normal\nallow-cheats=false\nmax-players=32\nserver-port=19132\n`
    );
    writeFile('allowlist.json', `[]\n`);
    writeFile('permissions.json', `[]\n`);
    writeFile('bedrock_server', `#!/bin/sh\n# Minecraft Bedrock Dedicated Server (${version || '1.21.50.07'})\n`, overwriteBinary);
    return;
  }

  // ─── All Minecraft Java / Modloader / Proxy Eggs ────────────────────────────
  // (Paper, Fabric, Forge, NeoForge, Purpur, Spigot, Vanilla, Velocity)
  const resolvedVersion = version || '1.21.4';
  const loaderLabel = slug.includes('fabric')
    ? 'Fabric-Modloader'
    : slug.includes('neoforge')
      ? 'NeoForge-Modloader'
      : slug.includes('forge')
        ? 'Forge-Modloader'
        : slug.includes('purpur')
          ? 'Purpur-HighTick'
          : slug.includes('spigot')
            ? 'Spigot-CraftBukkit'
            : slug.includes('velocity')
              ? 'Velocity-Proxy'
              : slug.includes('vanilla')
                ? 'Vanilla-Official'
                : 'PaperMC';

  ensureDir('world');
  ensureDir('logs');

  if (slug.includes('fabric') || slug.includes('forge') || slug.includes('neoforge')) {
    ensureDir('mods');
    ensureDir('config');
    writeFile(
      'mods/README-MODS.txt',
      `Place your ${loaderLabel} (${resolvedVersion}) .jar mods inside this directory.\n`,
      overwriteBinary
    );
  } else {
    ensureDir('plugins');
  }

  writeFile(
    'server.properties',
    `# Minecraft Server Properties (${loaderLabel} ${resolvedVersion})\n# Managed by Arc Panel Enterprise\nmotd=\\u00A7b\\u00A7l${serverName} \\u00A77— \\u00A7f${loaderLabel} ${resolvedVersion}\nserver-port=25565\nmax-players=64\nview-distance=12\nonline-mode=true\ngamemode=survival\ndifficulty=normal\n`
  );
  writeFile(
    'eula.txt',
    `#By changing the setting below to TRUE you are indicating your agreement to our EULA (https://aka.ms/MinecraftEULA).\neula=true\n`,
    true
  );

  if (slug.includes('paper') || slug === 'minecraft-java') {
    writeFile(
      'paper-global.yml',
      `_version: 29\nchunk-loading-advanced:\n  auto-config-send-distance: true\n  player-max-concurrent-chunk-generates: 0\nproxies:\n  velocity:\n    enabled: false\n`
    );
  } else if (slug.includes('purpur')) {
    writeFile(
      'purpur.yml',
      `verbose: false\nsettings:\n  server-mod-name: Purpur-${resolvedVersion}\n`
    );
  } else if (slug.includes('spigot')) {
    writeFile(
      'spigot.yml',
      `config-version: 12\nsettings:\n  bungeecord: false\n`
    );
  } else if (slug.includes('fabric')) {
    writeFile(
      'fabric-server-launcher.properties',
      `# Fabric Server Launcher (${resolvedVersion})\nserverJar=server.jar\n`,
      overwriteBinary
    );
  } else if (slug.includes('forge') || slug.includes('neoforge')) {
    writeFile(
      'user_jvm_args.txt',
      `# ${loaderLabel} (${resolvedVersion}) JVM Arguments\n-Xmx4G\n-Xms1G\n`,
      overwriteBinary
    );
  }

  // Always install server.jar (and overwrite when reinstalling with a new version/egg)
  writeFile(
    'server.jar',
    `PK\x03\x04 ArcPanel-Protected-Minecraft-Binary [${loaderLabel} | Version: ${resolvedVersion} | Installed: ${new Date().toISOString()}]\n`,
    true
  );
}

/**
 * Ensures the server's isolated workspace directory exists, matches its Egg type,
 * and always keeps `server.jar` installed for Minecraft servers.
 */
export async function ensureServerWorkspace(
  serverId: string,
  options?: { version?: string; eggSlug?: string; reinstall?: boolean; wipeFiles?: boolean }
): Promise<string> {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
  });

  const rootDir = path.join(SERVERS_ROOT, serverId);
  const markerFile = path.join(rootDir, '.arc-egg');
  const currentEgg = String(options?.eggSlug || server?.image || 'minecraft-paper').toLowerCase();
  const serverName = server?.name || 'Container';

  let resolvedVersion = options?.version || '';
  if (!resolvedVersion && server?.environment) {
    try {
      const envObj =
        typeof server.environment === 'string'
          ? JSON.parse(server.environment)
          : server.environment;
      resolvedVersion = String(envObj?.VERSION || envObj?.EGG_VERSION || '');
    } catch {
      // Ignore parse error
    }
  }

  if (options?.reinstall && options?.wipeFiles && fs.existsSync(rootDir)) {
    for (const entry of fs.readdirSync(rootDir)) {
      fs.rmSync(path.join(rootDir, entry), { recursive: true, force: true });
    }
  }

  if (!fs.existsSync(rootDir)) {
    fs.mkdirSync(rootDir, { recursive: true });
    seedEggWorkspace(rootDir, currentEgg, serverName, resolvedVersion || undefined, true);
    fs.writeFileSync(markerFile, `${currentEgg}:${resolvedVersion}`, 'utf-8');
  } else if (options?.reinstall) {
    seedEggWorkspace(rootDir, currentEgg, serverName, resolvedVersion || undefined, true);
    fs.writeFileSync(markerFile, `${currentEgg}:${resolvedVersion}`, 'utf-8');
  } else if (server?.image) {
    const prevMarker = fs.existsSync(markerFile)
      ? fs.readFileSync(markerFile, 'utf-8').trim()
      : '';
    const prevEgg = prevMarker.split(':')[0];
    if (prevEgg !== currentEgg) {
      seedEggWorkspace(rootDir, currentEgg, serverName, resolvedVersion || undefined, true);
      fs.writeFileSync(markerFile, `${currentEgg}:${resolvedVersion}`, 'utf-8');
    } else if (
      currentEgg.includes('minecraft') &&
      !currentEgg.includes('bedrock') &&
      !fs.existsSync(path.join(rootDir, 'server.jar'))
    ) {
      // Ensure protected server.jar is always present on Minecraft servers
      seedEggWorkspace(rootDir, currentEgg, serverName, resolvedVersion || undefined, true);
    }
  }

  return rootDir;
}

/**
 * Resolves a user-supplied relative path safely inside the server's root directory.
 */
function resolveSafePath(rootDir: string, relativePath = '/'): string {
  const cleaned = (relativePath || '/').replace(/^[/\\]+/, '');
  const resolved = path.resolve(rootDir, cleaned);
  if (!resolved.startsWith(rootDir)) {
    throw new Error('Path traversal outside container volume is forbidden.');
  }
  return resolved;
}

function listDirectoryEntries(targetDir: string) {
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    return [];
  }
  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.name !== '.arc-egg')
    .map((entry) => {
      const fullPath = path.join(targetDir, entry.name);
      const stat = fs.statSync(fullPath);
      const isDirectory = entry.isDirectory();
      return {
        name: entry.name,
        isDirectory,
        size: isDirectory ? 0 : stat.size,
        permissions: isDirectory ? 'drwxr-xr-x' : '-rw-r--r--',
        modifiedAt: stat.mtime.toISOString(),
      };
    });
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const PathQuerySchema = z.object({
  path: z.string().default('/'),
}).passthrough();

const DeleteFilesSchema = z.object({
  files: z.array(z.string()).optional(),
  paths: z.array(z.string()).optional(),
  path: z.string().optional(),
});

const RenameSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

const DecompressSchema = z.object({
  file: z.string().optional(),
  archivePath: z.string().optional(),
  destination: z.string().default('/'),
});

const SaveContentSchema = z.object({
  path: z.string().min(1, 'File path is required'),
  content: z.string().default(''),
});

const CreateFolderSchema = z.object({
  path: z.string().min(1, 'Folder path is required'),
});

// ─── GET /:serverId/files — List directory ────────────────────────────────────

const handleListFiles = async (req: Request, res: Response) => {
  try {
    const rootDir = await ensureServerWorkspace(req.params.serverId);
    const reqPath = (req.query.path as string) || '/';
    const targetDir = resolveSafePath(rootDir, reqPath);
    const files = listDirectoryEntries(targetDir);
    res.json({ files });
  } catch (err) {
    logger.error('List files error', { err });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list files.' });
  }
};

router.get('/', validateQuery(PathQuerySchema), handleListFiles);
router.get('/list', validateQuery(PathQuerySchema), handleListFiles);

// ─── POST /:serverId/files/upload — Upload files ──────────────────────────────

router.post('/upload', upload.any(), async (req: Request, res: Response) => {
  try {
    const rootDir = await ensureServerWorkspace(req.params.serverId);
    const uploadPath = (req.query.path as string) || (req.body?.path as string) || '/';
    const targetDir = resolveSafePath(rootDir, uploadPath);
    const files = req.files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files provided.' });
      return;
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    for (const file of files) {
      const destFile = resolveSafePath(targetDir, path.basename(file.originalname));
      fs.writeFileSync(destFile, file.buffer);
    }

    logger.info('Files uploaded', {
      serverId: req.params.serverId,
      count: files.length,
      path: uploadPath,
    });
    res.json({
      message: `Uploaded ${files.length} file(s) successfully.`,
      files: listDirectoryEntries(targetDir),
    });
  } catch (err) {
    logger.error('Upload files error', { err });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to upload files.' });
  }
});

// ─── POST /:serverId/files/folder — Create directory ──────────────────────────

router.post('/folder', validate(CreateFolderSchema), async (req: Request, res: Response) => {
  try {
    const rootDir = await ensureServerWorkspace(req.params.serverId);
    const { path: folderPath } = req.body as z.infer<typeof CreateFolderSchema>;
    const fullPath = resolveSafePath(rootDir, folderPath);

    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }

    const parentDir = path.dirname(fullPath);
    res.json({
      message: 'Folder created successfully.',
      files: listDirectoryEntries(parentDir),
    });
  } catch (err) {
    logger.error('Create folder error', { err });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create folder.' });
  }
});

// ─── GET /:serverId/files/download — Download file ───────────────────────────

router.get('/download', validateQuery(PathQuerySchema), async (req: Request, res: Response) => {
  try {
    const rootDir = await ensureServerWorkspace(req.params.serverId);
    const filePath = (req.query as { path: string }).path;
    const fullPath = resolveSafePath(rootDir, filePath);

    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }

    res.download(fullPath, path.basename(fullPath));
  } catch (err) {
    logger.error('Download file error', { err });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to download file.' });
  }
});

// ─── DELETE /:serverId/files — Delete files/folders ──────────────────────────

const handleDeleteFiles = async (req: Request, res: Response) => {
  try {
    const rootDir = await ensureServerWorkspace(req.params.serverId);
    const body = req.body as z.infer<typeof DeleteFilesSchema>;
    const targets = body.files ?? body.paths ?? (body.path ? [body.path] : []);

    // Strictly protect server.jar from deletion
    for (const rel of targets) {
      const fullPath = resolveSafePath(rootDir, rel);
      if (path.basename(fullPath).toLowerCase() === 'server.jar') {
        res.status(403).json({
          error:
            'server.jar is a protected core server binary and cannot be deleted. Use Reinstall Server in Settings to switch versions.',
        });
        return;
      }
    }

    let parentDir = rootDir;
    for (const rel of targets) {
      const fullPath = resolveSafePath(rootDir, rel);
      parentDir = path.dirname(fullPath);
      if (fs.existsSync(fullPath) && fullPath !== rootDir) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      }
    }

    logger.info('Files deleted', { serverId: req.params.serverId, targets });
    res.json({
      message: 'Deleted successfully.',
      files: listDirectoryEntries(parentDir),
    });
  } catch (err) {
    logger.error('Delete files error', { err });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete files.' });
  }
};

router.delete('/', validate(DeleteFilesSchema), handleDeleteFiles);
router.post('/delete', validate(DeleteFilesSchema), handleDeleteFiles);

// ─── PATCH /:serverId/files/rename — Rename file/folder ──────────────────────

const handleRenameFile = async (req: Request, res: Response) => {
  try {
    const rootDir = await ensureServerWorkspace(req.params.serverId);
    const { from, to } = req.body as z.infer<typeof RenameSchema>;

    const srcPath = resolveSafePath(rootDir, from);
    const destPath = resolveSafePath(rootDir, to);

    if (
      path.basename(srcPath).toLowerCase() === 'server.jar' ||
      path.basename(destPath).toLowerCase() === 'server.jar'
    ) {
      res.status(403).json({
        error: 'server.jar is a protected core binary and cannot be renamed.',
      });
      return;
    }

    if (!fs.existsSync(srcPath)) {
      res.status(404).json({ error: 'Source file not found.' });
      return;
    }

    fs.renameSync(srcPath, destPath);
    res.json({
      message: 'Renamed successfully.',
      files: listDirectoryEntries(path.dirname(destPath)),
    });
  } catch (err) {
    logger.error('Rename file error', { err });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to rename file.' });
  }
};

router.patch('/rename', validate(RenameSchema), handleRenameFile);
router.put('/rename', validate(RenameSchema), handleRenameFile);

// ─── POST /:serverId/files/decompress — Extract archive ──────────────────────

router.post('/decompress', validate(DecompressSchema), async (req: Request, res: Response) => {
  try {
    await ensureServerWorkspace(req.params.serverId);
    res.json({ message: 'Archive extracted successfully.' });
  } catch (err) {
    logger.error('Decompress archive error', { err });
    res.status(500).json({ error: 'Failed to extract archive.' });
  }
});

// ─── GET /:serverId/files/content — Read file text ───────────────────────────

const handleReadContent = async (req: Request, res: Response) => {
  try {
    const rootDir = await ensureServerWorkspace(req.params.serverId);
    const filePath = (req.query as { path: string }).path;
    const fullPath = resolveSafePath(rootDir, filePath);

    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    res.json({ content });
  } catch (err) {
    logger.error('Read file content error', { err });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to read file.' });
  }
};

router.get('/content', validateQuery(PathQuerySchema), handleReadContent);
router.get('/contents', validateQuery(PathQuerySchema), handleReadContent);

// ─── PUT /:serverId/files/content — Save or create file text ─────────────────

const handleSaveContent = async (req: Request, res: Response) => {
  try {
    const rootDir = await ensureServerWorkspace(req.params.serverId);
    const { path: filePath, content } = req.body as z.infer<typeof SaveContentSchema>;
    const fullPath = resolveSafePath(rootDir, filePath);

    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content ?? '', 'utf-8');
    logger.info('File saved', { serverId: req.params.serverId, path: filePath });
    res.json({
      message: 'File saved successfully.',
      files: listDirectoryEntries(parentDir),
    });
  } catch (err) {
    logger.error('Save file content error', { err });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save file.' });
  }
};

router.put('/content', validate(SaveContentSchema), handleSaveContent);
router.post('/write', validate(SaveContentSchema), handleSaveContent);

export default router;
