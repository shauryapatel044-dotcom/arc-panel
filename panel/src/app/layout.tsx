/* ════════════════════════════════════════════════════════════════
   src/app/layout.tsx — Root layout
   Provides Inter font, AnimatedBackground, and React-Hot-Toast
════════════════════════════════════════════════════════════════ */

import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import AnimatedBackground from '@/components/ui/AnimatedBackground';
import './globals.css';

/* ── Inter font ─────────────────────────────────────────────────── */
const inter = Inter({
  subsets:  ['latin'],
  variable: '--font-inter',
  display:  'swap',
});

/* ── Metadata ────────────────────────────────────────────────────── */
export const metadata: Metadata = {
  title: {
    template: '%s | Arc Panel',
    default:  'Arc Panel',
  },
  description: 'Enterprise game server management dashboard',
  icons: {
    icon:  '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor:  '#04061a',
  colorScheme: 'dark',
};

/* ── Root Layout ─────────────────────────────────────────────────── */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} dark`} suppressHydrationWarning>
      <body className="min-h-screen bg-arc-navy-950 text-white antialiased">
        {/* Animated aurora/nebula background — fixed, behind everything */}
        <AnimatedBackground />

        {/* Page content sits above the background */}
        <div className="relative z-10 min-h-screen">
          {children}
        </div>

        {/* Global toast notifications */}
        <Toaster
          position="top-right"
          gutter={8}
          toastOptions={{
            duration: 4000,
            style: {
              background:   'rgba(13, 17, 48, 0.92)',
              backdropFilter: 'blur(16px)',
              border:       '1px solid rgba(255,255,255,0.10)',
              color:        'rgba(255,255,255,0.92)',
              borderRadius: '12px',
              fontSize:     '0.875rem',
              fontFamily:   'Inter, sans-serif',
              boxShadow:    '0 8px 32px rgba(0,0,0,0.4)',
            },
            success: {
              iconTheme: { primary: '#00ccff', secondary: '#04061a' },
            },
            error: {
              iconTheme: { primary: '#fb8c3a', secondary: '#04061a' },
            },
          }}
        />
      </body>
    </html>
  );
}
