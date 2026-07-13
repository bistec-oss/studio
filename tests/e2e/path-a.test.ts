import { test, expect } from '@playwright/test'
import { loginAs, waitForDraft, type ApiClient } from '../helpers/api'

// Requires: MOCK_AI=true, MOCK_PUPPETEER=true in the APP's environment, and a
// seeded enabled COPY provider with providerKey 'cli' (scripts/seed-cli-provider.mjs).
// With MOCK_AI the design agent emits deterministic HTML whose background echoes
// the brand kit's first colour; MOCK_PUPPETEER returns a 1×1 PNG uploaded to MinIO.
//
// Real contract (verified against src/app/api/generate/assemble-a/route.ts):
//   POST /api/generate/assemble-a {briefId,templateId} → 202 {draftId} (ASYNC, F1)
//   The draft starts IN_PROGRESS and finishes EXPORTED in the background; poll
//   GET /api/drafts/[id] (waitForDraft) for the final status/htmlContent/exportUrl.
//   Bad input (missing template / ratio mismatch) is still validated synchronously → 4xx.

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'

test.describe('Path A — template-fill generation', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => { await api.dispose() })

  test('assemble-a produces an EXPORTED draft with brand colour in the HTML', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) {
      test.skip()
      return
    }

    // Brand kit with colours + a template
    const kitRes = await api.post('/api/admin/brandkits', {
      name: 'Path A Test Kit',
      colors: ['#0284c7', '#0f172a'],
      fonts: [],
    })
    const kit = await kitRes.json()

    const templateRes = await api.post(`/api/admin/brandkits/${kit.id}/templates`, {
      name: 'Basic Template',
      htmlTemplate: '<html><body style="width:1080px;height:1080px;background:#0284c7;color:#fff">{{topic}}</body></html>',
    })
    const template = await templateRes.json()

    const campRes = await api.post('/api/campaigns', { name: 'Path A Campaign', brandKitId: kit.id })
    const camp = await campRes.json()

    const briefRes = await api.post('/api/briefs', {
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

    // Assemble Path A — async: route returns 202 { draftId }
    const assembleRes = await api.post('/api/generate/assemble-a', {
      briefId: brief.id,
      templateId: template.id,
    })
    expect(assembleRes.status()).toBe(202)
    const assembled = await assembleRes.json()
    expect(assembled.draftId).toBeTruthy()

    // Poll GET /api/drafts/[id] until generation finishes.
    const draft = await waitForDraft(api, assembled.draftId)
    expect(draft.status).toBe('EXPORTED')
    expect(draft.exportUrl).toMatch(/^https?:\/\//) // signed MinIO URL (H10)
    expect(draft.htmlContent).toBeTruthy()
    // The brand kit's colour reached the design agent and appears in the HTML.
    expect(draft.htmlContent).toContain('#0284c7')
    // No raster image was generated (mock agent uses CSS only).
    expect(draft.imageUrl).toBeNull()
  })

  // TC-GEN-A2 — Path A with a non-existent template → 404.
  test('assemble-a with a bad templateId returns 404', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const kit = await (await api.post('/api/admin/brandkits', { name: 'A2 Kit', colors: ['#0284c7'] })).json()
    const camp = await (await api.post('/api/campaigns', { name: 'A2 Campaign', brandKitId: kit.id })).json()
    const brief = await (await api.post('/api/briefs', {
      topic: 'A2', goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
      designMode: 'TEMPLATE', copyProviderKey: 'cli', campaignId: camp.id,
    })).json()

    const res = await api.post('/api/generate/assemble-a', {
      briefId: brief.id,
      templateId: 'tmpl_does_not_exist',
    })
    expect(res.status()).toBe(404)
  })

  // TC-GEN-03 — Brief validation: missing required fields / bad FK → 4xx.
  test('brief creation rejects missing fields and bad FKs', async () => {
    // Missing goal.
    const noGoal = await api.post('/api/briefs', {
      topic: 'x', tone: 'professional', channels: ['INSTAGRAM'], designMode: 'GENERATE', copyProviderKey: 'cli',
    })
    expect(noGoal.status()).toBeGreaterThanOrEqual(400)
    expect(noGoal.status()).toBeLessThan(500)

    // Missing channels.
    const noChannels = await api.post('/api/briefs', {
      topic: 'x', goal: 'g', tone: 'professional', designMode: 'GENERATE', copyProviderKey: 'cli',
    })
    expect(noChannels.status()).toBeGreaterThanOrEqual(400)
    expect(noChannels.status()).toBeLessThan(500)

    // Bad campaign FK.
    const badCampaign = await api.post('/api/briefs', {
      topic: 'x', goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
      designMode: 'GENERATE', copyProviderKey: 'cli', campaignId: 'camp_missing',
    })
    expect(badCampaign.status()).toBeGreaterThanOrEqual(400)
    expect(badCampaign.status()).toBeLessThan(500)
  })

  // TC-GEN-04 — Validation is parallelized & still correct: multiple bad FKs at once → 4xx. Guards M12.
  test('brief with several invalid FKs is rejected', async () => {
    const res = await api.post('/api/briefs', {
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
  test('generated image is stored as a public URL', async () => {
    // The MOCK_AI design agent short-circuits the tool-use loop and never calls
    // generateImage, and no mock IMAGE-provider seam exists, so this cannot run
    // deterministically today. The public-IMAGES-bucket guarantee it targets is
    // exercised by TC-REG-H10a (brief-image upload → anonymous GET 200).
    test.skip(true, 'needs a mock IMAGE-provider seam (see TC-REG-H10a for the H10 public-bucket guard)')
  })

  // TC-GEN-06 — An oversized template (large inline data: assets) flows through the
  // pipeline without crashing — guards the inline-asset externalization fix.
  test('an oversized template does not crash Path A', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const kit = await (await api.post('/api/admin/brandkits', { name: 'Oversized Kit', colors: ['#0284c7'] })).json()

    // ~700KB inline data: URI — would blow the 600k CLI guard / API context if not
    // externalized to a token before the prompt is built.
    const huge = 'A'.repeat(700_000)
    const template = await (await api.post(`/api/admin/brandkits/${kit.id}/templates`, {
      name: 'Oversized Template',
      htmlTemplate: `<html><body style="width:1080px;height:1080px;background:#0284c7"><img src="data:image/png;base64,${huge}"/>{{topic}}</body></html>`,
    })).json()

    const camp = await (await api.post('/api/campaigns', { name: 'Oversized Campaign', brandKitId: kit.id })).json()
    const brief = await (await api.post('/api/briefs', {
      topic: 'Oversized', goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
      designMode: 'TEMPLATE', copyProviderKey: 'cli', campaignId: camp.id,
    })).json()

    const res = await api.post('/api/generate/assemble-a', { briefId: brief.id, templateId: template.id })
    // Must not 5xx — externalization keeps the prompt small; the pipeline completes.
    expect(res.status()).toBeLessThan(500)
    expect(res.status()).toBe(202)
    // The oversized template still completes (externalization) in the background.
    const draft = await waitForDraft(api, (await res.json()).draftId)
    expect(draft.status).toBe('EXPORTED')
  })

  // TC-GEN-A3 — A 3:4 PORTRAIT brief + matching PORTRAIT template assembles cleanly.
  // Guards the aspect-ratio threading through assemble-a / the design agent.
  test('assemble-a produces an EXPORTED draft for a 3:4 portrait brief', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const kit = await (await api.post('/api/admin/brandkits', { name: 'Portrait Kit', colors: ['#0284c7', '#0f172a'] })).json()
    const template = await (await api.post(`/api/admin/brandkits/${kit.id}/templates`, {
      name: 'Portrait Template',
      htmlTemplate: '<html><body style="width:1080px;height:1350px;background:#0284c7;color:#fff">{{topic}}</body></html>',
      aspectRatio: 'PORTRAIT',
    })).json()
    expect(template.aspectRatio).toBe('PORTRAIT')

    const camp = await (await api.post('/api/campaigns', { name: 'Portrait Campaign', brandKitId: kit.id })).json()
    const brief = await (await api.post('/api/briefs', {
      topic: 'Portrait Launch', goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
      aspectRatio: 'PORTRAIT', designMode: 'TEMPLATE', copyProviderKey: 'cli', campaignId: camp.id,
    })).json()

    const res = await api.post('/api/generate/assemble-a', { briefId: brief.id, templateId: template.id })
    expect(res.status()).toBe(202)
    const draft = await waitForDraft(api, (await res.json()).draftId)
    expect(draft.status).toBe('EXPORTED')
    expect((draft.brief as { aspectRatio: string }).aspectRatio).toBe('PORTRAIT')
  })

  // TC-GEN-A4 — A template whose size differs from the brief's chosen size is
  // rejected (the wizard only offers matching templates; the API enforces it).
  test('assemble-a rejects a template whose aspect ratio differs from the brief', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const kit = await (await api.post('/api/admin/brandkits', { name: 'Mismatch Kit', colors: ['#0284c7'] })).json()
    // SQUARE template (default) …
    const template = await (await api.post(`/api/admin/brandkits/${kit.id}/templates`, {
      name: 'Square Template',
      htmlTemplate: '<html><body style="width:1080px;height:1080px;background:#0284c7">{{topic}}</body></html>',
    })).json()
    const camp = await (await api.post('/api/campaigns', { name: 'Mismatch Campaign', brandKitId: kit.id })).json()
    // … against a PORTRAIT brief.
    const brief = await (await api.post('/api/briefs', {
      topic: 'Mismatch', goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
      aspectRatio: 'PORTRAIT', designMode: 'TEMPLATE', copyProviderKey: 'cli', campaignId: camp.id,
    })).json()

    const res = await api.post('/api/generate/assemble-a', { briefId: brief.id, templateId: template.id })
    expect(res.status()).toBe(400)
  })
})
