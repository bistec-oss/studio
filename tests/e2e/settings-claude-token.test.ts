import { test, expect, type Page } from '@playwright/test'
import { loginAs } from '../helpers/api'

// §O — Personal Claude OAuth tokens (self-service /settings + /api/me/claude-token).
//
// Contract notes:
//   - GET/PUT/DELETE /api/me/claude-token are withAuth and keyed to the session
//     user; responses carry only { connected, status, keyPrefix, connectedAt,
//     lastValidatedAt } — the raw token NEVER appears in any response.
//   - PUT validates shape (zod: sk-ant-oat01- + ≥20 [A-Za-z0-9_-]) → 400, then
//     runs validateClaudeToken. Under MOCK_AI that's the deterministic seam:
//     a token containing "invalid" → 422; anything else passes (no CLI spawn —
//     this env runs DESIGN_PROVIDER=claude-html).
//   - GET /api/me carries cliMode + the masked token state for the app shell.

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const EDITOR_EMAIL = 'editor@bisteccare.lk'
const PASSWORD = 'BistecStudio2026!'

const TOKEN_A = 'sk-ant-oat01-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const TOKEN_B = 'sk-ant-oat01-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB9zZ8'
const TOKEN_BAD = 'sk-ant-oat01-invalid-AAAAAAAAAAAAAAAAAAAAAAAAAAA'

