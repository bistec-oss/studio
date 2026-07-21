import { test, expect } from '@playwright/test'
import { loginAs, type ApiClient } from '../helpers/api'

// §S — Team settings: team-admin-only team credentials/channels/API keys
// (/api/team/*, team-tenancy Task 10/12/13), and super-admin team management
// (/api/admin/teams, Task 17).

const ADMIN_EMAIL = 'admin@bisteccare.lk' // super admin, Bistec team ADMIN
const ADMIN_PASSWORD = 'BistecStudio2026!'
const EDITOR_EMAIL = 'editor@bisteccare.lk' // Bistec team EDITOR
const EDITOR_PASSWORD = 'BistecStudio2026!'

// Same MOCK_AI validation seam as /api/me/claude-token (settings-claude-token.test.ts):
// a token containing "invalid" → 422; anything else shape-valid passes.
const TOKEN_OK = 'sk-ant-oat01-TEAMTOKENAAAAAAAAAAAAAAAAAAAAAAAA'
const TOKEN_BAD = 'sk-ant-oat01-invalid-AAAAAAAAAAAAAAAAAAAAAAAA'

test.describe('Team settings — team-admin-only credentials', () => {
  let admin: ApiClient
  let editor: ApiClient

  test.beforeEach(async ({ request }) => {
    admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
  })
  test.afterEach(async () => {
    await admin.dispose()
    await editor.dispose()
  })

  test('team admin can connect/replace/disconnect the team Claude token; editor is 403 throughout', async () => {
    // Editor 403s on every verb up front.
    expect((await editor.get('/api/team/claude-token')).status()).toBe(403)
    expect((await editor.put('/api/team/claude-token', { token: TOKEN_OK })).status()).toBe(403)
    expect((await editor.del('/api/team/claude-token')).status()).toBe(403)

    // Admin: malformed shape → 400.
    expect((await admin.put('/api/team/claude-token', { token: 'not-a-token' })).status()).toBe(400)

    // Admin: MOCK_AI validation seam rejects a token containing "invalid" → 422, nothing stored.
    const rejected = await admin.put('/api/team/claude-token', { token: TOKEN_BAD })
    expect(rejected.status()).toBe(422)
    expect((await (await admin.get('/api/team/claude-token')).json()).connected).toBe(false)

    // Admin: connect.
    const connected = await (await admin.put('/api/team/claude-token', { token: TOKEN_OK })).json()
    expect(connected.connected).toBe(true)
    expect(connected.keyPrefix).toBe(`…${TOKEN_OK.slice(-4)}`)
    expect(JSON.stringify(connected)).not.toContain(TOKEN_OK)

    const fetched = await (await admin.get('/api/team/claude-token')).json()
    expect(fetched).toEqual(connected)

    // Disconnect — idempotent.
    expect((await admin.del('/api/team/claude-token')).status()).toBe(200)
    expect(await (await admin.get('/api/team/claude-token')).json()).toEqual({ connected: false })
    expect((await admin.del('/api/team/claude-token')).status()).toBe(200)
  })

  test('team admin can connect/revoke Social Channels; editor is 403 throughout', async () => {
    expect((await editor.get('/api/team/channels')).status()).toBe(403)
    expect(
      (await editor.post('/api/team/channels', { channel: 'INSTAGRAM', token: 'x', metadata: 'y' })).status(),
    ).toBe(403)
    expect((await editor.del('/api/team/channels/INSTAGRAM')).status()).toBe(403)

    const before = await (await admin.get('/api/team/channels')).json()
    expect(before.INSTAGRAM.connected).toBe(false)

    const created = await admin.post('/api/team/channels', {
      channel: 'INSTAGRAM',
      token: 'ig-token-value',
      metadata: JSON.stringify({ accountId: '123' }),
    })
    expect(created.status()).toBe(201)

    const after = await (await admin.get('/api/team/channels')).json()
    expect(after.INSTAGRAM.connected).toBe(true)

    expect((await admin.del('/api/team/channels/INSTAGRAM')).status()).toBe(204)
    // Idempotent on the re-delete? The route 404s a second delete (no row) —
    // pin the actual contract rather than assume.
    expect((await admin.del('/api/team/channels/INSTAGRAM')).status()).toBe(404)

    const cleared = await (await admin.get('/api/team/channels')).json()
    expect(cleared.INSTAGRAM.connected).toBe(false)
  })

  test('team admin can create and revoke API keys; editor is 403 throughout', async ({ request }) => {
    expect((await editor.get('/api/team/api-keys')).status()).toBe(403)
    expect((await editor.post('/api/team/api-keys', { label: 'nope' })).status()).toBe(403)

    // Empty label rejected.
    expect((await admin.post('/api/team/api-keys', { label: '  ' })).status()).toBe(400)

    const created = await (
      await admin.post('/api/team/api-keys', { label: `Settings suite ${Date.now()}` })
    ).json()
    expect(created.plaintext).toMatch(/^bstk_/)
    expect(created.id).toBeTruthy()

    // The plaintext never appears in the list endpoint.
    const list = await (await admin.get('/api/team/api-keys')).json()
    const row = (list.keys as { id: string; keyPrefix: string; revokedAt: string | null }[]).find(
      (k) => k.id === created.id,
    )
    expect(row).toBeTruthy()
    expect(row!.revokedAt).toBeNull()
    expect(JSON.stringify(list)).not.toContain(created.plaintext)

    expect((await editor.del(`/api/team/api-keys/${created.id}`)).status()).toBe(403)

    expect((await admin.del(`/api/team/api-keys/${created.id}`)).status()).toBe(204)
    const listed = await (await admin.get('/api/team/api-keys')).json()
    const revoked = (listed.keys as { id: string; revokedAt: string | null }[]).find((k) => k.id === created.id)
    expect(revoked!.revokedAt).toBeTruthy()

    // Idempotent re-revoke.
    expect((await admin.del(`/api/team/api-keys/${created.id}`)).status()).toBe(204)

    // The revoked key stops authenticating against ACP immediately.
    const manifest = await request.get('/api/acp/manifest', {
      headers: { 'x-bistec-api-key': created.plaintext },
    })
    expect(manifest.status()).toBe(401)
  })
})

