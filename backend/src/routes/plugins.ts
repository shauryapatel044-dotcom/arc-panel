/**
 * src/routes/plugins.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * 1-Click Plugin & Mod Manager endpoints for game servers.
 *
 *  GET    /:serverId/plugins/catalog     — get curated plugins
 *  GET    /:serverId/plugins/installed   — list installed .jar files
 *  GET    /:serverId/plugins/search      — search Modrinth API
 *  POST   /:serverId/plugins/install     — install a plugin/mod
 *  DELETE /:serverId/plugins/uninstall   — remove a plugin/mod
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken, requireOwnership, requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { pluginService } from '../services/PluginService';
import { auditService } from '../services/AuditService';
import logger from '../logger';

const router = Router({ mergeParams: true });

router.use(authenticateToken);
router.use(requireOwnership);

const InstallSchema = z.object({
  downloadUrl: z.string().url('Invalid download URL'),
  filename: z.string().optional(),
  targetDir: z.enum(['plugins', 'mods']).default('plugins'),
});

const UninstallSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
  targetDir: z.enum(['plugins', 'mods']).default('plugins'),
});

// ── GET /:serverId/plugins/catalog ───────────────────────────────────────────
router.get('/catalog', async (req: Request, res: Response) => {
  try {
    const serverId = req.params.serverId || req.params.id;
    const catalog = await pluginService.getCatalog(serverId);
    res.json({ catalog });
  } catch (err: any) {
    logger.error('Failed to get plugin catalog', { err: err.message });
    res.status(500).json({ error: 'Failed to retrieve plugin catalog.' });
  }
});

// ── GET /:serverId/plugins/installed ─────────────────────────────────────────
router.get('/installed', async (req: Request, res: Response) => {
  try {
    const serverId = req.params.serverId || req.params.id;
    const installed = await pluginService.getInstalled(serverId);
    res.json({ installed });
  } catch (err: any) {
    logger.error('Failed to get installed plugins', { err: err.message });
    res.status(500).json({ error: 'Failed to retrieve installed plugins.' });
  }
});

// ── GET /:serverId/plugins/search ────────────────────────────────────────────
router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = String(req.query.q || req.query.query || '');
    const type = (req.query.type === 'mod' ? 'mod' : 'plugin') as 'mod' | 'plugin';
    const results = await pluginService.searchModrinth(query, type);
    res.json({ results });
  } catch (err: any) {
    logger.error('Failed to search plugins', { err: err.message });
    res.status(500).json({ error: 'Failed to search plugins.' });
  }
});

// ── POST /:serverId/plugins/install ──────────────────────────────────────────
router.post(
  '/install',
  requirePermission('files.write'),
  validate(InstallSchema),
  async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId || req.params.id;
      const { downloadUrl, filename, targetDir } = req.body;

      const installed = await pluginService.installPlugin(serverId, {
        downloadUrl,
        filename,
        targetDir,
      });

      await auditService.logAction({
        serverId,
        action: 'PLUGIN_INSTALL',
        details: `Installed ${installed.filename} into /${installed.directory}`,
        userId: req.user?.sub,
        ipAddress: req.ip,
      });

      res.status(201).json({
        message: `Successfully installed ${installed.filename}. Restart the server to load it.`,
        installed,
      });
    } catch (err: any) {
      logger.error('Failed to install plugin', { err: err.message });
      res.status(500).json({ error: err.message || 'Failed to install plugin.' });
    }
  }
);

// ── DELETE /:serverId/plugins/uninstall ──────────────────────────────────────
router.delete(
  '/uninstall',
  requirePermission('files.delete'),
  async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId || req.params.id;
      const filename = String(req.query.filename || req.body?.filename || '');
      const targetDir = (req.query.targetDir || req.body?.targetDir || 'plugins') as 'plugins' | 'mods';

      if (!filename) {
        return res.status(400).json({ error: 'Filename is required to uninstall.' });
      }

      const result = await pluginService.uninstallPlugin(serverId, filename, targetDir);

      await auditService.logAction({
        serverId,
        action: 'PLUGIN_UNINSTALL',
        details: `Removed ${result.removed} from /${targetDir}`,
        userId: req.user?.sub,
        ipAddress: req.ip,
      });

      res.json({
        message: `Successfully uninstalled ${result.removed}. Restart the server to apply changes.`,
      });
    } catch (err: any) {
      logger.error('Failed to uninstall plugin', { err: err.message });
      res.status(500).json({ error: err.message || 'Failed to uninstall plugin.' });
    }
  }
);

export default router;
