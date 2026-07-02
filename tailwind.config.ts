import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ─── Frozen Light design tokens ───
        'light-background':    '#f1f5f9',
        'light-surface':       '#ffffff',
        'light-surface-hover': '#f8fafc',
        'light-border':        '#cbd5e1',
        'light-text':          '#0f172a',
        'light-text-muted':    '#475569',

        'dark-background':    '#020617',
        'dark-surface':       '#0f172a',
        'dark-surface-hover': '#1e293b',
        'dark-border':        '#1e293b',
        'dark-text':          '#f8fafc',
        'dark-text-muted':    '#94a3b8',

        primary:        '#0284c7',
        'primary-light': '#7dd3fc',
        'primary-hover': '#0369a1',
        'primary-active':'#075985',

        // Status tokens — single source of truth for post-status colors
        // (StatusChip consumes these). DEFAULT is tuned for light surfaces,
        // `dark` for dark surfaces; the old single 400-level values lacked
        // contrast on white.
        'status-draft':      { DEFAULT: '#64748b', dark: '#94a3b8' },
        'status-exported':   { DEFAULT: '#7c3aed', dark: '#a78bfa' },
        'status-scheduled':  { DEFAULT: '#0284c7', dark: '#38bdf8' },
        'status-published':  { DEFAULT: '#047857', dark: '#4ade80' },
        'status-failed':     { DEFAULT: '#dc2626', dark: '#f87171' },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'monospace'],
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
        full: '9999px',
      },
      spacing: {
        'appbar': '4rem',   // 64px
        'sidebar': '16rem', // 256px
      },
      maxWidth: {
        canvas: '1440px',
      },
    },
  },
  plugins: [],
}

export default config
