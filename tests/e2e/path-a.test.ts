import { test, expect } from '@playwright/test'
import { login, post, get } from '../helpers/api'

// Requires: MOCK_AI=true, MOCK_PUPPETEER=true in the APP's environment, and a
// seeded enabled COPY provider with providerKey 'cli' (scripts/seed-cli-provider.mjs).
// With MOCK_AI the design agent emits deterministic HTML whose background echoes
// the brand kit's first colour; MOCK_PUPPETEER returns a 1×1 PNG uploaded to MinIO.
//
// Real contract (verified against src/app/api/generate/assemble-a/route.ts):
//   POST /api/generate/assemble-a {briefId,templateId} → 200 {draftId, exportUrl}
//   (exportUrl is a signed MinIO URL; status/htmlContent live on GET /api/drafts/[id])

test.describe('Path A — template-fill generation', () => {
  test.beforeEach(async ({ request }) => { await login(request) })

  test('assemble-a produces an EXPORTED draft with brand colour in the HTML', async ({ request }) => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) {
      test.skip()
      return
    }

    // Brand kit with colours + a template
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

    const campRes = await post(request, '/api/campaigns', { name: 'Path A Campaign', brandKitId: kit.id })
    const camp = await campRes.json()

    const briefRes = await post(request, '/api/briefs', {
      topic: 'Tech Summit 2026',
      goal: 'Drive registrations',
      tone: 'professional',
      channels: ['INSTAGRAM'],
      designMode: 'TEMPLATE',
      copyProviderKey: 'cli',
      campaignId: camp.id,
    })
    expect(briefRes.status()).toBe(201)
    const brief = await briefRes.json()

    // Assemble Path A — route returns 200 { draftId, exportUrl }
    const assembleRes = await post(request, '/api/generate/assemble-a', {
      briefId: brief.id,
      templateId: template.id,
    })
    expect(assembleRes.status()).toBe(200)
    const assembled = await assembleRes.json()
    expect(assembled.draftId).toBeTruthy()
    expect(assembled.exportUrl).toMatch(/^https?:\/\//) // signed MinIO URL (H10)

    // Full draft state via GET /api/drafts/[id]
    const draftRes = await get(request, `/api/drafts/${assembled.draftId}`)
    expect(draftRes.status()).toBe(200)
    const draft = await draftRes.json()
    expect(draft.status).toBe('EXPORTED')
    expect(draft.htmlContent).toBeTruthy()
    // The brand kit's colour reached the design agent and appears in the HTML.
    expect(draft.htmlContent).toContain('#0284c7')
    // No raster image was generated (mock agent uses CSS only).
    expect(draft.imageUrl).toBeNull()
  })
})
