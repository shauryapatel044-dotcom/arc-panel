/**
 * src/middleware/auth.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * JWT authentication middleware and role / ownership / subuser permission guards.
 *
 * Middleware:
 *  • authenticateToken  — verifies Bearer JWT, attaches decoded payload to req.user
 *  • requireAdmin       — ensures the authenticated user has the ADMIN role
 *  • requireOwnership   — ensures the server belongs to user OR user is subuser OR admin
 *  • requirePermission  — enforces granular permission flags for subusers
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import prisma from '../prisma';
import logger from '../logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string;        // User ID (cuid)
  username: string;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}

// Augment Express Request to carry our decoded user and server context
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      server?: any;
      subuserPermissions?: string[];
      isOwner?: boolean;
    }
  }
}

// ─── authenticateToken ────────────────────────────────────────────────────────

export function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or malformed Authorization header.' });
      return;
    }

    const token = authHeader.slice(7); // strip "Bearer "
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      logger.error('JWT_SECRET environment variable is not set!');
      res.status(500).json({ error: 'Server configuration error.' });
      return;
    }

    const payload = jwt.verify(token, secret, { ignoreExpiration: true }) as JwtPayload;
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Access token has expired.' });
      return;
    }
    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Invalid access token.' });
      return;
    }
    logger.error('Unexpected error in authenticateToken', { err });
    res.status(500).json({ error: 'Authentication error.' });
  }
}

// ─── requireAdmin ─────────────────────────────────────────────────────────────

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }
  if (req.user.role !== Role.ADMIN) {
    res.status(403).json({ error: 'Insufficient permissions. Admin role required.' });
    return;
  }
  next();
}

// ─── requireOwnership (Owner, Admin, or Subuser) ──────────────────────────────

export function requireOwnership(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  return (async () => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }

    // Support both :serverId and :id parameter names
    const serverId = req.params.serverId || req.params.id;

    if (!serverId) {
      res.status(400).json({ error: 'Server ID parameter is missing.' });
      return;
    }

    try {
      const server = await prisma.server.findUnique({
        where: { id: serverId },
        select: {
          id: true,
          ownerId: true,
          nodeId: true,
          containerId: true,
          status: true,
          suspended: true,
          name: true,
          image: true,
          dockerImage: true,
        },
      });

      if (!server) {
        res.status(404).json({ error: 'Server not found.' });
        return;
      }

      req.server = server;

      // 1. ADMINs always have full access
      if (req.user.role === Role.ADMIN) {
        req.isOwner = true;
        req.subuserPermissions = ['*'];
        return next();
      }

      // 2. Direct Server Owner
      if (server.ownerId === req.user.sub) {
        req.isOwner = true;
        req.subuserPermissions = ['*'];
        return next();
      }

      // 3. Subuser Check
      const subuser = await prisma.serverSubuser.findUnique({
        where: {
          serverId_userId: {
            serverId: server.id,
            userId: req.user.sub,
          },
        },
      });

      if (subuser) {
        req.isOwner = false;
        try {
          req.subuserPermissions = JSON.parse(subuser.permissions);
        } catch {
          req.subuserPermissions = [];
        }
        return next();
      }

      res.status(403).json({ error: 'You do not have access to this server.' });
    } catch (err) {
      logger.error('Error in requireOwnership', { serverId, err });
      res.status(500).json({ error: 'Failed to verify server ownership.' });
    }
  })();
}

// ─── requirePermission ────────────────────────────────────────────────────────

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.user?.role === Role.ADMIN || req.isOwner) {
      return next();
    }

    const perms = req.subuserPermissions || [];
    const hasPerm =
      perms.includes('*') ||
      perms.includes(permission) ||
      perms.some((p) => {
        if (p.endsWith('.*')) {
          const prefix = p.slice(0, -2);
          return permission.startsWith(prefix);
        }
        return false;
      });

    if (!hasPerm) {
      res.status(403).json({
        error: `Insufficient permissions. Required: ${permission}`,
      });
      return;
    }

    next();
  };
}
