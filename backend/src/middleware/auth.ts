/**
 * src/middleware/auth.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * JWT authentication middleware and role / ownership guards.
 *
 * Middleware:
 *  • authenticateToken  — verifies Bearer JWT, attaches decoded payload to req.user
 *  • requireAdmin       — ensures the authenticated user has the ADMIN role
 *  • requireOwnership   — ensures the server in :serverId / :id belongs to the user
 *                          (ADMINs bypass the ownership check)
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

// Augment Express Request to carry our decoded user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// ─── authenticateToken ────────────────────────────────────────────────────────

/**
 * Verifies the Authorization: Bearer <token> header.
 * On success, attaches the decoded payload to req.user.
 */
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

/**
 * Must be used AFTER authenticateToken.
 * Returns 403 if the user's role is not ADMIN.
 */
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

// ─── requireOwnership ─────────────────────────────────────────────────────────

/**
 * Must be used AFTER authenticateToken.
 * Checks that the server identified by req.params.serverId (or req.params.id)
 * belongs to req.user. ADMINs are always allowed.
 *
 * Attaches the server to req.server for downstream handlers.
 */
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
        select: { id: true, ownerId: true, nodeId: true, containerId: true, status: true, suspended: true },
      });

      if (!server) {
        res.status(404).json({ error: 'Server not found.' });
        return;
      }

      // ADMINs bypass ownership check
      if (req.user.role !== Role.ADMIN && server.ownerId !== req.user.sub) {
        res.status(403).json({ error: 'You do not have access to this server.' });
        return;
      }

      // Attach server context for downstream route handlers
      (req as Request & { server: typeof server }).server = server;
      next();
    } catch (err) {
      logger.error('Error in requireOwnership', { serverId, err });
      res.status(500).json({ error: 'Failed to verify server ownership.' });
    }
  })();
}
