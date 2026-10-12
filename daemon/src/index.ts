/**
 * Arc Panel Daemon — Entry Point
 *
 * Responsibilities:
 *  1. Load environment / config
 *  2. Bootstrap Express REST API with auth middleware
 *  3. Attach a native WebSocket server for console streaming
 *  4. Start the SFTP server
 *  5. Ensure required data directories exist
 */

import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer } from 'ws';
import app from './app';
import { logger } from './utils/logger';
import { handleConsoleUpgrade } from './websocket/consoleHandler';
import { startSftpServer } from './sftp/SftpServer';
import { config } from './config';

// ── Ensure critical directories exist before anything else ─────────────────
function ensureDirectories(): void {
  const dirs = [
    config.dataDir,
    config.backupDir,
    path.join(config.dataDir, 'servers'), // per-server sub-directories live here
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info(`Created directory: ${dir}`);
    }
  }
}

async function bootstrap(): Promise<void> {
  // 1. Ensure all required directories are present on disk.
  ensureDirectories();

  // 2. Wrap Express in a plain Node HTTP server so we can share it with the
  //    WebSocket server (both listen on the same port via the upgrade event).
  const httpServer = http.createServer(app);

  // 3. Create the WebSocket server WITHOUT its own HTTP server so it piggybacks
  //    on the existing HTTP server's upgrade events.
  const wss = new WebSocketServer({ noServer: true });

  // 4. Route HTTP upgrade requests to the correct WS handler.
  //    Console stream:  /ws/servers/:id/console?token=<DAEMON_TOKEN>
  httpServer.on('upgrade', (request, socket, head) => {
    const url = request.url ?? '';

    if (url.startsWith('/ws/servers/') && url.includes('/console')) {
      wss.handleUpgrade(request, socket as import('stream').Duplex, head, (ws) => {
        handleConsoleUpgrade(ws, request);
      });
    } else {
      // Unknown upgrade target — destroy the socket cleanly.
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      logger.warn(`Rejected WebSocket upgrade for unknown path: ${url}`);
    }
  });

  // 5. Start SFTP server (non-blocking, listens on its own port).
  startSftpServer();

  // 6. Start the HTTP server.
  httpServer.listen(config.port, '0.0.0.0', () => {
    logger.info(`Arc Panel Daemon v1.0.0 listening on port ${config.port}`);
    logger.info(`Environment : ${config.nodeEnv}`);
    logger.info(`Data Dir    : ${config.dataDir}`);
    logger.info(`Backup Dir  : ${config.backupDir}`);
    logger.info(`SFTP Port   : ${config.sftpPort}`);
  });

  // 7. Graceful shutdown handlers.
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully…`);
    httpServer.close(() => {
      logger.info('HTTP server closed.');
      process.exit(0);
    });

    // Force-exit after 10 s if connections linger.
    setTimeout(() => {
      logger.error('Forced exit after timeout.');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection:', { reason });
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', { err });
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  // Logger might not be ready yet — fall back to console.
  console.error('Fatal: failed to start daemon', err);
  process.exit(1);
});
