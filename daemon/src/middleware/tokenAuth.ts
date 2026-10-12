/**
 * Arc Panel Daemon — Token Authentication Middleware
 *
 * Every HTTP request (REST) must carry:
 *   Authorization: Bearer <DAEMON_TOKEN>
 *
 * WebSocket upgrade requests carry the token in the query string:
 *   /ws/servers/:id/console?token=<DAEMON_TOKEN>
 * (The WS upgrade handler calls verifyToken() directly, NOT this middleware.)
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Verify a raw token string against the configured daemon token.
 * Returns true if valid, false otherwise.
 */
export function verifyToken(token: string | undefined | null): boolean {
  if (!token) return false;
  // Use a simple constant-time comparison to avoid timing attacks.
  // For Node ≥ 21 use crypto.timingSafeEqual; here we keep it dependency-free.
  const expected = config.daemonToken;
  if (token.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Express middleware.
 * Accepts:
 *  - Authorization: Bearer <token>   (preferred, used by REST clients)
 *  - ?token=<token>                   (fallback for browser-based clients)
 */
export function tokenAuth(req: Request, res: Response, next: NextFunction): void {
  // 0. Allow public health check endpoint (used by install.sh & monitoring)
  if (
    req.method === 'GET' &&
    (req.path === '/api/health' || req.path === '/health')
  ) {
    return next();
  }

  // 1. Try Authorization header first.
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (verifyToken(token)) {
      return next();
    }
  }

  // 2. Fallback: query string (useful for download links etc.)
  const queryToken = req.query['token'] as string | undefined;
  if (verifyToken(queryToken)) {
    return next();
  }

  // 3. Reject — log the attempt for auditability.
  logger.warn(`Unauthorized request: ${req.method} ${req.path}`, {
    ip: req.ip,
    authHeader: authHeader ? '[present but invalid]' : '[missing]',
  });

  res.status(401).json({
    error: 'Unauthorized',
    message: 'A valid Bearer token is required.',
  });
}
