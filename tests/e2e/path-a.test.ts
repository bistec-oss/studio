import { test, expect } from '@playwright/test'
import { login, post, get } from '../helpers/api'

// Requires: MOCK_AI=true, MOCK_PUPPETEER=true in the test environment.
// With mocks active, assembly returns deterministic HTML + a 1×1 PNG export.

test.describe('Path A — template-fill generation', () => {
  test.beforeEach(async ({ request }) => { await login(request) })

  test('assemble-a produces draft with htmlContent, exportUrl, and brand colors in HTML', async ({ request }) => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) {
      test.skip()
      return
    }

    // Set up brand kit with colors + template
    const kitRes = await post(request, '/api/admin/brandkits', {
      name: 'Path A Test Kit',
      colors: ['#0284c7', '#0f172a'],
      fonts: [],
    })
    const kit = await kitRes.json()

    const templateRes = await post(request, `/api/admin/brandkits/${kit.id}/templates`, {
      name: 'Basic Template',
      htmlTemplate: '<html><body style="width:1080px;height:1080px;background:#0284c7;color:#fff">{{topic}}</body></html>',
    })
    const template = await templateRes.json()

    // Create campaign with this kit
    const campRes = await post(request, '/api/campaigns', { name: 'Path A Campaign', brandKitId: kit.id })
    const camp = await campRes.json()

    // Create brief
    const briefRes = await post(request, '/api/briefs', {
      topic: 'Tech Summit 2026',
      goal: 'Drive registrations',
      tone: 'professional',
      channels: ['INSTAGRAM'],
      designMode: 'TEMPLATE',
      copyProviderKey: 'env-default',
      campaignId: camp.id,
    })
    expect(briefRes.status()).toBe(201)
    const brief = await briefRes.json()

    // Assemble Path A
    const assembleRes = await post(request, '/api/generate/assemble-a', {
      briefId: brief.id,
      templateId: template.id,
    })
    expect(assembleRes.status()).toBe(201)
    const draft = await assembleRes.json()

    expect(draft.htmlContent).toBeTruthy()
    expect(draft.exportUrl).toBeTruthy()
    expect(draft.status).toBe('EXPORTED')

    // Brand colors should appear in the HTML
    expect(draft.htmlContent).toContain('#0284c7')

    // Export URL should be a valid MinIO pre-signed URL
    expect(draft.exportUrl).toMatch(/^https?:\/\//)

    // imageUrl is null if Claude used CSS/SVG (mock always does)
    expect(draft.imageUrl).toBeNull()
  })
})
