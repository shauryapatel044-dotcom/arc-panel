/* ════════════════════════════════════════════════════════════════
   src/components/ui/AnimatedBackground.tsx
   Full-screen animated aurora/nebula background — no red
════════════════════════════════════════════════════════════════ */

'use client';

import { memo } from 'react';

/**
 * AnimatedBackground renders three large blurred orbs that drift
 * slowly across a deep navy/dark-purple base, simulating a nebula /
 * aurora effect.  All animation is pure CSS (keyframes defined in
 * globals.css) so there is zero JS overhead at runtime.
 */
const AnimatedBackground = memo(function AnimatedBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #04061a 0%, #070b28 40%, #0c0f2e 70%, #06061e 100%)' }}
    >
      {/* ── Orb 1 — Cyan ─────────────────────────────────────────── */}
      <div
        className="absolute rounded-full"
        style={{
          top:    '-20%',
          left:   '-10%',
          width:  '65vw',
          height: '65vw',
          background: 'radial-gradient(circle at center, rgba(0,204,255,0.18) 0%, rgba(0,153,220,0.08) 50%, transparent 70%)',
          filter: 'blur(80px)',
          animation: 'aurora-drift-1 18s ease-in-out infinite',
          willChange: 'transform, opacity',
        }}
      />

      {/* ── Orb 2 — Violet ───────────────────────────────────────── */}
      <div
        className="absolute rounded-full"
        style={{
          bottom: '-15%',
          right:  '-5%',
          width:  '70vw',
          height: '70vw',
          background: 'radial-gradient(circle at center, rgba(147,92,255,0.20) 0%, rgba(100,40,220,0.09) 50%, transparent 70%)',
          filter: 'blur(90px)',
          animation: 'aurora-drift-2 24s ease-in-out infinite',
          willChange: 'transform, opacity',
        }}
      />

      {/* ── Orb 3 — Blue (mid-screen) ────────────────────────────── */}
      <div
        className="absolute rounded-full"
        style={{
          top:    '30%',
          left:   '35%',
          width:  '50vw',
          height: '50vw',
          background: 'radial-gradient(circle at center, rgba(77,121,255,0.14) 0%, rgba(40,80,200,0.07) 50%, transparent 70%)',
          filter: 'blur(70px)',
          animation: 'aurora-drift-3 30s ease-in-out infinite',
          willChange: 'transform, opacity',
        }}
      />

      {/* ── Nebula sheen — static noise texture layer ────────────── */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'repeating-conic-gradient(rgba(255,255,255,0.012) 0deg, transparent 1deg) 50% / 120px 120px',
          animation: 'nebula-pulse 8s ease-in-out infinite',
        }}
      />

      {/* ── Grid overlay for depth ────────────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), ' +
            'linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* ── Vignette ─────────────────────────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 50%, rgba(4,6,26,0.70) 100%)',
        }}
      />
    </div>
  );
});

export default AnimatedBackground;