test.describe('Super admin — /api/admin/teams', () => {
  test('creates a team, assigns members with roles, renames, and soft-deletes it', async ({ request }) => {
    const sa = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    try {
      const name = `Settings-Suite Team ${Date.now()}`
      const created = await (await sa.post('/api/admin/teams', { name })).json()
      expect(created.id).toBeTruthy()
      expect(created.memberCount).toBe(0)

      // Duplicate name → 409.
      expect((await sa.post('/api/admin/teams', { name })).status()).toBe(409)

      // Assign the seeded editor to it as EDITOR.
      const users = await (await sa.get('/api/admin/users')).json()
      const editorUser = (users as { id: string; email: string }[]).find(
        (u) => u.email === 'editor@bisteccare.lk',
      )
      expect(editorUser).toBeTruthy()

      const addRes = await sa.post(`/api/admin/teams/${created.id}/members`, {
        userId: editorUser!.id,
        role: 'EDITOR',
      })
      expect(addRes.status()).toBe(201)

      let members = await (await sa.get(`/api/admin/teams/${created.id}/members`)).json()
      expect(members.map((m: { userId: string }) => m.userId)).toContain(editorUser!.id)

      // Role change EDITOR → ADMIN.
      const roleRes = await sa.patch(`/api/admin/teams/${created.id}/members/${editorUser!.id}`, {
        role: 'ADMIN',
      })
      expect(roleRes.status()).toBe(200)
      members = await (await sa.get(`/api/admin/teams/${created.id}/members`)).json()
      expect(members.find((m: { userId: string }) => m.userId === editorUser!.id).role).toBe('ADMIN')

      // Rename.
      const renamed = await (
        await sa.patch(`/api/admin/teams/${created.id}`, { name: `${name} Renamed` })
      ).json()
      expect(renamed.name).toBe(`${name} Renamed`)

      // Remove the membership.
      expect((await sa.del(`/api/admin/teams/${created.id}/members/${editorUser!.id}`)).status()).toBe(204)
      members = await (await sa.get(`/api/admin/teams/${created.id}/members`)).json()
      expect(members.map((m: { userId: string }) => m.userId)).not.toContain(editorUser!.id)

      // Soft-delete — drops out of the listing.
      expect((await sa.del(`/api/admin/teams/${created.id}`)).status()).toBe(204)
      const teams = await (await sa.get('/api/admin/teams')).json()
      expect((teams as { id: string }[]).map((t) => t.id)).not.toContain(created.id)
    } finally {
      await sa.dispose()
    }
  })

  test('a non-super-admin gets 403 on every /api/admin/teams route', async ({ request }) => {
    const admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD) // super admin, for setup only
    const editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    try {
      const team = await (
        await admin.post('/api/admin/teams', { name: `Perm-check Team ${Date.now()}` })
      ).json()

      expect((await editor.get('/api/admin/teams')).status()).toBe(403)
      expect((await editor.post('/api/admin/teams', { name: 'x' })).status()).toBe(403)
      expect((await editor.patch(`/api/admin/teams/${team.id}`, { name: 'y' })).status()).toBe(403)
      expect((await editor.get(`/api/admin/teams/${team.id}/members`)).status()).toBe(403)
      expect(
        (await editor.post(`/api/admin/teams/${team.id}/members`, { userId: 'x', role: 'EDITOR' })).status(),
      ).toBe(403)
      expect((await editor.del(`/api/admin/teams/${team.id}`)).status()).toBe(403)

      await admin.del(`/api/admin/teams/${team.id}`)
    } finally {
      await editor.dispose()
      await admin.dispose()
    }
  })
})
