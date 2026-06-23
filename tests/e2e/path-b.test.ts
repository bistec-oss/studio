import { test, expect } from '@playwright/test'
import { login, post } from '../helpers/api'

// Requires: MOCK_AI=true, MOCK_PUPPETEER=true in the test environment.

test.describe('Path B — freeform design generation', () => {
  test.beforeEach(async ({ request }) => { await login(request) })

  test('assemble-b produces draft with htmlContent, exportUrl, status EXPORTED', async ({ request }) => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) {
      test.skip()
      return
    }

    const kitRes = await post(request, '/api/admin/brandkits', {
      name: 'Path B Test Kit',
      colors: ['#7dd3fc', '#020617'],
    })
    const kit = await kitRes.json()

    const campRes = await post(request, '/api/campaigns', { name: 'Path B Campaign', brandKitId: kit.id })
    const camp = await campRes.json()

    const briefRes = await post(request, '/api/briefs', {
      topic: 'AI Product Launch',
      description: 'Announcing our new AI assistant',
      goal: 'Generate buzz',
      tone: 'bold',
      channels: ['LINKEDIN'],
      designMode: 'GENERATE',
      copyProviderKey: 'env-default',
      campaignId: camp.id,
    })
    expect(briefRes.status()).toBe(201)
    const brief = await briefRes.json()

    const assembleRes = await post(request, '/api/generate/assemble-b', { briefId: brief.id })
    expect(assembleRes.status()).toBe(201)
    const draft = await assembleRes.json()

    expect(draft.htmlContent).toBeTruthy()
    expect(draft.exportUrl).toBeTruthy()
    expect(draft.status).toBe('EXPORTED')
  })
})
