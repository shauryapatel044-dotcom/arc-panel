/**
 * src/routes/databases.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Server database provisioning and management.
 *
 *  GET    /:serverId/databases                   — list databases
 *  POST   /:serverId/databases                   — provision new database
 *  DELETE /:serverId/databases/:dbId             — drop database
 *  POST   /:serverId/databases/:dbId/rotate-password — rotate password
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken, requireOwnership, requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { databaseService } from '../services/DatabaseService';
import { auditService } from '../services/AuditService';
import logger from '../logger';

const router = Router({ mergeParams: true });

router.use(authenticateToken);
router.use(requireOwnership);

const CreateDatabaseSchema = z.object({
  name: z
    .string()
    .min(2, 'Database name must be at least 2 characters')
    .max(16, 'Database name cannot exceed 16 characters')
    .regex(/^[a-z0-9_]+$/, 'Database name can only contain lowercase letters, numbers, and underscores'),
});

// ── GET /:serverId/databases ─────────────────────────────────────────────────
router.get('/', requirePermission('databases.read'), async (req: Request, res: Response) => {
  try {
    const serverId = req.params.serverId || req.params.id;
    const databases = await databaseService.listDatabases(serverId);
    res.json({ databases });
  } catch (err: any) {
    logger.error('Failed to list databases', { err: err.message });
    res.status(500).json({ error: 'Failed to retrieve databases.' });
  }
});

// ── POST /:serverId/databases ────────────────────────────────────────────────
router.post(
  '/',
  requirePermission('databases.create'),
  validate(CreateDatabaseSchema),
  async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId || req.params.id;
      const { name } = req.body;

      const database = await databaseService.createDatabase(serverId, name);

      await auditService.logAction({
        serverId,
        action: 'DATABASE_CREATE',
        details: `Created database ${database.fullDbName} with user ${database.username}`,
        userId: req.user?.sub,
        ipAddress: req.ip,
      });

      res.status(201).json({
        message: `Database '${database.name}' provisioned successfully.`,
        database,
      });
    } catch (err: any) {
      logger.error('Failed to create database', { err: err.message });
      res.status(500).json({ error: err.message || 'Failed to create database.' });
    }
  }
);

// ── DELETE /:serverId/databases/:dbId ────────────────────────────────────────
router.delete(
  '/:dbId',
  requirePermission('databases.delete'),
  async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId || req.params.id;
      const { dbId } = req.params;

      await databaseService.deleteDatabase(serverId, dbId);

      await auditService.logAction({
        serverId,
        action: 'DATABASE_DELETE',
        details: `Dropped database ${dbId}`,
        userId: req.user?.sub,
        ipAddress: req.ip,
      });

      res.json({ message: 'Database deleted successfully.' });
    } catch (err: any) {
      logger.error('Failed to delete database', { err: err.message });
      res.status(500).json({ error: err.message || 'Failed to delete database.' });
    }
  }
);

// ── POST /:serverId/databases/:dbId/rotate-password ──────────────────────────
router.post(
  '/:dbId/rotate-password',
  requirePermission('databases.manage'),
  async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId || req.params.id;
      const { dbId } = req.params;

      const updated = await databaseService.rotatePassword(serverId, dbId);

      await auditService.logAction({
        serverId,
        action: 'DATABASE_PASSWORD_RESET',
        details: `Rotated password for database ${updated.name}`,
        userId: req.user?.sub,
        ipAddress: req.ip,
      });

      res.json({
        message: 'Password rotated successfully.',
        password: updated.password,
      });
    } catch (err: any) {
      logger.error('Failed to rotate database password', { err: err.message });
      res.status(500).json({ error: err.message || 'Failed to rotate password.' });
    }
  }
);

export default router;
