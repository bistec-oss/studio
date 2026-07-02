import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Unit-test runner (fast, no DB / no browser). E2E stays on Playwright
// (playwright.config.ts) — vitest only picks up tests/unit/**.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
