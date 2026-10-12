/* ════════════════════════════════════════════════════════════════
   src/app/(dashboard)/profile/page.tsx
   User Profile & Security Center — Username/Email, Password,
   and TOTP Authenticator App Two-Factor Authentication (2FA)
════════════════════════════════════════════════════════════════ */

'use client';

import { useState } from 'react';
import {
  User as UserIcon,
  Lock,
  ShieldCheck,
  QrCode,
  CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import GlassInput from '@/components/ui/GlassInput';
import { useAuth } from '@/hooks/useAuth';
import { api, authApi } from '@/lib/api';
import type { TwoFactorSetupResponse } from '@/types';

export default function ProfilePage() {
  const user = useAuth((s) => s.user);
  const updateUser = useAuth((s) => s.updateUser);

  // Profile info state
  const [username, setUsername] = useState(user?.username ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // 2FA state
  const [totpSetup, setTotpSetup] = useState<TwoFactorSetupResponse | null>(
    null,
  );
  const [totpCode, setTotpCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [busy2FA, setBusy2FA] = useState(false);

  /* ── Update Username / Email ──────────────────────────────────── */
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const { data } = await api.patch('/profile/me', { username, email });
      updateUser(data.user ?? { username, email });
      toast.success('Profile updated successfully.');
    } catch {
      toast.error('Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  /* ── Change Password ──────────────────────────────────────────── */
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match.');
      return;
    }
    setSavingPassword(true);
    try {
      await authApi.changePassword({
        currentPassword,
        newPassword,
      });
      toast.success('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      updateUser({ firstLogin: false });
    } catch {
      toast.error('Failed to change password. Verify your current password.');
    } finally {
      setSavingPassword(false);
    }
  };

  /* ── Setup TOTP 2FA ───────────────────────────────────────────── */
  const handleInit2FA = async () => {
    setBusy2FA(true);
    try {
      const { data } = await api.post('/profile/me/2fa/setup');
      setTotpSetup({
        secret: data.secret,
        otpAuthUrl: data.otpauthUrl ?? data.otpAuthUrl,
        qrCodeDataUrl: data.qrCode ?? data.qrCodeDataUrl,
      });
    } catch {
      toast.error('Failed to initialize 2FA setup.');
    } finally {
      setBusy2FA(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpSetup) return;
    setBusy2FA(true);
    try {
      await api.post('/profile/me/2fa/verify', {
        secret: totpSetup.secret,
        token: totpCode.trim(),
      });
      updateUser({ twoFactorEnabled: true });
      setTotpSetup(null);
      setTotpCode('');
      toast.success('Two-Factor Authentication enabled!');
    } catch {
      toast.error('Invalid 6-digit authenticator code.');
    } finally {
      setBusy2FA(false);
    }
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy2FA(true);
    try {
      await api.delete('/profile/me/2fa', {
        data: { password: disablePassword },
      });
      updateUser({ twoFactorEnabled: false });
      setDisablePassword('');
      toast.success('Two-Factor Authentication disabled.');
    } catch {
      toast.error('Could not disable 2FA. Check your password.');
    } finally {
      setBusy2FA(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Account & Security</h1>
        <p className="text-sm text-white/50">
          Update your credentials and configure TOTP Two-Factor Authentication.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Profile Details Card */}
        <GlassCard hoverable={false} accentColor="cyan">
          <div className="flex items-center gap-2.5 border-b border-white/10 pb-3">
            <UserIcon className="h-5 w-5 text-arc-cyan-400" />
            <h2 className="text-base font-semibold text-white">
              Profile Information
            </h2>
          </div>

          <form
            onSubmit={handleSaveProfile}
            className="mt-4 flex flex-col gap-4"
          >
            <GlassInput
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <GlassInput
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <div className="pt-1">
              <GlassButton
                type="submit"
                variant="primary"
                isLoading={savingProfile}
              >
                Update Profile
              </GlassButton>
            </div>
          </form>
        </GlassCard>

        {/* Password Change Card */}
        <GlassCard hoverable={false} accentColor="blue">
          <div className="flex items-center gap-2.5 border-b border-white/10 pb-3">
            <Lock className="h-5 w-5 text-arc-blue-400" />
            <h2 className="text-base font-semibold text-white">
              Change Password
            </h2>
          </div>

          <form
            onSubmit={handleChangePassword}
            className="mt-4 flex flex-col gap-4"
          >
            <GlassInput
              label="Current Password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
            <GlassInput
              label="New Password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <GlassInput
              label="Confirm New Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            <div className="pt-1">
              <GlassButton
                type="submit"
                variant="secondary"
                isLoading={savingPassword}
              >
                Update Password
              </GlassButton>
            </div>
          </form>
        </GlassCard>
      </div>

      {/* Two-Factor Authentication Card */}
      <GlassCard hoverable={false} accentColor="violet">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-arc-violet-400" />
            <div>
              <h2 className="text-base font-semibold text-white">
                Two-Factor Authentication (TOTP)
              </h2>
              <p className="text-xs text-white/50">
                Protect your Arc Panel account with an authenticator app
                (Google Authenticator, Authy, 1Password).
              </p>
            </div>
          </div>

          <span
            className={
              user?.twoFactorEnabled
                ? 'inline-flex items-center gap-1.5 rounded-full border border-arc-cyan-400/30 bg-arc-cyan-400/10 px-3 py-1 text-xs font-semibold text-arc-cyan-400'
                : 'inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/50'
            }
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {user?.twoFactorEnabled ? '2FA Enabled' : '2FA Disabled'}
          </span>
        </div>

        <div className="mt-5">
          {user?.twoFactorEnabled ? (
            <form
              onSubmit={handleDisable2FA}
              className="flex max-w-md flex-col gap-4"
            >
              <GlassInput
                label="Confirm Password to Disable 2FA"
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                required
              />
              <div>
                <GlassButton
                  type="submit"
                  variant="danger"
                  isLoading={busy2FA}
                >
                  Disable Two-Factor Auth
                </GlassButton>
              </div>
            </form>
          ) : totpSetup ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={totpSetup.qrCodeDataUrl}
                  alt="TOTP QR Code"
                  className="h-44 w-44 rounded-xl border border-white/20 bg-white p-2"
                />
                <p className="font-mono text-xs text-arc-cyan-400">
                  Secret: {totpSetup.secret}
                </p>
              </div>

              <form
                onSubmit={handleVerify2FA}
                className="flex flex-col justify-center gap-4"
              >
                <GlassInput
                  label="6-Digit Authenticator Code"
                  placeholder="123456"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  required
                />
                <div className="flex gap-2">
                  <GlassButton
                    type="submit"
                    variant="primary"
                    isLoading={busy2FA}
                  >
                    Verify & Activate 2FA
                  </GlassButton>
                  <GlassButton
                    type="button"
                    variant="ghost"
                    onClick={() => setTotpSetup(null)}
                  >
                    Cancel
                  </GlassButton>
                </div>
              </form>
            </div>
          ) : (
            <GlassButton
              variant="primary"
              isLoading={busy2FA}
              onClick={() => void handleInit2FA()}
              leftIcon={<QrCode className="h-4 w-4" />}
            >
              Configure 2FA Authenticator
            </GlassButton>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