async function pageLogin(page: Page, email = EDITOR_EMAIL) {
  await page.goto('/login')
  await page.getByPlaceholder('Username').fill(email)
  await page.getByPlaceholder('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(url => url.pathname === '/' || url.pathname === '/choose-team')
  // Defensive: a super admin (e.g. ADMIN_EMAIL) with no active-team cookie
  // lands on /choose-team once a second team exists (team tenancy) — pick
  // "Bistec" so this helper stays correct regardless of which account it's
  // called with. EDITOR_EMAIL (the default) has a single membership and
  // never hits this branch. The extra page.goto('/') forces a fresh SSR
  // round-trip instead of trusting the client router's soft-nav landing
  // spot, which can settle on a stale "/" before a server redirect lands.
  await page.goto('/')
  if (page.url().includes('/choose-team')) {
    await page.getByRole('button', { name: 'Bistec' }).click()
    await page.waitForURL(url => url.pathname === '/')
  }
}

test.describe('Personal Claude token', () => {
  test('GET /api/me exposes cliMode and the (absent) token state', async ({ request }) => {
    const editor = await loginAs(request, EDITOR_EMAIL, PASSWORD)
    // Start clean in case an earlier run left a token behind.
    await editor.del('/api/me/claude-token')

    const me = await (await editor.get('/api/me')).json()
    expect(me.cliMode).toBe(false) // this env runs claude-html
    expect(me.claudeToken).toBeNull()
    await editor.dispose()
  })

  test('connect → replace → disconnect lifecycle; the raw token never leaves the server', async ({ request }) => {
    const editor = await loginAs(request, EDITOR_EMAIL, PASSWORD)
    const base = '/api/me/claude-token'
    await editor.del(base)

    expect(await (await editor.get(base)).json()).toEqual({ connected: false })

    // Connect.
    const put = await editor.put(base, { token: TOKEN_A })
    expect(put.status()).toBe(200)
    const connected = await put.json()
    expect(connected.connected).toBe(true)
    expect(connected.status).toBe('ACTIVE')
    expect(connected.keyPrefix).toBe(`…${TOKEN_A.slice(-4)}`)
    // The raw token must not appear anywhere in the response.
    expect(JSON.stringify(connected)).not.toContain(TOKEN_A)

    // Reflected on /api/me (masked only).
    const me = await (await editor.get('/api/me')).json()
    expect(me.claudeToken.status).toBe('ACTIVE')
    expect(me.claudeToken.keyPrefix).toBe(`…${TOKEN_A.slice(-4)}`)
    expect(JSON.stringify(me)).not.toContain(TOKEN_A)

    // Replace (upsert) updates the masked suffix.
    const replaced = await (await editor.put(base, { token: TOKEN_B })).json()
    expect(replaced.keyPrefix).toBe(`…${TOKEN_B.slice(-4)}`)

    // Disconnect — idempotent.
    expect((await editor.del(base)).status()).toBe(200)
    expect(await (await editor.get(base)).json()).toEqual({ connected: false })
    expect((await editor.del(base)).status()).toBe(200)

    await editor.dispose()
  })

  test('PUT rejects malformed tokens (400) and validation failures (422)', async ({ request }) => {
    const editor = await loginAs(request, EDITOR_EMAIL, PASSWORD)
    const base = '/api/me/claude-token'
    await editor.del(base)

    // Shape guard (zod): wrong prefix / too short.
    expect((await editor.put(base, { token: 'sk-ant-api03-not-an-oauth-token-aaaa' })).status()).toBe(400)
    expect((await editor.put(base, { token: 'sk-ant-oat01-short' })).status()).toBe(400)
    expect((await editor.put(base, {})).status()).toBe(400)

    // MOCK_AI validation seam: "invalid" in the token → 422 with detail.
    const invalid = await editor.put(base, { token: TOKEN_BAD })
    expect(invalid.status()).toBe(422)
    const body = await invalid.json()
    expect(body.error).toBe('Token validation failed')
    expect(body.detail).toContain('rejected')

    // Nothing was stored.
    expect(await (await editor.get(base)).json()).toEqual({ connected: false })
    await editor.dispose()
  })

  test('tokens are per-user: one user connecting does not affect another', async ({ request }) => {
    const editor = await loginAs(request, EDITOR_EMAIL, PASSWORD)
    const admin = await loginAs(request, ADMIN_EMAIL, PASSWORD)
    const base = '/api/me/claude-token'
    await editor.del(base)
    await admin.del(base)

    await editor.put(base, { token: TOKEN_A })
    expect((await (await editor.get(base)).json()).connected).toBe(true)
    expect(await (await admin.get(base)).json()).toEqual({ connected: false })

    await editor.del(base)
    await editor.dispose()
    await admin.dispose()
  })

  test('unauthenticated calls are blocked (proxy redirect to /login)', async ({ request }) => {
    // The session gate is proxy-level and REDIRECTS unauthenticated requests
    // to /login — it does not 401 (see auth.test.ts TC-AUTH-03).
    const gets = await request.get('/api/me/claude-token', { maxRedirects: 0 })
    const puts = await request.put('/api/me/claude-token', { data: { token: TOKEN_A }, maxRedirects: 0 })
    const dels = await request.delete('/api/me/claude-token', { maxRedirects: 0 })
    for (const res of [gets, puts, dels]) {
      expect([301, 302, 303, 307, 308]).toContain(res.status())
      expect(res.headers()['location'] ?? '').toContain('/login')
    }
  })

  test('the /settings page renders the Claude card for an editor (API-mode note, no CLI banner)', async ({ page, request }) => {
    const editor = await loginAs(request, EDITOR_EMAIL, PASSWORD)
    await editor.del('/api/me/claude-token')
    await editor.dispose()

    await pageLogin(page)

    // Settings is in the nav for every role.
    await page.getByRole('link', { name: 'Settings' }).first().click()
    await page.waitForURL(url => url.pathname === '/settings')

    await expect(page.getByRole('heading', { name: 'Claude account', exact: true })).toBeVisible()
    // /settings also renders an OpenAiKeyCard (Task 17) with its own
    // "Not connected" status pill, so this assertion is scoped to at least
    // one match rather than requiring exact uniqueness.
    await expect(page.getByText('Not connected').first()).toBeVisible()
    await expect(page.getByText('claude setup-token').first()).toBeVisible()
    // This env is API mode → the informational note shows, and the app-shell
    // connect banner must NOT render (it's CLI-mode-only).
    await expect(page.getByText('API mode', { exact: false })).toBeVisible()
    await expect(page.getByText('Connect your Claude account so your posts generate')).toHaveCount(0)
  })

  test('connecting via the settings form shows the Connected state', async ({ page, request }) => {
    const editor = await loginAs(request, EDITOR_EMAIL, PASSWORD)
    await editor.del('/api/me/claude-token')
    await editor.dispose()

    await pageLogin(page)
    await page.goto('/settings')

    // Scoped to the Claude card's own <form>: /settings also renders an
    // OpenAiKeyCard with its own "Connect" button (Task 17), so an unscoped
    // getByRole('button', { name: 'Connect' }) is ambiguous (strict-mode
    // violation) on this page.
    const claudeForm = page.locator('form', { has: page.getByLabel('Claude OAuth token') })
    await claudeForm.getByLabel('Claude OAuth token').fill(TOKEN_A)
    await claudeForm.getByRole('button', { name: 'Connect' }).click()

    await expect(page.getByText('Connected', { exact: true })).toBeVisible()
    await expect(page.getByText(`token …${TOKEN_A.slice(-4)}`)).toBeVisible()
    // The raw token never appears in the DOM after save.
    await expect(page.locator('body')).not.toContainText(TOKEN_A)

    // Cleanup so other cases start disconnected.
    const cleanup = await loginAs(request, EDITOR_EMAIL, PASSWORD)
    await cleanup.del('/api/me/claude-token')
    await cleanup.dispose()
  })
})
