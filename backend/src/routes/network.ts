/**
 * src/routes/network.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Port & Allocation Manager.
 * Allows assigning additional secondary ports for plugins (Dynmap, Geyser Bedrock,
 * Simple Voice Chat, Votifier, Prometheus) and designating primary ports.
 *
 *  GET    /:serverId/network              — list assigned ports & free pool
 *  POST   /:serverId/network/assign       — assign an additional port
 *  DELETE /:serverId/network/:allocId     — unassign secondary port
 *  PATCH  /:serverId/network/:allocId/primary — set port as primary
 *  PATCH  /:serverId/network/:allocId/notes   — update port label/note
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../prisma';
import { authenticateToken, requireOwnership, requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { auditService } from '../services/AuditService';
import logger from '../logger';

const router = Router({ mergeParams: true });

router.use(authenticateToken);
router.use(requireOwnership);

const AssignPortSchema = z.object({
  allocationId: z.string().optional(),
  notes: z.string().max(64).optional(),
});

const UpdateNotesSchema = z.object({
  notes: z.string().max(64).optional(),
});

// ── GET /:serverId/network ───────────────────────────────────────────────────
router.get('/', requirePermission('network.read'), async (req: Request, res: Response) => {
  try {
    const serverId = req.params.serverId || req.params.id;

    const server = await prisma.server.findUnique({
      where: { id: serverId },
      include: {
        node: true,
        allocations: {
          orderBy: [{ isPrimary: 'desc' }, { port: 'asc' }],
        },
      },
    });

    if (!server) {
      return res.status(404).json({ error: 'Server not found.' });
    }

    // Ensure at least one allocation is flagged as primary
    let hasPrimary = server.allocations.some((a) => a.isPrimary);
    if (!hasPrimary && server.allocations.length > 0) {
      await prisma.allocation.update({
        where: { id: server.allocations[0].id },
        data: { isPrimary: true },
      });
      server.allocations[0].isPrimary = true;
    }

    // Available unassigned ports on this node
    const availablePool = await prisma.allocation.findMany({
      where: {
        nodeId: server.nodeId,
        serverId: null,
        isAssigned: false,
      },
      orderBy: { port: 'asc' },
      take: 20,
    });

    res.json({
      allocations: server.allocations,
      availablePool,
      node: {
        id: server.node.id,
        name: server.node.name,
        fqdn: server.node.fqdn,
      },
    });
  } catch (err: any) {
    logger.error('Failed to get network allocations', { err: err.message });
    res.status(500).json({ error: 'Failed to retrieve network allocations.' });
  }
});

// ── POST /:serverId/network/assign ───────────────────────────────────────────
router.post(
  '/assign',
  requirePermission('network.manage'),
  validate(AssignPortSchema),
  async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId || req.params.id;
      const { allocationId, notes } = req.body;

      const server = await prisma.server.findUnique({
        where: { id: serverId },
      });

      if (!server) {
        return res.status(404).json({ error: 'Server not found.' });
      }

      let targetAlloc;

      if (allocationId) {
        targetAlloc = await prisma.allocation.findFirst({
          where: {
            id: allocationId,
            nodeId: server.nodeId,
            serverId: null,
            isAssigned: false,
          },
        });
      } else {
        // Automatically pick the first free port on this node
        targetAlloc = await prisma.allocation.findFirst({
          where: {
            nodeId: server.nodeId,
            serverId: null,
            isAssigned: false,
          },
          orderBy: { port: 'asc' },
        });
      }

      if (!targetAlloc) {
        return res.status(400).json({
          error: 'No available unassigned ports remaining on this node.',
        });
      }

      const updated = await prisma.allocation.update({
        where: { id: targetAlloc.id },
        data: {
          serverId: server.id,
          isAssigned: true,
          isPrimary: false,
          notes: notes?.trim() || 'Secondary Port',
        },
      });

      await auditService.logAction({
        serverId,
        action: 'PORT_ASSIGN',
        details: `Assigned secondary port ${updated.port} (${updated.notes})`,
        userId: req.user?.sub,
        ipAddress: req.ip,
      });

      res.status(201).json({
        message: `Port ${updated.port} successfully allocated to this server.`,
        allocation: updated,
      });
    } catch (err: any) {
      logger.error('Failed to assign allocation', { err: err.message });
      res.status(500).json({ error: err.message || 'Failed to assign port.' });
    }
  }
);

// ── DELETE /:serverId/network/:allocId ───────────────────────────────────────
router.delete(
  '/:allocId',
  requirePermission('network.manage'),
  async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId || req.params.id;
      const { allocId } = req.params;

      const alloc = await prisma.allocation.findFirst({
        where: { id: allocId, serverId },
      });

      if (!alloc) {
        return res.status(404).json({ error: 'Allocation not found on this server.' });
      }

      if (alloc.isPrimary) {
        return res.status(400).json({
          error: 'Cannot unassign the primary connection port of the server.',
        });
      }

      await prisma.allocation.update({
        where: { id: allocId },
        data: {
          serverId: null,
          isAssigned: false,
          isPrimary: false,
          notes: null,
        },
      });

      await auditService.logAction({
        serverId,
        action: 'PORT_UNASSIGN',
        details: `Unassigned secondary port ${alloc.port}`,
        userId: req.user?.sub,
        ipAddress: req.ip,
      });

      res.json({ message: `Port ${alloc.port} unassigned and returned to node pool.` });
    } catch (err: any) {
      logger.error('Failed to unassign allocation', { err: err.message });
      res.status(500).json({ error: 'Failed to unassign port.' });
    }
  }
);

// ── PATCH /:serverId/network/:allocId/primary ────────────────────────────────
router.patch(
  '/:allocId/primary',
  requirePermission('network.manage'),
  async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId || req.params.id;
      const { allocId } = req.params;

      const alloc = await prisma.allocation.findFirst({
        where: { id: allocId, serverId },
      });

      if (!alloc) {
        return res.status(404).json({ error: 'Allocation not found on this server.' });
      }

      // Clear existing primary flag on all server allocations
      await prisma.allocation.updateMany({
        where: { serverId },
        data: { isPrimary: false },
      });

      // Set this one as primary
      const updated = await prisma.allocation.update({
        where: { id: allocId },
        data: { isPrimary: true },
      });

      await auditService.logAction({
        serverId,
        action: 'PORT_SET_PRIMARY',
        details: `Set port ${updated.port} as primary connection port`,
        userId: req.user?.sub,
        ipAddress: req.ip,
      });

      res.json({
        message: `Port ${updated.port} is now the primary port.`,
        allocation: updated,
      });
    } catch (err: any) {
      logger.error('Failed to set primary allocation', { err: err.message });
      res.status(500).json({ error: 'Failed to set primary port.' });
    }
  }
);

// ── PATCH /:serverId/network/:allocId/notes ──────────────────────────────────
router.patch(
  '/:allocId/notes',
  requirePermission('network.manage'),
  validate(UpdateNotesSchema),
  async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId || req.params.id;
      const { allocId } = req.params;
      const { notes } = req.body;

      const updated = await prisma.allocation.update({
        where: { id: allocId },
        data: { notes: notes?.trim() || null },
      });

      res.json({ allocation: updated });
    } catch (err: any) {
      logger.error('Failed to update allocation note', { err: err.message });
      res.status(500).json({ error: 'Failed to update port note.' });
    }
  }
);

export default router;
