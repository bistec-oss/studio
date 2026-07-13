import { test, expect } from '@playwright/test'
import { loginAs, waitForDraft, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'

// Requires: MOCK_AI=true, MOCK_PUPPETEER=true in the APP's environment + seeded
// 'cli' COPY provider.
//
// Real contract (src/app/api/generate/assemble-b/route.ts):
//   POST /api/generate/assemble-b {briefId} → 202 {draftId} (ASYNC, F1); the draft
//   finishes EXPORTED in the background — poll via waitForDraft. NO_BRAND_KIT is
//   validated synchronously → 422.

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'

test.describe('Path B — freeform design generation', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => { await api.dispose() })

  test('assemble-b produces an EXPORTED draft', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) {
      test.skip()
      return
    }

    const kitRes = await api.post('/api/admin/brandkits', {
      name: 'Path B Test Kit',
      colors: ['#7dd3fc', '#020617'],
    })
    const kit = await kitRes.json()

    const campRes = await api.post('/api/campaigns', { name: 'Path B Campaign', brandKitId: kit.id })
    const camp = await campRes.json()

    const briefRes = await api.post('/api/briefs', {
      topic: 'AI Product Launch',
      description: 'Announcing our new AI assistant',
      goal: 'Generate buzz',
      tone: 'bold',
      channels: ['LINKEDIN'],
      designMode: 'GENERATE',
      copyProviderKey: 'cli',
      campaignId: camp.id,
    })
    expect(briefRes.status()).toBe(201)
    const brief = await briefRes.json()

    const assembleRes = await api.post('/api/generate/assemble-b', { briefId: brief.id })
    expect(assembleRes.status()).toBe(202)
    const assembled = await assembleRes.json()
    expect(assembled.draftId).toBeTruthy()

    const draft = await waitForDraft(api, assembled.draftId)
    expect(draft.status).toBe('EXPORTED')
    expect(draft.exportUrl).toMatch(/^https?:\/\//)
    expect(draft.htmlContent).toBeTruthy()
  })

  test('assemble-b produces an EXPORTED draft for a 3:4 portrait brief', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }

    const kit = await (await api.post('/api/admin/brandkits', {
      name: 'Path B Portrait Kit', colors: ['#7dd3fc', '#020617'],
    })).json()
    const camp = await (await api.post('/api/campaigns', { name: 'Path B Portrait Campaign', brandKitId: kit.id })).json()
    const brief = await (await api.post('/api/briefs', {
      topic: 'Portrait Freeform', goal: 'Generate buzz', tone: 'bold',
      channels: ['LINKEDIN'], aspectRatio: 'PORTRAIT', designMode: 'GENERATE',
      copyProviderKey: 'cli', campaignId: camp.id,
    })).json()

    const res = await api.post('/api/generate/assemble-b', { briefId: brief.id })
    expect(res.status()).toBe(202)
    const draft = await waitForDraft(api, (await res.json()).draftId)
    expect(draft.status).toBe('EXPORTED')
    expect((draft.brief as { aspectRatio: string }).aspectRatio).toBe('PORTRAIT')
  })

  test('assemble-b without a resolvable brand kit returns 422 NO_BRAND_KIT', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) {
      test.skip()
      return
    }

    // A standalone brief (no campaign) resolves to the system default kit — the
    // seeded "Bistec" kit. To exercise the NO_BRAND_KIT branch we must remove the
    // system default. With DB access we temporarily unset every default, assert
    // the 422, then restore. Without DB access we fall back to the lenient check
    // (the route must never 500).
    const briefRes = await api.post('/api/briefs', {
      topic: 'No-kit Brief',
      goal: 'Test fallback',
      tone: 'neutral',
      channels: ['INSTAGRAM'],
      designMode: 'GENERATE',
      copyProviderKey: 'cli',
    })
    const brief = await briefRes.json()

    if (!dbAvailable) {
      const res = await api.post('/api/generate/assemble-b', { briefId: brief.id })
      expect([200, 422]).toContain(res.status())
      return
    }

    const defaults = await prisma!.brandKit.findMany({ where: { isDefault: true, isDeleted: false } })
    try {
      await prisma!.brandKit.updateMany({ where: { isDefault: true }, data: { isDefault: false } })
      const res = await api.post('/api/generate/assemble-b', { briefId: brief.id })
      expect(res.status()).toBe(422)
      const body = await res.json()
      expect(JSON.stringify(body)).toContain('NO_BRAND_KIT')
    } finally {
      // Restore the original default(s) so the rest of the suite is unaffected.
      for (const k of defaults) {
        await prisma!.brandKit.update({ where: { id: k.id }, data: { isDefault: true } })
      }
    }
  })
})
