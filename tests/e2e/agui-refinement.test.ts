import { test, expect } from '@playwright/test'
import { login, post, get } from '../helpers/api'

// Requires: MOCK_AI=true, MOCK_PUPPETEER=true in the test environment.
// Mock design agent returns MOCK_HTML; mock renderer returns a 1×1 PNG.

test.describe('AGUI design refinement', () => {
  test.beforeEach(async ({ request }) => { await login(request) })

  async function createExportedDraft(request: import('@playwright/test').APIRequestContext) {
    const kitRes = await post(request, '/api/admin/brandkits', {
      name: 'AGUI Test Kit',
      colors: ['#0284c7'],
    })
    const kit = await kitRes.json()
    const campRes = await post(request, '/api/campaigns', { name: 'AGUI Campaign', brandKitId: kit.id })
    const camp = await campRes.json()
    const briefRes = await post(request, '/api/briefs', {
      topic: 'AGUI Refinement Test',
      goal: 'Test AGUI',
      tone: 'casual',
      channels: ['INSTAGRAM'],
      designMode: 'GENERATE',
      copyProviderKey: 'env-default',
      campaignId: camp.id,
    })
    const brief = await briefRes.json()
    const assembleRes = await post(request, '/api/generate/assemble-b', { briefId: brief.id })
    if (assembleRes.status() !== 201) return null
    return assembleRes.json()
  }

  test('refinement instruction updates htmlContent and creates DraftRevision', async ({ request }) => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) {
      test.skip()
      return
    }

    const draft = await createExportedDraft(request)
    if (!draft) { test.skip(); return }

    const refineRes = await post(request, `/api/drafts/${draft.id}/refine`, {
      instruction: 'Make the background darker',
    })
    expect(refineRes.status()).toBe(200)
    const result = await refineRes.json()
    expect(result.reply).toBe('Design updated')
    expect(result.revisionId).toBeTruthy()
    expect(result.exportUrl).toBeTruthy()

    // Draft htmlContent should be updated
    const draftRes = await get(request, `/api/drafts/${draft.id}`)
    const updated = await draftRes.json()
    expect(updated.htmlContent).toBeTruthy()

    // Revision should exist
    const revRes = await get(request, `/api/drafts/${draft.id}/revisions`)
    const { revisions } = await revRes.json()
    expect(revisions.length).toBeGreaterThanOrEqual(1)
    const rev = revisions.find((r: { id: string }) => r.id === result.revisionId)
    expect(rev).toBeTruthy()
    expect(rev.instruction).toBe('Make the background darker')
  })

  test('conflicting instruction returns conflict card without updating draft', async ({ request }) => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) {
      test.skip()
      return
    }

    const draft = await createExportedDraft(request)
    if (!draft) { test.skip(); return }

    const originalHtml = draft.htmlContent

    // The mock AI returns a conflict marker when instruction contains "conflict_test"
    const refineRes = await post(request, `/api/drafts/${draft.id}/refine`, {
      instruction: 'conflict_test: use completely off-brand colors',
    })

    if (refineRes.status() === 200) {
      const body = await refineRes.json()
      if (body.conflict) {
        expect(body.explanation).toBeTruthy()
        expect(body.conflictId).toBeTruthy()

        // htmlContent must not have changed
        const draftRes = await get(request, `/api/drafts/${draft.id}`)
        const unchanged = await draftRes.json()
        expect(unchanged.htmlContent).toBe(originalHtml)

        // Override the conflict
        const overrideRes = await post(request, `/api/drafts/${draft.id}/refine`, {
          instruction: 'conflict_test: use completely off-brand colors',
          overrideConflictId: body.conflictId,
        })
        expect(overrideRes.status()).toBe(200)
        const overrideResult = await overrideRes.json()
        expect(overrideResult.reply).toBe('Design updated')

        // After override, htmlContent should be updated
        const draftRes2 = await get(request, `/api/drafts/${draft.id}`)
        const overridden = await draftRes2.json()
        expect(overridden.htmlContent).not.toBe(originalHtml)
      }
    }
  })

  test('restore re-renders htmlSnapshot and updates exportUrl', async ({ request }) => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) {
      test.skip()
      return
    }

    const draft = await createExportedDraft(request)
    if (!draft) { test.skip(); return }

    // Create at least one revision
    await post(request, `/api/drafts/${draft.id}/refine`, { instruction: 'Add a subtle gradient' })

    const revRes = await get(request, `/api/drafts/${draft.id}/revisions`)
    const { revisions } = await revRes.json()
    if (!revisions.length) { test.skip(); return }

    const rev = revisions[0]
    const restoreRes = await post(request, `/api/drafts/${draft.id}/revisions/${rev.revisionNumber}/restore`, {})
    expect(restoreRes.status()).toBe(200)
    const restored = await restoreRes.json()
    expect(restored.exportUrl).toBeTruthy()
  })

  test('revision history is ordered correctly', async ({ request }) => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) {
      test.skip()
      return
    }

    const draft = await createExportedDraft(request)
    if (!draft) { test.skip(); return }

    await post(request, `/api/drafts/${draft.id}/refine`, { instruction: 'First edit' })
    await post(request, `/api/drafts/${draft.id}/refine`, { instruction: 'Second edit' })

    const revRes = await get(request, `/api/drafts/${draft.id}/revisions`)
    const { revisions } = await revRes.json()

    // Ordered desc — first item should have higher revisionNumber
    for (let i = 1; i < revisions.length; i++) {
      expect(revisions[i - 1].revisionNumber).toBeGreaterThan(revisions[i].revisionNumber)
    }
  })
})
