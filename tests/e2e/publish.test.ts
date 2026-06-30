import { test, expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { login, post, get, del, loginAs } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'

// Requires MOCK_SOCIAL=true (and MOCK_AI/MOCK_PUPPETEER to mint a draft) in the
// APP's environment + seeded 'cli' COPY provider.
//
// Real contract (src/app/api/posts/route.ts):
//   POST /api/posts {draftId, channel, scheduledAt?}  (admin-only)
//     → 201 {postId, status}  — SINGULAR channel; PUBLISHED | SCHEDULED | FAILED
//   The response is an object (NOT an array) and does not echo platformId/scheduledAt.
//
// Deterministic publish failures: the MOCK_AI copy seam embeds the brief topic in
// the caption, and the mock publishers fail when the caption contains a sentinel —
// "__FAIL_ALWAYS__" (always) or "__FAIL_ONCE__" (first attempt only). See
// src/lib/testHooks.ts (shouldMockPublishFail). Topics include Date.now() so each
// post's caption is unique (required for the __FAIL_ONCE__ per-caption record).

const EDITOR_EMAIL = 'editor@bisteccare.lk'
const EDITOR_PASSWORD = 'BistecStudio2026!'

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER && process.env.MOCK_SOCIAL)

async function createExportedDraft(
  request: APIRequestContext,
  opts: { topic?: string } = {},
): Promise<string> {
  const kitRes = await post(request, '/api/admin/brandkits', { name: 'Publish Test Kit', colors: ['#0284c7'] })
  const kit = await kitRes.json()
  const campRes = await post(request, '/api/campaigns', { name: 'Publish Campaign', brandKitId: kit.id })
  const camp = await campRes.json()
  const briefRes = await post(request, '/api/briefs', {
    topic: opts.topic ?? 'E2E Publish Test',
    goal: 'Test publishing',
    tone: 'professional',
    channels: ['INSTAGRAM'],
    designMode: 'GENERATE',
    copyProviderKey: 'cli',
    campaignId: camp.id,
  })
  const brief = await briefRes.json()
  const assembleRes = await post(request, '/api/generate/assemble-b', { briefId: brief.id })
  expect(assembleRes.status()).toBe(200)
  const { draftId } = await assembleRes.json()
  return draftId
}

