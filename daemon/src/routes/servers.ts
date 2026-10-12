/**
 * Arc Panel Daemon — Server Management Routes
 *
 * POST   /api/servers            — create a new server container
 * DELETE /api/servers/:id        — force-stop and remove container
 * POST   /api/servers/:id/power  — start | stop | restart | kill
 * GET    /api/servers/:id/stats  — live resource usage snapshot
 * GET    /api/servers/:id/status — container running state
 * GET    /api/servers            — list all Arc Panel managed servers
 */

import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { dockerService, resolveImage } from '../docker/DockerService';
import { serverStore } from '../utils/serverStore';
import { config } from '../config';
import { logger } from '../utils/logger';

const router = Router();

// ── Helper — ensure the data directory for a server exists ─────────────────
function ensureServerDataDir(serverId: string): void {
  const dir = path.join(config.dataDir, 'servers', serverId, 'data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`Created server data directory: ${dir}`);
  }
}

// ── GET /api/servers — list all managed servers ────────────────────────────
router.get('/', async (_req: Request, res: Response) => {
  try {
    const servers = serverStore.getAll();
    res.json({ servers });
  } catch (err) {
    logger.error('GET /servers error', { err });
    res.status(500).json({ error: 'Failed to list servers' });
  }
});

// ── POST /api/servers — create a new server ────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
  const {
    id,
    name,
    image,
    memory = 512,   // MB
    cpu = 1024,     // cpu shares
    ports = [],
    env = {},
    startCmd,
  } = req.body as {
    id: string;
    name: string;
    image: string;
    memory?: number;
    cpu?: number;
    ports?: Array<{ host: number; container: number }>;
    env?: Record<string, string>;
    startCmd?: string;
  };

  if (!id || !name || !image) {
    return res.status(400).json({ error: 'id, name, and image are required' });
  }

  // Reject if a server with this ID already exists.
  if (serverStore.get(id)) {
    return res.status(409).json({ error: `Server ${id} already exists` });
  }

  try {
    // 1. Pull the image if not already cached locally.
    await dockerService.ensureImage(image);

    // 2. Ensure the per-server data directory exists (bind mount target).
    ensureServerDataDir(id);

    // 3. Create the Docker container.
    const containerId = await dockerService.createContainer(
      {
        id,
        name,
        image,
        memoryMB: memory,
        cpuShares: cpu,
        ports,
        env,
        startCmd,
      },
      config.dataDir,
    );

    // 4. Persist metadata.
    serverStore.set({
      id,
      name,
      containerId,
      image: resolveImage(image),
      createdAt: new Date().toISOString(),
    });

    logger.info(`Server created: ${id} → container ${containerId}`);
    res.status(201).json({ id, containerId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`POST /servers error for ${id}`, { err });
    res.status(500).json({ error: 'Failed to create server', message });
  }
});

// ── DELETE /api/servers/:id — remove server container ─────────────────────
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const meta = serverStore.get(id);
  if (!meta) {
    return res.status(404).json({ error: `Server ${id} not found` });
  }

  try {
    await dockerService.removeContainer(meta.containerId);
    serverStore.delete(id);
    logger.info(`Server deleted: ${id}`);
    res.json({ message: `Server ${id} deleted` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`DELETE /servers/${id} error`, { err });
    res.status(500).json({ error: 'Failed to delete server', message });
  }
});

// ── POST /api/servers/:id/power — power control ───────────────────────────
router.post('/:id/power', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { action } = req.body as { action: 'start' | 'stop' | 'restart' | 'kill' };

  if (!['start', 'stop', 'restart', 'kill'].includes(action)) {
    return res.status(400).json({ error: 'action must be one of: start, stop, restart, kill' });
  }

  const meta = serverStore.get(id);
  if (!meta) {
    return res.status(404).json({ error: `Server ${id} not found` });
  }

  try {
    const container = dockerService.getContainer(meta.containerId);

    switch (action) {
      case 'start':
        await container.start();
        break;
      case 'stop':
        await container.stop({ t: 10 });
        break;
      case 'restart':
        await container.restart({ t: 10 });
        break;
      case 'kill':
        await container.kill();
        break;
    }

    logger.info(`Server ${id} action: ${action}`);
    res.json({ message: `${action} sent to server ${id}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`POST /servers/${id}/power (${action}) error`, { err });
    res.status(500).json({ error: `Failed to ${action} server`, message });
  }
});

// ── GET /api/servers/:id/stats — resource usage ───────────────────────────
router.get('/:id/stats', async (req: Request, res: Response) => {
  const { id } = req.params;
  const meta = serverStore.get(id);
  if (!meta) {
    return res.status(404).json({ error: `Server ${id} not found` });
  }

  try {
    const stats = await dockerService.getStats(meta.containerId);
    res.json(stats);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`GET /servers/${id}/stats error`, { err });
    res.status(500).json({ error: 'Failed to retrieve stats', message });
  }
});

// ── GET /api/servers/:id/status — container state ─────────────────────────
router.get('/:id/status', async (req: Request, res: Response) => {
  const { id } = req.params;
  const meta = serverStore.get(id);
  if (!meta) {
    return res.status(404).json({ error: `Server ${id} not found` });
  }

  try {
    const state = await dockerService.getContainerState(meta.containerId);
    res.json({
      id,
      containerId: meta.containerId,
      status: state.Status,
      running: state.Running,
      paused: state.Paused,
      restarting: state.Restarting,
      startedAt: state.StartedAt,
      finishedAt: state.FinishedAt,
      exitCode: state.ExitCode,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`GET /servers/${id}/status error`, { err });
    res.status(500).json({ error: 'Failed to retrieve status', message });
  }
});

export default router;
