/**
 * src/routes/profile.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * User profile management routes (all require authentication):
 *  GET    /me           — fetch current user profile
 *  PATCH  /me           — update username / email
 *  POST   /me/2fa/setup — generate TOTP secret and QR code
 *  POST   /me/2fa/verify — verify TOTP and enable 2FA
 *  DELETE /me/2fa       — disable 2FA
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../prisma';
import { authenticateToken } from '../middleware/auth';
import { authService } from '../services/AuthService';
import { validate } from '../middleware/validate';
import logger from '../logger';

const router = Router();

// All profile routes require authentication
router.use(authenticateToken);

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const UpdateProfileSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  email: z.string().email().optional(),
}).refine((d) => d.username || d.email, {
  message: 'At least one field (username or email) must be provided.',
});

const VerifyTotpSchema = z.object({
  secret: z.string().min(10, 'Secret is required'),
  token: z.string().length(6, 'TOTP code must be 6 digits'),
});

const Disable2faSchema = z.object({
  password: z.string().min(1, 'Current password is required to disable 2FA'),
});

// ─── GET /me ──────────────────────────────────────────────────────────────────

router.get('/me', async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        twoFactorEnabled: true,
        forcePasswordChange: true,
        suspended: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { servers: true } },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    res.json(user);
  } catch (err) {
    logger.error('GET /me error', { err });
    res.status(500).json({ error: 'Failed to fetch profile.' });
  }
});

// ─── PATCH /me ────────────────────────────────────────────────────────────────

router.patch('/me', validate(UpdateProfileSchema), async (req: Request, res: Response) => {
  try {
    const { username, email } = req.body as z.infer<typeof UpdateProfileSchema>;
    const userId = req.user!.sub;

    // Check uniqueness of new values
    if (username) {
      const taken = await prisma.user.findFirst({
        where: { username, NOT: { id: userId } },
      });
      if (taken) {
        res.status(409).json({ error: 'Username is already taken.' });
        return;
      }
    }

    if (email) {
      const taken = await prisma.user.findFirst({
        where: { email, NOT: { id: userId } },
      });
      if (taken) {
        res.status(409).json({ error: 'Email is already in use.' });
        return;
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(username && { username }),
        ...(email && { email }),
      },
      select: {
        id: true, username: true, email: true, role: true,
        twoFactorEnabled: true, forcePasswordChange: true, createdAt: true, updatedAt: true,
      },
    });

    logger.info('Profile updated', { userId });
    res.json(updated);
  } catch (err) {
    logger.error('PATCH /me error', { err });
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// ─── POST /me/2fa/setup ───────────────────────────────────────────────────────

router.post('/me/2fa/setup', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.sub;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    if (user.twoFactorEnabled) {
      res.status(409).json({ error: '2FA is already enabled on this account.' });
      return;
    }

    const setup = await authService.generateTotpSecret(user.username);

    // Temporarily store the secret (not yet enabled — user must verify)
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: setup.secret, twoFactorEnabled: false },
    });

    logger.info('2FA setup initiated', { userId });
    res.json({
      secret: setup.secret,
      otpauthUrl: setup.otpauthUrl,
      qrCode: setup.qrCodeDataUrl,
    });
  } catch (err) {
    logger.error('2FA setup error', { err });
    res.status(500).json({ error: '2FA setup failed.' });
  }
});

// ─── POST /me/2fa/verify ──────────────────────────────────────────────────────

router.post('/me/2fa/verify', validate(VerifyTotpSchema), async (req: Request, res: Response) => {
  try {
    const { secret, token } = req.body as z.infer<typeof VerifyTotpSchema>;
    const userId = req.user!.sub;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    // Verify the code against the provided secret (must match what we stored)
    if (user.twoFactorSecret !== secret) {
      res.status(400).json({ error: 'Secret mismatch. Please start setup again.' });
      return;
    }

    const valid = authService.verifyTotp(secret, token);
    if (!valid) {
      res.status(400).json({ error: 'Invalid TOTP code. Please check your authenticator app.' });
      return;
    }

    // Activate 2FA
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });

    logger.info('2FA enabled', { userId });
    res.json({ message: '2FA has been enabled on your account.' });
  } catch (err) {
    logger.error('2FA verify error', { err });
    res.status(500).json({ error: '2FA verification failed.' });
  }
});

// ─── DELETE /me/2fa ───────────────────────────────────────────────────────────

router.delete('/me/2fa', validate(Disable2faSchema), async (req: Request, res: Response) => {
  try {
    const { password } = req.body as z.infer<typeof Disable2faSchema>;
    const userId = req.user!.sub;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    if (!user.twoFactorEnabled) {
      res.status(400).json({ error: '2FA is not enabled on this account.' });
      return;
    }

    // Re-confirm identity with password before disabling 2FA
    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      res.status(401).json({ error: 'Incorrect password.' });
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: null, twoFactorEnabled: false },
    });

    logger.info('2FA disabled', { userId });
    res.json({ message: '2FA has been disabled on your account.' });
  } catch (err) {
    logger.error('Disable 2FA error', { err });
    res.status(500).json({ error: 'Failed to disable 2FA.' });
  }
});

export default router;