test.describe('Publishing flow', () => {
  test.beforeEach(async ({ request }) => { await login(request) })

  test('immediate publish creates a PUBLISHED post', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const draftId = await createExportedDraft(request)

    const postRes = await post(request, '/api/posts', { draftId, channel: 'INSTAGRAM' })
    expect(postRes.status()).toBe(201)
    const body = await postRes.json()
    expect(body.postId).toBeTruthy()
    expect(body.status).toBe('PUBLISHED')

    // platformId is persisted (not in the create response) — verify via GET.
    const single = await get(request, `/api/posts/${body.postId}`)
    const fetched = await single.json()
    expect(fetched.platformId).toBeTruthy()
  })

  test('scheduled publish creates a SCHEDULED post', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const draftId = await createExportedDraft(request)

    const futureDate = new Date(Date.now() + 1000 * 60 * 60).toISOString()
    const postRes = await post(request, '/api/posts', {
      draftId,
      channel: 'LINKEDIN',
      scheduledAt: futureDate,
    })
    expect(postRes.status()).toBe(201)
    const body = await postRes.json()
    expect(body.postId).toBeTruthy()
    expect(body.status).toBe('SCHEDULED')

    // H7: no transient PENDING row — the persisted status is SCHEDULED.
    const single = await get(request, `/api/posts/${body.postId}`)
    const fetched = await single.json()
    expect(fetched.status).toBe('SCHEDULED')
    expect(fetched.scheduledAt).toBeTruthy()
  })

  // TC-PUB-06 — Cancel a SCHEDULED post; cancelling a non-SCHEDULED post → 409.
  test('cancel a SCHEDULED post; 409 when cancelling a PUBLISHED post', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const draftId = await createExportedDraft(request)
    const futureDate = new Date(Date.now() + 1000 * 60 * 60).toISOString()
    const created = await (await post(request, '/api/posts', { draftId, channel: 'INSTAGRAM', scheduledAt: futureDate })).json()

    const delRes = await del(request, `/api/posts/${created.postId}`)
    expect(delRes.status()).toBe(200)
    const cancelled = await delRes.json()
    expect(cancelled.status).toBe('CANCELLED')

    // A PUBLISHED post cannot be cancelled → 409.
    const pubDraft = await createExportedDraft(request)
    const published = await (await post(request, '/api/posts', { draftId: pubDraft, channel: 'INSTAGRAM' })).json()
    expect(published.status).toBe('PUBLISHED')
    const delPub = await del(request, `/api/posts/${published.postId}`)
    expect(delPub.status()).toBe(409)
  })

  test('retry endpoint requires a FAILED post (409 otherwise)', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    // In MOCK_SOCIAL success mode no FAILED rows are created, so publishing-then
    // -retrying a freshly PUBLISHED post must 409 (not in FAILED state).
    const draftId = await createExportedDraft(request)
    const published = await (await post(request, '/api/posts', { draftId, channel: 'INSTAGRAM' })).json()
    expect(published.status).toBe('PUBLISHED')

    const retryRes = await post(request, `/api/posts/${published.postId}/publish`, {})
    expect(retryRes.status()).toBe(409)
  })

  // TC-PUB-03 — Publish failure → FAILED, never PENDING. Guards H7.
  test('a failing publish lands in FAILED with an errorReason, no PENDING orphan', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const topic = `__FAIL_ALWAYS__ publish fail ${Date.now()}`
    const draftId = await createExportedDraft(request, { topic })

    const postRes = await post(request, '/api/posts', { draftId, channel: 'INSTAGRAM' })
    expect(postRes.status()).toBe(201)
    const body = await postRes.json()
    expect(body.status).toBe('FAILED')

    const fetched = await (await get(request, `/api/posts/${body.postId}`)).json()
    expect(fetched.status).toBe('FAILED')
    expect(fetched.errorReason).toBeTruthy()
    // H7: the row is terminal, never left transiently PENDING.
    expect(fetched.status).not.toBe('PENDING')
  })

  // TC-PUB-04 — Retry a FAILED post → PUBLISHED; retryCount/nextRetryAt reset. Guards H12.
  test('retrying a FAILED post publishes it and resets retry bookkeeping', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    // __FAIL_ONCE__: the first publish fails, the retry succeeds (per-caption record).
    const topic = `__FAIL_ONCE__ retry success ${Date.now()}`
    const draftId = await createExportedDraft(request, { topic })

    const first = await (await post(request, '/api/posts', { draftId, channel: 'INSTAGRAM' })).json()
    expect(first.status).toBe('FAILED')

    const retryRes = await post(request, `/api/posts/${first.postId}/publish`, {})
    expect(retryRes.status()).toBe(200)
    const retried = await retryRes.json()
    expect(retried.status).toBe('PUBLISHED')

    const fetched = await (await get(request, `/api/posts/${first.postId}`)).json()
    expect(fetched.status).toBe('PUBLISHED')
    expect(fetched.platformId).toBeTruthy()
    expect(fetched.errorReason).toBeNull()
    expect(fetched.retryCount).toBe(0)
    expect(fetched.nextRetryAt).toBeNull()
  })

  // TC-PUB-07 — Publishing a draft with no exportUrl → 422. Needs a draft row in a
  // state the happy path never produces, so seed it directly via the test DB.
  test('publishing a draft without an exportUrl returns 422', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')

    // Create a normal exported draft, then null out its exportUrl directly.
    const draftId = await createExportedDraft(request)
    await prisma!.draft.update({ where: { id: draftId }, data: { exportUrl: null, status: 'IN_PROGRESS' } })

    const res = await post(request, '/api/posts', { draftId, channel: 'INSTAGRAM' })
    expect(res.status()).toBe(422)
  })

  // TC-PUB-08 — The publisher receives a signed https export URL (not a bare key). Guards H10.
  test('publish stores a platformId from a signed export URL', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const draftId = await createExportedDraft(request)

    // The stored exportUrl is an EXPORTS object key (private bucket)...
    const draftRow = await prisma!.draft.findUnique({ where: { id: draftId } })
    expect(draftRow?.exportUrl).toBeTruthy()
    expect(/^https?:\/\//.test(draftRow!.exportUrl!)).toBe(false) // a key, not a URL

    // ...but the API surfaces a signed URL, and publish succeeds against it.
    const apiDraft = await (await get(request, `/api/drafts/${draftId}`)).json()
    expect(apiDraft.exportUrl).toMatch(/^https?:\/\//)
    const published = await (await post(request, '/api/posts', { draftId, channel: 'LINKEDIN' })).json()
    expect(published.status).toBe('PUBLISHED')
    const fetched = await (await get(request, `/api/posts/${published.postId}`)).json()
    expect(fetched.platformId).toBeTruthy()
  })

  // TC-PUB-09 — Publish is admin-only. Guards H4.
  test('a non-admin (editor) cannot create a post', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const draftId = await createExportedDraft(request)
    const editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    const res = await editor.post('/api/posts', { draftId, channel: 'INSTAGRAM' })
    expect(res.status()).toBe(403)
  })
})
