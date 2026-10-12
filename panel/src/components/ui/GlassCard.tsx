/* ════════════════════════════════════════════════════════════════
   src/components/ui/GlassCard.tsx
   Reusable glassmorphism card with Framer Motion
════════════════════════════════════════════════════════════════ */

'use client';

import { motion, type HTMLMotionProps } from 'framer-motion';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface GlassCardProps extends HTMLMotionProps<'div'> {
  /** Extra Tailwind classes */
  className?:     string;
  children:       React.ReactNode;
  /** Whether to apply the lift-on-hover effect (default: true) */
  hoverable?:     boolean;
  /** Whether to add a colored top border accent */
  accentColor?:   'cyan' | 'blue' | 'violet' | 'orange' | 'none';
  /** Padding preset */
  padding?:       'none' | 'sm' | 'md' | 'lg';
}

const accentStyles: Record<NonNullable<GlassCardProps['accentColor']>, string> = {
  cyan:   'border-t-arc-cyan-400/50',
  blue:   'border-t-arc-blue-400/50',
  violet: 'border-t-arc-violet-400/50',
  orange: 'border-t-arc-orange-400/50',
  none:   '',
};

const paddingStyles: Record<NonNullable<GlassCardProps['padding']>, string> = {
  none: 'p-0',
  sm:   'p-3',
  md:   'p-5',
  lg:   'p-7',
};

const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  (
    {
      className,
      children,
      hoverable    = true,
      accentColor  = 'none',
      padding      = 'md',
      ...motionProps
    },
    ref,
  ) => {
    return (
      <motion.div
        ref={ref}
        className={cn(
          /* Base glass styles */
          'relative overflow-hidden rounded-2xl',
          'bg-white/[0.04] border border-white/[0.08]',
          'backdrop-blur-xl',
          'shadow-[0_4px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)]',
          'transition-colors duration-200',
          /* Accent top border */
          accentColor !== 'none' && 'border-t-2',
          accentStyles[accentColor],
          /* Padding */
          paddingStyles[padding],
          /* Optional hover */
          hoverable && [
            'hover:bg-white/[0.07]',
            'hover:border-white/[0.14]',
            'hover:shadow-[0_8px_48px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.10)]',
            'cursor-default',
          ],
          className,
        )}
        /* Framer Motion entrance + hover animations */
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
        whileHover={hoverable ? { y: -2, transition: { duration: 0.2 } } : undefined}
        {...motionProps}
      >
        {/* Subtle inner highlight */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 50%)',
          }}
        />
        {children}
      </motion.div>
    );
  },
);

GlassCard.displayName = 'GlassCard';

export default GlassCard;
