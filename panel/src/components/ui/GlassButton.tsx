/* ════════════════════════════════════════════════════════════════
   src/components/ui/GlassButton.tsx
   Reusable glass button with variants and Framer Motion
════════════════════════════════════════════════════════════════ */

'use client';

import { motion, type HTMLMotionProps } from 'framer-motion';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
type ButtonSize    = 'xs' | 'sm' | 'md' | 'lg';

interface GlassButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  children?:    React.ReactNode;
  variant?:     ButtonVariant;
  size?:        ButtonSize;
  isLoading?:   boolean;
  leftIcon?:    React.ReactNode;
  rightIcon?:   React.ReactNode;
  fullWidth?:   boolean;
}

/* ── Variant styles ─────────────────────────────────────────────── */
const variantStyles: Record<ButtonVariant, string> = {
  primary: [
    'bg-arc-cyan-400/12 border border-arc-cyan-400/30 text-arc-cyan-400',
    'hover:bg-arc-cyan-400/22 hover:border-arc-cyan-400/55',
    'hover:shadow-[0_0_20px_rgba(0,204,255,0.30)]',
  ].join(' '),

  secondary: [
    'bg-arc-violet-400/12 border border-arc-violet-400/30 text-arc-violet-400',
    'hover:bg-arc-violet-400/22 hover:border-arc-violet-400/55',
    'hover:shadow-[0_0_20px_rgba(147,92,255,0.30)]',
  ].join(' '),

  /* "danger" uses deep orange — NOT red */
  danger: [
    'bg-arc-orange-400/12 border border-arc-orange-400/30 text-arc-orange-400',
    'hover:bg-arc-orange-400/22 hover:border-arc-orange-400/55',
    'hover:shadow-[0_0_20px_rgba(251,140,58,0.30)]',
  ].join(' '),

  ghost: [
    'bg-transparent border border-white/08 text-white/60',
    'hover:bg-white/06 hover:border-white/16 hover:text-white/90',
  ].join(' '),

  outline: [
    'bg-transparent border border-arc-blue-400/40 text-arc-blue-400',
    'hover:bg-arc-blue-400/10 hover:border-arc-blue-400/70',
    'hover:shadow-[0_0_16px_rgba(77,121,255,0.25)]',
  ].join(' '),
};

/* ── Size styles ─────────────────────────────────────────────────── */
const sizeStyles: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-xs gap-1   rounded-lg',
  sm: 'h-8 px-3   text-sm gap-1.5 rounded-xl',
  md: 'h-10 px-4  text-sm gap-2   rounded-xl',
  lg: 'h-12 px-6  text-base gap-2 rounded-2xl',
};

/* ── Spinner ─────────────────────────────────────────────────────── */
function Spinner({ size }: { size: ButtonSize }) {
  const dim = size === 'xs' || size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <svg
      className={`${dim} animate-spin`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12" cy="12" r="10"
        stroke="currentColor" strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

/* ── Component ───────────────────────────────────────────────────── */
const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(
  (
    {
      variant   = 'primary',
      size      = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      className,
      children,
      disabled,
      ...motionProps
    },
    ref,
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <motion.button
        ref={ref}
        className={cn(
          /* Base */
          'inline-flex items-center justify-center font-semibold',
          'backdrop-blur-md select-none outline-none',
          'transition-colors duration-200',
          'focus-visible:ring-2 focus-visible:ring-arc-cyan-400/60 focus-visible:ring-offset-1',
          'focus-visible:ring-offset-transparent',
          /* Variant */
          variantStyles[variant],
          /* Size */
          sizeStyles[size],
          /* Full width */
          fullWidth && 'w-full',
          /* Disabled */
          isDisabled && 'opacity-50 cursor-not-allowed pointer-events-none',
          className,
        )}
        disabled={isDisabled}
        whileHover={!isDisabled ? { scale: 1.02 } : undefined}
        whileTap={!isDisabled  ? { scale: 0.97 } : undefined}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        {...motionProps}
      >
        {isLoading ? (
          <Spinner size={size} />
        ) : (
          leftIcon && <span className="shrink-0">{leftIcon}</span>
        )}
        {children && <span>{children}</span>}
        {!isLoading && rightIcon && (
          <span className="shrink-0">{rightIcon}</span>
        )}
      </motion.button>
    );
  },
);

GlassButton.displayName = 'GlassButton';

export default GlassButton;
