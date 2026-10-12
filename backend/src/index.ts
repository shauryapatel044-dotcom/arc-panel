/**
 * src/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Arc Panel — Enterprise Backend API Entrypoint (Port 3001)
 *
 * Responsibilities:
 *  • Express HTTP server with Helmet, CORS, Rate Limiting, and Morgan logging
 *  • REST API route mounting (/api/auth, /api/servers, /api/admin, /api/profile, etc.)
 *  • Socket.IO real-time server for console streaming and live resource telemetry
 *  • Automatic node health & token handshake verification on startup
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';

// Ensure BigInt values serialize safely in all JSON responses
if (typeof (BigInt.prototype as any).toJSON !== 'function') {
  (BigInt.prototype as any).toJSON = function () {
    return Number(this);
  };
}

// Load .env variables into process.env if not already set
const envFilePath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envFilePath)) {
  const lines = fs.readFileSync(envFilePath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

import prisma from './prisma';
import logger from './logger';
import { nodeService } from './services/NodeService';
import { registerConsoleProxy } from './websocket/consoleProxy';

// Route imports
import authRoutes from './routes/auth';
import profileRoutes from './routes/profile';
import serverRoutes from './routes/servers';
import fileRoutes from './routes/files';
import backupRoutes from './routes/backups';
import adminRoutes from './routes/admin';

// ─── Configuration ────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3001', 10);
const PANEL_URL = process.env.PANEL_URL || 'http://localhost:8080';

const app = express();
app.set('etag', false);
const httpServer = http.createServer(app);

// ─── Security & Core Middleware ───────────────────────────────────────────────

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests from the panel frontend, local dev, or non-browser tools
      if (!origin || origin.startsWith('http://localhost') || origin.startsWith(PANEL_URL)) {
        callback(null, true);
      } else {
        callback(null, true); // Permissive in multi-IP VPS environments unless locked down
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Arc-Panel', 'Cache-Control', 'Pragma'],
  })
);

// Prevent browser/Express 304 caching on dynamic API endpoints
app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Rate limiting to protect auth and API endpoints
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

app.use('/api', apiLimiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging via Morgan -> Winston
app.use(
  morgan(':method :url :status :res[content-length] - :response-time ms', {
    stream: {
      write: (message: string) => logger.http(message.trim()),
    },
  })
);

// ─── Health Check Endpoint ────────────────────────────────────────────────────

app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const nodes = await prisma.node.findMany({
      select: { id: true, name: true, fqdn: true, port: true, isOnline: true },
    });
    res.json({
      status: 'online',
      service: 'arc-panel-backend',
      version: '1.0.0',
      uptime: process.uptime(),
      database: 'connected',
      nodes,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Healthcheck DB failure', { err });
    res.status(503).json({
      status: 'degraded',
      service: 'arc-panel-backend',
      database: 'disconnected',
    });
  }
});

// ─── API Route Mounting ───────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);

// Mount profile routes on both /api/profile and /api/users for client compatibility
app.use('/api/profile', profileRoutes);
app.use('/api/users', profileRoutes);

// Server routes + nested file & backup routes
app.use('/api/servers', serverRoutes);
app.use('/api/servers/:serverId/files', fileRoutes);
app.use('/api/files/:serverId', fileRoutes);
app.use('/api/servers/:serverId/backups', backupRoutes);
app.use('/api/backups/:serverId', backupRoutes);

// Admin routes (/api/admin/stats, /api/admin/users, /api/admin/servers, /api/admin/nodes)
app.use('/api/admin', adminRoutes);

// ─── 404 & Global Error Handler ───────────────────────────────────────────────

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled Express error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error.' });
});

// ─── Socket.IO Initialization (Console & Telemetry Proxy) ─────────────────────

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

registerConsoleProxy(io);

// ─── Bootstrap & Auto-Connection Handshake Verification ──────────────────────

async function bootstrap(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('Connected to MariaDB database.');

    // Synchronize local node token if DAEMON_TOKEN is set in environment (from install.sh)
    const envDaemonToken = process.env.DAEMON_TOKEN;
    if (envDaemonToken && envDaemonToken !== 'will_be_set_by_install_script') {
      await prisma.node
        .updateMany({
          where: { name: 'local' },
          data: { daemonToken: envDaemonToken },
        })
        .catch((err) => {
          logger.debug('Local node token sync skipped or not yet seeded', { err });
        });
    }

    // Perform initial health handshake with all registered daemon nodes
    await nodeService.checkAllNodes();

    // Schedule periodic node health check every 30 seconds
    setInterval(() => {
      void nodeService.checkAllNodes();
    }, 30_000);

    httpServer.listen(PORT, '0.0.0.0', () => {
      logger.info(`Arc Panel Backend API listening on http://0.0.0.0:${PORT}`);
    });
  } catch (err) {
    logger.error('Failed to bootstrap Arc Panel Backend', { err });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down Arc Panel Backend...');
  await prisma.$disconnect();
  httpServer.close(() => process.exit(0));
});

void bootstrap();
