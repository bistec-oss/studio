import { test, expect } from '@playwright/test'
import { loginAs, findTeamIdByName, addTeamMember, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable, NO_DB_MSG } from '../helpers/db'

// §P — Brief draft autosave & recovery (unfinished briefs).
//
// Contract (all withAuth, strictly owner-scoped — no admin override):
//   PUT    /api/brief-drafts            {id?, payload} → 200 {id} | 404 (unknown id,
//          no resurrection) | 422 (trivial payload) | 413 (oversized)
//   GET    /api/brief-drafts            → { drafts: [{id, topic, updatedAt}] } newest
//          first; lazily sweeps rows idle >7 days (images included)
//   GET    /api/brief-drafts/[id]       → full payload for wizard rehydration
//   DELETE /api/brief-drafts/[id]       → discard (deletes briefs/<uid>/ images);
//          ?keepImages=true = Generate-success variant (row only)
// Cap: 5 rows per user; creating past it evicts the oldest.
//
// The wizard-side behaviours (1.5s debounce, resume rehydration, dangling-id
// clearing via the existing consistency effect) are client logic; this suite
// pins the API contract they depend on.

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'

// 1×1 transparent PNG for real MinIO uploads (image lifecycle assertions).
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

function payload(overrides: Record<string, unknown> = {}) {
  return {
    step: 2,
    campaignId: '',
    aspectRatio: 'SQUARE',
    brandKitId: '',
    designMode: 'GENERATE',
    templateId: '',
    referenceTemplateId: '',
    topic: 'Recovery test topic',
    prompt: 'A prompt long enough to matter',
    goal: 'awareness',
    tone: 'professional',
    images: [],
    ...overrides,
  }
}

async function createDraft(api: ApiClient, overrides: Record<string, unknown> = {}) {
  const res = await api.put('/api/brief-drafts', { payload: payload(overrides) })
  expect(res.status()).toBe(200)
  return (await res.json()).id as string
}

async function listIds(api: ApiClient): Promise<string[]> {
  const body = await (await api.get('/api/brief-drafts')).json()
  return (body.drafts as { id: string }[]).map((d) => d.id)
}

// Each test cleans up the rows it created so the per-user cap never bleeds
// between tests (the suite shares the seeded admin account).
async function discardAll(api: ApiClient) {
  for (const id of await listIds(api)) await api.del(`/api/brief-drafts/${id}`)
}

