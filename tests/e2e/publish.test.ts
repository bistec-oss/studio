import { test, expect } from '@playwright/test'
import { loginAs, waitForDraft, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'
import { pageLogin } from '../helpers/ui'

// Requires MOCK_SOCIAL=true (and MOCK_AI/MOCK_PUPPETEER to mint a draft) in the
// APP's environment + seeded 'cli' COPY provider.
//
// Real contract (src/app/api/posts/route.ts):
//   POST /api/posts {draftId, channel, scheduledAt?}  (admin-only)
//     → 201 {postId, status}  — SINGULAR channel; PUBLISHED | SCHEDULED
//     → 502 {error, code: 'PUBLISH_FAILED', postId, status: 'FAILED'} when the
//       platform refuses an immediate publish (017 FR-01); the FAILED row persists.
//   POST /api/posts/[id]/publish (retry a FAILED post)
//     → 200 {postId, status: 'PUBLISHED'} | 502 in the same shape (017 FR-02)
//   The response is an object (NOT an array) and does not echo platformId/scheduledAt.
//
// Deterministic publish failures: the MOCK_AI copy seam embeds the brief topic in
// the caption, and the mock publishers fail when the caption contains a sentinel —
// "__FAIL_ALWAYS__" (always) or "__FAIL_ONCE__" (first attempt only). See
// src/lib/testHooks.ts (shouldMockPublishFail). Topics include Date.now() so each
// post's caption is unique (required for the __FAIL_ONCE__ per-caption record).

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const EDITOR_EMAIL = 'editor@bisteccare.lk'
const EDITOR_PASSWORD = 'BistecStudio2026!'

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER && process.env.MOCK_SOCIAL)

async function createExportedDraft(
  api: ApiClient,
  opts: { topic?: string } = {},
): Promise<string> {
  const kitRes = await api.post('/api/admin/brandkits', { name: 'Publish Test Kit', colors: ['#0284c7'] })
  const kit = await kitRes.json()
  const campRes = await api.post('/api/campaigns', { name: 'Publish Campaign', brandKitId: kit.id })
  const camp = await campRes.json()
  const briefRes = await api.post('/api/briefs', {
    topic: opts.topic ?? 'E2E Publish Test',
    goal: 'Test publishing',
    tone: 'professional',
    channels: ['INSTAGRAM'],
    designMode: 'GENERATE',
    copyProviderKey: 'cli',
    campaignId: camp.id,
  })
  const brief = await briefRes.json()
  const assembleRes = await api.post('/api/generate/assemble-b', { briefId: brief.id })
  expect(assembleRes.status()).toBe(202)
  const { draftId } = await assembleRes.json()
  await waitForDraft(api, draftId) // generation is async — wait for EXPORTED
  return draftId
}

