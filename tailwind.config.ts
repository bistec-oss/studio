import type { Config } from 'tailwindcss'

// A semantic colour token from globals.css (an R G B triplet), with Tailwind's
// opacity modifier slot.
const tok = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ─── Semantic colours (change 011, DESIGN_SYSTEM.md §3.4) ───
        // Each is an R G B triplet var from globals.css, switched by .dark, so
        // one class serves both themes and opacity modifiers work (bg-scrim/50).
        canvas: tok('canvas'),
        surface: { DEFAULT: tok('surface-1'), raised: tok('surface-2') },
        fg: { DEFAULT: tok('fg'), muted: tok('fg-muted') },
        line: { DEFAULT: tok('line'), subtle: tok('line-subtle') },
        accent: { DEFAULT: tok('accent'), fg: tok('accent-fg') },
        focus: tok('focus'),
        scrim: tok('scrim'),

        // Status tokens — single source of truth for post-status colours
        // (StatusChip consumes these). Each --status-* var carries its own
        // light and dark values.
        'status-draft':     tok('status-draft'),
        'status-exported':  tok('status-exported'),
        'status-scheduled': tok('status-scheduled'),
        'status-published': tok('status-published'),
        'status-failed':    tok('status-failed'),
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        raised: 'var(--shadow-raised)',
        overlay: 'var(--shadow-overlay)',
      },
      // Exactly two families (021 FR-02): Plus Jakarta Sans and JetBrains Mono,
      // both from next/font (src/app/layout.tsx). The body sets `font-sans`,
      // so nothing else needs a font utility.
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      // The design system's sizes and radii under ui-* keys: Tailwind's own
      // sm/base/xl/2xl (type) and md/lg (radius) differ from ours, and the app
      // still uses a few of the defaults. Spacing needs only the control
      // heights (the design steps equal Tailwind's): h-control-md, w-control-sm
      // and so on (014 FR-07), under their own keys so no default step changes.
      spacing: {
        'control-sm': 'var(--control-sm)',
        'control-md': 'var(--control-md)',
        'control-lg': 'var(--control-lg)',
      },
      fontSize: {
        'ui-2xs': 'var(--text-2xs)',
        'ui-xs': 'var(--text-xs)',
        'ui-sm': 'var(--text-sm)',
        'ui-base': 'var(--text-base)',
        'ui-lg': 'var(--text-lg)',
        'ui-xl': 'var(--text-xl)',
        'ui-2xl': 'var(--text-2xl)',
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
        full: '9999px',
        'ui-sm': 'var(--radius-sm)',
        'ui-md': 'var(--radius-md)',
        'ui-lg': 'var(--radius-lg)',
        'ui-xl': 'var(--radius-xl)',
        'ui-pill': 'var(--radius-pill)',
      },
      // The one status-tint alpha, for bg-status-x/12 (021 A2).
      opacity: {
        '12': '0.12',
      },
      // The one small-caps tracking, used only by SMALL_CAPS (021 FR-07).
      letterSpacing: {
        label: '0.14em',
      },
      transitionDuration: {
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
        slow: 'var(--dur-slow)',
      },
      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
        exit: 'var(--ease-exit)',
      },
      maxWidth: {
        canvas: '1440px',
      },
    },
  },
  plugins: [],
}

export default config
