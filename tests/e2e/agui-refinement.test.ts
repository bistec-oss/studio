import { test, expect } from '@playwright/test'
import { loginAs, waitForDraft, waitForAction, type ApiClient } from '../helpers/api'

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const EDITOR_EMAIL = 'editor@bisteccare.lk'
const EDITOR_PASSWORD = 'BistecStudio2026!'

// Requires: MOCK_AI=true, MOCK_PUPPETEER=true in the APP's environment + seeded
// 'cli' COPY provider. The MOCK_AI design agent returns deterministic HTML, or a
// conflict marker when the instruction contains "conflict_test".
//
// Real contracts (src/app/api/drafts/[id]/... — refine is ASYNC as of the
// async-draft-actions change, §Q):
//   POST /refine {instruction}            → 202 {ok:true}; the refinement runs in
//     the background — poll GET /api/drafts/[id] (waitForAction) until
//     pendingAction settles to null, then assert the new revision / conflict.
//   POST /refine {instruction:'conflict_test…'} → 202; after the poll the draft
//     GET carries conflict {conflictId, explanation} (never pendingHtml).
//   POST /refine {instruction, overrideConflictId} → SYNCHRONOUS 200
//     {reply:'Design updated', revisionId, exportUrl} (commits stored HTML).
//   GET  /revisions                        → BARE ARRAY [{id, revisionNumber, instruction, exportUrl, createdAt}]
//   POST /revisions/[revisionNumber]/restore → 200 {exportUrl} (409 while a
//     pendingAction is in flight)

async function createExportedDraft(api: ApiClient) {
  const kitRes = await api.post('/api/admin/brandkits', { name: 'AGUI Test Kit', colors: ['#0284c7'] })
  const kit = await kitRes.json()
  const campRes = await api.post('/api/campaigns', { name: 'AGUI Campaign', brandKitId: kit.id })
  const camp = await campRes.json()
  const briefRes = await api.post('/api/briefs', {
    topic: 'AGUI Refinement Test',
    goal: 'Test AGUI',
    tone: 'casual',
    channels: ['INSTAGRAM'],
    designMode: 'GENERATE',
    copyProviderKey: 'cli',
    campaignId: camp.id,
  })
  const brief = await briefRes.json()
  // Generation is async: assemble returns 202 { draftId }; poll until EXPORTED.
  const assembleRes = await api.post('/api/generate/assemble-b', { briefId: brief.id })
  if (assembleRes.status() !== 202) return null
  const { draftId } = await assembleRes.json()
  return waitForDraft(api, draftId)
}

// Fire a refine (202) and poll it to completion. Returns the settled draft.
async function refineAndWait(api: ApiClient, draftId: string, instruction: string) {
  const res = await api.post(`/api/drafts/${draftId}/refine`, { instruction })
  expect(res.status()).toBe(202)
  return waitForAction(api, draftId)
}

