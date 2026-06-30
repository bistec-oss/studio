import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  // The app runs under `next dev`, which lazily compiles routes on first hit; a
  // cold compile under full-suite load can blow short action timeouts. One retry
  // (the route is warm the second time) keeps the UI flows stable.
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.TEST_BASE_URL ?? 'http://localhost:3001',
    // NOTE: do NOT set a global Content-Type here. Playwright auto-sets
    // application/json when a request passes `data:` as an object, and sets the
    // multipart boundary for `multipart:` uploads. A hard-coded application/json
    // would override the multipart boundary and 500 every file-upload route.
  },
})
