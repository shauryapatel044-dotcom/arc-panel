/* ════════════════════════════════════════════════════════════════
   src/app/(auth)/register/page.tsx
   Glassmorphic registration form
════════════════════════════════════════════════════════════════ */

'use client';

import { useState }   from 'react';
import { useRouter }  from 'next/navigation';
import Link           from 'next/link';
import { motion }     from 'framer-motion';
import { useForm }    from 'react-hook-form';
import { zodResolver }from '@hookform/resolvers/zod';
import { z }          from 'zod';
import toast          from 'react-hot-toast';
import { User, Mail, Lock, Eye, EyeOff, Shield } from 'lucide-react';

import { authApi }   from '@/lib/api';
import GlassInput    from '@/components/ui/GlassInput';
import GlassButton   from '@/components/ui/GlassButton';
import GlassCard     from '@/components/ui/GlassCard';

/* ── Schema ─────────────────────────────────────────────────────── */
const schema = z
  .object({
    username:        z.string().min(3, 'At least 3 characters').max(32, 'At most 32 characters')
                       .regex(/^[a-z0-9_-]+$/i, 'Letters, numbers, _ and - only'),
    email:           z.string().email('Enter a valid email'),
    password:        z.string()
                       .min(8,  'At least 8 characters')
                       .regex(/[A-Z]/, 'Include an uppercase letter')
                       .regex(/[0-9]/, 'Include a number'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path:    ['confirmPassword'],
  });

type RegisterForm = z.infer<typeof schema>;

/* ── Page ────────────────────────────────────────────────────────── */
export default function RegisterPage() {
  const router               = useRouter();
  const [showPw, setShowPw]  = useState(false);
  const [showCp, setShowCp]  = useState(false);

  const {
    register, handleSubmit, formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: RegisterForm) => {
    try {
      await authApi.register({
        username: data.username,
        email:    data.email,
        password: data.password,
      });
      toast.success('Account created! Please sign in.');
      router.push('/login');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Registration failed';
      toast.error(msg);
    }
  };

  /* ── Animation variants ─────────────────────────────────────────── */
  const container = {
    hidden:  {},
    visible: { transition: { staggerChildren: 0.07 } },
  };
  const item = {
    hidden:  { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <motion.div
        className="w-full max-w-md"
        variants={container}
        initial="hidden"
        animate="visible"
      >
        {/* Brand */}
        <motion.div variants={item} className="mb-8 text-center">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{
              background: 'linear-gradient(135deg, rgba(0,204,255,0.2), rgba(147,92,255,0.2))',
              border: '1px solid rgba(0,204,255,0.3)',
            }}
          >
            <Shield className="w-8 h-8 text-arc-cyan-400" />
          </div>
          <h1 className="text-3xl font-bold text-shimmer">Arc Panel</h1>
          <p className="mt-1 text-sm text-white/50">Create your account</p>
        </motion.div>

        <GlassCard className="p-8" hoverable={false}>
          <motion.h2 variants={item} className="text-xl font-semibold text-white/90 mb-6">
            Register
          </motion.h2>

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <motion.div variants={item} className="space-y-4">
              <GlassInput
                label="Username"
                type="text"
                autoComplete="username"
                placeholder="cooluser"
                leftIcon={<User className="w-4 h-4" />}
                hint="Letters, numbers, _ and - only"
                error={errors.username?.message}
                required
                {...register('username')}
              />

              <GlassInput
                label="Email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                leftIcon={<Mail className="w-4 h-4" />}
                error={errors.email?.message}
                required
                {...register('email')}
              />

              <GlassInput
                label="Password"
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="••••••••"
                leftIcon={<Lock className="w-4 h-4" />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="pointer-events-auto text-white/40 hover:text-white/70 transition-colors"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
                hint="Min 8 chars, 1 uppercase, 1 number"
                error={errors.password?.message}
                required
                {...register('password')}
              />

              <GlassInput
                label="Confirm Password"
                type={showCp ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="••••••••"
                leftIcon={<Lock className="w-4 h-4" />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowCp((v) => !v)}
                    className="pointer-events-auto text-white/40 hover:text-white/70 transition-colors"
                  >
                    {showCp ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
                error={errors.confirmPassword?.message}
                required
                {...register('confirmPassword')}
              />

              <GlassButton
                type="submit"
                variant="primary"
                fullWidth
                size="md"
                isLoading={isSubmitting}
                className="mt-2"
              >
                Create Account
              </GlassButton>
            </motion.div>
          </form>

          <motion.p variants={item} className="mt-6 text-center text-sm text-white/40">
            Already have an account?{' '}
            <Link
              href="/login"
              className="text-arc-cyan-400 hover:text-arc-cyan-300 transition-colors font-medium"
            >
              Sign in
            </Link>
          </motion.p>
        </GlassCard>
      </motion.div>
    </main>
  );
}
