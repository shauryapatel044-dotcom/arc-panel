/**
 * src/routes/webhooks.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Discord Webhook Notifications & Audit Activity Logs.
 *
 *  GET    /:serverId/webhooks            — list server webhooks
 *  POST   /:serverId/webhooks            — create Discord webhook
 *  DELETE /:serverId/webhooks/:whId      — delete webhook
 *  POST   /:serverId/webhooks/:whId/test — send test Discord notification
 *  GET    /:serverId/audit-logs          — list server audit trail
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../prisma';
import { authenticateToken, requireOwnership } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { auditService } from '../services/AuditService';
import logger from '../logger';

const router = Router({ mergeParams: true });

router.use(authenticateToken);
router.use(requireOwnership);

const CreateWebhookSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(64),
  url: z.string().url('Must be a valid Discord or HTTP webhook URL'),
  events: z.array(z.string()).default(['all']),
});

// ── GET /:serverId/webhooks ──────────────────────────────────────────────────
router.get('/webhooks', async (req: Request, res: Response) => {
  try {
    const serverId = req.params.serverId || req.params.id;

    const webhooks = await prisma.serverWebhook.findMany({
      where: { serverId },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = webhooks.map((w) => {
      let events: string[] = [];
      try {
        events = JSON.parse(w.events);
      } catch {
        events = ['all'];
      }
      return {
        ...w,
        events,
      };
    });

    res.json({ webhooks: formatted });
  } catch (err: any) {
    logger.error('Failed to get webhooks', { err: err.message });
    res.status(500).json({ error: 'Failed to retrieve webhooks.' });
  }
});

// ── POST /:serverId/webhooks ─────────────────────────────────────────────────
router.post('/webhooks', validate(CreateWebhookSchema), async (req: Request, res: Response) => {
  try {
    const serverId = req.params.serverId || req.params.id;
    const { name, url, events } = req.body;

    const webhook = await prisma.serverWebhook.create({
      data: {
        serverId,
        name,
        url,
        events: JSON.stringify(events),
        isActive: true,
      },
    });

    await auditService.logAction({
      serverId,
      action: 'WEBHOOK_CREATE',
      details: `Configured Discord webhook: ${name}`,
      userId: req.user?.sub,
      ipAddress: req.ip,
    });

    res.status(201).json({
      message: 'Discord webhook created successfully.',
      webhook: {
        ...webhook,
        events,
      },
    });
  } catch (err: any) {
    logger.error('Failed to create webhook', { err: err.message });
    res.status(500).json({ error: 'Failed to create webhook.' });
  }
});

// ── DELETE /:serverId/webhooks/:whId ─────────────────────────────────────────
router.delete('/webhooks/:whId', async (req: Request, res: Response) => {
  try {
    const serverId = req.params.serverId || req.params.id;
    const { whId } = req.params;

    const deleted = await prisma.serverWebhook.delete({
      where: { id: whId },
    });

    await auditService.logAction({
      serverId,
      action: 'WEBHOOK_DELETE',
      details: `Removed webhook: ${deleted.name}`,
      userId: req.user?.sub,
      ipAddress: req.ip,
    });

    res.json({ message: 'Webhook removed successfully.' });
  } catch (err: any) {
    logger.error('Failed to delete webhook', { err: err.message });
    res.status(500).json({ error: 'Failed to remove webhook.' });
  }
});

// ── POST /:serverId/webhooks/:whId/test ──────────────────────────────────────
router.post('/webhooks/:whId/test', async (req: Request, res: Response) => {
  try {
    const serverId = req.params.serverId || req.params.id;
    const { whId } = req.params;

    const webhook = await prisma.serverWebhook.findUnique({
      where: { id: whId },
      include: { server: { select: { name: true } } },
    });

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found.' });
    }

    await auditService.sendTestWebhook(webhook.url, webhook.server?.name || 'Arc Server');

    res.json({ message: 'Test alert sent to Discord successfully!' });
  } catch (err: any) {
    logger.error('Failed to send test webhook', { err: err.message });
    res.status(500).json({ error: err.message || 'Failed to send test alert to Discord.' });
  }
});

// ── GET /:serverId/audit-logs ────────────────────────────────────────────────
router.get('/audit-logs', async (req: Request, res: Response) => {
  try {
    const serverId = req.params.serverId || req.params.id;
    const limit = Math.min(Number(req.query.limit || 50), 100);

    const logs = await auditService.getRecentLogs(serverId, limit);
    res.json({ logs });
  } catch (err: any) {
    logger.error('Failed to get audit logs', { err: err.message });
    res.status(500).json({ error: 'Failed to retrieve audit activity logs.' });
  }
});

export default router;
