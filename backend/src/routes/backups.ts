/**
 * src/routes/backups.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Server backup management routes — orchestrates backup records in MariaDB
 * and relays archive operations to the assigned daemon node:
 *  GET    /                     — list all backups for a server
 *  POST   /                     — create a new backup (tar.gz on daemon + DB record)
 *  GET    /:backupId/download   — stream backup archive from daemon
 *  POST   /:backupId/restore    — restore server data from backup archive
 *  DELETE /:backupId            — delete backup from daemon and MariaDB
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import axios from 'axios';
import prisma from '../prisma';
import { authenticateToken, requireOwnership } from '../middleware/auth';
import { nodeService } from '../services/NodeService';
import { validate } from '../middleware/validate';
import logger from '../logger';

const router = Router({ mergeParams: true });

// All backup routes require authentication + server ownership (or ADMIN)
router.use(authenticateToken);
router.use(requireOwnership);

// ─── Validation Schemas ───────────────────────────────────────────────────────

const CreateBackupSchema = z.object({
  name: z
    .string()
    .min(1, 'Backup name cannot be empty')
    .max(128, 'Backup name must be at most 128 characters')
    .optional(),
});

// ─── Helper: serialize BigInt fields for JSON ─────────────────────────────────

function serializeBackup(backup: {
  id: string;
  serverId: string;
  name: string;
  size: bigint;
  checksum: string | null;
  completed: boolean;
  createdAt: Date;
}) {
  return {
    id: backup.id,
    serverId: backup.serverId,
    name: backup.name,
    size: Number(backup.size),
    sizeBytes: Number(backup.size),
    checksum: backup.checksum,
    completed: backup.completed,
    status: backup.completed ? 'complete' : 'in_progress',
    locked: false,
    createdAt: backup.createdAt.toISOString(),
    completedAt: backup.completed ? backup.createdAt.toISOString() : undefined,
  };
}

// ─── GET / — List backups for server ──────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  const { serverId } = req.params;
  try {
    const backups = await prisma.backup.findMany({
      where: { serverId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      backups: backups.map(serializeBackup),
      total: backups.length,
    });
  } catch (err) {
    logger.error('GET /backups error', { serverId, err });
    res.status(500).json({ error: 'Failed to list server backups.' });
  }
});

// ─── POST / — Create a new backup ─────────────────────────────────────────────

router.post('/', validate(CreateBackupSchema), async (req: Request, res: Response) => {
  const { serverId } = req.params;
  const { name } = req.body as z.infer<typeof CreateBackupSchema>;

  try {
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { id: true, name: true, nodeId: true },
    });

    if (!server) {
      res.status(404).json({ error: 'Server not found.' });
      return;
    }

    // Request daemon to create the compressed backup archive
    const daemonRes = await nodeService.relayToDaemon<{
      name: string;
      size: number;
      checksum?: string;
      createdAt: string;
    }>(server.nodeId, 'POST', `/api/backups/${server.id}`, { name });

    const archiveName =
      daemonRes.name ||
      name ||
      `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.tar.gz`;

    const backup = await prisma.backup.create({
      data: {
        serverId: server.id,
        name: archiveName,
        size: BigInt(daemonRes.size ?? 0),
        checksum: daemonRes.checksum ?? null,
        completed: true,
      },
    });

    logger.info(`Created backup "${backup.name}" for server ${server.id}`, {
      backupId: backup.id,
      size: daemonRes.size,
    });

    res.status(201).json({ backup: serializeBackup(backup) });
  } catch (err) {
    logger.error('POST /backups error', { serverId, err });
    const message = axios.isAxiosError(err)
      ? err.response?.data?.error || err.message
      : 'Failed to create server backup.';
    res.status(502).json({ error: message });
  }
});

// ─── GET /:backupId/download — Stream backup archive from daemon ──────────────

router.get('/:backupId/download', async (req: Request, res: Response) => {
  const { serverId, backupId } = req.params;

  try {
    const backup = await prisma.backup.findFirst({
      where: { id: backupId, serverId },
      include: { server: { select: { nodeId: true } } },
    });

    if (!backup) {
      res.status(404).json({ error: 'Backup not found.' });
      return;
    }

    const client = await nodeService.getNodeClient(backup.server.nodeId);
    const daemonStream = await client.get(
      `/api/backups/${serverId}/${encodeURIComponent(backup.name)}/download`,
      { responseType: 'stream' }
    );

    const fileName = backup.name.endsWith('.tar.gz')
      ? backup.name
      : `${backup.name}.tar.gz`;

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    if (backup.size > BigInt(0)) {
      res.setHeader('Content-Length', backup.size.toString());
    }

    daemonStream.data.pipe(res);
  } catch (err) {
    logger.error('GET /backups/:backupId/download error', { serverId, backupId, err });
    res.status(502).json({ error: 'Failed to download backup from daemon node.' });
  }
});

// ─── POST /:backupId/restore — Restore server from backup ─────────────────────

router.post('/:backupId/restore', async (req: Request, res: Response) => {
  const { serverId, backupId } = req.params;

  try {
    const backup = await prisma.backup.findFirst({
      where: { id: backupId, serverId },
      include: { server: { select: { nodeId: true } } },
    });

    if (!backup) {
      res.status(404).json({ error: 'Backup not found.' });
      return;
    }

    await nodeService.relayToDaemon(
      backup.server.nodeId,
      'POST',
      `/api/backups/${serverId}/${encodeURIComponent(backup.name)}/restore`
    );

    logger.info(`Restored backup "${backup.name}" for server ${serverId}`, { backupId });
    res.json({ message: 'Backup restored successfully.', backup: serializeBackup(backup) });
  } catch (err) {
    logger.error('POST /backups/:backupId/restore error', { serverId, backupId, err });
    const message = axios.isAxiosError(err)
      ? err.response?.data?.error || err.message
      : 'Failed to restore backup.';
    res.status(502).json({ error: message });
  }
});

// ─── DELETE /:backupId — Delete backup ────────────────────────────────────────

router.delete('/:backupId', async (req: Request, res: Response) => {
  const { serverId, backupId } = req.params;

  try {
    const backup = await prisma.backup.findFirst({
      where: { id: backupId, serverId },
      include: { server: { select: { nodeId: true } } },
    });

    if (!backup) {
      res.status(404).json({ error: 'Backup not found.' });
      return;
    }

    // Best-effort removal on daemon node
    await nodeService
      .relayToDaemon(
        backup.server.nodeId,
        'DELETE',
        `/api/backups/${serverId}/${encodeURIComponent(backup.name)}`
      )
      .catch((daemonErr) => {
        logger.warn('Daemon backup file removal returned warning', {
          backupId,
          err: daemonErr instanceof Error ? daemonErr.message : String(daemonErr),
        });
      });

    await prisma.backup.delete({ where: { id: backup.id } });

    logger.info(`Deleted backup "${backup.name}" (${backup.id})`, { serverId });
    res.json({ message: 'Backup deleted successfully.' });
  } catch (err) {
    logger.error('DELETE /backups/:backupId error', { serverId, backupId, err });
    res.status(500).json({ error: 'Failed to delete backup.' });
  }
});

export default router;
