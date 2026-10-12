/**
 * Arc Panel Daemon — Top-Level API Router
 *
 * Mounts all feature-specific sub-routers under /api.
 * The tokenAuth middleware is already applied globally in app.ts,
 * so no additional auth is needed here.
 */

import { Router } from 'express';
import healthRouter from './health';
import serversRouter from './servers';
import filesRouter from './files';
import backupsRouter from './backups';

export const router = Router();

router.use('/health', healthRouter);
router.use('/servers', serversRouter);
router.use('/files', filesRouter);
router.use('/backups', backupsRouter);
