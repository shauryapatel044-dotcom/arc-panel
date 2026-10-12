/**
 * src/routes/auth.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Authentication routes:
 *  POST /register         — create account
 *  POST /login            — credentials + optional 2FA check
 *  POST /login/2fa        — complete 2FA challenge
 *  POST /refresh          — exchange refresh token
 *  POST /logout           — revoke refresh token
 *  POST /change-password  — forced password change flow
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Role } from '@prisma/client';
import prisma from '../prisma';
import { authService } from '../services/AuthService';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validate';
import logger from '../logger';

const router = Router();
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const RegisterSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username must be at most 32 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username may only contain letters, numbers, _ and -'),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long'),
});

const LoginSchema = z.object({
  email: z.string().min(1, 'Email or username is required'),
  password: z.string().min(1, 'Password is required'),
  totpCode: z.string().optional(),
});

const TwoFaLoginSchema = z.object({
  pendingToken: z.string().min(1),
  totpCode: z.string().length(6, 'TOTP code must be 6 digits'),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const LogoutSchema = z.object({
  refreshToken: z.string().optional(),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).max(128),
});

// ─── POST /register ───────────────────────────────────────────────────────────

router.post('/register', validate(RegisterSchema), async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body as z.infer<typeof RegisterSchema>;

    // Check uniqueness
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });

    if (existing) {
      const field = existing.email === email ? 'email' : 'username';
      res.status(409).json({ error: `A user with that ${field} already exists.` });
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = await prisma.user.create({
      data: { username, email, passwordHash, role: Role.USER },
      select: { id: true, username: true, email: true, role: true, createdAt: true },
    });

    const tokens = await authService.generateTokens(user);

    logger.info('New user registered', { userId: user.id, email });
    res.status(201).json({
      user: {
        ...user,
        role: user.role.toLowerCase(),
        status: 'active',
        firstLogin: false,
        twoFactorEnabled: false,
      },
      tokens: { ...tokens, expiresIn: 900 },
      ...tokens,
    });
  } catch (err) {
    logger.error('Registration error', { err });
    res.status(500).json({ error: 'Registration failed.' });
  }
});

// ─── POST /login ──────────────────────────────────────────────────────────────

router.post('/login', validate(LoginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password, totpCode } = req.body as z.infer<typeof LoginSchema>;

    const normalizedInput = email.trim();
    let user = await prisma.user.findFirst({
      where: {
        OR: [{ email: normalizedInput }, { username: normalizedInput }],
      },
    });

    // Auto-bootstrap default admin if database has no admin user yet
    if (
      !user &&
      (normalizedInput.toLowerCase() === 'admin@arc.local' ||
        normalizedInput.toLowerCase() === 'admin')
    ) {
      const adminCount = await prisma.user.count({
        where: { role: Role.ADMIN },
      });
      if (adminCount === 0) {
        const defaultHash = await bcrypt.hash('admin', BCRYPT_ROUNDS);
        user = await prisma.user.create({
          data: {
            username: 'admin',
            email: 'admin@arc.local',
            passwordHash: defaultHash,
            role: Role.ADMIN,
            forcePasswordChange: true,
          },
        });
        logger.info('Auto-bootstrapped default admin user (admin@arc.local)');
      }
    }

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    if (user.suspended) {
      res.status(403).json({ error: 'Your account has been suspended.' });
      return;
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    // ── 2FA Check ────────────────────────────────────────────────────────────
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      if (!totpCode) {
        const pendingToken =
          require('jsonwebtoken').sign(
            { sub: user.id, pending2fa: true },
            process.env.JWT_SECRET!,
            { expiresIn: '5m' }
          );

        res.status(200).json({
          requires2FA: true,
          pendingToken,
        });
        return;
      }

      const valid = authService.verifyTotp(user.twoFactorSecret, totpCode);
      if (!valid) {
        res.status(401).json({ error: 'Invalid 2FA code.' });
        return;
      }
    }

    const safeUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };

    const tokens = await authService.generateTokens(safeUser);

    logger.info('User logged in', { userId: user.id });
    res.json({
      firstLogin: user.forcePasswordChange,
      tokens: {
        ...tokens,
        expiresIn: 900,
      },
      user: {
        ...safeUser,
        role: safeUser.role.toLowerCase(),
        status: user.suspended ? 'suspended' : 'active',
        firstLogin: user.forcePasswordChange,
        forcePasswordChange: user.forcePasswordChange,
        twoFactorEnabled: user.twoFactorEnabled,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      ...tokens,
    });
  } catch (err) {
    logger.error('Login error', { err });
    res.status(500).json({ error: 'Login failed.' });
  }
});

// ─── POST /login/2fa ──────────────────────────────────────────────────────────

router.post('/login/2fa', validate(TwoFaLoginSchema), async (req: Request, res: Response) => {
  try {
    const { pendingToken, totpCode } = req.body as z.infer<typeof TwoFaLoginSchema>;
    const jwt = require('jsonwebtoken');

    let decoded: { sub: string; pending2fa?: boolean };
    try {
      decoded = jwt.verify(pendingToken, process.env.JWT_SECRET!);
    } catch {
      res.status(401).json({ error: 'Invalid or expired 2FA challenge token.' });
      return;
    }

    if (!decoded.pending2fa) {
      res.status(400).json({ error: 'Token is not a pending 2FA token.' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user || !user.twoFactorSecret || !user.twoFactorEnabled) {
      res.status(400).json({ error: 'User does not have 2FA enabled.' });
      return;
    }

    const valid = authService.verifyTotp(user.twoFactorSecret, totpCode);
    if (!valid) {
      res.status(401).json({ error: 'Invalid 2FA code.' });
      return;
    }

    const safeUser = { id: user.id, username: user.username, email: user.email, role: user.role };
    const tokens = await authService.generateTokens(safeUser);

    logger.info('2FA login completed', { userId: user.id });
    res.json({
      user: { ...safeUser, forcePasswordChange: user.forcePasswordChange, twoFactorEnabled: true },
      ...tokens,
    });
  } catch (err) {
    logger.error('2FA login error', { err });
    res.status(500).json({ error: '2FA verification failed.' });
  }
});

// ─── POST /refresh ────────────────────────────────────────────────────────────

router.post('/refresh', validate(RefreshSchema), async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body as z.infer<typeof RefreshSchema>;

    const { payload, sessionId } = await authService.verifyRefreshToken(refreshToken);

    // Rotate: delete old session
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});

    // Fetch current user (in case role changed since last login)
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, email: true, role: true, suspended: true },
    });

    if (!user) {
      res.status(401).json({ error: 'User no longer exists.' });
      return;
    }

    if (user.suspended) {
      res.status(403).json({ error: 'Account is suspended.' });
      return;
    }

    const tokens = await authService.generateTokens(user);
    res.json(tokens);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Token refresh failed.';
    res.status(401).json({ error: msg });
  }
});

// ─── POST /logout ─────────────────────────────────────────────────────────────

router.post('/logout', validate(LogoutSchema), async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body as z.infer<typeof LogoutSchema>;
    if (refreshToken) {
      await authService.revokeRefreshToken(refreshToken);
    }
    res.json({ message: 'Logged out successfully.' });
  } catch (err) {
    logger.error('Logout error', { err });
    res.status(500).json({ error: 'Logout failed.' });
  }
});

// ─── POST /change-password ────────────────────────────────────────────────────

router.post(
  '/change-password',
  authenticateToken,
  validate(ChangePasswordSchema),
  async (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body as z.infer<typeof ChangePasswordSchema>;
      const userId = req.user!.sub;

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      // If not a forced first-login password change, verify currentPassword
      if (!user.forcePasswordChange || currentPassword) {
        if (!currentPassword) {
          res.status(400).json({ error: 'Current password is required.' });
          return;
        }
        const passwordValid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!passwordValid) {
          res.status(400).json({ error: 'Current password is incorrect.' });
          return;
        }
      }

      const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

      await prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: newHash,
          forcePasswordChange: false,
        },
      });

      logger.info('Password changed', { userId });
      res.json({ message: 'Password changed successfully.' });
    } catch (err) {
      logger.error('Change password error', { err });
      res.status(500).json({ error: 'Failed to change password.' });
    }
  }
);

export default router;
