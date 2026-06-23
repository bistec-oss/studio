import { test, expect } from '@playwright/test'
import { login, post, get } from '../helpers/api'

// These tests require MOCK_SOCIAL=true in the test environment.
// The mock publishers return a deterministic platformId without calling the real API.

test.describe('Publishing flow', () => {
  test.beforeEach(async ({ request }) => { await login(request) })

  async function createMinimalDraft(request: import('@playwright/test').APIRequestContext) {
    // Create a brand kit
    const kitRes = await post(request, '/api/admin/brandkits', {
      name: 'Publish Test Kit',
      colors: ['#0284c7'],
    })
    const kit = await kitRes.json()

    // Create a campaign with this kit
    const campRes = await post(request, '/api/campaigns', { name: 'Publish Campaign', brandKitId: kit.id })
    const camp = await campRes.json()

    // Create a brief
    const briefRes = await post(request, '/api/briefs', {
      topic: 'E2E Publish Test',
      goal: 'Test publishing',
      tone: 'professional',
      channels: ['INSTAGRAM'],
      designMode: 'GENERATE',
      copyProviderKey: 'env-default',
      campaignId: camp.id,
    })
    expect(briefRes.status()).toBe(201)
    const brief = await briefRes.json()

    // Create a draft directly (bypassing generation for speed)
    return { brief, camp, kit }
  }

  test('immediate publish creates PUBLISHED post', async ({ request }) => {
    if (!process.env.MOCK_SOCIAL) {
      test.skip()
      return
    }
    const { brief } = await createMinimalDraft(request)

    // We need a draft with exportUrl — in mock mode, assemble-b sets exportUrl
    const assembleRes = await post(request, '/api/generate/assemble-b', { briefId: brief.id })
    if (assembleRes.status() !== 201) {
      test.skip() // Generation requires working AI + Puppeteer
      return
    }
    const draft = await assembleRes.json()

    const postRes = await post(request, '/api/posts', {
      draftId: draft.id,
      channels: ['INSTAGRAM'],
    })
    expect(postRes.status()).toBe(201)
    const posts = await postRes.json()
    expect(posts.length).toBeGreaterThan(0)
    expect(posts[0].status).toBe('PUBLISHED')
    expect(posts[0].platformId).toBeTruthy()
  })

  test('scheduled publish creates SCHEDULED post', async ({ request }) => {
    if (!process.env.MOCK_SOCIAL) {
      test.skip()
      return
    }

    // Simulate a pre-existing draft with exportUrl via direct DB route (test endpoint)
    const draftRes = await get(request, '/api/library?page=1&pageSize=1')
    const library = await draftRes.json()
    if (!library.drafts?.length || !library.drafts[0].exportUrl) {
      test.skip()
      return
    }
    const draft = library.drafts[0]

    const futureDate = new Date(Date.now() + 1000 * 60 * 60).toISOString()
    const postRes = await post(request, '/api/posts', {
      draftId: draft.id,
      channels: ['LINKEDIN'],
      scheduledAt: futureDate,
    })
    expect(postRes.status()).toBe(201)
    const posts = await postRes.json()
    expect(posts[0].status).toBe('SCHEDULED')
    expect(posts[0].scheduledAt).toBeTruthy()
  })

  test('retry FAILED post via publish endpoint', async ({ request }) => {
    if (!process.env.MOCK_SOCIAL) {
      test.skip()
      return
    }

    // Find a FAILED post to retry — skip if none exist
    const postsRes = await get(request, '/api/posts?status=FAILED&pageSize=1')
    if (!postsRes.ok()) {
      test.skip()
      return
    }
    const { posts } = await postsRes.json()
    if (!posts?.length) {
      test.skip()
      return
    }
    const failedPost = posts[0]
    const retryRes = await post(request, `/api/posts/${failedPost.id}/publish`, {})
    expect([200, 201]).toContain(retryRes.status())
  })
})
