/* ════════════════════════════════════════════════════════════════
   src/components/ui/StatusBadge.tsx
   Server status badge with animated indicators
════════════════════════════════════════════════════════════════ */

'use client';

import { cn } from '@/lib/utils';
import type { ServerStatus } from '@/types';

interface StatusBadgeProps {
  status:    ServerStatus;
  className?: string;
  /** Show text label alongside the dot (default true) */
  showLabel?: boolean;
  /** Size variant */
  size?: 'sm' | 'md';
}

/* ── Config map ─────────────────────────────────────────────────── */
const statusConfig: Record<
  ServerStatus,
  { label: string; dotColor: string; badgeClass: string; pulse: boolean }
> = {
  running: {
    label:      'Running',
    dotColor:   'bg-arc-cyan-400',
    badgeClass: 'bg-arc-cyan-400/10 border-arc-cyan-400/30 text-arc-cyan-400',
    pulse:       true,
  },
  stopped: {
    label:      'Stopped',
    dotColor:   'bg-slate-500',
    badgeClass: 'bg-slate-700/40 border-slate-600/40 text-slate-400',
    pulse:       false,
  },
  starting: {
    label:      'Starting',
    dotColor:   'bg-arc-blue-400',
    badgeClass: 'bg-arc-blue-400/10 border-arc-blue-400/30 text-arc-blue-400',
    pulse:       true,
  },
  stopping: {
    label:      'Stopping',
    dotColor:   'bg-arc-blue-300',
    badgeClass: 'bg-arc-blue-300/10 border-arc-blue-300/30 text-arc-blue-300',
    pulse:       true,
  },
  error: {
    label:      'Error',
    dotColor:   'bg-arc-orange-400',
    badgeClass: 'bg-arc-orange-400/10 border-arc-orange-400/30 text-arc-orange-400',
    pulse:       false,
  },
  installing: {
    label:      'Installing',
    dotColor:   'bg-arc-violet-400',
    badgeClass: 'bg-arc-violet-400/10 border-arc-violet-400/30 text-arc-violet-400',
    pulse:       true,
  },
  reinstalling: {
    label:      'Reinstalling',
    dotColor:   'bg-arc-violet-300',
    badgeClass: 'bg-arc-violet-300/10 border-arc-violet-300/30 text-arc-violet-300',
    pulse:       true,
  },
};

export default function StatusBadge({
  status,
  className,
  showLabel = true,
  size      = 'md',
}: StatusBadgeProps) {
  const config  = statusConfig[status] ?? statusConfig.stopped;
  const dotSize = size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 border rounded-full font-semibold',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs',
        config.badgeClass,
        className,
      )}
    >
      {/* Dot with optional pulse animation */}
      <span className="relative flex shrink-0">
        {config.pulse && (
          <span
            className={cn(
              'absolute inline-flex rounded-full opacity-75',
              dotSize,
              config.dotColor,
              'animate-ping',
            )}
            style={{ animationDuration: '1.8s' }}
          />
        )}
        <span
          className={cn('relative inline-flex rounded-full', dotSize, config.dotColor)}
        />
      </span>

      {showLabel && config.label}
    </span>
  );
}
