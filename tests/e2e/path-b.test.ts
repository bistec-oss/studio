import { test, expect } from '@playwright/test'
import { login, post, get } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'

// Requires: MOCK_AI=true, MOCK_PUPPETEER=true in the APP's environment + seeded
// 'cli' COPY provider.
//
// Real contract (src/app/api/generate/assemble-b/route.ts):
//   POST /api/generate/assemble-b {briefId} → 200 {draftId, exportUrl}

test.describe('Path B — freeform design generation', () => {
  test.beforeEach(async ({ request }) => { await login(request) })

  test('assemble-b produces an EXPORTED draft', async ({ request }) => {
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
      copyProviderKey: 'cli',
      campaignId: camp.id,
    })
    expect(briefRes.status()).toBe(201)
    const brief = await briefRes.json()

    const assembleRes = await post(request, '/api/generate/assemble-b', { briefId: brief.id })
    expect(assembleRes.status()).toBe(200)
    const assembled = await assembleRes.json()
    expect(assembled.draftId).toBeTruthy()
    expect(assembled.exportUrl).toMatch(/^https?:\/\//)

    const draftRes = await get(request, `/api/drafts/${assembled.draftId}`)
    const draft = await draftRes.json()
    expect(draft.status).toBe('EXPORTED')
    expect(draft.htmlContent).toBeTruthy()
  })

  test('assemble-b without a resolvable brand kit returns 422 NO_BRAND_KIT', async ({ request }) => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) {
      test.skip()
      return
    }

    // A standalone brief (no campaign) resolves to the system default kit — the
    // seeded "Bistec" kit. To exercise the NO_BRAND_KIT branch we must remove the
    // system default. With DB access we temporarily unset every default, assert
    // the 422, then restore. Without DB access we fall back to the lenient check
    // (the route must never 500).
    const briefRes = await post(request, '/api/briefs', {
      topic: 'No-kit Brief',
      goal: 'Test fallback',
      tone: 'neutral',
      channels: ['INSTAGRAM'],
      designMode: 'GENERATE',
      copyProviderKey: 'cli',
    })
    const brief = await briefRes.json()

    if (!dbAvailable) {
      const res = await post(request, '/api/generate/assemble-b', { briefId: brief.id })
      expect([200, 422]).toContain(res.status())
      return
    }

    const defaults = await prisma!.brandKit.findMany({ where: { isDefault: true, isDeleted: false } })
    try {
      await prisma!.brandKit.updateMany({ where: { isDefault: true }, data: { isDefault: false } })
      const res = await post(request, '/api/generate/assemble-b', { briefId: brief.id })
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
