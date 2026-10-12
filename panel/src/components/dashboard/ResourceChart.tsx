/* ════════════════════════════════════════════════════════════════
   src/components/dashboard/ResourceChart.tsx
   Real-time flowing glassmorphic line chart using Chart.js
   Strictly no-red palette: Cyan, Electric Blue, Violet
════════════════════════════════════════════════════════════════ */

'use client';

import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  type ChartOptions,
  type ScriptableContext,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import GlassCard from '@/components/ui/GlassCard';
import { cn } from '@/lib/utils';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
);

export type ChartColorTheme = 'cyan' | 'blue' | 'violet';

interface ResourceChartProps {
  /** Chart title (e.g., "CPU Load", "Memory Allocation") */
  label: string;
  /** Rolling array of numeric data points */
  data: number[];
  /** Unit suffix (e.g., "%", "MB", "KB/s") */
  unit: string;
  /** Optional maximum y-axis ceiling (e.g., 100 for %, or server RAM limit) */
  maxValue?: number;
  /** Color theme — strictly cyan, blue, or violet (NO red) */
  color?: ChartColorTheme;
  /** Optional subtitle or current / limit text */
  subtitle?: string;
  /** Optional icon rendered in the header */
  icon?: React.ReactNode;
  className?: string;
}

const THEME_PALETTE: Record<
  ChartColorTheme,
  {
    stroke: string;
    fillTop: string;
    fillBottom: string;
    badgeBg: string;
    badgeText: string;
    glow: string;
  }
> = {
  cyan: {
    stroke: '#00ccff',
    fillTop: 'rgba(0, 204, 255, 0.28)',
    fillBottom: 'rgba(0, 204, 255, 0.0)',
    badgeBg: 'bg-arc-cyan-400/12 border-arc-cyan-400/30',
    badgeText: 'text-arc-cyan-400',
    glow: 'shadow-[0_0_24px_rgba(0,204,255,0.2)]',
  },
  blue: {
    stroke: '#4d79ff',
    fillTop: 'rgba(77, 121, 255, 0.28)',
    fillBottom: 'rgba(77, 121, 255, 0.0)',
    badgeBg: 'bg-arc-blue-400/12 border-arc-blue-400/30',
    badgeText: 'text-arc-blue-400',
    glow: 'shadow-[0_0_24px_rgba(77,121,255,0.2)]',
  },
  violet: {
    stroke: '#935cff',
    fillTop: 'rgba(147, 92, 255, 0.28)',
    fillBottom: 'rgba(147, 92, 255, 0.0)',
    badgeBg: 'bg-arc-violet-400/12 border-arc-violet-400/30',
    badgeText: 'text-arc-violet-400',
    glow: 'shadow-[0_0_24px_rgba(147,92,255,0.2)]',
  },
};

export default function ResourceChart({
  label,
  data,
  unit,
  maxValue,
  color = 'cyan',
  subtitle,
  icon,
  className,
}: ResourceChartProps) {
  const palette = THEME_PALETTE[color];

  // Ensure smooth visual baseline even before 20 samples arrive
  const normalizedData = useMemo(() => {
    const minPoints = 20;
    if (data.length >= minPoints) return data;
    const padding = Array(minPoints - data.length).fill(0);
    return [...padding, ...data];
  }, [data]);

  const currentVal = normalizedData[normalizedData.length - 1] ?? 0;

  const chartData = useMemo(
    () => ({
      labels: normalizedData.map((_, idx) => `${idx}`),
      datasets: [
        {
          label,
          data: normalizedData,
          borderColor: palette.stroke,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: palette.stroke,
          pointHoverBorderColor: '#060a14',
          pointHoverBorderWidth: 2,
          tension: 0.42,
          fill: true,
          backgroundColor: (context: ScriptableContext<'line'>) => {
            const ctx = context.chart.ctx;
            const gradient = ctx.createLinearGradient(0, 0, 0, 180);
            gradient.addColorStop(0, palette.fillTop);
            gradient.addColorStop(1, palette.fillBottom);
            return gradient;
          },
        },
      ],
    }),
    [normalizedData, label, palette],
  );

  const options: ChartOptions<'line'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 350,
        easing: 'easeOutQuart',
      },
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(6, 10, 20, 0.88)',
          titleColor: 'rgba(255, 255, 255, 0.6)',
          bodyColor: '#ffffff',
          borderColor: 'rgba(255, 255, 255, 0.12)',
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            title: () => label,
            label: (ctx) => `${Number(ctx.parsed.y).toFixed(1)} ${unit}`,
          },
        },
      },
      scales: {
        x: {
          display: false,
        },
        y: {
          beginAtZero: true,
          suggestedMax: maxValue,
          grid: {
            color: 'rgba(255, 255, 255, 0.04)',
          },
          border: {
            display: false,
          },
          ticks: {
            color: 'rgba(255, 255, 255, 0.35)',
            font: { size: 11 },
            maxTicksLimit: 5,
            callback: (val) => `${val}${unit}`,
          },
        },
      },
    }),
    [label, unit, maxValue],
  );

  return (
    <GlassCard
      accentColor={color}
      padding="md"
      className={cn('flex flex-col gap-4', className)}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {icon && (
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-xl border',
                palette.badgeBg,
                palette.badgeText,
              )}
            >
              {icon}
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold text-white/90">{label}</h3>
            {subtitle && (
              <p className="text-xs text-white/45">{subtitle}</p>
            )}
          </div>
        </div>

        {/* Live Value Pill */}
        <div
          className={cn(
            'rounded-xl border px-3 py-1 text-right font-mono text-sm font-bold',
            palette.badgeBg,
            palette.badgeText,
            palette.glow,
          )}
        >
          {currentVal.toFixed(unit === '%' ? 1 : 0)}{' '}
          <span className="text-xs font-normal opacity-80">{unit}</span>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="relative h-44 w-full">
        <Line data={chartData} options={options} />
      </div>
    </GlassCard>
  );
}
