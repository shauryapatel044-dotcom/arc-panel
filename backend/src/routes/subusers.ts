/**
 * src/routes/subusers.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Sub-users & Server Collaborator Management.
 *
 *  GET    /:serverId/subusers           — list collaborators
 *  POST   /:serverId/subusers           — invite/add collaborator
 *  PATCH  /:serverId/subusers/:subId    — update permissions
 *  DELETE /:serverId/subusers/:subId    — revoke collaborator access
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

const AddSubuserSchema = z.object({
  emailOrUsername: z.string().min(1, 'Email or username is required'),
  permissions: z.array(z.string()).min(1, 'Select at least one permission'),
});

const UpdateSubuserSchema = z.object({
  permissions: z.array(z.string()).min(1, 'Select at least one permission'),
});

// ── GET /:serverId/subusers ──────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const serverId = req.params.serverId || req.params.id;

    const subusers = await prisma.serverSubuser.findMany({
      where: { serverId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = subusers.map((sub) => {
      let perms: string[] = [];
      try {
        perms = JSON.parse(sub.permissions);
      } catch {
        perms = [];
      }
      return {
        id: sub.id,
        userId: sub.userId,
        user: sub.user,
        permissions: perms,
        createdAt: sub.createdAt,
      };
    });

    res.json({ subusers: formatted });
  } catch (err: any) {
    logger.error('Failed to list subusers', { err: err.message });
    res.status(500).json({ error: 'Failed to retrieve server collaborators.' });
  }
});

// ── POST /:serverId/subusers ─────────────────────────────────────────────────
router.post('/', validate(AddSubuserSchema), async (req: Request, res: Response) => {
  try {
    const serverId = req.params.serverId || req.params.id;
    const { emailOrUsername, permissions } = req.body;

    const cleanInput = emailOrUsername.trim().toLowerCase();

    // Find the target user
    const targetUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: cleanInput }, { username: cleanInput }],
      },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User with that email or username does not exist.' });
    }

    // Check if target user is server owner
    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (server?.ownerId === targetUser.id) {
      return res.status(400).json({ error: 'This user is already the owner of this server.' });
    }

    // Check if already a subuser
    const existing = await prisma.serverSubuser.findUnique({
      where: {
        serverId_userId: {
          serverId,
          userId: targetUser.id,
        },
      },
    });

    if (existing) {
      return res.status(409).json({ error: 'User is already a collaborator on this server.' });
    }

    const created = await prisma.serverSubuser.create({
      data: {
        serverId,
        userId: targetUser.id,
        permissions: JSON.stringify(permissions),
      },
      include: {
        user: {
          select: { id: true, username: true, email: true, role: true },
        },
      },
    });

    await auditService.logAction({
      serverId,
      action: 'SUBUSER_ADD',
      details: `Invited @${targetUser.username} (${targetUser.email}) with ${permissions.length} permissions`,
      userId: req.user?.sub,
      ipAddress: req.ip,
    });

    res.status(201).json({
      message: `Collaborator @${targetUser.username} added successfully.`,
      subuser: {
        id: created.id,
        userId: created.userId,
        user: created.user,
        permissions,
        createdAt: created.createdAt,
      },
    });
  } catch (err: any) {
    logger.error('Failed to add subuser', { err: err.message });
    res.status(500).json({ error: err.message || 'Failed to add collaborator.' });
  }
});

// ── PATCH /:serverId/subusers/:subId ─────────────────────────────────────────
router.patch('/:subId', validate(UpdateSubuserSchema), async (req: Request, res: Response) => {
  try {
    const serverId = req.params.serverId || req.params.id;
    const { subId } = req.params;
    const { permissions } = req.body;

    const updated = await prisma.serverSubuser.update({
      where: { id: subId },
      data: {
        permissions: JSON.stringify(permissions),
      },
      include: {
        user: {
          select: { id: true, username: true, email: true },
        },
      },
    });

    await auditService.logAction({
      serverId,
      action: 'SUBUSER_UPDATE',
      details: `Updated permissions for @${updated.user.username}`,
      userId: req.user?.sub,
      ipAddress: req.ip,
    });

    res.json({
      message: 'Collaborator permissions updated.',
      subuser: {
        id: updated.id,
        userId: updated.userId,
        user: updated.user,
        permissions,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (err: any) {
    logger.error('Failed to update subuser', { err: err.message });
    res.status(500).json({ error: 'Failed to update permissions.' });
  }
});

// ── DELETE /:serverId/subusers/:subId ────────────────────────────────────────
router.delete('/:subId', async (req: Request, res: Response) => {
  try {
    const serverId = req.params.serverId || req.params.id;
    const { subId } = req.params;

    const deleted = await prisma.serverSubuser.delete({
      where: { id: subId },
      include: { user: { select: { username: true } } },
    });

    await auditService.logAction({
      serverId,
      action: 'SUBUSER_REMOVE',
      details: `Revoked access for collaborator @${deleted.user.username}`,
      userId: req.user?.sub,
      ipAddress: req.ip,
    });

    res.json({ message: 'Collaborator access revoked successfully.' });
  } catch (err: any) {
    logger.error('Failed to remove subuser', { err: err.message });
    res.status(500).json({ error: 'Failed to remove collaborator.' });
  }
});

export default router;