test.describe('§P Brief draft autosave & recovery', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    await discardAll(api)
  })
  test.afterEach(async () => {
    await discardAll(api)
    await api.dispose()
  })

  test('TC-BDR-01: save → list → resume payload round-trips (AC-1)', async () => {
    const id = await createDraft(api, { topic: 'Round trip', step: 3 })

    const listed = await (await api.get('/api/brief-drafts')).json()
    const row = listed.drafts.find((d: { id: string }) => d.id === id)
    expect(row).toBeTruthy()
    expect(row.topic).toBe('Round trip')

    const full = await (await api.get(`/api/brief-drafts/${id}`)).json()
    expect(full.payload).toMatchObject({ topic: 'Round trip', step: 3, designMode: 'GENERATE' })
  })

  test('TC-BDR-02: update in place — same id, no duplicate row', async () => {
    const id = await createDraft(api)
    const res = await api.put('/api/brief-drafts', {
      id,
      payload: payload({ topic: 'Edited topic' }),
    })
    expect(res.status()).toBe(200)
    expect((await res.json()).id).toBe(id)

    const ids = await listIds(api)
    expect(ids).toEqual([id])
    const full = await (await api.get(`/api/brief-drafts/${id}`)).json()
    expect(full.payload.topic).toBe('Edited topic')
  })

  test('TC-BDR-03: keepImages delete + no resurrection via stale autosave (AC-2)', async () => {
    const id = await createDraft(api)

    const del = await api.del(`/api/brief-drafts/${id}?keepImages=true`)
    expect(del.status()).toBe(200)
    expect(await listIds(api)).toEqual([])

    // A late autosave (debounce that fired after Generate) must NOT recreate it.
    const late = await api.put('/api/brief-drafts', { id, payload: payload() })
    expect(late.status()).toBe(404)
    expect(await listIds(api)).toEqual([])
  })

  test('TC-BDR-04: discard deletes the uploaded image from MinIO (AC-3)', async () => {
    // Real upload through the wizard's endpoint → real MinIO object.
    const up = await api.multipart('/api/briefs/images', {
      file: { name: 'bdr.png', mimeType: 'image/png', buffer: PNG_1PX },
    })
    expect(up.status()).toBe(200)
    const { url } = await up.json()

    expect((await api.get(url)).status()).toBe(200) // object exists (public bucket)

    const id = await createDraft(api, {
      images: [{ id: 'img1', url, filename: 'bdr.png', intent: 'embed' }],
    })
    expect((await api.del(`/api/brief-drafts/${id}`)).status()).toBe(200)

    expect(await listIds(api)).toEqual([])
    expect((await api.get(url)).status()).not.toBe(200) // image gone with the row
  })

  test('TC-BDR-05: 6th draft evicts the oldest (AC-4)', async () => {
    const first = await createDraft(api, { topic: 'Oldest' })
    for (let i = 2; i <= 6; i++) await createDraft(api, { topic: `Draft ${i}` })

    const ids = await listIds(api)
    expect(ids).toHaveLength(5)
    expect(ids).not.toContain(first)
  })

  test('TC-BDR-06: rows idle >7 days are swept on read, DB row deleted (AC-5)', async () => {
    if (!dbAvailable || !prisma) {
      test.skip(true, NO_DB_MSG)
      return
    }
    const id = await createDraft(api, { topic: 'Stale' })
    await prisma.briefDraft.update({
      where: { id },
      data: { updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60_000) },
    })

    expect(await listIds(api)).not.toContain(id)
    expect(await prisma.briefDraft.findUnique({ where: { id } })).toBeNull()
  })

  test('TC-BDR-07: foreign ids are 404 for other users INCLUDING admins (AC-6)', async ({
    request,
  }) => {
    const id = await createDraft(api, { topic: 'Private' })

    // Create a second ADMIN — proves there is deliberately no admin override.
    const username = `bdradmin${Date.now()}`
    const created = await api.post('/api/admin/users', {
      name: 'BDR Admin',
      username,
      role: 'admin',
      password: 'BdrAdminPass1!',
    })
    expect(created.status()).toBe(201)
    // Creating a platform user via /api/admin/users grants NO team membership
    // (a deliberate separate step — team-tenancy); the top-level
    // GET/PUT /api/brief-drafts routes are withTeamAuth (Task 7), so this
    // second admin needs a real Bistec membership to even reach the
    // owner-scope 404 logic under test (otherwise it 403s "not a member of
    // any team" before ever touching brief-drafts — a different code path
    // than the "no admin override" this test is about).
    const createdBody = await created.json()
    const bistecId = await findTeamIdByName(api, 'Bistec')
    await addTeamMember(api, bistecId, createdBody.id, 'ADMIN')
    const other = await loginAs(
      request,
      `${username}@users.bistec.internal`,
      'BdrAdminPass1!',
    )
    try {
      expect((await other.get(`/api/brief-drafts/${id}`)).status()).toBe(404)
      expect(
        (await other.put('/api/brief-drafts', { id, payload: payload() })).status(),
      ).toBe(404)
      expect((await other.del(`/api/brief-drafts/${id}`)).status()).toBe(404)
      // Owner's row untouched, and the other admin's list doesn't include it.
      expect(await listIds(api)).toContain(id)
      expect(await listIds(other)).not.toContain(id)
    } finally {
      await other.dispose()
    }
  })

  test('TC-BDR-08: trivial payloads never create a row (AC-7)', async () => {
    const res = await api.put('/api/brief-drafts', {
      payload: payload({ topic: '  ', prompt: '', images: [] }),
    })
    expect(res.status()).toBe(422)
    expect(await listIds(api)).toEqual([])
  })

  test('TC-BDR-09: oversized payloads are rejected (schema cap 400, size cap 413)', async () => {
    // Per-field zod cap (prompt ≤ 20k) → 400 at parseBody.
    const res400 = await api.put('/api/brief-drafts', {
      payload: payload({ prompt: 'x'.repeat(70_000) }),
    })
    expect(res400.status()).toBe(400)

    // Fields individually within caps but serialized payload > 64 KB → 413
    // (twenty ~4 KB image URLs slip past the field caps).
    const bigImages = Array.from({ length: 20 }, (_, i) => ({
      id: `img${i}`,
      url: `http://localhost:9000/generated-images/briefs/u/${'a'.repeat(4000)}-${i}.png`,
      filename: `${i}.png`,
      intent: 'embed',
    }))
    const res413 = await api.put('/api/brief-drafts', {
      payload: payload({ images: bigImages }),
    })
    expect(res413.status()).toBe(413)
    expect(await listIds(api)).toEqual([])
  })

  test('TC-BDR-10: unauthenticated requests are redirected to /login (proxy)', async ({
    request,
  }) => {
    // The auth proxy fronts /api/brief-drafts (not a PUBLIC_PREFIX), so an
    // unauthenticated call never reaches the handler — same contract TC-AUTH-07
    // pins for sibling API paths.
    const res = await request.get('/api/brief-drafts', { maxRedirects: 0 })
    expect([301, 302, 303, 307, 308]).toContain(res.status())
    expect(res.headers()['location'] ?? '').toContain('/login')
  })
})
