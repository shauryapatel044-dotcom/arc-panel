/* ════════════════════════════════════════════════════════════════
   src/app/(auth)/login/page.tsx
   Full glassmorphic login page with 2FA support and first-login modal
════════════════════════════════════════════════════════════════ */

'use client';

import { useState, useEffect } from 'react';
import { useRouter }           from 'next/navigation';
import Link                    from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm }             from 'react-hook-form';
import { zodResolver }         from '@hookform/resolvers/zod';
import { z }                   from 'zod';
import toast                   from 'react-hot-toast';
import { Mail, Lock, Shield, Eye, EyeOff, KeyRound } from 'lucide-react';

import { useAuth }    from '@/hooks/useAuth';
import GlassInput     from '@/components/ui/GlassInput';
import GlassButton    from '@/components/ui/GlassButton';
import GlassCard      from '@/components/ui/GlassCard';
import { authApi }    from '@/lib/api';

/* ── Zod schemas ─────────────────────────────────────────────────── */
const loginSchema = z.object({
  email:    z.string().min(1, 'Enter your email or username (e.g. admin)'),
  password: z.string().min(1, 'Password is required'),
  totpCode: z.string().optional(),
});

const changePassSchema = z.object({
  newPassword: z.string()
    .min(8,  'At least 8 characters')
    .regex(/[A-Z]/, 'Include an uppercase letter')
    .regex(/[0-9]/, 'Include a number'),
  confirm: z.string(),
}).refine((d) => d.newPassword === d.confirm, {
  message: 'Passwords do not match',
  path:    ['confirm'],
});

type LoginForm      = z.infer<typeof loginSchema>;
type ChangePassForm = z.infer<typeof changePassSchema>;

/* ── Page ────────────────────────────────────────────────────────── */
export default function LoginPage() {
  const router = useRouter();
  const { login, user } = useAuth();

  /* If already authed, go to dashboard */
  useEffect(() => { if (user) router.replace('/dashboard'); }, [user, router]);

  const [showPassword,  setShowPassword]  = useState(false);
  const [needs2FA,      setNeeds2FA]      = useState(false);
  const [needsPassReset,setNeedsPassReset]= useState(false);

  /* ── Login form ─────────────────────────────────────────────────── */
  const {
    register, handleSubmit, formState: { errors, isSubmitting }, getValues,
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onLoginSubmit = async (data: LoginForm) => {
    try {
      const response = await login({
        email:    data.email,
        password: data.password,
        totpCode: data.totpCode,
      });

      if (response.requires2FA) {
        setNeeds2FA(true);
        return;
      }
      if (response.firstLogin) {
        setNeedsPassReset(true);
        return;
      }

      toast.success('Welcome back!');
      router.push('/dashboard');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Invalid credentials';
      toast.error(msg);
    }
  };

  /* ── Change password form (firstLogin modal) ───────────────────── */
  const {
    register: regCP,
    handleSubmit: handleCP,
    formState: { errors: cpErrors, isSubmitting: cpSubmitting },
  } = useForm<ChangePassForm>({ resolver: zodResolver(changePassSchema) });

  const onChangePassword = async (data: ChangePassForm) => {
    try {
      await authApi.changePassword({ newPassword: data.newPassword });
      toast.success('Password updated! Logging you in…');
      setNeedsPassReset(false);
      router.push('/dashboard');
    } catch {
      toast.error('Failed to update password');
    }
  };

  /* ── Entrance animation variants ────────────────────────────────── */
  const container = {
    hidden:  {},
    visible: { transition: { staggerChildren: 0.07 } },
  };
  const item = {
    hidden:  { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      {/* ── Login Card ────────────────────────────────────────────── */}
      <motion.div
        className="w-full max-w-md"
        variants={container}
        initial="hidden"
        animate="visible"
      >
        {/* Logo / brand */}
        <motion.div variants={item} className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
               style={{ background: 'linear-gradient(135deg, rgba(0,204,255,0.2), rgba(147,92,255,0.2))',
                        border: '1px solid rgba(0,204,255,0.3)' }}>
            <Shield className="w-8 h-8 text-arc-cyan-400" />
          </div>
          <h1 className="text-3xl font-bold text-shimmer">Arc Panel</h1>
          <p className="mt-1 text-sm text-white/50">Enterprise Game Server Management</p>
        </motion.div>

        <GlassCard className="p-8" hoverable={false}>
          <motion.h2 variants={item} className="text-xl font-semibold text-white/90 mb-6">
            Sign in to your account
          </motion.h2>

          <form onSubmit={handleSubmit(onLoginSubmit)} noValidate>
            <motion.div variants={item} className="space-y-4">
              <GlassInput
                label="Email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                leftIcon={<Mail className="w-4 h-4" />}
                error={errors.email?.message}
                {...register('email')}
              />

              <div>
                <GlassInput
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  leftIcon={<Lock className="w-4 h-4" />}
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="pointer-events-auto text-white/40 hover:text-white/70 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                  error={errors.password?.message}
                  {...register('password')}
                />
              </div>

              {/* 2FA field — shown after server says requires2FA */}
              <AnimatePresence>
                {needs2FA && (
                  <motion.div
                    key="totp"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <GlassInput
                      label="Authenticator Code"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                      leftIcon={<KeyRound className="w-4 h-4" />}
                      hint="Enter the 6-digit code from your authenticator app"
                      error={errors.totpCode?.message}
                      {...register('totpCode')}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <GlassButton
                type="submit"
                variant="primary"
                fullWidth
                size="md"
                isLoading={isSubmitting}
                className="mt-2"
              >
                {needs2FA ? 'Verify & Sign In' : 'Sign In'}
              </GlassButton>
            </motion.div>
          </form>

          <motion.p variants={item} className="mt-6 text-center text-sm text-white/40">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-arc-cyan-400 hover:text-arc-cyan-300 transition-colors font-medium">
              Create one
            </Link>
          </motion.p>
        </GlassCard>
      </motion.div>

      {/* ── Force Password Change Modal ───────────────────────────── */}
      <AnimatePresence>
        {needsPassReset && (
          <motion.div
            key="modal-backdrop"
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ backdropFilter: 'blur(12px)', background: 'rgba(4,6,26,0.75)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1,   opacity: 1 }}
              exit={{ scale: 0.9,    opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="w-full max-w-md"
            >
              <GlassCard className="p-8" hoverable={false} accentColor="violet">
                <div className="flex items-center gap-3 mb-2">
                  <KeyRound className="w-5 h-5 text-arc-violet-400" />
                  <h3 className="text-lg font-semibold text-white/90">
                    Set a new password
                  </h3>
                </div>
                <p className="text-sm text-white/50 mb-6">
                  Your account requires a password change before continuing.
                </p>

                <form onSubmit={handleCP(onChangePassword)} noValidate className="space-y-4">
                  <GlassInput
                    label="New Password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    leftIcon={<Lock className="w-4 h-4" />}
                    error={cpErrors.newPassword?.message}
                    {...regCP('newPassword')}
                  />
                  <GlassInput
                    label="Confirm Password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    leftIcon={<Lock className="w-4 h-4" />}
                    error={cpErrors.confirm?.message}
                    {...regCP('confirm')}
                  />
                  <GlassButton
                    type="submit"
                    variant="secondary"
                    fullWidth
                    isLoading={cpSubmitting}
                  >
                    Update Password &amp; Continue
                  </GlassButton>
                </form>
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
