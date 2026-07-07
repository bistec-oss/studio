import { test, expect, request as pwRequest } from '@playwright/test'
import { loginAs } from '../helpers/api'

// §M — Super-admin user management (/api/admin/users).
//
// Contract notes (src/app/api/admin/users/*, src/lib/auth.ts):
//   - Accounts sign in by USERNAME (better-auth username plugin); email is
//     internal (synthesized for admin-created accounts).
//   - The seeded admin is SUPER_ADMIN (username adminBTG); routes are gated
//     withSuperAdmin — a plain ADMIN gets 403.
//   - "Delete" = deactivate: disabled flag + sessions revoked; sign-in blocked
//     by a session-create databaseHook (403), live sessions null out (401 on
//     /api/me via getCurrentUser).
//   - Guards: self-modify 403; SUPER_ADMIN targets 403; SUPER_ADMIN is never
//     assignable via this API (zod only allows admin|editor).

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const EDITOR_EMAIL = 'editor@bisteccare.lk'

const uniq = () => `um${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3001'

// Each probe gets a FRESH context: a session cookie left in a shared jar makes
// better-auth run its CSRF origin check on the next sign-in POST and fail it
// with 403 MISSING_OR_NULL_ORIGIN — masking the status under test.
async function signInUsername(username: string, password: string): Promise<number> {
  const ctx = await pwRequest.newContext({ baseURL: BASE })
  try {
    const res = await ctx.post('/api/auth/sign-in/username', { data: { username, password } })
    return res.status()
  } finally {
    await ctx.dispose()
  }
}

test.describe('Super-admin user management', () => {
  test('super-admin lists users; list includes the seeded accounts', async ({ request }) => {
    const sa = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const res = await sa.get('/api/admin/users')
    expect(res.status()).toBe(200)
    const users = await res.json()
    const emails = users.map((u: { email: string }) => u.email)
    expect(emails).toContain(ADMIN_EMAIL)
    expect(emails).toContain(EDITOR_EMAIL)
    await sa.dispose()
  })

  test('create user → sign in by username → role change → deactivate → reactivate + reset', async ({ request }) => {
    const sa = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const username = uniq()

    // Create (editor).
    const createRes = await sa.post('/api/admin/users', {
      name: 'UM Test',
      username,
      role: 'editor',
      password: 'InitialPass1!',
    })
    expect(createRes.status()).toBe(201)
    const created = await createRes.json()
    expect(created.role).toBe('EDITOR')
    expect(created.username).toBe(username.toLowerCase())

    // Duplicate username → 409.
    expect(
      (
        await sa.post('/api/admin/users', {
          name: 'Dup',
          username,
          role: 'editor',
          password: 'InitialPass1!',
        })
      ).status(),
    ).toBe(409)

    // The new user can sign in by username.
    expect(await signInUsername(username, 'InitialPass1!')).toBe(200)

    // Role change editor → admin.
    const patched = await (
      await sa.patch(`/api/admin/users/${created.id}`, { role: 'admin' })
    ).json()
    expect(patched.role).toBe('ADMIN')

    // Deactivate: sign-in now blocked (session-create hook → 403).
    await sa.patch(`/api/admin/users/${created.id}`, { disabled: true })
    expect(await signInUsername(username, 'InitialPass1!')).toBe(403)

    // Reactivate + password reset: old password dead, new one works.
    await sa.patch(`/api/admin/users/${created.id}`, { disabled: false, password: 'ResetPass2!' })
    expect(await signInUsername(username, 'InitialPass1!')).toBe(401)
    expect(await signInUsername(username, 'ResetPass2!')).toBe(200)

    await sa.dispose()
  })

  test('deactivation revokes live sessions immediately', async ({ request }) => {
    const sa = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const username = uniq()
    const created = await (
      await sa.post('/api/admin/users', {
        name: 'UM Session',
        username,
        role: 'editor',
        password: 'SessionPass1!',
      })
    ).json()

    // Hold a live session as the new user (username sign-in → internal email works for loginAs).
    const victim = await loginAs(request, `${username.toLowerCase()}@users.bistec.internal`, 'SessionPass1!')
    expect((await victim.get('/api/me')).status()).toBe(200)

    await sa.patch(`/api/admin/users/${created.id}`, { disabled: true })

    // The pre-existing session is dead (middleware redirects / API 401s — not 200).
    const after = await victim.get('/api/me')
    expect(after.status()).not.toBe(200)

    await victim.dispose()
    await sa.dispose()
  })

  test('guards: self-modify and super-admin targets are 403; role field rejects super_admin', async ({ request }) => {
    const sa = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const users = await (await sa.get('/api/admin/users')).json()
    const me = users.find((u: { email: string }) => u.email === ADMIN_EMAIL)

    expect((await sa.patch(`/api/admin/users/${me.id}`, { disabled: true })).status()).toBe(403)
    // Creating a super_admin through the API is a schema violation.
    expect(
      (
        await sa.post('/api/admin/users', {
          name: 'Nope',
          username: uniq(),
          role: 'super_admin',
          password: 'SomePass123!',
        })
      ).status(),
    ).toBe(400)
    await sa.dispose()
  })

  test('a plain ADMIN gets 403 on every user-management route', async ({ request }) => {
    const sa = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const username = uniq()
    const created = await (
      await sa.post('/api/admin/users', {
        name: 'Plain Admin',
        username,
        role: 'admin',
        password: 'PlainAdmin1!',
      })
    ).json()

    const plain = await loginAs(request, `${username.toLowerCase()}@users.bistec.internal`, 'PlainAdmin1!')
    // Sanity: this account IS an admin (reaches admin routes)…
    expect((await plain.get('/api/admin/brandkits')).status()).toBe(200)
    // …but not a super-admin.
    expect((await plain.get('/api/admin/users')).status()).toBe(403)
    expect(
      (
        await plain.post('/api/admin/users', {
          name: 'x',
          username: uniq(),
          role: 'editor',
          password: 'SomePass123!',
        })
      ).status(),
    ).toBe(403)
    expect((await plain.patch(`/api/admin/users/${created.id}`, { disabled: true })).status()).toBe(403)

    await plain.dispose()
    await sa.dispose()
  })

  test('an editor gets 403 on user-management routes', async ({ request }) => {
    const editor = await loginAs(request, EDITOR_EMAIL, ADMIN_PASSWORD)
    expect((await editor.get('/api/admin/users')).status()).toBe(403)
    await editor.dispose()
  })
})
