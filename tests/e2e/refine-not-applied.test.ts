import { test, expect } from '@playwright/test'
import { loginAs, waitForDraft, waitForAction, type ApiClient } from '../helpers/api'

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const CLIENTX_EMAIL = 'clientx.admin@users.bistec.internal'
const CLIENTX_PASSWORD = 'BistecStudio2026!'

// Fix round 1, Important 2: two presigned URLs for the SAME object are never
// byte-identical (the signature covers a to-the-second X-Amz-Date), so
// comparing them with `toBe` flakes. Compare the object path only — proves
// "the same underlying object", which is what these tests actually mean.
function urlPath(u: string): string {
  return new URL(u).pathname
}

// T18 (change 004 Phase 2) — GET /api/drafts/[id]'s `notApplied` field
// (Ruling E): a top-level, DISTINCT outcome channel from both success and the
// existing `pendingActionError` crash channel —
//   notApplied: { reason, instruction, revisionId, previewUrl, rejectedAt } | null
// re-derived every poll from the retained rejected DraftRevision row (never
// trusted off the stored FK alone). T17 landed the writer side
// (recordRejectedRender / Draft.notAppliedReason+notAppliedRevisionId); this
// suite covers only the T18 poll/UI surface — T21 adds the full fidelity
// catalog on top of the same seams.
//
// Requires: MOCK_AI=true, MOCK_PUPPETEER=true + the seeded 'cli' COPY
// provider (as agui-refinement.test.ts). Deterministic seams
// (src/lib/testHooks.ts):
//   "__VERIFY_FAIL_ALWAYS__" — the mock verifier misses on every attempt, but
//     the refine reply IS a complete document → not-applied WITH a stored
//     export (previewUrl non-null).
//   "__REFINE_TRUNCATED__"   — the reply has no closing </html> on either
//     attempt → not-applied with NO usable document → previewUrl null.

async function createExportedDraft(api: ApiClient) {
  const kitRes = await api.post('/api/admin/brandkits', { name: 'T18 Not-Applied Kit', colors: ['#0284c7'] })
  const kit = await kitRes.json()
  const campRes = await api.post('/api/campaigns', { name: 'T18 Not-Applied Campaign', brandKitId: kit.id })
  const camp = await campRes.json()
  const briefRes = await api.post('/api/briefs', {
    topic: 'T18 Not-Applied Test',
    goal: 'Test the not-applied poll field',
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

test.describe('T18 — refine not-applied poll field', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => { await api.dispose() })

  test('notApplied is null by default on a freshly exported draft', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }

    expect(draft.notApplied).toBeNull()
  })

  test('a twice-failed refine surfaces the exact notApplied shape, with a preview', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }
    const baseline = draft.currentRevisionNumber as number | null

    const settled = await refineAndWait(api, draft.id as string, 'darken it __VERIFY_FAIL_ALWAYS__')
    // A not-applied refine is a CLEAN completion — not the crash channel.
    expect(settled.pendingAction).toBeNull()
    expect(settled.pendingActionError).toBeNull()
    // FR-12: the pointer does not move.
    expect(settled.currentRevisionNumber).toBe(baseline)

    const notApplied = settled.notApplied as Record<string, unknown> | null
    expect(notApplied).toBeTruthy()
    expect(Object.keys(notApplied!).sort()).toEqual([
      'instruction',
      'previewUrl',
      'reason',
      'rejectedAt',
      'revisionId',
    ])
    expect(notApplied!.reason).toMatch(/could not be applied/i)
    expect(notApplied!.instruction).toBe('darken it __VERIFY_FAIL_ALWAYS__')
    expect(typeof notApplied!.revisionId).toBe('string')
    expect(notApplied!.previewUrl).toMatch(/^https?:\/\//)
    expect(new Date(notApplied!.rejectedAt as string).toString()).not.toBe('Invalid Date')
  })

  test('previewUrl is null when the rejected attempt left no usable document', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }

    const settled = await refineAndWait(api, draft.id as string, 'reduce it __REFINE_TRUNCATED__')
    const notApplied = settled.notApplied as Record<string, unknown> | null
    expect(notApplied).toBeTruthy()
    expect(notApplied!.previewUrl).toBeNull()
  })

  test('a later successful refine clears notApplied', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }

    const rejected = await refineAndWait(api, draft.id as string, 'darken it __VERIFY_FAIL_ALWAYS__')
    expect(rejected.notApplied).toBeTruthy()

    const succeeded = await refineAndWait(api, draft.id as string, 'Make the background darker')
    expect(succeeded.pendingActionError).toBeNull()
    expect(succeeded.notApplied).toBeNull()
  })

  test('restoring an earlier revision clears notApplied (T17 concern 4)', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }
    const baseline = draft.currentRevisionNumber as number

    const rejected = await refineAndWait(api, draft.id as string, 'darken it __VERIFY_FAIL_ALWAYS__')
    expect(rejected.notApplied).toBeTruthy()

    const restoreRes = await api.post(`/api/drafts/${draft.id}/revisions/${baseline}/restore`, {})
    expect(restoreRes.status()).toBe(200)

    const after = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(after.currentRevisionNumber).toBe(baseline)
    expect(after.notApplied).toBeNull()
  })

  test('a cross-team draft is still a 404 (notApplied leaks nothing extra)', async ({ request }) => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }
    await refineAndWait(api, draft.id as string, 'darken it __VERIFY_FAIL_ALWAYS__')

    const clientx = await loginAs(request, CLIENTX_EMAIL, CLIENTX_PASSWORD, { team: 'ClientX' })
    try {
      const res = await clientx.get(`/api/drafts/${draft.id}`)
      expect(res.status()).toBe(404)
    } finally {
      await clientx.dispose()
    }
  })
})

