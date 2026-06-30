import { test, expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { login, post, get, loginAs } from '../helpers/api'

const EDITOR_EMAIL = 'editor@bisteccare.lk'
const EDITOR_PASSWORD = 'BistecStudio2026!'

// Requires: MOCK_AI=true, MOCK_PUPPETEER=true in the APP's environment + seeded
// 'cli' COPY provider. The MOCK_AI design agent returns deterministic HTML, or a
// conflict marker when the instruction contains "conflict_test".
//
// Real contracts (src/app/api/drafts/[id]/...):
//   POST /refine {instruction}            → 200 {reply:'Design updated', revisionId, exportUrl}
//   POST /refine {instruction:'conflict_test…'} → 200 {conflict:true, explanation, conflictId}
//   POST /refine {instruction, overrideConflictId}  → 200 {reply:'Design updated', …}
//   GET  /revisions                        → BARE ARRAY [{id, revisionNumber, instruction, exportUrl, createdAt}]
//   POST /revisions/[revisionNumber]/restore → 200 {exportUrl}

async function createExportedDraft(request: APIRequestContext) {
  const kitRes = await post(request, '/api/admin/brandkits', { name: 'AGUI Test Kit', colors: ['#0284c7'] })
  const kit = await kitRes.json()
  const campRes = await post(request, '/api/campaigns', { name: 'AGUI Campaign', brandKitId: kit.id })
  const camp = await campRes.json()
  const briefRes = await post(request, '/api/briefs', {
    topic: 'AGUI Refinement Test',
    goal: 'Test AGUI',
    tone: 'casual',
    channels: ['INSTAGRAM'],
    designMode: 'GENERATE',
    copyProviderKey: 'cli',
    campaignId: camp.id,
  })
  const brief = await briefRes.json()
  const assembleRes = await post(request, '/api/generate/assemble-b', { briefId: brief.id })
  if (assembleRes.status() !== 200) return null
  const { draftId } = await assembleRes.json()
  // Return the full draft (assemble returns only {draftId,exportUrl}).
  return (await get(request, `/api/drafts/${draftId}`)).json()
}

test.describe('AGUI design refinement', () => {
  test.beforeEach(async ({ request }) => { await login(request) })

  test('refinement instruction updates htmlContent and creates a DraftRevision', async ({ request }) => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(request)
    if (!draft) { test.skip(); return }

    const refineRes = await post(request, `/api/drafts/${draft.id}/refine`, {
      instruction: 'Make the background darker',
    })
    expect(refineRes.status()).toBe(200)
    const result = await refineRes.json()
    expect(result.reply).toBe('Design updated')
    expect(result.revisionId).toBeTruthy()
    expect(result.exportUrl).toMatch(/^https?:\/\//)

    const updated = await (await get(request, `/api/drafts/${draft.id}`)).json()
    expect(updated.htmlContent).toBeTruthy()

    // /revisions is a BARE ARRAY.
    const revisions = await (await get(request, `/api/drafts/${draft.id}/revisions`)).json()
    expect(Array.isArray(revisions)).toBe(true)
    const rev = revisions.find((r: { id: string }) => r.id === result.revisionId)
    expect(rev).toBeTruthy()
    expect(rev.instruction).toBe('Make the background darker')
  })

  test('conflicting instruction returns a conflict card; override applies it', async ({ request }) => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(request)
    if (!draft) { test.skip(); return }
    const originalHtml = draft.htmlContent

    const refineRes = await post(request, `/api/drafts/${draft.id}/refine`, {
      instruction: 'conflict_test: use completely off-brand colors',
    })
    expect(refineRes.status()).toBe(200)
    const body = await refineRes.json()
    expect(body.conflict).toBe(true)
    expect(body.explanation).toBeTruthy()
    expect(body.conflictId).toBeTruthy()

    // htmlContent must NOT have changed yet.
    const unchanged = await (await get(request, `/api/drafts/${draft.id}`)).json()
    expect(unchanged.htmlContent).toBe(originalHtml)

    // Override → applies the withheld pendingHtml.
    const overrideRes = await post(request, `/api/drafts/${draft.id}/refine`, {
      instruction: 'conflict_test: use completely off-brand colors',
      overrideConflictId: body.conflictId,
    })
    expect(overrideRes.status()).toBe(200)
    const overrideResult = await overrideRes.json()
    expect(overrideResult.reply).toBe('Design updated')

    const overridden = await (await get(request, `/api/drafts/${draft.id}`)).json()
    expect(overridden.htmlContent).not.toBe(originalHtml)
  })

  test('restore re-renders a revision snapshot and returns a signed exportUrl', async ({ request }) => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(request)
    if (!draft) { test.skip(); return }

    await post(request, `/api/drafts/${draft.id}/refine`, { instruction: 'Add a subtle gradient' })
    const revisions = await (await get(request, `/api/drafts/${draft.id}/revisions`)).json()
    expect(revisions.length).toBeGreaterThanOrEqual(1)

    const rev = revisions[0]
    const restoreRes = await post(request, `/api/drafts/${draft.id}/revisions/${rev.revisionNumber}/restore`, {})
    expect(restoreRes.status()).toBe(200)
    const restored = await restoreRes.json()
    expect(restored.exportUrl).toMatch(/^https?:\/\//)
  })

  test('revision numbers are unique and contiguous (H7)', async ({ request }) => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(request)
    if (!draft) { test.skip(); return }

    await post(request, `/api/drafts/${draft.id}/refine`, { instruction: 'First edit' })
    await post(request, `/api/drafts/${draft.id}/refine`, { instruction: 'Second edit' })

    const revisions = await (await get(request, `/api/drafts/${draft.id}/revisions`)).json()
    const numbers = revisions.map((r: { revisionNumber: number }) => r.revisionNumber).sort((a: number, b: number) => a - b)
    expect(numbers.length).toBeGreaterThanOrEqual(2)
    expect(new Set(numbers).size).toBe(numbers.length) // all distinct
    // contiguous from 1
    numbers.forEach((n: number, i: number) => expect(n).toBe(i + 1))
  })

  // TC-AGUI-06 — Refining another user's draft is forbidden. Guards H2 (IDOR).
  test('an editor cannot refine a draft owned by the admin', async ({ request }) => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(request) // owned by the admin (beforeEach login)
    if (!draft) { test.skip(); return }

    const editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    const res = await editor.post(`/api/drafts/${draft.id}/refine`, { instruction: 'Make it pop' })
    expect(res.status()).toBe(403)
  })
})
