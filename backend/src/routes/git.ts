/**
 * src/routes/git.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * GitHub Repository Synchronization Routes:
 *  • GET    /api/servers/:serverId/git          — Get current Git integration status
 *  • POST   /api/servers/:serverId/git/test     — Test connection to repo with PAT
 *  • POST   /api/servers/:serverId/git/branches — Fetch remote branches
 *  • POST   /api/servers/:serverId/git/connect  — Connect repo and save credentials
 *  • POST   /api/servers/:serverId/git/pull     — Pull / sync latest code
 *  • DELETE /api/servers/:serverId/git          — Disconnect GitHub repository
 *  • POST   /api/servers/:serverId/git/webhook  — GitHub auto-deploy webhook receiver
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../prisma';
import { authenticateToken, requireOwnership, requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { gitService } from '../services/GitService';
import { auditService } from '../services/AuditService';
import logger from '../logger';

const router = Router({ mergeParams: true });

const GitConnectSchema = z.object({
  repo: z.string().min(3, 'Repository name or URL is required'),
  token: z.string().min(10, 'GitHub Personal Access Token (ghp_...) is required'),
  branch: z.string().default('main'),
  targetDir: z.string().default('/'),
  autoDeploy: z.boolean().default(false),
});

const GitTestSchema = z.object({
  repo: z.string().min(3, 'Repository is required'),
  token: z.string().min(10, 'GitHub Token is required'),
});

const GitBranchesSchema = z.object({
  repo: z.string().min(3),
  token: z.string().optional(),
});

// ─── GET /api/servers/:serverId/git ──────────────────────────────────────────
router.get(
  '/',
  authenticateToken,
  requireOwnership,
  requirePermission('files.read'),
  async (req: Request, res: Response) => {
    const { serverId } = req.params;
    try {
      const server = await prisma.server.findUnique({
        where: { id: serverId },
        select: {
          id: true,
          githubRepo: true,
          githubBranch: true,
          githubTargetDir: true,
          githubAutoDeploy: true,
          githubLastSync: true,
          githubLastCommit: true,
          githubLastMessage: true,
          githubToken: true,
        },
      });

      if (!server) {
        res.status(404).json({ error: 'Server not found.' });
        return;
      }

      const isConfigured = Boolean(server.githubRepo && server.githubToken);

      // Mask token: "ghp_abc...xyz"
      let maskedToken: string | null = null;
      if (server.githubToken) {
        const raw = server.githubToken;
        if (raw.length > 8) {
          maskedToken = `${raw.substring(0, 7)}...${raw.substring(raw.length - 4)}`;
        } else {
          maskedToken = '********';
        }
      }

      const webhookUrl = `${process.env.PANEL_URL || 'http://localhost:8080'}/api/servers/${serverId}/git/webhook`;

      res.json({
        configured: isConfigured,
        repo: server.githubRepo,
        branch: server.githubBranch || 'main',
        targetDir: server.githubTargetDir || '/',
        autoDeploy: server.githubAutoDeploy,
        lastSync: server.githubLastSync?.toISOString() || null,
        lastCommit: server.githubLastCommit,
        lastMessage: server.githubLastMessage,
        maskedToken,
        webhookUrl,
      });
    } catch (err) {
      logger.error('GET /api/servers/:serverId/git error', { err });
      res.status(500).json({ error: 'Failed to retrieve Git settings.' });
    }
  }
);

// ─── POST /api/servers/:serverId/git/test ─────────────────────────────────────
router.post(
  '/test',
  authenticateToken,
  requireOwnership,
  validate(GitTestSchema),
  async (req: Request, res: Response) => {
    const { repo, token } = req.body;
    try {
      const info = await gitService.testConnection(repo, token);
      res.json({ success: true, info });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection test failed.';
      res.status(400).json({ error: msg });
    }
  }
);

// ─── POST /api/servers/:serverId/git/branches ─────────────────────────────────
router.post(
  '/branches',
  authenticateToken,
  requireOwnership,
  validate(GitBranchesSchema),
  async (req: Request, res: Response) => {
    const { serverId } = req.params;
    const { repo, token } = req.body;
    try {
      let activeToken = token;
      if (!activeToken) {
        const server = await prisma.server.findUnique({
          where: { id: serverId },
          select: { githubToken: true },
        });
        activeToken = server?.githubToken || undefined;
      }

      if (!activeToken) {
        res.status(400).json({ error: 'Personal Access Token is required to fetch branches.' });
        return;
      }

      const branches = await gitService.fetchBranches(repo, activeToken);
      res.json({ branches });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch branches.';
      res.status(400).json({ error: msg });
    }
  }
);

// ─── POST /api/servers/:serverId/git/connect ──────────────────────────────────
router.post(
  '/connect',
  authenticateToken,
  requireOwnership,
  requirePermission('files.write'),
  validate(GitConnectSchema),
  async (req: Request, res: Response) => {
    const { serverId } = req.params;
    const { repo, token, branch, targetDir, autoDeploy } = req.body;

    try {
      // 1. Verify token & repository access
      const repoInfo = await gitService.testConnection(repo, token);

      // 2. Persist to server
      const updated = await prisma.server.update({
        where: { id: serverId },
        data: {
          githubRepo: repoInfo.fullName,
          githubToken: token.trim(),
          githubBranch: branch || repoInfo.defaultBranch,
          githubTargetDir: targetDir || '/',
          githubAutoDeploy: Boolean(autoDeploy),
        },
      });

      // 3. Log audit event
      await auditService.log({
        serverId,
        userId: req.user?.sub,
        action: 'github.connect',
        details: JSON.stringify({ repo: repoInfo.fullName, branch }),
        ipAddress: req.ip,
      });

      logger.info(`Server ${serverId} linked to GitHub repo ${repoInfo.fullName}`);

      res.json({
        success: true,
        message: `Successfully connected to ${repoInfo.fullName}.`,
        server: {
          repo: updated.githubRepo,
          branch: updated.githubBranch,
          targetDir: updated.githubTargetDir,
          autoDeploy: updated.githubAutoDeploy,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect GitHub repository.';
      res.status(400).json({ error: msg });
    }
  }
);

// ─── POST /api/servers/:serverId/git/pull ─────────────────────────────────────
router.post(
  '/pull',
  authenticateToken,
  requireOwnership,
  requirePermission('files.write'),
  async (req: Request, res: Response) => {
    const { serverId } = req.params;
    try {
      const result = await gitService.pullRepo(serverId, req.user?.sub, req.ip);
      res.json({
        success: true,
        message: `Successfully pulled latest commit: ${result.commit.shortSha} ("${result.commit.message}")`,
        commit: result.commit,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to pull repository.';
      res.status(400).json({ error: msg });
    }
  }
);

// ─── DELETE /api/servers/:serverId/git ────────────────────────────────────────
router.delete(
  '/',
  authenticateToken,
  requireOwnership,
  requirePermission('files.write'),
  async (req: Request, res: Response) => {
    const { serverId } = req.params;
    try {
      await prisma.server.update({
        where: { id: serverId },
        data: {
          githubRepo: null,
          githubToken: null,
          githubBranch: 'main',
          githubTargetDir: '/',
          githubAutoDeploy: false,
          githubLastSync: null,
          githubLastCommit: null,
          githubLastMessage: null,
        },
      });

      await auditService.log({
        serverId,
        userId: req.user?.sub,
        action: 'github.disconnect',
        details: 'Disconnected GitHub repository',
        ipAddress: req.ip,
      });

      res.json({ success: true, message: 'GitHub repository disconnected.' });
    } catch (err) {
      logger.error('DELETE /api/servers/:serverId/git error', { err });
      res.status(500).json({ error: 'Failed to disconnect repository.' });
    }
  }
);

// ─── POST /api/servers/:serverId/git/webhook ──────────────────────────────────
router.post('/webhook', async (req: Request, res: Response) => {
  const { serverId } = req.params;
  try {
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { githubAutoDeploy: true, githubRepo: true },
    });

    if (!server || !server.githubAutoDeploy || !server.githubRepo) {
      res.status(200).json({ message: 'Auto-deploy ignored (disabled or unconfigured).' });
      return;
    }

    // Trigger pull in background
    void gitService.pullRepo(serverId, undefined, req.ip);
    res.status(200).json({ message: 'Auto-deploy webhook received, pull initiated.' });
  } catch (err) {
    logger.error('Git webhook error', { serverId, err });
    res.status(500).json({ error: 'Webhook processing failed.' });
  }
});

export default router;
