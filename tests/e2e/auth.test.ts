import { test, expect } from '@playwright/test'
import { login, get, loginAs } from '../helpers/api'

// §A — Authentication & RBAC (docs/e2e-test-plan.md).
//
// Contract notes verified against src/middleware.ts + src/lib/auth.ts:
//   - The session gate is MIDDLEWARE-level and REDIRECTS unauthenticated requests
//     to /login (302/307) — it does NOT return 401 — for every path except the
//     public prefixes (/login, /api/auth, /api/acp). So an unauthenticated API
//     call is blocked by redirect, not by a 401 body. (/api/acp fails closed with
//     a route-level 401 — see acp.test.ts.)
//   - /api/me returns the role LOWER-CASED ('admin' | 'editor'); the DB enum is
//     ADMIN/EDITOR and requireRole compares case-insensitively.
//   - Admin-only mutations return 403 for an editor (requireRole('admin')).

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const EDITOR_EMAIL = 'editor@bisteccare.lk'
const EDITOR_PASSWORD = 'BistecStudio2026!'

test.describe('Authentication & RBAC', () => {
  // TC-AUTH-01 — Login success sets a session cookie.
  test('login with valid admin credentials sets a session cookie', async ({ request }) => {
    const res = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    expect(res.status()).toBe(200)
    expect(res.headers()['set-cookie'] ?? '').toContain('better-auth.session_token=')
  })

  // TC-AUTH-02 — Login failure: wrong password, no session cookie.
  test('login with a wrong password is rejected without a session cookie', async ({ request }) => {
    const res = await request.post('/api/auth/sign-in/email', {
      data: { email: ADMIN_EMAIL, password: 'wrong-password' },
    })
    expect(res.status()).toBeGreaterThanOrEqual(400)
    // No usable session token issued.
    const setCookie = res.headers()['set-cookie'] ?? ''
    expect(/better-auth\.session_token=[^;]+/.test(setCookie) && !setCookie.includes('session_token=;')).toBe(false)
  })

  // TC-AUTH-03 — Unauthenticated access is blocked. The middleware redirects to
  // /login (it is NOT a 401 for these routes). Assert the redirect rather than 401.
  test('unauthenticated requests are redirected to /login', async ({ request }) => {
    for (const path of ['/api/library', '/api/drafts/anything']) {
      const res = await request.get(path, { maxRedirects: 0 })
      expect([301, 302, 303, 307, 308]).toContain(res.status())
      expect(res.headers()['location'] ?? '').toContain('/login')
    }
  })

  // TC-AUTH-04 — /api/me returns the lower-cased role. Guards H13.
  test('/api/me reports the role lower-cased for admin and editor', async ({ request }) => {
    await login(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const adminMe = await (await get(request, '/api/me')).json()
    expect(adminMe.role).toBe('admin')
    expect(adminMe.userId).toBeTruthy()

    const editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    const editorMe = await (await editor.get('/api/me')).json()
    expect(editorMe.role).toBe('editor')
  })

  // TC-AUTH-05 — Admin-only mutations are gated for an editor → 403. Guards H4.
  test('an editor is forbidden from admin-only mutations', async ({ request }) => {
    // Seed a campaign + project as admin to target.
    await login(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const { post: adminPost } = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const camp = await (await adminPost('/api/campaigns', { name: 'RBAC Campaign' })).json()
    const proj = await (await adminPost('/api/projects', { name: 'RBAC Project' })).json()

    const editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    expect((await editor.patch(`/api/campaigns/${camp.id}`, { name: 'hijack' })).status()).toBe(403)
    expect((await editor.del(`/api/campaigns/${camp.id}`)).status()).toBe(403)
    expect((await editor.patch(`/api/projects/${proj.id}`, { name: 'hijack' })).status()).toBe(403)
    expect((await editor.del(`/api/projects/${proj.id}`)).status()).toBe(403)
    // POST /api/posts is admin-only — requireRole fires before draft validation.
    expect((await editor.post('/api/posts', { draftId: 'x', channel: 'INSTAGRAM' })).status()).toBe(403)
    // Any /api/admin/* write.
    expect((await editor.post('/api/admin/brandkits', { name: 'nope' })).status()).toBe(403)
  })

  // TC-AUTH-06 — requireRole is case-insensitive: the admin (ADMIN in DB) reaches
  // an admin route (200, not 403). Guards the role-casing fix.
  test('admin (ADMIN in DB) is allowed through requireRole', async ({ request }) => {
    await login(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const res = await get(request, '/api/admin/brandkits')
    expect(res.status()).toBe(200)
  })

  // TC-AUTH-07 — The public-prefix check is exact: a sibling path that merely
  // prefixes a public route is NOT exempted, so an unauthenticated request to it
  // is redirected to /login. Guards M9.
  test('a path that only prefixes a public route is still protected', async ({ request }) => {
    // "/api/authsomething" is not "/api/auth" and not under "/api/auth/".
    const res = await request.get('/api/authsomething', { maxRedirects: 0 })
    expect([301, 302, 303, 307, 308]).toContain(res.status())
    expect(res.headers()['location'] ?? '').toContain('/login')
  })
})
