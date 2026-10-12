/**
 * Arc Panel Daemon — Express Application Factory
 *
 * Separated from index.ts so the app can be tested independently of the
 * HTTP/WebSocket/SFTP lifecycle.
 */

import express, { Request, Response, NextFunction } from 'express';
import { tokenAuth } from './middleware/tokenAuth';
import { router as apiRouter } from './routes/index';
import { logger } from './utils/logger';

const app = express();

// ── Body parsers ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Request logging ─────────────────────────────────────────────────────────
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.http(`${req.method} ${req.url}`, {
    ip: req.ip,
    ua: req.headers['user-agent'],
  });
  next();
});

// ── Global token authentication — applied to every route ────────────────────
app.use(tokenAuth);

// ── API routes ───────────────────────────────────────────────────────────────
app.use('/api', apiRouter);

// ── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

// ── Global error handler ─────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled Express error', { message: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

export default app;
