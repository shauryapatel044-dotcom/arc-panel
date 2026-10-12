/* ════════════════════════════════════════════════════════════════
   src/app/page.tsx — Root redirect
   Redirects authenticated users to /dashboard, others to /login
════════════════════════════════════════════════════════════════ */

import { redirect } from 'next/navigation';
import { cookies }  from 'next/headers';

/**
 * Server component — reads the arc_access_token cookie to decide
 * where to send the user.  The actual auth validation happens in
 * the dashboard layout's client-side auth guard.
 */
export default function RootPage() {
  const cookieStore = cookies();
  const token       = cookieStore.get('arc_access_token')?.value;

  /* Redirect server-side to avoid flash of content */
  if (token) {
    redirect('/dashboard');
  } else {
    redirect('/login');
  }
}
