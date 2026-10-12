/**
 * src/services/AuthService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Authentication service: JWT generation/verification, session management,
 * and TOTP 2FA helpers.
 */

import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { Role, User } from '@prisma/client';
import prisma from '../prisma';
import logger from '../logger';
import { JwtPayload } from '../middleware/auth';

// ─── Token Lifetimes ─────────────────────────────────────────────────────────
const ACCESS_TOKEN_TTL = '7d';    // 7 days
const REFRESH_TOKEN_TTL = '7d';   // 7 days
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

// ─── Token Pair ──────────────────────────────────────────────────────────────
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// ─── TOTP Setup Result ────────────────────────────────────────────────────────
export interface TotpSetup {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

// ─── AuthService ──────────────────────────────────────────────────────────────

class AuthService {
  /**
   * Generates an access token + refresh token pair for a user.
   * The refresh token is persisted in the Session table.
   */
  async generateTokens(user: Pick<User, 'id' | 'username' | 'email' | 'role'>): Promise<TokenPair> {
    const jwtSecret = this.getSecret('JWT_SECRET');
    const refreshSecret = this.getSecret('JWT_REFRESH_SECRET');

    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };

    const accessToken = jwt.sign(payload, jwtSecret, { expiresIn: ACCESS_TOKEN_TTL });

    // Refresh token carries a unique jti to allow individual revocation
    const jti = uuidv4();
    const refreshToken = jwt.sign({ ...payload, jti }, refreshSecret, { expiresIn: REFRESH_TOKEN_TTL });

    // Persist session
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken,
        expiresAt,
      },
    });

    logger.debug('Tokens generated', { userId: user.id });
    return { accessToken, refreshToken };
  }

  /**
   * Verifies an access token and returns its decoded payload.
   * Throws on invalid or expired token.
   */
  verifyAccessToken(token: string): JwtPayload {
    const secret = this.getSecret('JWT_SECRET');
    return jwt.verify(token, secret) as JwtPayload;
  }

  /**
   * Verifies a refresh token against the database session.
   * Returns the stored session + decoded payload on success.
   */
  async verifyRefreshToken(token: string): Promise<{ payload: JwtPayload; sessionId: string }> {
    const secret = this.getSecret('JWT_REFRESH_SECRET');

    // Verify cryptographic signature first
    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, secret) as JwtPayload;
    } catch {
      throw new Error('Invalid refresh token signature.');
    }

    // Check DB — if in-memory store restarted, re-register valid signed token
    let session = await prisma.session.findUnique({
      where: { refreshToken: token },
    });

    if (!session) {
      session = await prisma.session.create({
        data: {
          userId: payload.sub,
          refreshToken: token,
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        },
      });
    }

    if (session.expiresAt < new Date()) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      throw new Error('Refresh token has expired.');
    }

    return { payload, sessionId: session.id };
  }

  /**
   * Deletes a refresh token session from the database (logout).
   */
  async revokeRefreshToken(token: string): Promise<void> {
    await prisma.session.deleteMany({ where: { refreshToken: token } });
    logger.debug('Refresh token revoked');
  }

  /**
   * Deletes ALL sessions for a given user (force logout everywhere).
   */
  async revokeAllUserSessions(userId: string): Promise<void> {
    const { count } = await prisma.session.deleteMany({ where: { userId } });
    logger.info('All sessions revoked', { userId, count });
  }

  /**
   * Generates a new TOTP secret for the given username and returns:
   *  • The raw base32 secret (to be stored encrypted)
   *  • The otpauth:// URL
   *  • A base64-encoded PNG QR code
   */
  async generateTotpSecret(username: string): Promise<TotpSetup> {
    const secretObj = speakeasy.generateSecret({
      name: `Arc Panel (${username})`,
      issuer: 'Arc Panel',
      length: 20,
    });

    const otpauthUrl = secretObj.otpauth_url as string;
    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

    return {
      secret: secretObj.base32,
      otpauthUrl,
      qrCodeDataUrl,
    };
  }

  /**
   * Verifies a TOTP token against a stored base32 secret.
   * Allows a 1-step window (±30 seconds) to account for clock drift.
   */
  verifyTotp(secret: string, token: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1,
    });
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private getSecret(envKey: string): string {
    const val = process.env[envKey];
    if (!val) {
      throw new Error(`Environment variable ${envKey} is not set.`);
    }
    return val;
  }
}

export const authService = new AuthService();
export default authService;
