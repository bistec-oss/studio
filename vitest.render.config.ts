import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Real-render suite (tests/render/**): launches Chromium through the production
// renderHtmlToPng, so it is kept out of the fast browser-free unit config.
// MOCK_PUPPETEER is forced off here — the harness also throws if it is on, so
// a mis-set environment fails the run rather than skipping it.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/render/**/*.test.ts'],
    env: { MOCK_PUPPETEER: 'false' },
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
