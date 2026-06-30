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

  // TC-GEN-A2 — Path A with a non-existent template → 404.
  test('assemble-a with a bad templateId returns 404', async ({ request }) => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const kit = await (await post(request, '/api/admin/brandkits', { name: 'A2 Kit', colors: ['#0284c7'] })).json()
    const camp = await (await post(request, '/api/campaigns', { name: 'A2 Campaign', brandKitId: kit.id })).json()
    const brief = await (await post(request, '/api/briefs', {
      topic: 'A2', goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
      designMode: 'TEMPLATE', copyProviderKey: 'cli', campaignId: camp.id,
    })).json()

    const res = await post(request, '/api/generate/assemble-a', {
      briefId: brief.id,
      templateId: 'tmpl_does_not_exist',
    })
    expect(res.status()).toBe(404)
  })

  // TC-GEN-03 — Brief validation: missing required fields / bad FK → 4xx.
  test('brief creation rejects missing fields and bad FKs', async ({ request }) => {
    // Missing goal.
    const noGoal = await post(request, '/api/briefs', {
      topic: 'x', tone: 'professional', channels: ['INSTAGRAM'], designMode: 'GENERATE', copyProviderKey: 'cli',
    })
    expect(noGoal.status()).toBeGreaterThanOrEqual(400)
    expect(noGoal.status()).toBeLessThan(500)

    // Missing channels.
    const noChannels = await post(request, '/api/briefs', {
      topic: 'x', goal: 'g', tone: 'professional', designMode: 'GENERATE', copyProviderKey: 'cli',
    })
    expect(noChannels.status()).toBeGreaterThanOrEqual(400)
    expect(noChannels.status()).toBeLessThan(500)

    // Bad campaign FK.
    const badCampaign = await post(request, '/api/briefs', {
      topic: 'x', goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
      designMode: 'GENERATE', copyProviderKey: 'cli', campaignId: 'camp_missing',
    })
    expect(badCampaign.status()).toBeGreaterThanOrEqual(400)
    expect(badCampaign.status()).toBeLessThan(500)
  })

  // TC-GEN-04 — Validation is parallelized & still correct: multiple bad FKs at once → 4xx. Guards M12.
  test('brief with several invalid FKs is rejected', async ({ request }) => {
    const res = await post(request, '/api/briefs', {
      topic: 'x',
      goal: 'g',
      tone: 'professional',
      channels: ['INSTAGRAM'],
      designMode: 'TEMPLATE',
      copyProviderKey: 'no_such_provider',
      campaignId: 'camp_missing',
      templateId: 'tmpl_missing',
    })
    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).toBeLessThan(500)
  })

  // TC-GEN-05 — Generated raster images are stored as public (anonymously-readable)
  // URLs so a later re-render can fetch them. Guards H10.
  test('generated image is stored as a public URL', async ({ request }) => {
    // The MOCK_AI design agent short-circuits the tool-use loop and never calls
    // generateImage, and no mock IMAGE-provider seam exists, so this cannot run
    // deterministically today. The public-IMAGES-bucket guarantee it targets is
    // exercised by TC-REG-H10a (brief-image upload → anonymous GET 200).
    test.skip(true, 'needs a mock IMAGE-provider seam (see TC-REG-H10a for the H10 public-bucket guard)')
    void request
  })

  // TC-GEN-06 — An oversized template (large inline data: assets) flows through the
  // pipeline without crashing — guards the inline-asset externalization fix.
  test('an oversized template does not crash Path A', async ({ request }) => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const kit = await (await post(request, '/api/admin/brandkits', { name: 'Oversized Kit', colors: ['#0284c7'] })).json()

    // ~700KB inline data: URI — would blow the 600k CLI guard / API context if not
    // externalized to a token before the prompt is built.
    const huge = 'A'.repeat(700_000)
    const template = await (await post(request, `/api/admin/brandkits/${kit.id}/templates`, {
      name: 'Oversized Template',
      htmlTemplate: `<html><body style="width:1080px;height:1080px;background:#0284c7"><img src="data:image/png;base64,${huge}"/>{{topic}}</body></html>`,
    })).json()

    const camp = await (await post(request, '/api/campaigns', { name: 'Oversized Campaign', brandKitId: kit.id })).json()
    const brief = await (await post(request, '/api/briefs', {
      topic: 'Oversized', goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
      designMode: 'TEMPLATE', copyProviderKey: 'cli', campaignId: camp.id,
    })).json()

    const res = await post(request, '/api/generate/assemble-a', { briefId: brief.id, templateId: template.id })
    // Must not 5xx — externalization keeps the prompt small; the pipeline completes.
    expect(res.status()).toBeLessThan(500)
    expect(res.status()).toBe(200)
  })

  // TC-GEN-A3 — A 3:4 PORTRAIT brief + matching PORTRAIT template assembles cleanly.
  // Guards the aspect-ratio threading through assemble-a / the design agent.
  test('assemble-a produces an EXPORTED draft for a 3:4 portrait brief', async ({ request }) => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const kit = await (await post(request, '/api/admin/brandkits', { name: 'Portrait Kit', colors: ['#0284c7', '#0f172a'] })).json()
    const template = await (await post(request, `/api/admin/brandkits/${kit.id}/templates`, {
      name: 'Portrait Template',
      htmlTemplate: '<html><body style="width:1080px;height:1350px;background:#0284c7;color:#fff">{{topic}}</body></html>',
      aspectRatio: 'PORTRAIT',
    })).json()
    expect(template.aspectRatio).toBe('PORTRAIT')

    const camp = await (await post(request, '/api/campaigns', { name: 'Portrait Campaign', brandKitId: kit.id })).json()
    const brief = await (await post(request, '/api/briefs', {
      topic: 'Portrait Launch', goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
      aspectRatio: 'PORTRAIT', designMode: 'TEMPLATE', copyProviderKey: 'cli', campaignId: camp.id,
    })).json()

    const res = await post(request, '/api/generate/assemble-a', { briefId: brief.id, templateId: template.id })
    expect(res.status()).toBe(200)
    const draftRes = await get(request, `/api/drafts/${(await res.json()).draftId}`)
    const draft = await draftRes.json()
    expect(draft.status).toBe('EXPORTED')
    expect(draft.brief.aspectRatio).toBe('PORTRAIT')
  })

  // TC-GEN-A4 — A template whose size differs from the brief's chosen size is
  // rejected (the wizard only offers matching templates; the API enforces it).
  test('assemble-a rejects a template whose aspect ratio differs from the brief', async ({ request }) => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const kit = await (await post(request, '/api/admin/brandkits', { name: 'Mismatch Kit', colors: ['#0284c7'] })).json()
    // SQUARE template (default) …
    const template = await (await post(request, `/api/admin/brandkits/${kit.id}/templates`, {
      name: 'Square Template',
      htmlTemplate: '<html><body style="width:1080px;height:1080px;background:#0284c7">{{topic}}</body></html>',
    })).json()
    const camp = await (await post(request, '/api/campaigns', { name: 'Mismatch Campaign', brandKitId: kit.id })).json()
    // … against a PORTRAIT brief.
    const brief = await (await post(request, '/api/briefs', {
      topic: 'Mismatch', goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
      aspectRatio: 'PORTRAIT', designMode: 'TEMPLATE', copyProviderKey: 'cli', campaignId: camp.id,
    })).json()

    const res = await post(request, '/api/generate/assemble-a', { briefId: brief.id, templateId: template.id })
    expect(res.status()).toBe(400)
  })
})