test.describe('AGUI design refinement', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => { await api.dispose() })

  test('refinement instruction updates htmlContent and creates a DraftRevision', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }

    // Async contract: 202 {ok:true}, then poll pendingAction to completion.
    const refineRes = await api.post(`/api/drafts/${draft.id}/refine`, {
      instruction: 'Make the background darker',
    })
    expect(refineRes.status()).toBe(202)
    expect(await refineRes.json()).toEqual({ ok: true })

    const updated = await waitForAction(api, draft.id as string)
    expect(updated.pendingAction).toBeNull()
    expect(updated.pendingActionError).toBeNull()
    expect(updated.htmlContent).toBeTruthy()
    expect(updated.exportUrl).toMatch(/^https?:\/\//)

    // /revisions is a BARE ARRAY. The applied refinement is the new row.
    const revisions = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()
    expect(Array.isArray(revisions)).toBe(true)
    const rev = revisions.find((r: { instruction: string }) => r.instruction === 'Make the background darker')
    expect(rev).toBeTruthy()
    expect(rev.id).toBeTruthy()
  })

  test('conflicting instruction surfaces a conflict via poll; override applies it', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }
    const originalHtml = draft.htmlContent

    const refineRes = await api.post(`/api/drafts/${draft.id}/refine`, {
      instruction: 'conflict_test: use completely off-brand colors',
    })
    expect(refineRes.status()).toBe(202)

    // The conflict arrives via the draft GET's conflict field, not the response.
    const settled = await waitForAction(api, draft.id as string)
    expect(settled.pendingActionError).toBeNull()
    const conflict = settled.conflict as { conflictId?: string; explanation?: string } | null
    expect(conflict).toBeTruthy()
    expect(conflict!.explanation).toBeTruthy()
    expect(conflict!.conflictId).toBeTruthy()

    // htmlContent must NOT have changed yet.
    expect(settled.htmlContent).toBe(originalHtml)

    // Override → applies the withheld pendingHtml. Stays SYNCHRONOUS.
    const overrideRes = await api.post(`/api/drafts/${draft.id}/refine`, {
      instruction: 'conflict_test: use completely off-brand colors',
      overrideConflictId: conflict!.conflictId,
    })
    expect(overrideRes.status()).toBe(200)
    const overrideResult = await overrideRes.json()
    expect(overrideResult.reply).toBe('Design updated')

    const overridden = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(overridden.htmlContent).not.toBe(originalHtml)
  })

  test('restore re-renders a revision snapshot and returns a signed exportUrl', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }

    await refineAndWait(api, draft.id as string, 'Add a subtle gradient')
    const revisions = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()
    expect(revisions.length).toBeGreaterThanOrEqual(1)

    const rev = revisions[0]
    const restoreRes = await api.post(`/api/drafts/${draft.id}/revisions/${rev.revisionNumber}/restore`, {})
    expect(restoreRes.status()).toBe(200)
    const restored = await restoreRes.json()
    expect(restored.exportUrl).toMatch(/^https?:\/\//)
  })

  // F2 — the design history is an append-only log with a "current version"
  // pointer, so reverting can move BACK and then FORWARD again (the old flow
  // lost the forward state). Generation records v1 up front.
  test('version switching moves back and forward freely (F2)', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }

    // Generation records the original design as v1 and points at it.
    expect(draft.currentRevisionNumber).toBe(1)
    const revs = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()
    expect(revs.some((r: { revisionNumber: number }) => r.revisionNumber === 1)).toBe(true)

    // Refine → appends v2 and the pointer advances to it (once the poll settles).
    let after = await refineAndWait(api, draft.id as string, 'Add a subtle gradient')
    expect(after.currentRevisionNumber).toBe(2)

    // Jump BACK to v1 → the pointer follows.
    const backRes = await api.post(`/api/drafts/${draft.id}/revisions/1/restore`, {})
    expect(backRes.status()).toBe(200)
    after = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(after.currentRevisionNumber).toBe(1)

    // Jump FORWARD to v2 → the previously-"lost" forward state is reachable again.
    // (Before F2, reverting had no pointer and no way forward — this is the fix.)
    const fwdRes = await api.post(`/api/drafts/${draft.id}/revisions/2/restore`, {})
    expect(fwdRes.status()).toBe(200)
    after = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(after.currentRevisionNumber).toBe(2)
  })

  test('revision numbers are unique and contiguous (H7)', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }

    // Sequential refines — each must settle before the next can claim the
    // action slot (a second refine while one is in flight is a 409).
    await refineAndWait(api, draft.id as string, 'First edit')
    await refineAndWait(api, draft.id as string, 'Second edit')

    const revisions = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()
    const numbers = revisions.map((r: { revisionNumber: number }) => r.revisionNumber).sort((a: number, b: number) => a - b)
    expect(numbers.length).toBeGreaterThanOrEqual(2)
    expect(new Set(numbers).size).toBe(numbers.length) // all distinct
    // contiguous from 1
    numbers.forEach((n: number, i: number) => expect(n).toBe(i + 1))
  })

  // TC-AGUI-06 — Refining another user's draft is forbidden. Guards H2 (IDOR).
  test('an editor cannot refine a draft owned by the admin', async ({ request }) => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api) // owned by the admin (beforeEach loginAs)
    if (!draft) { test.skip(); return }

    const editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    try {
      const res = await editor.post(`/api/drafts/${draft.id}/refine`, { instruction: 'Make it pop' })
      expect(res.status()).toBe(403)
    } finally {
      await editor.dispose()
    }
  })
})
