/* ════════════════════════════════════════════════════════════════
   src/app/page.tsx — Root redirect
   Redirects authenticated users to /dashboard, others to /login
════════════════════════════════════════════════════════════════ */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Sparkles } from 'lucide-react';

export default function RootPage() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const accessToken = useAuth((s) => s.accessToken);
  const isAuthed = !!(user && accessToken);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    const localToken =
      typeof window !== 'undefined'
        ? window.localStorage.getItem('arc_access_token')
        : null;

    if (localToken && (isAuthed || user)) {
      router.replace('/dashboard');
    } else {
      router.replace('/login');
    }
    setHasChecked(true);
  }, [isAuthed, user, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-4 backdrop-blur-xl shadow-2xl">
        <Sparkles className="h-5 w-5 animate-spin text-arc-cyan-400" />
        <span className="text-sm font-medium text-white/80">
          Loading Arc Panel...
        </span>
      </div>
    </div>
  );
}