// T19 (change 004 Phase 2, FR-14a) — POST
// /api/drafts/[id]/rejected/[revisionId]/adopt: "Use anyway" commits a
// twice-failed refine's retained rejected render as a normal chain revision,
// through commitDraftRevision (adoptRejectedRevisionId), reusing the
// rejected row's own stored export (nothing re-renders). Adopt never CLAIMS
// Draft.pendingAction (no DraftAction value fits), but fix round 1 (Minor 1)
// does re-check it atomically inside the same guarded UPDATE that re-checks
// the not-applied pointer — see the route's own header comment. Additional
// seam used here:
//   "__REFINE_REDUCE_NOOP__" — a `remove` whose reply echoes the current
//     document unchanged → structural miss on both attempts → not-applied
//     WITH a stored export (same "with export" shape as __VERIFY_FAIL_ALWAYS__,
//     named here per the task brief).
test.describe('T19 — "Use anyway" adopts a rejected render', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => { await api.dispose() })

  test('adopting commits exactly one new revision, advances the pointer, serves the rejected export, and clears notApplied', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }
    const baseline = draft.currentRevisionNumber as number

    const settled = await refineAndWait(api, draft.id as string, 'reduce it __REFINE_REDUCE_NOOP__')
    const notApplied = settled.notApplied as Record<string, unknown>
    expect(notApplied).toBeTruthy()
    expect(notApplied.previewUrl).toMatch(/^https?:\/\//)

    const revisionsBefore = (await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()) as Array<{
      id: string
    }>

    const adoptRes = await api.post(`/api/drafts/${draft.id}/rejected/${notApplied.revisionId}/adopt`)
    expect(adoptRes.status()).toBe(200)
    const body = await adoptRes.json()
    expect(typeof body.revisionId).toBe('string')
    expect(body.reply).toBeTruthy()
    expect(body.exportUrl).toMatch(/^https?:\/\//)

    const after = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(after.notApplied).toBeNull()
    expect(after.currentRevisionNumber).toBe(baseline + 1)
    // The draft's live export now serves the rejected render's own object —
    // compare the signed URL's PATH, not the whole string (Important 2: two
    // presigned URLs for the same object are never byte-identical).
    expect(urlPath(after.exportUrl)).toBe(urlPath(notApplied.previewUrl as string))
    expect(urlPath(after.exportUrl)).toBe(urlPath(body.exportUrl))

    const revisionsAfter = (await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()) as Array<{
      id: string
      revisionNumber: number
      instruction: string
    }>
    expect(revisionsAfter.length).toBe(revisionsBefore.length + 1)
    const created = revisionsAfter.find((r) => r.id === body.revisionId)
    expect(created).toBeTruthy()
    expect(created!.revisionNumber).toBe(baseline + 1)
    expect(created!.instruction).toMatch(/^Use anyway: /)
  })

  test('a second adopt of the same render is 409 and creates no second revision', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }

    const settled = await refineAndWait(api, draft.id as string, 'reduce it __REFINE_REDUCE_NOOP__')
    const notApplied = settled.notApplied as Record<string, unknown>
    const adoptUrl = `/api/drafts/${draft.id}/rejected/${notApplied.revisionId}/adopt`

    const first = await api.post(adoptUrl)
    expect(first.status()).toBe(200)
    const revisionsAfterFirst = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()

    const second = await api.post(adoptUrl)
    expect(second.status()).toBe(409)

    const revisionsAfterSecond = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()
    expect(revisionsAfterSecond.length).toBe(revisionsAfterFirst.length)
  })

  test('adopt of a truncated not-applied row (no export) is 409', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }

    const settled = await refineAndWait(api, draft.id as string, 'reduce it __REFINE_TRUNCATED__')
    const notApplied = settled.notApplied as Record<string, unknown>
    expect(notApplied.previewUrl).toBeNull()

    const res = await api.post(`/api/drafts/${draft.id}/rejected/${notApplied.revisionId}/adopt`)
    expect(res.status()).toBe(409)
  })

  test('adopt after a restore (the outcome was discarded) is 409', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }
    const baseline = draft.currentRevisionNumber as number

    const settled = await refineAndWait(api, draft.id as string, 'reduce it __REFINE_REDUCE_NOOP__')
    const notApplied = settled.notApplied as Record<string, unknown>

    const restoreRes = await api.post(`/api/drafts/${draft.id}/revisions/${baseline}/restore`)
    expect(restoreRes.status()).toBe(200)

    const res = await api.post(`/api/drafts/${draft.id}/rejected/${notApplied.revisionId}/adopt`)
    expect(res.status()).toBe(409)
  })

  test('a cross-team draft is a 404', async ({ request }) => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }

    const settled = await refineAndWait(api, draft.id as string, 'reduce it __REFINE_REDUCE_NOOP__')
    const notApplied = settled.notApplied as Record<string, unknown>

    const clientx = await loginAs(request, CLIENTX_EMAIL, CLIENTX_PASSWORD, { team: 'ClientX' })
    try {
      const res = await clientx.post(`/api/drafts/${draft.id}/rejected/${notApplied.revisionId}/adopt`)
      expect(res.status()).toBe(404)
    } finally {
      await clientx.dispose()
    }
  })

  // Fix round 1, Important 1: a revisionId that IS real, but belongs to
  // ANOTHER draft (here, on ANOTHER TEAM entirely) must answer exactly like
  // an id that never existed — 404 both times. Before the fix, the row
  // lookup was unscoped (findUnique by id alone) and a mismatched draftId
  // fell through to the 409 "can no longer be adopted" branch instead — a
  // caller who can see any one draft could tell "this id exists elsewhere"
  // (409) apart from "no such id" (404), an existence leak the tenancy rule
  // (cross-team is always 404) forbids.
  test('a real rejected-row id belonging to a DIFFERENT team\'s draft is 404, exactly like an unknown id', async ({
    request,
  }) => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }

    const clientx = await loginAs(request, CLIENTX_EMAIL, CLIENTX_PASSWORD, { team: 'ClientX' })
    try {
      const clientxDraft = await createExportedDraft(clientx)
      if (!clientxDraft) { test.skip(); return }
      const clientxSettled = await refineAndWait(clientx, clientxDraft.id as string, 'reduce it __REFINE_REDUCE_NOOP__')
      const clientxNotApplied = clientxSettled.notApplied as Record<string, unknown>
      expect(clientxNotApplied).toBeTruthy()

      // A real, currently-live, adoptable rejected row — but on ClientX's
      // draft, requested against the admin's (Bistec) draft.
      const crossTeamRes = await api.post(
        `/api/drafts/${draft.id}/rejected/${clientxNotApplied.revisionId}/adopt`,
      )
      expect(crossTeamRes.status()).toBe(404)

      // An id that never existed at all answers the exact same way.
      const unknownRes = await api.post(`/api/drafts/${draft.id}/rejected/does-not-exist-at-all/adopt`)
      expect(unknownRes.status()).toBe(404)
    } finally {
      await clientx.dispose()
    }
  })

  // Fix round 1, Minor 5: two adopts of the SAME rejected row fired at once.
  // The atomic guard inside commitDraftRevision (not any request-ordering)
  // must be what decides the winner — exactly one 200, one 409, and exactly
  // one new chain revision, never two and never zero.
  test('two concurrent adopts of the same render: exactly one 200, one 409, exactly one new revision', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }

    const settled = await refineAndWait(api, draft.id as string, 'reduce it __REFINE_REDUCE_NOOP__')
    const notApplied = settled.notApplied as Record<string, unknown>
    const adoptUrl = `/api/drafts/${draft.id}/rejected/${notApplied.revisionId}/adopt`

    const revisionsBefore = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()

    const [a, b] = await Promise.all([api.post(adoptUrl), api.post(adoptUrl)])
    expect([a.status(), b.status()].sort()).toEqual([200, 409])

    const revisionsAfter = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()
    expect(revisionsAfter.length).toBe(revisionsBefore.length + 1)
  })
})
