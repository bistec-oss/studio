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
//     CHAIN ONLY — a rejected (not-applied) render is retained out of chain with
//     a NEGATIVE revisionNumber and is filtered out of this list, out of the
//     poll's revisionCount, and out of restore.
//   POST /revisions/[revisionNumber]/restore → 200 {exportUrl} (409 while a
//     pendingAction is in flight; 400 for a non-positive number)
//
// Design-instruction fidelity (change 004) — the third outcome of a refine:
//   GET /api/drafts/[id] → notAppliedReason: string | null. Set when a refine
//     ran cleanly TWICE and the verifier measured that the instruction was not
//     applied. It is NOT pendingActionError (the run did not crash), and it is
//     NOT a committed revision (the chain and currentRevisionNumber are frozen).
//     claimDraftAction clears it when the NEXT action on the draft is claimed.
//   The three poll outcomes are mutually exclusive and all three are asserted
//   below: success (both null, new revision) / crashed (pendingActionError set)
//   / not applied (notAppliedReason set).

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

  // A rejected refine render (one the verifier threw away) is retained
  // out-of-chain as a revision with a NEGATIVE number. The route used to accept
  // any integer `rev`, so naming that number directly would have restored the
  // rejected HTML into the live draft. Chain numbers start at 1 — anything below
  // that is rejected at the param, before the (independently filtered) lookup.
  test('restore refuses a non-positive revision number (out-of-chain space)', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }

    for (const rev of ['-1', '-2', '0']) {
      const res = await api.post(`/api/drafts/${draft.id}/revisions/${rev}/restore`, {})
      expect(res.status()).toBe(400)
    }

    // …and the draft is untouched.
    const after = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(after.htmlContent).toBe(draft.htmlContent)
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

  // TC-AGUI-06 — team tenancy D6: "team-shared" is precisely "the brief has a
  // non-null campaignId" — createExportedDraft's fixture is campaign-scoped,
  // so an in-team editor CAN refine it (canAccessContent allows own OR
  // under-a-campaign). Rewritten from the pre-team-tenancy "always 403" to
  // match D6, plus a second case with a non-campaign (private, uncategorized)
  // fixture proving the boundary still holds for in-team-but-private drafts.
  test('an in-team editor CAN refine a campaign-shared draft owned by the admin (D6)', async ({ request }) => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api) // owned by the admin, under a campaign (beforeEach loginAs)
    if (!draft) { test.skip(); return }

    const editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    try {
      const res = await editor.post(`/api/drafts/${draft.id}/refine`, { instruction: 'Make it pop' })
      expect(res.status()).toBe(202)
      await waitForAction(editor, draft.id as string)
    } finally {
      await editor.dispose()
    }
  })

  // TC-AGUI-06b — the D6 boundary still holds for a PRIVATE (uncategorized,
  // no campaign) draft: an in-team editor gets 404 (not 403 — cross-boundary
  // access must not leak existence, per canAccessContent/Task 9), same as
  // any other by-id route.
  test('an in-team editor cannot refine a PRIVATE (uncategorized) draft owned by the admin', async ({ request }) => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const kitRes = await api.post('/api/admin/brandkits', { name: 'AGUI Private Kit', colors: ['#0284c7'] })
    const kit = await kitRes.json()
    const briefRes = await api.post('/api/briefs', {
      topic: 'AGUI Private Post',
      goal: 'Test AGUI private',
      tone: 'casual',
      channels: ['INSTAGRAM'],
      designMode: 'GENERATE',
      copyProviderKey: 'cli',
      brandKitId: kit.id, // no campaignId — private, uncategorized
    })
    const brief = await briefRes.json()
    const assembleRes = await api.post('/api/generate/assemble-b', { briefId: brief.id })
    if (assembleRes.status() !== 202) { test.skip(); return }
    const { draftId } = await assembleRes.json()
    const draft = await waitForDraft(api, draftId)
    if (!draft) { test.skip(); return }

    const editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    try {
      const res = await editor.post(`/api/drafts/${draft.id}/refine`, { instruction: 'Make it pop' })
      expect(res.status()).toBe(404)
    } finally {
      await editor.dispose()
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Design-instruction fidelity (change 004) — TC-AGUI-07 … TC-AGUI-13
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // ⚠️ READ THIS BEFORE ADDING OR STRENGTHENING A CASE HERE. What follows is the
  // honest boundary of what this suite can prove, and every case below is
  // written to stay inside it.
  //
  // 1. This suite runs in API mode. `.env.test` sets DESIGN_PROVIDER=claude-html,
  //    so isCliMode() is false and the refine route takes its API branch — which
  //    carries NO envelope (API-mode HTML arrives as a renderHtml tool argument,
  //    with no surrounding text for the classification header to sit in). It
  //    therefore always takes FR-05's preserving default: classes = ['add'],
  //    supersedes = []. So NOTHING here exercises real classification. AC-10
  //    (destructive-with-empty-supersedes downgrade), AC-11 (multi-class), and
  //    the `remove`/`replace`/`constrain` post-conditions of AC-12 are CLI-mode
  //    behaviour and are covered by the unit tests over resolveEffectiveClasses
  //    and instructionClasses, not by anything in this file.
  //
  // 2. MOCK_AI is a STUB, not a model. buildMockHtml returns a fixed-shape
  //    document keyed on a digest of the prompt: it makes a mocked refine
  //    observably an EDIT (the document changes), but it does not obey the
  //    instruction. A case asserting "reduce the text → the output is measurably
  //    shorter" would be asserting something the stub cannot deliver, and would
  //    fail for a reason that has nothing to do with the code under test.
  //
  // What IS genuinely reachable — and is what the cases below assert — is the
  // OUTCOME CONTRACT around verification, driven by T12's deterministic seam
  // (src/lib/testHooks.ts → shouldMockVerificationMiss), which substitutes a
  // forced miss for the mock's stubbed pass:
  //    __FAIL_VERIFY_ALWAYS__ in the instruction → miss on both attempts →
  //      the twice-failed / not-applied path
  //    __FAIL_VERIFY_ONCE__   in the instruction → miss once, pass on the retry
  //      (must be UNIQUE PER DRAFT to isolate its state — the same discipline
  //      the __FAIL_ONCE__ publish sentinel needs; each case below interpolates
  //      the draft id for that reason)
  //
  // So: what the model DID is unobservable here; what the pipeline DOES ABOUT IT
  // is fully observable. The measurement halves of AC-08 ("measurably shorter")
  // and AC-09 ("the superseded element is absent", and the duplicate-image
  // export failing it) can only be proven by a real CLI-mode run against the
  // live Claude CLI. Each case repeats that split in its own comment.

  // A signed EXPORTS URL carries a per-request signature, so two reads of the
  // same stored object are different strings. The PATH is the object key.
  const exportKeyOf = (url: unknown): string | null =>
    typeof url === 'string' && url ? new URL(url).pathname : null

  // TC-AGUI-07 — REGRESSION, reported defect #1: "reduce the text" came back
  // with the text not reduced, and was committed anyway.
  //
  // Asserted here: a refine whose verification misses TWICE is NOT applied — the
  // previous design is left byte-for-byte intact, the run is reported as a
  // failure on its own poll field, and pendingActionError stays null because the
  // run did not crash.
  //
  // NOT asserted here, and NOT assertable under MOCK_AI: that a real `remove`
  // instruction produces visible text that is measurably shorter, and that the
  // shortening is what the verifier measured. In this environment the class is
  // the API-mode default `add`, and the miss is injected by the seam rather than
  // measured. Needs a real CLI-mode run.
  test('a refine whose verification misses twice is NOT applied (reduce-the-text regression)', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }

    const instruction = `Reduce the text __FAIL_VERIFY_ALWAYS__ [${draft.id}]`
    const settled = await refineAndWait(api, draft.id as string, instruction)

    expect(settled.pendingAction).toBeNull()
    // The run completed cleanly — "the model didn't do what you asked" is NOT
    // "the run crashed", and must not be reported on the crash channel.
    expect(settled.pendingActionError).toBeNull()
    expect(typeof settled.notAppliedReason).toBe('string')
    expect(settled.notAppliedReason).toBeTruthy()

    // The previous design survives untouched — this is the whole point of FR-12.
    expect(settled.htmlContent).toBe(draft.htmlContent)
    expect(settled.currentRevisionNumber).toBe(draft.currentRevisionNumber)

    // …and the rejected attempt is not offered as a version to switch to.
    const revisions = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()
    expect(revisions.some((r: { instruction: string }) => r.instruction === instruction)).toBe(false)
  })

  // TC-AGUI-08 — REGRESSION, reported defect #2: "use the uploaded image as the
  // background" produced a design carrying BOTH images (the superseded one was
  // never removed) and that duplicate-image render was exported.
  //
  // Asserted here: the rejected render never reaches the user — the draft still
  // points at the PREVIOUS export object, not at the render the verifier threw
  // away. (Object key, not the full signed URL: the signature differs per read.)
  //
  // NOT asserted here: that a real `replace` instruction's named superseded
  // element is absent from the output — i.e. that the duplicate-image design
  // actually FAILS verification on its own merits. Under MOCK_AI the class is
  // the API-mode default `add`, no `supersedes` target is ever declared, and the
  // miss comes from the seam. Needs a real CLI-mode run with the envelope.
  test('a twice-missed refine leaves the draft pointing at the PREVIOUS export (use-the-uploaded-image regression)', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }
    const originalKey = exportKeyOf(draft.exportUrl)
    expect(originalKey).toBeTruthy()

    const instruction = `Use the uploaded image as the background __FAIL_VERIFY_ALWAYS__ [${draft.id}]`
    const settled = await refineAndWait(api, draft.id as string, instruction)

    expect(settled.notAppliedReason).toBeTruthy()
    expect(settled.pendingActionError).toBeNull()
    expect(settled.htmlContent).toBe(draft.htmlContent)
    expect(exportKeyOf(settled.exportUrl)).toBe(originalKey)
  })

  // TC-AGUI-09 — the retry is real, and it is the LAST chance (FR-11/AC-15).
  // __FAIL_VERIFY_ONCE__ misses the first verification and passes the retry's,
  // so the refine commits normally: one new chain revision, the pointer
  // advances, and no not-applied outcome is recorded.
  //
  // This is the case that proves the not-applied path above is a real second
  // attempt rather than a single attempt reported twice — if the route did not
  // retry, this instruction would land on the not-applied path too.
  //
  // The 2-refine/2-verifier hard cap itself (AC-15) has no HTTP surface; it is
  // held by the route's bounded `for` and the verifier-call budget, and is
  // covered by unit tests.
  test('a refine that misses once and passes on the retry commits normally', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }
    expect(draft.currentRevisionNumber).toBe(1)

    // Unique per draft — the ONCE seam keys its state on the instruction string.
    const instruction = `Reduce the text __FAIL_VERIFY_ONCE__ [${draft.id}]`
    const settled = await refineAndWait(api, draft.id as string, instruction)

    expect(settled.pendingActionError).toBeNull()
    expect(settled.notAppliedReason).toBeNull()
    expect(settled.htmlContent).not.toBe(draft.htmlContent)
    expect(settled.currentRevisionNumber).toBe(2)

    const revisions = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()
    expect(revisions.some((r: { instruction: string }) => r.instruction === instruction)).toBe(true)
  })

  // TC-AGUI-10 — AC-16. The chain is an append-only version history the user
  // switches between; a refine that was deliberately NOT applied must leave no
  // trace in it. The rejected render is retained out of chain with a NEGATIVE
  // revisionNumber, so the assertions are: same length, same numbers, still
  // contiguous from 1, all positive, count and pointer unmoved.
  test('a twice-failed refine leaves the revision chain and the pointer untouched (AC-16)', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }

    // Put a real second version in the chain first, so "unchanged" is a
    // non-trivial statement about a chain that has already moved once.
    await refineAndWait(api, draft.id as string, 'Add a subtle gradient')
    const before = await (await api.get(`/api/drafts/${draft.id}`)).json()
    const beforeRevs = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()
    expect(before.currentRevisionNumber).toBe(2)
    expect(beforeRevs.length).toBe(2)

    const settled = await refineAndWait(
      api,
      draft.id as string,
      `Add a mascot in the corner __FAIL_VERIFY_ALWAYS__ [${draft.id}]`,
    )
    expect(settled.notAppliedReason).toBeTruthy()
    expect(settled.currentRevisionNumber).toBe(before.currentRevisionNumber)
    // revisionCount is a CHAIN-filtered relation count — the retained rejected
    // row must not inflate it.
    expect(settled.revisionCount).toBe(before.revisionCount)

    const afterRevs = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()
    expect(afterRevs.length).toBe(beforeRevs.length)
    const numbers = afterRevs
      .map((r: { revisionNumber: number }) => r.revisionNumber)
      .sort((a: number, b: number) => a - b)
    numbers.forEach((n: number, i: number) => expect(n).toBe(i + 1)) // positive + contiguous from 1

    // AC-17 — the retained rejected render has NO read surface over HTTP by
    // design (listChainRevisions filters it, revisionCount filters it, and
    // restore rejects its number space), so this suite cannot assert its stored
    // instruction/classes/rejectionReason. Verifying THAT needs a DB read; what
    // is assertable here is the guarantee that matters to a user — the rejected
    // render is unreachable, including by naming its number directly.
    for (const rev of ['-1', '-2']) {
      const res = await api.post(`/api/drafts/${draft.id}/revisions/${rev}/restore`, {})
      expect(res.status()).toBe(400)
    }
    const stillThere = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(stillThere.htmlContent).toBe(before.htmlContent)
  })

  // TC-AGUI-11 — AC-18. The poll's three outcomes on ONE draft, in sequence, so
  // they are compared against each other rather than each asserted in isolation:
  //   success      → pendingActionError null, notAppliedReason null, new revision
  //   crashed      → pendingActionError set,  notAppliedReason null
  //   not applied  → pendingActionError null, notAppliedReason set
  // The final step also covers claimDraftAction's clear: a later action must
  // retire the previous refine's not-applied card rather than leave it standing
  // over a design that has since changed.
  test('the poll distinguishes success, a crashed run, and a not-applied refine (AC-18)', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }
    const id = draft.id as string

    // 1 — success.
    const ok = await refineAndWait(api, id, 'Make the background darker')
    expect(ok.pendingActionError).toBeNull()
    expect(ok.notAppliedReason).toBeNull()
    expect(ok.currentRevisionNumber).toBe(2)

    // 2 — the run itself throws (__FAIL_GEN_ALWAYS__ rides the instruction into
    // the design agent's prompt, the same carrier the F1 retry cases use). That
    // is the EXISTING error channel and must stay distinct from not-applied.
    const crashed = await refineAndWait(api, id, 'Make it pop __FAIL_GEN_ALWAYS__')
    expect(crashed.pendingActionError).toBeTruthy()
    expect(crashed.notAppliedReason).toBeNull()

    // 3 — ran fine, did not do what was asked.
    const notApplied = await refineAndWait(api, id, `Make it pop __FAIL_VERIFY_ALWAYS__ [${id}]`)
    expect(notApplied.notAppliedReason).toBeTruthy()
    expect(notApplied.pendingActionError).toBeNull()
    // The claim in step 3 cleared step 2's error — the two channels do not stack.
    expect(notApplied.currentRevisionNumber).toBe(2)

    // 4 — the next action clears the stale not-applied outcome.
    const recovered = await refineAndWait(api, id, 'Add a subtle gradient')
    expect(recovered.notAppliedReason).toBeNull()
    expect(recovered.pendingActionError).toBeNull()
    expect(recovered.currentRevisionNumber).toBe(3)
  })

  // TC-AGUI-12 — AC-20. regenerate-design and regenerate-copy share the action
  // slot and the poll with refine, but they acquire NO verification step and no
  // not-applied outcome: they produce a new design/copy by definition rather
  // than applying a named instruction to an existing one, so there is nothing to
  // verify against. Their 202 + poll contract is unchanged by this work.
  test('regenerate-design and regenerate-copy gain no verification and no not-applied outcome (AC-20)', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api) // Path B (designMode GENERATE)
    if (!draft) { test.skip(); return }
    const id = draft.id as string

    const designRes = await api.post(`/api/drafts/${id}/regenerate-design`, {})
    expect(designRes.status()).toBe(202)
    const afterDesign = await waitForAction(api, id)
    expect(afterDesign.pendingActionError).toBeNull()
    expect(afterDesign.notAppliedReason).toBeNull()
    expect(afterDesign.htmlContent).toBeTruthy()

    const copyRes = await api.post(`/api/drafts/${id}/regenerate-copy`, {})
    expect(copyRes.status()).toBe(202)
    const afterCopy = await waitForAction(api, id)
    expect(afterCopy.pendingActionError).toBeNull()
    expect(afterCopy.notAppliedReason).toBeNull()
    expect(afterCopy.copyText).toBeTruthy()
  })

  // TC-AGUI-13 — the sentinels are TEST-ONLY seams, and an instruction that
  // merely TALKS about verification must behave like any other instruction. This
  // is the guard against the seam widening into a substring that real user copy
  // could contain.
  test('an ordinary instruction is unaffected by the verification seam', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }

    const settled = await refineAndWait(
      api,
      draft.id as string,
      'Reduce the text and verify the layout still balances',
    )
    expect(settled.notAppliedReason).toBeNull()
    expect(settled.pendingActionError).toBeNull()
    expect(settled.currentRevisionNumber).toBe(2)
  })
})
