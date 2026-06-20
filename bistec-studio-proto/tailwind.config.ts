import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#ffffff',
          1: '#f9fafb',
          2: '#f3f4f6',
          3: '#e5e7eb',
          4: '#d1d5db',
        },
      },
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'monospace'],
        display: ['var(--font-syne)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
