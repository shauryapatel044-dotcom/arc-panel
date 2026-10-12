import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        /* ── Arc Panel Design System Palette ──────────────────────── */
        'arc-navy': {
          50:  '#e8eaf6',
          100: '#c5c9e8',
          200: '#9fa5d9',
          300: '#7981ca',
          400: '#5c65be',
          500: '#3f4ab2',
          600: '#1a1f4b',  // primary deep navy
          700: '#141840',
          800: '#0d1130',  // darkest bg
          900: '#080c24',
          950: '#04061a',
        },
        'arc-glass': {
          DEFAULT: 'rgba(255,255,255,0.05)',
          border: 'rgba(255,255,255,0.08)',
          hover:  'rgba(255,255,255,0.09)',
          strong: 'rgba(255,255,255,0.12)',
        },
        'arc-cyan': {
          50:  '#e0f9ff',
          100: '#b3f0ff',
          200: '#80e7ff',
          300: '#4dddff',
          400: '#26d5ff',  // primary accent
          500: '#00ccff',
          600: '#00a3cc',
          700: '#007a99',
          800: '#005266',
          900: '#002933',
        },
        'arc-blue': {
          50:  '#e6eeff',
          100: '#c0d2ff',
          200: '#97b3ff',
          300: '#6e93ff',
          400: '#4d79ff',  // primary blue accent
          500: '#2a5eff',
          600: '#1a4bda',
          700: '#1039b5',
          800: '#082890',
          900: '#01186b',
        },
        'arc-violet': {
          50:  '#f0e8ff',
          100: '#d9c5ff',
          200: '#c09fff',
          300: '#a779ff',
          400: '#935cff',  // primary violet accent
          500: '#7f3fff',
          600: '#6527e0',
          700: '#4c13c0',
          800: '#33039f',
          900: '#1c007f',
        },
        'arc-orange': {
          400: '#fb8c3a',  // "danger" — deep orange, NOT red
          500: '#f97316',
          600: '#ea6c0a',
        },
        'arc-slate': {
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
      },

      /* ── Backdrop Blur Utilities ────────────────────────────────── */
      backdropBlur: {
        xs: '2px',
        sm: '4px',
        md: '8px',
        lg: '16px',
        xl: '24px',
        '2xl': '40px',
        '3xl': '64px',
      },

      /* ── Custom Box Shadows ─────────────────────────────────────── */
      boxShadow: {
        'glass':         '0 4px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
        'glass-hover':   '0 8px 48px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.10)',
        'cyan-glow':     '0 0 20px rgba(0,204,255,0.4), 0 0 40px rgba(0,204,255,0.15)',
        'blue-glow':     '0 0 20px rgba(77,121,255,0.4), 0 0 40px rgba(77,121,255,0.15)',
        'violet-glow':   '0 0 20px rgba(147,92,255,0.4), 0 0 40px rgba(147,92,255,0.15)',
        'orange-glow':   '0 0 20px rgba(251,140,58,0.4), 0 0 40px rgba(251,140,58,0.15)',
      },

      /* ── Font Family ────────────────────────────────────────────── */
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
      },

      /* ── Animation Keyframes ────────────────────────────────────── */
      keyframes: {
        /* Aurora orb slow drift */
        'aurora-drift-1': {
          '0%,100%': { transform: 'translate(0%, 0%) scale(1)',   opacity: '0.55' },
          '33%':     { transform: 'translate(8%, -12%) scale(1.15)', opacity: '0.70' },
          '66%':     { transform: 'translate(-5%, 8%) scale(0.90)',  opacity: '0.50' },
        },
        'aurora-drift-2': {
          '0%,100%': { transform: 'translate(0%, 0%) scale(1)',    opacity: '0.45' },
          '40%':     { transform: 'translate(-10%, 6%) scale(1.2)', opacity: '0.65' },
          '70%':     { transform: 'translate(6%, -8%) scale(0.85)', opacity: '0.40' },
        },
        'aurora-drift-3': {
          '0%,100%': { transform: 'translate(0%, 0%) scale(1)',     opacity: '0.35' },
          '50%':     { transform: 'translate(12%, 10%) scale(1.25)', opacity: '0.55' },
        },
        /* Nebula shimmer */
        'nebula-pulse': {
          '0%,100%': { opacity: '0.3', transform: 'scale(1)' },
          '50%':     { opacity: '0.6', transform: 'scale(1.08)' },
        },
        /* Status badge pulse */
        'status-pulse': {
          '0%,100%': { boxShadow: '0 0 6px rgba(0,204,255,0.6)' },
          '50%':     { boxShadow: '0 0 16px rgba(0,204,255,1.0)' },
        },
        /* Fade-in up */
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        /* Slide-in from left */
        'slide-in-left': {
          from: { opacity: '0', transform: 'translateX(-32px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        /* Spin */
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to:   { transform: 'rotate(360deg)' },
        },
        /* Counter shimmer */
        'shimmer': {
          '0%':   { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition:  '200% center' },
        },
      },

      animation: {
        'aurora-1':     'aurora-drift-1 18s ease-in-out infinite',
        'aurora-2':     'aurora-drift-2 24s ease-in-out infinite',
        'aurora-3':     'aurora-drift-3 30s ease-in-out infinite',
        'nebula':       'nebula-pulse 8s ease-in-out infinite',
        'status-pulse': 'status-pulse 2s ease-in-out infinite',
        'fade-in-up':   'fade-in-up 0.5s ease-out forwards',
        'slide-left':   'slide-in-left 0.4s ease-out forwards',
        'spin-slow':    'spin-slow 8s linear infinite',
        'shimmer':      'shimmer 3s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