test.describe('Publishing flow', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => { await api.dispose() })

  test('immediate publish creates a PUBLISHED post', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draftId = await createExportedDraft(api)

    const postRes = await api.post('/api/posts', { draftId, channel: 'INSTAGRAM' })
    expect(postRes.status()).toBe(201)
    const body = await postRes.json()
    expect(body.postId).toBeTruthy()
    expect(body.status).toBe('PUBLISHED')

    // platformId is persisted (not in the create response) — verify via GET.
    const single = await api.get(`/api/posts/${body.postId}`)
    const fetched = await single.json()
    expect(fetched.platformId).toBeTruthy()
  })

  test('scheduled publish creates a SCHEDULED post', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draftId = await createExportedDraft(api)

    const futureDate = new Date(Date.now() + 1000 * 60 * 60).toISOString()
    const postRes = await api.post('/api/posts', {
      draftId,
      channel: 'LINKEDIN',
      scheduledAt: futureDate,
    })
    expect(postRes.status()).toBe(201)
    const body = await postRes.json()
    expect(body.postId).toBeTruthy()
    expect(body.status).toBe('SCHEDULED')

    // H7: no transient PENDING row — the persisted status is SCHEDULED.
    const single = await api.get(`/api/posts/${body.postId}`)
    const fetched = await single.json()
    expect(fetched.status).toBe('SCHEDULED')
    expect(fetched.scheduledAt).toBeTruthy()
  })

  // TC-PUB-06 — Cancel a SCHEDULED post; cancelling a non-SCHEDULED post → 409.
  test('cancel a SCHEDULED post; 409 when cancelling a PUBLISHED post', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draftId = await createExportedDraft(api)
    const futureDate = new Date(Date.now() + 1000 * 60 * 60).toISOString()
    const created = await (await api.post('/api/posts', { draftId, channel: 'INSTAGRAM', scheduledAt: futureDate })).json()

    const delRes = await api.del(`/api/posts/${created.postId}`)
    expect(delRes.status()).toBe(200)
    const cancelled = await delRes.json()
    expect(cancelled.status).toBe('CANCELLED')

    // A PUBLISHED post cannot be cancelled → 409.
    const pubDraft = await createExportedDraft(api)
    const published = await (await api.post('/api/posts', { draftId: pubDraft, channel: 'INSTAGRAM' })).json()
    expect(published.status).toBe('PUBLISHED')
    const delPub = await api.del(`/api/posts/${published.postId}`)
    expect(delPub.status()).toBe(409)
  })

  test('retry endpoint requires a FAILED post (409 otherwise)', async () => {
    if (!MOCKED()) { test.skip(); return }
    // In MOCK_SOCIAL success mode no FAILED rows are created, so publishing-then
    // -retrying a freshly PUBLISHED post must 409 (not in FAILED state).
    const draftId = await createExportedDraft(api)
    const published = await (await api.post('/api/posts', { draftId, channel: 'INSTAGRAM' })).json()
    expect(published.status).toBe('PUBLISHED')

    const retryRes = await api.post(`/api/posts/${published.postId}/publish`, {})
    expect(retryRes.status()).toBe(409)
  })

  // TC-PUB-03 — Publish failure → 502 PUBLISH_FAILED and a FAILED row, never
  // PENDING. Guards H7; 017 AC-01 (a failed publish is not a 2xx), and AC-02
  // (a retry that fails again is a 502 in the same shape).
  test('a failing publish is 502 PUBLISH_FAILED with a FAILED row, no PENDING orphan', async () => {
    if (!MOCKED()) { test.skip(); return }
    const topic = `__FAIL_ALWAYS__ publish fail ${Date.now()}`
    const draftId = await createExportedDraft(api, { topic })

    const postRes = await api.post('/api/posts', { draftId, channel: 'INSTAGRAM' })
    expect(postRes.status()).toBe(502)
    const body = await postRes.json()
    expect(body.code).toBe('PUBLISH_FAILED')
    expect(body.status).toBe('FAILED')
    expect(body.postId).toBeTruthy()
    expect(body.error).toBe('Mock Instagram publish failure')

    const fetched = await (await api.get(`/api/posts/${body.postId}`)).json()
    expect(fetched.status).toBe('FAILED')
    expect(fetched.errorReason).toBe(body.error)
    // H7: the row is terminal, never left transiently PENDING.
    expect(fetched.status).not.toBe('PENDING')

    // AC-02: retrying it fails again — 502, same shape, still FAILED.
    const retryRes = await api.post(`/api/posts/${body.postId}/publish`, {})
    expect(retryRes.status()).toBe(502)
    expect(await retryRes.json()).toEqual({
      error: 'Mock Instagram publish failure',
      code: 'PUBLISH_FAILED',
      postId: body.postId,
      status: 'FAILED',
    })
    const after = await (await api.get(`/api/posts/${body.postId}`)).json()
    expect(after.status).toBe('FAILED')
  })

  // TC-PUB-10 — 017 AC-03 (FR-03): the publish dialog shows a platform refusal.
  // Instagram's caption carries __FAIL_ALWAYS__; LinkedIn's is rewritten clean,
  // so one submission gets one ✓ and one ✕, and the dialog stays open.
  test('the publish dialog shows ✕ failed with the reason and stays open', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const topic = `__FAIL_ALWAYS__ dialog ${Date.now()}`
    const draftId = await createExportedDraft(api, { topic })
    const clean = await api.patch(`/api/drafts/${draftId}`, { channel: 'LINKEDIN', text: `Clean LinkedIn caption ${Date.now()}` })
    expect(clean.status()).toBe(200)

    await pageLogin(page)
    await page.goto(`/drafts/${draftId}`)
    const publishBtn = page.getByRole('button', { name: /^publish$/i })
    await expect(publishBtn).toBeVisible({ timeout: 20_000 })
    await publishBtn.click()

    const dialog = page.getByRole('dialog', { name: 'Publish post' })
    await expect(dialog).toBeVisible()
    const instagram = dialog.getByRole('checkbox', { name: 'Instagram' })
    const linkedin = dialog.getByRole('checkbox', { name: 'LinkedIn' })
    await instagram.check()
    await linkedin.check()

    const [igRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith('/api/posts') && r.request().method() === 'POST' && r.request().postData()?.includes('INSTAGRAM') === true,
      ),
      dialog.getByRole('button', { name: /^publish$/i }).click(),
    ])
    expect(igRes.status()).toBe(502)

    // The refusal is shown, with its reason, on the channel it belongs to.
    await expect(dialog.getByText('✕ failed')).toHaveCount(1)
    await expect(dialog.getByText('Mock Instagram publish failure')).toBeVisible()
    await expect(instagram).toHaveAccessibleDescription('Mock Instagram publish failure')
    // The channel that worked shows ✓ and is locked; the failed one is not.
    await expect(dialog.getByText('✓ published')).toHaveCount(1)
    await expect(linkedin).toBeDisabled()
    await expect(instagram).toBeEnabled()
    // The dialog did not close.
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/Instagram failed/)).toBeVisible()
  })

  // TC-PUB-04 — Retry a FAILED post → PUBLISHED; retryCount/nextRetryAt reset. Guards H12.
  test('retrying a FAILED post publishes it and resets retry bookkeeping', async () => {
    if (!MOCKED()) { test.skip(); return }
    // __FAIL_ONCE__: the first publish fails, the retry succeeds (per-caption record).
    const topic = `__FAIL_ONCE__ retry success ${Date.now()}`
    const draftId = await createExportedDraft(api, { topic })

    const first = await (await api.post('/api/posts', { draftId, channel: 'INSTAGRAM' })).json()
    expect(first.status).toBe('FAILED')

    const retryRes = await api.post(`/api/posts/${first.postId}/publish`, {})
    expect(retryRes.status()).toBe(200)
    const retried = await retryRes.json()
    expect(retried.status).toBe('PUBLISHED')

    const fetched = await (await api.get(`/api/posts/${first.postId}`)).json()
    expect(fetched.status).toBe('PUBLISHED')
    expect(fetched.platformId).toBeTruthy()
    expect(fetched.errorReason).toBeNull()
    expect(fetched.retryCount).toBe(0)
    expect(fetched.nextRetryAt).toBeNull()
  })

  // TC-PUB-07 — Publishing a draft with no exportUrl → 422. Needs a draft row in a
  // state the happy path never produces, so seed it directly via the test DB.
  test('publishing a draft without an exportUrl returns 422', async () => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')

    // Create a normal exported draft, then null out its exportUrl directly.
    const draftId = await createExportedDraft(api)
    await prisma!.draft.update({ where: { id: draftId }, data: { exportUrl: null, status: 'IN_PROGRESS' } })

    const res = await api.post('/api/posts', { draftId, channel: 'INSTAGRAM' })
    expect(res.status()).toBe(422)
  })

  // TC-PUB-08 — The publisher receives a signed https export URL (not a bare key). Guards H10.
  test('publish stores a platformId from a signed export URL', async () => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const draftId = await createExportedDraft(api)

    // The stored exportUrl is an EXPORTS object key (private bucket)...
    const draftRow = await prisma!.draft.findUnique({ where: { id: draftId } })
    expect(draftRow?.exportUrl).toBeTruthy()
    expect(/^https?:\/\//.test(draftRow!.exportUrl!)).toBe(false) // a key, not a URL

    // ...but the API surfaces a signed URL, and publish succeeds against it.
    const apiDraft = await (await api.get(`/api/drafts/${draftId}`)).json()
    expect(apiDraft.exportUrl).toMatch(/^https?:\/\//)
    const published = await (await api.post('/api/posts', { draftId, channel: 'LINKEDIN' })).json()
    expect(published.status).toBe('PUBLISHED')
    const fetched = await (await api.get(`/api/posts/${published.postId}`)).json()
    expect(fetched.platformId).toBeTruthy()
  })

  // TC-PUB-09 — Publish is admin-only. Guards H4.
  test('a non-admin (editor) cannot create a post', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const draftId = await createExportedDraft(api)
    const editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    try {
      const res = await editor.post('/api/posts', { draftId, channel: 'INSTAGRAM' })
      expect(res.status()).toBe(403)
    } finally {
      await editor.dispose()
    }
  })
})
