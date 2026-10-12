/**
 * Arc Panel Daemon — Health Route
 *
 * GET /api/health
 * Returns basic liveness information so the panel can verify the daemon
 * is reachable and learn about its runtime state.
 */

import { Router, Request, Response } from 'express';
import os from 'os';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const mem = process.memoryUsage();

  res.json({
    status: 'online',
    version: '1.0.0',
    uptime: process.uptime(),           // seconds since daemon started
    memory: {
      rss: mem.rss,                     // resident set size (bytes)
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
    },
    cpu: os.loadavg(),                  // [1 min, 5 min, 15 min] averages
    platform: process.platform,
    nodeVersion: process.version,
    hostname: os.hostname(),
    timestamp: new Date().toISOString(),
  });
});

export default router;
