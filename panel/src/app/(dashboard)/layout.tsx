/* ════════════════════════════════════════════════════════════════
   src/app/(dashboard)/layout.tsx
   Antigravity floating glass dashboard shell
   Features weightless sidebar, glass topbar, and auth guard
════════════════════════════════════════════════════════════════ */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Server,
  UserCircle,
  Shield,
  Users,
  HardDrive,
  LogOut,
  Sparkles,
  Activity,
  PlusCircle,
} from 'lucide-react';
import { useAuth, selectIsAuthed, selectIsAdmin } from '@/hooks/useAuth';
import GlassButton from '@/components/ui/GlassButton';
import { cn, getInitials } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const CLIENT_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Profile & 2FA', href: '/profile', icon: UserCircle },
];

const ADMIN_NAV: NavItem[] = [
  { label: 'Global Overview', href: '/admin', icon: Shield },
  { label: 'User Management', href: '/admin/users', icon: Users },
  { label: 'All Servers', href: '/admin/servers', icon: HardDrive },
  { label: 'Create Server', href: '/servers/create', icon: PlusCircle },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const user = useAuth((s) => s.user);
  const accessToken = useAuth((s) => s.accessToken);
  const isHydrated = useAuth((s) => s.isHydrated);
  const isAdmin = useAuth(selectIsAdmin);
  const logout = useAuth((s) => s.logout);
  const isAuthed = !!(user && accessToken);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!isHydrated) {
      useAuth.getState().setHydrated();
    }
  }, [isHydrated]);

  useEffect(() => {
    if (mounted && !isAuthed) {
      const token =
        typeof window !== 'undefined'
          ? window.localStorage.getItem('arc_access_token')
          : null;
      if (!token) {
        router.replace('/login');
      }
    }
  }, [mounted, isAuthed, router]);

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-4 backdrop-blur-xl">
          <Sparkles className="h-5 w-5 animate-spin text-arc-cyan-400" />
          <span className="text-sm font-medium text-white/80">
            Initializing Arc Panel Environment...
          </span>
        </div>
      </div>
    );
  }

  if (!isAuthed) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-4 backdrop-blur-xl">
          <Sparkles className="h-5 w-5 animate-spin text-arc-cyan-400" />
          <span className="text-sm font-medium text-white/80">
            Redirecting to sign in...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full gap-5 p-4 lg:p-6">
      {/* ── Floating Glass Sidebar ─────────────────────────────────── */}
      <motion.aside
        initial={{ opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          'sticky top-6 hidden h-[calc(100vh-3rem)] w-64 shrink-0 flex-col justify-between',
          'rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 backdrop-blur-2xl',
          'shadow-[0_8px_40px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)]',
          'lg:flex',
        )}
      >
        {/* Top Brand + Nav Links */}
        <div className="flex flex-col gap-6">
          {/* Brand Header */}
          <div className="flex flex-col gap-2.5">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-2 py-1.5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-arc-cyan-400/40 bg-arc-cyan-400/15 shadow-[0_0_20px_rgba(0,204,255,0.3)]">
                <Server className="h-5 w-5 text-arc-cyan-400" />
              </div>
              <div>
                <span className="bg-gradient-to-r from-white via-arc-cyan-300 to-arc-blue-400 bg-clip-text text-lg font-bold tracking-tight text-transparent">
                  ARC PANEL
                </span>
                <p className="text-[11px] font-medium uppercase tracking-widest text-white/40">
                  Enterprise Cloud
                </p>
              </div>
            </Link>

            {/* Owned By Tag */}
            <div className="flex items-center gap-2 rounded-xl border border-arc-cyan-400/35 bg-arc-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-arc-cyan-300 shadow-[0_0_15px_rgba(0,204,255,0.2)]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-arc-cyan-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-arc-cyan-400"></span>
              </span>
              <span className="truncate">Owned By Eclipse Market(Demo Panel)</span>
            </div>
          </div>

          {/* Client Area Navigation */}
          <div className="flex flex-col gap-1">
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/35">
              Client Space
            </p>
            {CLIENT_NAV.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href ||
                (item.href === '/dashboard' &&
                  pathname.startsWith('/servers'));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200',
                    active
                      ? 'border border-arc-cyan-400/30 bg-arc-cyan-400/12 text-arc-cyan-400 shadow-[0_0_20px_rgba(0,204,255,0.18)]'
                      : 'text-white/65 hover:bg-white/[0.06] hover:text-white',
                  )}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4 transition-transform group-hover:scale-110',
                      active ? 'text-arc-cyan-400' : 'text-white/45',
                    )}
                  />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Admin Section (visible to admins) */}
          {(isAdmin || user?.role?.toUpperCase() === 'ADMIN') && (
            <div className="flex flex-col gap-1">
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-arc-violet-400/80">
                Administration
              </p>
              {ADMIN_NAV.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200',
                      active
                        ? 'border border-arc-violet-400/35 bg-arc-violet-400/15 text-arc-violet-300 shadow-[0_0_20px_rgba(147,92,255,0.2)]'
                        : 'text-white/65 hover:bg-white/[0.06] hover:text-white',
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4 transition-transform group-hover:scale-110',
                        active ? 'text-arc-violet-400' : 'text-white/45',
                      )}
                    />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom User Profile Pill */}
        <div className="flex flex-col gap-3 border-t border-white/[0.08] pt-4">
          <div className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-arc-cyan-400/30 bg-arc-cyan-400/15 text-xs font-bold text-arc-cyan-400">
                {getInitials(user?.username ?? 'Arc User')}
              </div>
              <div className="overflow-hidden">
                <p className="truncate text-sm font-semibold text-white/90">
                  {user?.username}
                </p>
                <p className="truncate text-xs text-white/45">{user?.email}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void logout()}
              title="Sign Out"
              className="rounded-lg p-2 text-white/45 transition hover:bg-white/10 hover:text-arc-orange-400"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.aside>

      {/* ── Main Content Column ────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        {/* Top Floating Glass Bar */}
        <header
          className={cn(
            'flex flex-wrap items-center justify-between gap-4 rounded-2xl',
            'border border-white/[0.08] bg-white/[0.04] px-5 py-3.5 backdrop-blur-xl',
            'shadow-[0_4px_24px_rgba(0,0,0,0.3)]',
          )}
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-arc-cyan-400" />
              <span className="hidden sm:inline text-xs font-medium uppercase tracking-wider text-white/60">
                Daemon Telemetry
              </span>
            </div>

            {/* Owned By Eclipse Market Tag */}
            <div className="flex items-center gap-1.5 rounded-full border border-arc-cyan-400/40 bg-arc-cyan-400/12 px-3 py-1 text-xs font-semibold text-arc-cyan-300 shadow-[0_0_18px_rgba(0,204,255,0.25)]">
              <Sparkles className="h-3.5 w-3.5 text-arc-cyan-400 animate-pulse" />
              <span>Owned By Eclipse Market(Demo Panel)</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {(isAdmin || user?.role?.toUpperCase() === 'ADMIN') && (
              <Link href="/servers/create">
                <GlassButton
                  variant="primary"
                  size="xs"
                  leftIcon={<PlusCircle className="h-3.5 w-3.5" />}
                >
                  Create Server
                </GlassButton>
              </Link>
            )}
            <span className="rounded-full border border-arc-cyan-400/30 bg-arc-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase text-arc-cyan-400">
              {user?.role}
            </span>
            <GlassButton
              variant="ghost"
              size="xs"
              onClick={() => void logout()}
              className="lg:hidden"
            >
              Sign Out
            </GlassButton>
          </div>
        </header>

        {/* Mobile Navigation Strip (visible on < lg screens) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:hidden">
          <Link
            href="/dashboard"
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium transition',
              pathname === '/dashboard'
                ? 'border-arc-cyan-400/40 bg-arc-cyan-400/15 text-arc-cyan-400'
                : 'border-white/10 bg-white/[0.03] text-white/70 hover:text-white',
            )}
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            <span>Dashboard</span>
          </Link>
          {(isAdmin || user?.role?.toUpperCase() === 'ADMIN') && (
            <>
              <Link
                href="/admin"
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium transition',
                  pathname === '/admin'
                    ? 'border-arc-violet-400/40 bg-arc-violet-400/15 text-arc-violet-300'
                    : 'border-white/10 bg-white/[0.03] text-white/70 hover:text-white',
                )}
              >
                <Shield className="h-3.5 w-3.5" />
                <span>Admin Overview</span>
              </Link>
              <Link
                href="/servers/create"
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium transition',
                  pathname === '/servers/create'
                    ? 'border-arc-cyan-400/40 bg-arc-cyan-400/15 text-arc-cyan-400'
                    : 'border-white/10 bg-white/[0.03] text-white/70 hover:text-white',
                )}
              >
                <PlusCircle className="h-3.5 w-3.5" />
                <span>Create Server</span>
              </Link>
            </>
          )}
          <Link
            href="/profile"
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium transition',
              pathname === '/profile'
                ? 'border-arc-cyan-400/40 bg-arc-cyan-400/15 text-arc-cyan-400'
                : 'border-white/10 bg-white/[0.03] text-white/70 hover:text-white',
            )}
          >
            <UserCircle className="h-3.5 w-3.5" />
            <span>Profile</span>
          </Link>
        </div>

        {/* Page Content */}
        <main className="flex-1 pb-10">{children}</main>
      </div>
    </div>
  );
}
