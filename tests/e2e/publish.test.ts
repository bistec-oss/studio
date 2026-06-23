import { test, expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { login, post, get, del } from '../helpers/api'

// Requires MOCK_SOCIAL=true (and MOCK_AI/MOCK_PUPPETEER to mint a draft) in the
// APP's environment + seeded 'cli' COPY provider.
//
// Real contract (src/app/api/posts/route.ts):
//   POST /api/posts {draftId, channel, scheduledAt?}  (admin-only)
//     → 201 {postId, status}  — SINGULAR channel; PUBLISHED | SCHEDULED | FAILED
//   The response is an object (NOT an array) and does not echo platformId/scheduledAt.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER && process.env.MOCK_SOCIAL)

async function createExportedDraft(request: APIRequestContext): Promise<string> {
  const kitRes = await post(request, '/api/admin/brandkits', { name: 'Publish Test Kit', colors: ['#0284c7'] })
  const kit = await kitRes.json()
  const campRes = await post(request, '/api/campaigns', { name: 'Publish Campaign', brandKitId: kit.id })
  const camp = await campRes.json()
  const briefRes = await post(request, '/api/briefs', {
    topic: 'E2E Publish Test',
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

  test('cancel a SCHEDULED post', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const draftId = await createExportedDraft(request)
    const futureDate = new Date(Date.now() + 1000 * 60 * 60).toISOString()
    const created = await (await post(request, '/api/posts', { draftId, channel: 'INSTAGRAM', scheduledAt: futureDate })).json()

    const delRes = await del(request, `/api/posts/${created.postId}`)
    expect(delRes.status()).toBe(200)
    const cancelled = await delRes.json()
    expect(cancelled.status).toBe('CANCELLED')
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
})
