/**
 * src/routes/servers.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Game server management routes:
 *  GET    /                  — list user's servers (or all servers for ADMIN)
 *  GET    /eggs              — list available server templates (eggs) & versions
 *  GET    /users             — list assignable users for server ownership
 *  POST   /                  — create new server container (auto-installs server.jar & auto-starts)
 *  GET    /:id               — server details
 *  PATCH  /:id               — update server name, settings, Auto-Start, or transfer ownerId
 *  POST   /:id/reinstall     — reinstall server with different Egg version (or loader)
 *  DELETE /:id               — delete server
 *  POST   /:id/power         — power action (start/stop/restart/kill)
 *  GET    /:id/stats         — live stats from daemon
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Role, ServerStatus } from '@prisma/client';
import prisma from '../prisma';
import { serverService, PowerAction } from '../services/ServerService';
import { authenticateToken, requireAdmin, requireOwnership } from '../middleware/auth';
import { validate } from '../middleware/validate';
import logger from '../logger';

const router = Router();

// All server routes require authentication
router.use(authenticateToken);

// ─── Comprehensive Egg Catalog (All Minecraft Loaders + Gaming & App Runtimes) ─

export const BUILTIN_EGGS = [
  {
    id: 'egg_mc_paper',
    slug: 'minecraft-paper',
    name: 'Minecraft: PaperMC',
    category: 'minecraft',
    description: 'High-performance PaperMC server with plugin support & async chunk loading',
    dockerImage: 'itzg/minecraft-server:latest',
    startupCmd: 'java -Xms128M -Xmx4096M -jar server.jar nogui',
    defaultVersion: '1.21.4',
    versions: ['1.21.4', '1.21.1', '1.20.6', '1.20.4', '1.19.4', '1.18.2', '1.16.5', '1.12.2', '1.8.8'],
  },
  {
    id: 'egg_mc_fabric',
    slug: 'minecraft-fabric',
    name: 'Minecraft: Fabric Modloader',
    category: 'minecraft',
    description: 'Lightweight, modular Fabric modded Minecraft server runtime',
    dockerImage: 'itzg/minecraft-server:latest',
    startupCmd: 'java -Xms128M -Xmx4096M -jar server.jar nogui',
    defaultVersion: '1.21.4',
    versions: ['1.21.4', '1.21.1', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.18.2', '1.16.5'],
  },
  {
    id: 'egg_mc_forge',
    slug: 'minecraft-forge',
    name: 'Minecraft: Forge Modded',
    category: 'minecraft',
    description: 'Classic Minecraft Forge server for large modpacks & heavy mods',
    dockerImage: 'itzg/minecraft-server:latest',
    startupCmd: 'java -Xms128M -Xmx4096M -jar server.jar nogui',
    defaultVersion: '1.21.1',
    versions: ['1.21.1', '1.20.6', '1.20.4', '1.20.1', '1.19.2', '1.18.2', '1.16.5', '1.12.2'],
  },
  {
    id: 'egg_mc_neoforge',
    slug: 'minecraft-neoforge',
    name: 'Minecraft: NeoForge',
    category: 'minecraft',
    description: 'Next-generation NeoForge modding platform for modern Minecraft',
    dockerImage: 'itzg/minecraft-server:latest',
    startupCmd: 'java -Xms128M -Xmx4096M -jar server.jar nogui',
    defaultVersion: '1.21.4',
    versions: ['1.21.4', '1.21.1', '1.20.6', '1.20.4'],
  },
  {
    id: 'egg_mc_purpur',
    slug: 'minecraft-purpur',
    name: 'Minecraft: Purpur High-Tick',
    category: 'minecraft',
    description: 'Drop-in Paper fork with extensive gameplay customization & Pufferfish optimizations',
    dockerImage: 'itzg/minecraft-server:latest',
    startupCmd: 'java -Xms128M -Xmx4096M -jar server.jar nogui',
    defaultVersion: '1.21.4',
    versions: ['1.21.4', '1.21.1', '1.20.6', '1.20.4', '1.19.4'],
  },
  {
    id: 'egg_mc_spigot',
    slug: 'minecraft-spigot',
    name: 'Minecraft: Spigot / CraftBukkit',
    category: 'minecraft',
    description: 'Standard Spigot & Bukkit plugin-compatible Minecraft server',
    dockerImage: 'itzg/minecraft-server:latest',
    startupCmd: 'java -Xms128M -Xmx4096M -jar server.jar nogui',
    defaultVersion: '1.21.4',
    versions: ['1.21.4', '1.21.1', '1.20.4', '1.19.4', '1.16.5', '1.12.2', '1.8.8'],
  },
  {
    id: 'egg_mc_vanilla',
    slug: 'minecraft-vanilla',
    name: 'Minecraft: Vanilla Official',
    category: 'minecraft',
    description: 'Official Mojang unmodified Vanilla Minecraft Java server',
    dockerImage: 'itzg/minecraft-server:latest',
    startupCmd: 'java -Xms128M -Xmx4096M -jar server.jar nogui',
    defaultVersion: '1.21.4',
    versions: ['1.21.4', '1.21.1', '1.20.6', '1.20.4', '1.19.4', '1.18.2', '1.16.5', '1.12.2'],
  },
  {
    id: 'egg_mc_velocity',
    slug: 'minecraft-velocity',
    name: 'Minecraft: Velocity / BungeeCord',
    category: 'minecraft',
    description: 'High-speed proxy network server for linking multiple Minecraft worlds',
    dockerImage: 'itzg/bungeecord:latest',
    startupCmd: 'java -Xms512M -Xmx1024M -jar server.jar',
    defaultVersion: '3.4.0-SNAPSHOT',
    versions: ['3.4.0-SNAPSHOT', '3.3.0-SNAPSHOT', 'BungeeCord-1.21'],
  },
  {
    id: 'egg_mc_bedrock',
    slug: 'minecraft-bedrock',
    name: 'Minecraft: Bedrock Edition',
    category: 'minecraft',
    description: 'Cross-platform Minecraft Bedrock dedicated server for PC, Console & Mobile',
    dockerImage: 'itzg/minecraft-bedrock-server:latest',
    startupCmd: './bedrock_server',
    defaultVersion: '1.21.50.07',
    versions: ['1.21.50.07', '1.21.40.04', '1.21.20.03', '1.20.80.05'],
  },
  {
    id: 'egg_mc_java',
    slug: 'minecraft-java',
    name: 'Minecraft: Java Edition',
    category: 'minecraft',
    description: 'High-performance Paper/Vanilla Minecraft Java server',
    dockerImage: 'itzg/minecraft-server:latest',
    startupCmd: 'java -Xms128M -Xmx4096M -jar server.jar nogui',
    defaultVersion: '1.21.4',
    versions: ['1.21.4', '1.21.1', '1.20.6', '1.20.4', '1.19.4', '1.18.2', '1.16.5', '1.12.2', '1.8.8'],
  },
  {
    id: 'egg_palworld',
    slug: 'palworld',
    name: 'Palworld Dedicated Server',
    category: 'gaming',
    description: 'Official Palworld multiplayer survival cluster container',
    dockerImage: 'thijsvanloef/palworld-server-docker:latest',
    startupCmd: './PalServer.sh',
    defaultVersion: 'v0.4.14 (Feybreak)',
    versions: ['v0.4.14 (Feybreak)', 'v0.3.10 (Sakurajima)', 'v0.2.4.0'],
  },
  {
    id: 'egg_rust',
    slug: 'rust',
    name: 'Rust Dedicated Server',
    category: 'gaming',
    description: 'Facepunch Rust dedicated survival server with Oxide / uMod support',
    dockerImage: 'didstopia/rust-server:latest',
    startupCmd: './RustDedicated -batchmode',
    defaultVersion: 'Latest Steam Branch',
    versions: ['Latest Steam Branch', 'Oxide Modded Latest', 'Staging Branch'],
  },
  {
    id: 'egg_cs2',
    slug: 'cs2',
    name: 'Counter-Strike 2',
    category: 'gaming',
    description: 'Valve CS2 Source 2 competitive dedicated server',
    dockerImage: 'joedwards32/cs2:latest',
    startupCmd: './game/bin/linuxsteamrt64/cs2 -dedicated',
    defaultVersion: 'Source 2 Latest',
    versions: ['Source 2 Latest', 'Tournament 128-Subtick'],
  },
  {
    id: 'egg_hytale',
    slug: 'hytale',
    name: 'Hytale Dedicated Server',
    category: 'gaming',
    description: 'Hytale adventure and minigame container runtime',
    dockerImage: 'ubuntu:22.04',
    startupCmd: './hytale-server --bind 0.0.0.0',
    defaultVersion: 'Orbis Release 1.0',
    versions: ['Orbis Release 1.0', 'Minigame Cluster 1.0'],
  },
  {
    id: 'egg_nodejs',
    slug: 'nodejs',
    name: 'Node.js Runtime',
    category: 'programming',
    description: 'Alpine-based Node.js container for Discord bots, APIs & web apps',
    dockerImage: 'node:20-alpine',
    startupCmd: 'node index.js',
    defaultVersion: '20 LTS',
    versions: ['20 LTS', '22 Current', '18 LTS'],
  },
  {
    id: 'egg_python',
    slug: 'python',
    name: 'Python Runtime',
    category: 'programming',
    description: 'Python slim container for AI workers, automation & Discord bots',
    dockerImage: 'python:3.12-slim',
    startupCmd: 'python main.py',
    defaultVersion: '3.12',
    versions: ['3.12', '3.11', '3.10', '3.9'],
  },
];

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const CreateServerSchema = z.object({
  name: z
    .string()
    .min(1, 'Server name is required')
    .max(64, 'Server name must be at most 64 characters'),
  image: z.string().min(1, 'Egg slug (image) is required'),
  dockerImage: z.string().optional(),
  memoryLimit: z.coerce.number().int().min(128, 'Minimum memory is 128 MB').max(65536).default(2048),
  cpuLimit: z.coerce.number().int().min(10).max(10000).default(100),
  diskLimit: z.coerce.number().int().min(512).max(1048576).default(10240),
  nodeId: z.string().optional(),
  ownerId: z.string().optional(),
  environment: z.record(z.string()).optional(),
  startupCmd: z.string().max(512).optional(),
});

const UpdateServerSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  ownerId: z.string().min(1).optional(),
  startupCmd: z.string().max(512).optional(),
  environment: z.record(z.string()).optional(),
});

const ReinstallServerSchema = z.object({
  version: z.string().min(1, 'Target version is required'),
  eggSlug: z.string().optional(),
  wipeFiles: z.boolean().optional().default(false),
});

const PowerActionSchema = z.object({
  action: z.enum(['start', 'stop', 'restart', 'kill']),
});

// ─── GET /eggs — List available eggs ──────────────────────────────────────────

router.get('/eggs', async (_req: Request, res: Response) => {
  res.json({ eggs: BUILTIN_EGGS });
});

// ─── GET /users — List assignable users for server ownership ──────────────────

router.get('/users', async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
      },
      orderBy: { username: 'asc' },
    });
    res.json({ users });
  } catch (err) {
    logger.error('GET /servers/users error', { err });
    res.status(500).json({ error: 'Failed to fetch users list.' });
  }
});

// ─── GET / — List servers ─────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.sub;
    const isAdmin = req.user!.role === Role.ADMIN;

    const servers = await prisma.server.findMany({
      where: isAdmin ? {} : { ownerId: userId },
      include: {
        allocations: { select: { id: true, ip: true, port: true, isAssigned: true } },
        node: { select: { id: true, name: true, fqdn: true, isOnline: true } },
        owner: { select: { id: true, username: true, email: true } },
        _count: { select: { backups: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ servers, total: servers.length });
  } catch (err) {
    logger.error('GET /servers error', { err });
    res.status(500).json({ error: 'Failed to fetch servers.' });
  }
});

// ─── POST / — Create server (Admin only — auto-installs server.jar & auto-starts) ─

router.post('/', requireAdmin, validate(CreateServerSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body as z.infer<typeof CreateServerSchema>;

    const matchedEgg = BUILTIN_EGGS.find((e) => e.slug === body.image);
    const resolvedDockerImage =
      body.dockerImage ||
      matchedEgg?.dockerImage ||
      'itzg/minecraft-server:latest';

    let targetOwnerId = req.user!.sub;
    if (body.ownerId && body.ownerId.trim() !== '') {
      const targetUser = await prisma.user.findUnique({
        where: { id: body.ownerId.trim() },
      });
      if (!targetUser) {
        res.status(404).json({ error: 'Selected target user does not exist.' });
        return;
      }
      targetOwnerId = targetUser.id;
    }

    const defaultVersion = matchedEgg?.defaultVersion || '1.21.4';
    const mergedEnv: Record<string, string> = {
      VERSION: defaultVersion,
      AUTO_START: 'true',
      ...(body.environment ?? {}),
    };

    const server = await serverService.createServer({
      name: body.name,
      ownerId: targetOwnerId,
      image: body.image,
      dockerImage: resolvedDockerImage,
      memoryLimit: body.memoryLimit,
      cpuLimit: body.cpuLimit,
      diskLimit: body.diskLimit,
      nodeId: body.nodeId || undefined,
      environment: mergedEnv,
      startupCmd: body.startupCmd || matchedEgg?.startupCmd,
    });

    const activeServer = await prisma.server.update({
      where: { id: server.id },
      data: { status: ServerStatus.RUNNING },
      include: {
        allocations: true,
        owner: { select: { id: true, username: true, email: true } },
        node: { select: { id: true, name: true, fqdn: true } },
      },
    });

    // Install server.jar / starter files immediately & trigger automatic startup sequence
    try {
      const { ensureServerWorkspace } = require('./files');
      await ensureServerWorkspace(activeServer.id, {
        version: mergedEnv.VERSION,
        eggSlug: body.image,
        reinstall: true,
      });
      const { broadcastPowerEvent } = require('../websocket/consoleProxy');
      broadcastPowerEvent(
        {
          id: activeServer.id,
          name: activeServer.name,
          image: activeServer.image,
          dockerImage: activeServer.dockerImage,
          startupCmd: activeServer.startupCmd,
          environment: activeServer.environment,
        },
        'start'
      );
    } catch {
      // Non-fatal
    }

    logger.info('Server created & auto-started via API', {
      serverId: activeServer.id,
      ownerId: targetOwnerId,
      egg: body.image,
      version: mergedEnv.VERSION,
    });

    res.status(201).json({ server: activeServer, ...activeServer });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create server.';
    logger.error('POST /servers error', { err });
    res.status(500).json({ error: msg });
  }
});

// ─── GET /:id — Server details ────────────────────────────────────────────────

router.get('/:id', requireOwnership, async (req: Request, res: Response) => {
  try {
    const server = await prisma.server.findUnique({
      where: { id: req.params.id },
      include: {
        allocations: { select: { id: true, ip: true, port: true } },
        node: { select: { id: true, name: true, fqdn: true, isOnline: true } },
        owner: { select: { id: true, username: true, email: true } },
        _count: { select: { backups: true } },
      },
    });

    if (!server) {
      res.status(404).json({ error: 'Server not found.' });
      return;
    }

    res.json(server);
  } catch (err) {
    logger.error('GET /servers/:id error', { err });
    res.status(500).json({ error: 'Failed to fetch server details.' });
  }
});

// ─── PATCH /:id — Update server settings, Auto-Start, or transfer ownership ──

router.patch('/:id', requireOwnership, validate(UpdateServerSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body as z.infer<typeof UpdateServerSchema>;

    if (body.ownerId) {
      const targetUser = await prisma.user.findUnique({
        where: { id: body.ownerId },
      });
      if (!targetUser) {
        res.status(404).json({ error: 'Target user for ownership transfer not found.' });
        return;
      }
    }

    const updated = await prisma.server.update({
      where: { id: req.params.id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.ownerId !== undefined && { ownerId: body.ownerId }),
        ...(body.startupCmd !== undefined && { startupCmd: body.startupCmd }),
        ...(body.environment !== undefined && {
          environment: JSON.stringify(body.environment),
        }),
      },
      include: {
        owner: { select: { id: true, username: true, email: true } },
        node: { select: { id: true, name: true, fqdn: true } },
        allocations: true,
      },
    });
    res.json({ server: updated });
  } catch (err) {
    logger.error('PATCH /servers/:id error', { err });
    res.status(500).json({ error: 'Failed to update server.' });
  }
});

// ─── POST /:id/reinstall — Reinstall server with different Egg version / loader ─

router.post(
  '/:id/reinstall',
  requireOwnership,
  validate(ReinstallServerSchema),
  async (req: Request, res: Response) => {
    try {
      const { version, eggSlug, wipeFiles } = req.body as z.infer<
        typeof ReinstallServerSchema
      >;
      const existing = await prisma.server.findUnique({
        where: { id: req.params.id },
      });

      if (!existing) {
        res.status(404).json({ error: 'Server not found.' });
        return;
      }

      const targetEggSlug = eggSlug || existing.image;
      const matchedEgg = BUILTIN_EGGS.find((e) => e.slug === targetEggSlug);

      let envObj: Record<string, string> = {};
      if (existing.environment) {
        try {
          envObj =
            typeof existing.environment === 'string'
              ? JSON.parse(existing.environment)
              : (existing.environment as Record<string, string>);
        } catch {
          envObj = {};
        }
      }

      const updatedEnv: Record<string, string> = {
        ...envObj,
        VERSION: version,
        EGG_VERSION: version,
      };

      const updated = await prisma.server.update({
        where: { id: req.params.id },
        data: {
          image: targetEggSlug,
          dockerImage: matchedEgg?.dockerImage || existing.dockerImage,
          environment: JSON.stringify(updatedEnv),
          status: ServerStatus.RUNNING,
        },
        include: {
          owner: { select: { id: true, username: true, email: true } },
          node: { select: { id: true, name: true, fqdn: true } },
          allocations: true,
        },
      });

      // Reinstall server.jar / runtime binary in workspace
      const { ensureServerWorkspace } = require('./files');
      await ensureServerWorkspace(updated.id, {
        version,
        eggSlug: targetEggSlug,
        reinstall: true,
        wipeFiles,
      });

      // Stream live reinstallation & auto-start logs to connected consoles
      try {
        const { broadcastReinstallEvent } = require('../websocket/consoleProxy');
        broadcastReinstallEvent(updated, version, matchedEgg?.name || targetEggSlug);
      } catch {
        // Ignore broadcast error
      }

      const { auditService } = require('../services/AuditService');
      auditService.logAction({
        serverId: updated.id,
        action: 'SERVER_REINSTALL',
        details: `Server reinstalled with ${matchedEgg?.name || targetEggSlug} (${version})`,
        userId: req.user?.sub,
        ipAddress: req.ip,
      });

      logger.info('Server reinstalled with new version', {
        serverId: updated.id,
        eggSlug: targetEggSlug,
        version,
      });

      res.json({
        message: `Server reinstalled with ${matchedEgg?.name || targetEggSlug} (${version}) and started.`,
        server: updated,
      });
    } catch (err) {
      logger.error('POST /servers/:id/reinstall error', { err });
      res.status(500).json({ error: 'Failed to reinstall server.' });
    }
  }
);

// ─── DELETE /:id — Delete server ──────────────────────────────────────────────

router.delete('/:id', requireOwnership, async (req: Request, res: Response) => {
  try {
    const { auditService } = require('../services/AuditService');
    await auditService.logAction({
      serverId: req.params.id,
      action: 'SERVER_DELETE',
      details: 'Server destroyed and volume deleted',
      userId: req.user?.sub,
      ipAddress: req.ip,
    });

    await serverService.deleteServer(req.params.id);
    logger.info('Server deleted', { serverId: req.params.id, userId: req.user!.sub });
    res.json({ message: 'Server deleted successfully.' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to delete server.';
    logger.error('DELETE /servers/:id error', { err });
    res.status(500).json({ error: msg });
  }
});

// ─── POST /:id/power — Power action ──────────────────────────────────────────

router.post('/:id/power', requireOwnership, validate(PowerActionSchema), async (req: Request, res: Response) => {
  try {
    const { action } = req.body as z.infer<typeof PowerActionSchema>;

    await serverService.powerAction(req.params.id, action as PowerAction);

    const { auditService } = require('../services/AuditService');
    auditService.logAction({
      serverId: req.params.id,
      action: `POWER_${action.toUpperCase()}`,
      details: `Dispatched ${action.toUpperCase()} command to container`,
      userId: req.user?.sub,
      ipAddress: req.ip,
    });

    res.json({ message: `Power action "${action}" sent successfully.` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Power action failed.';
    logger.error('POST /servers/:id/power error', { serverId: req.params.id, err });
    res.status(500).json({ error: msg });
  }
});

// ─── GET /:id/stats — Live stats ──────────────────────────────────────────────

router.get('/:id/stats', requireOwnership, async (req: Request, res: Response) => {
  try {
    const stats = await serverService.getStats(req.params.id);
    res.json(stats);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch stats.';
    logger.error('GET /servers/:id/stats error', { serverId: req.params.id, err });
    res.status(502).json({ error: msg });
  }
});

export default router;
