/* ════════════════════════════════════════════════════════════════
   src/app/page.tsx — Root redirect
   Redirects authenticated users to /dashboard, others to /login
════════════════════════════════════════════════════════════════ */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, selectIsAuthed } from '@/hooks/useAuth';

export default function RootPage() {
  const router = useRouter();
  const isHydrated = useAuth((s) => s.isHydrated);
  const isAuthed = useAuth(selectIsAuthed);

  useEffect(() => {
    const localToken =
      typeof window !== 'undefined'
        ? window.localStorage.getItem('arc_access_token')
        : null;

    if (localToken || isAuthed) {
      router.replace('/dashboard');
    } else {
      router.replace('/login');
    }
  }, [isHydrated, isAuthed, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070b14]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-arc-cyan-400 border-t-transparent" />
    </div>
  );
}
