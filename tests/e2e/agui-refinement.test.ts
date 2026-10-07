import { test, expect, type Page } from '@playwright/test'
import { loginAs, waitForDraft, waitForAction, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'

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
})

// ── §V — Refine fidelity contract (change 004 Phase 2, T21) ─────────────────
//
// The refine route verifies every edit (drafts/refineAttempt.ts): the reply
// carries its instruction classes, destructive classes need a named
// superseded element, replace/remove/constrain are checked structurally (no
// model call), add spends one Haiku verifier call, a miss retries ONCE, and a
// second miss commits nothing — the render is kept as a rejected DraftRevision
// (revisionNumber NULL, `rejection` diagnostics) and the draft carries the
// not-applied outcome. These cases drive that contract end to end with the
// T20 seams (src/lib/testHooks.ts):
//   mock refine replies  __REFINE_REDUCE_NOOP__ / _REAL__, __REFINE_IMAGE_DUP__ /
//                        _REPLACE__, __REFINE_IMAGE_MOVE_DUP__,
//                        __REFINE_EMPTY_SUPERSEDES__,
//                        __REFINE_MULTI_CLASS__, __REFINE_TOKEN_RENAME__,
//                        __REFINE_TRUNCATED__, modifier __REFINE_FIX_ON_RETRY__
//   forced verify        __VERIFY_PASS__ / _FAIL_ALWAYS__ / _FAIL_ONCE__ /
//                        _UNAVAILABLE__ (short-circuit BEFORE the model hook,
//                        so rejection.verifierCalls is 0 on those paths)
// Diagnostics are read straight from the test DB (tests/helpers/db.ts).
//
// Scope: the mock suite runs DESIGN_PROVIDER=claude-html, so ONLY the API-mode
// refine branch (runDesignAgentRefine) is exercised here. The prod CLI branch
// (runDesignAgentCliRefine) and the Haiku-pinned verifier (AC-20b) are unit-
// covered only — see docs/e2e-test-plan.md §V.
//
// Before-documents that need an image or an inline data: asset are arranged
// through the existing inline-edit route (a normal committed revision), never
// a seam. Every case uses its own draft and a unique instruction tag.

const MOCK_NEW_IMAGE = 'https://mock.invalid/refine-new-image.png' // testHooks.ts
const MOCK_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const FIDELITY_READY = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER) && dbAvailable

const PARAGRAPH =
  'Join us for five days of product demos, customer stories, live workshops and an open question time with the whole team every afternoon.'
// findTextPhrase (testHooks.ts): the first six visible words — what the mock
// remove reply names in supersedes.
const PARAGRAPH_PHRASE = PARAGRAPH.split(' ').slice(0, 6).join(' ')

function doc(inner: string): string {
  return `<!DOCTYPE html>\n<html>\n<head><style>body{margin:0;width:1080px;height:1080px;font-family:Inter,sans-serif}</style></head>\n<body>${inner}</body>\n</html>`
}
const textDoc = () => doc(`<p>${PARAGRAPH}</p>`)
// An "uploaded" image on the public MinIO host (the IMAGES bucket is public-read).
const imageUrlFor = (tag: string) => `http://localhost:9000/images/t21-${tag}-uploaded.png`
const imageDoc = (tag: string) => doc(`<img src="${imageUrlFor(tag)}" alt="Uploaded photo"><p>Autumn open day</p>`)
// Final F1 / C-1: an old background plus an "uploaded" inset — the before-
// document of the reported duplicate (background first, inset second: the
// order __REFINE_IMAGE_MOVE_DUP__ reads them in).
const moveDoc = (oldBg: string, upload: string) =>
  doc(`<div class="bg" style="background-image:url('${oldBg}')"></div><img class="inset" src="${upload}" alt="Uploaded photo"><p>Autumn open day</p>`)
const dataUri = `data:image/png;base64,${MOCK_PNG_B64}`
const dataDoc = () => doc(`<img src="${dataUri}" alt="Inline logo"><p>Inline asset poster</p>`)

function visibleWords(html: string): number {
  const text = html
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text ? text.split(' ').length : 0
}

// Two presigned URLs for one object are never byte-identical (X-Amz-Date):
// compare the object path only.
function urlPath(u: string): string {
  return new URL(u).pathname
}

const uniq = (id: string) => `[${id}-${Date.now()}-${Math.floor(Math.random() * 1e6)}]`

interface Arranged {
  id: string
  pointer: number
  html: string
  committed: number[]
}

interface AttemptDiag {
  attempt: 1 | 2
  document: 'complete' | 'truncated' | 'none'
  classes: string[]
  classificationDefaulted: boolean
  effectiveClasses: string[]
  downgraded: string[]
  supersedes: string[]
  reconcile: { kind: string; missing: string[]; reason?: string }
  verdict: 'pass' | 'miss' | 'unavailable' | 'skipped'
  reasons: string[]
  verifierCalls: number
}

interface Diagnostics {
  version: 1
  refineCalls: number
  verifierCalls: number
  reasons: string[]
  export: 'stored' | 'none' | 'render-failed'
  attempts: AttemptDiag[]
}

async function committedNumbers(draftId: string): Promise<number[]> {
  const rows = await prisma!.draftRevision.findMany({
    where: { draftId, revisionNumber: { not: null } },
    select: { revisionNumber: true },
  })
  return rows.map((r) => r.revisionNumber as number).sort((a, b) => a - b)
}

async function rejectedCount(draftId: string): Promise<number> {
  return prisma!.draftRevision.count({ where: { draftId, rejectedAt: { not: null } } })
}

let fidelityKitId: string | null = null

// An EXPORTED private draft (no campaign — keeps the campaign list small),
// optionally moved onto a specific before-document through inline-edit.
async function fidelityDraft(api: ApiClient, tag: string, beforeHtml?: string): Promise<Arranged> {
  if (!fidelityKitId) {
    const kit = await (
      await api.post('/api/admin/brandkits', { name: `T21 Fidelity Kit ${Date.now()}`, colors: ['#0284c7'] })
    ).json()
    fidelityKitId = kit.id as string
  }
  const brief = await (
    await api.post('/api/briefs', {
      topic: `T21 Fidelity ${tag}`,
      goal: 'Refine fidelity contract',
      tone: 'casual',
      channels: ['INSTAGRAM'],
      designMode: 'GENERATE',
      copyProviderKey: 'cli',
      brandKitId: fidelityKitId,
    })
  ).json()
  const assembleRes = await api.post('/api/generate/assemble-b', { briefId: brief.id })
  expect(assembleRes.status()).toBe(202)
  const { draftId } = await assembleRes.json()
  const generated = await waitForDraft(api, draftId)
  expect(generated.status).toBe('EXPORTED')

  if (beforeHtml) {
    const edit = await api.post(`/api/drafts/${draftId}/inline-edit`, { html: beforeHtml })
    expect(edit.status()).toBe(200)
  }
  const got = await (await api.get(`/api/drafts/${draftId}`)).json()
  if (beforeHtml) expect(got.htmlContent).toBe(beforeHtml)
  return {
    id: draftId,
    pointer: got.currentRevisionNumber as number,
    html: got.htmlContent as string,
    committed: await committedNumbers(draftId),
  }
}

// AC-15, asserted on every rejected row this suite reads.
function expectWithinCaps(d: Diagnostics) {
  expect(d.version).toBe(1)
  expect(d.refineCalls).toBeGreaterThanOrEqual(1)
  expect(d.refineCalls).toBeLessThanOrEqual(2)
  expect(d.verifierCalls).toBeLessThanOrEqual(2)
  expect(d.attempts).toHaveLength(d.refineCalls)
  for (const a of d.attempts) expect(a.verifierCalls).toBeLessThanOrEqual(1)
  expect(d.attempts.reduce((n, a) => n + a.verifierCalls, 0)).toBe(d.verifierCalls)
}

// A refine that must end NOT APPLIED. Asserts the whole FR-12/13/14 outcome and
// returns the poll's notApplied, the rejected row and its diagnostics.
async function refineNotApplied(api: ApiClient, draft: Arranged, instruction: string) {
  const rejectedBefore = await rejectedCount(draft.id)
  const settled = await refineAndWait(api, draft.id, instruction)
  // A clean completion, not the crash channel (AC-18).
  expect(settled.pendingAction).toBeNull()
  expect(settled.pendingActionError).toBeNull()
  // AC-16 / FR-12: pointer, content and chain untouched.
  expect(settled.currentRevisionNumber).toBe(draft.pointer)
  expect(settled.htmlContent).toBe(draft.html)
  expect(await committedNumbers(draft.id)).toEqual(draft.committed)
  // Exactly one rejected row per not-applied refine.
  expect(await rejectedCount(draft.id)).toBe(rejectedBefore + 1)

  const notApplied = settled.notApplied as {
    reason: string
    instruction: string
    revisionId: string
    previewUrl: string | null
  } | null
  expect(notApplied).toBeTruthy()
  expect(notApplied!.instruction).toBe(instruction)
  expect(notApplied!.reason).toMatch(/could not be applied/i)

  // AC-17 / FR-13: the rejected render, labelled, out of the chain.
  const row = await prisma!.draftRevision.findFirst({ where: { id: notApplied!.revisionId, draftId: draft.id } })
  expect(row).toBeTruthy()
  expect(row!.revisionNumber).toBeNull()
  expect(row!.rejectedAt).not.toBeNull()
  expect(row!.instruction).toBe(instruction)
  expect(row!.adoptedAt).toBeNull()
  expect(row!.discardedAt).toBeNull()
  const diag = row!.rejection as unknown as Diagnostics
  expectWithinCaps(diag)
  // Not applied always means the one retry was spent (FR-11).
  expect(diag.refineCalls).toBe(2)
  expect(diag.attempts.map((a) => a.attempt)).toEqual([1, 2])
  // "The verifier's stated miss" is the final attempt's reasons, and the user
  // is shown it.
  expect(diag.reasons).toEqual(diag.attempts[1].reasons)
  expect(diag.reasons.length).toBeGreaterThan(0)
  expect(notApplied!.reason).toContain(diag.reasons[0].slice(0, 40))
  return { notApplied: notApplied!, row: row!, diag }
}

// A refine that must COMMIT. Asserts the pointer advanced by exactly one and no
// rejected row was written.
async function refineCommitted(api: ApiClient, draft: Arranged, instruction: string) {
  const rejectedBefore = await rejectedCount(draft.id)
  const settled = await refineAndWait(api, draft.id, instruction)
  expect(settled.pendingActionError).toBeNull()
  expect(settled.notApplied).toBeNull()
  expect(settled.currentRevisionNumber).toBe(draft.pointer + 1)
  expect(await committedNumbers(draft.id)).toEqual([...draft.committed, draft.pointer + 1])
  expect(await rejectedCount(draft.id)).toBe(rejectedBefore)
  const revisions = (await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()) as Array<{
    revisionNumber: number
    instruction: string
  }>
  expect(revisions.find((r) => r.revisionNumber === draft.pointer + 1)?.instruction).toBe(instruction)
  return settled as Record<string, unknown> & { htmlContent: string }
}

async function pageLogin(page: Page) {
  await page.goto('/login')
  await page.getByPlaceholder('Username').fill(ADMIN_EMAIL)
  await page.getByPlaceholder('Password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => url.pathname === '/' || url.pathname === '/choose-team')
  // Same active-team dance as ui.test.ts (a super admin with two teams seeded).
  await page.goto('/')
  if (page.url().includes('/choose-team')) {
    await page.getByRole('button', { name: 'Bistec' }).click()
    await page.waitForURL((url) => url.pathname === '/')
  }
}

test.describe('§V — refine fidelity contract', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => {
    await api.dispose()
  })

  // TC-FID-01 — REGRESSION "reduce the text" (AC-08, AC-12, AC-16, AC-17).
  // The reported failure: a remove whose output is not measurably shorter was
  // committed anyway. Now it is retried once and ends not applied.
  test('regression: "reduce the text" that is not shorter retries once, then is not applied', async () => {
    if (!FIDELITY_READY()) { test.skip(); return }
    const draft = await fidelityDraft(api, 'reduce-noop', textDoc())
    const instruction = `Reduce the text __REFINE_REDUCE_NOOP__ ${uniq('V01')}`

    const { notApplied, row, diag } = await refineNotApplied(api, draft, instruction)

    for (const a of diag.attempts) {
      expect(a.document).toBe('complete')
      expect(a.classes).toEqual(['remove'])
      expect(a.effectiveClasses).toEqual(['remove'])
      expect(a.downgraded).toEqual([])
      expect(a.supersedes).toEqual([PARAGRAPH_PHRASE])
      expect(a.verdict).toBe('miss')
      expect(a.reasons.some((r) => /^remove: /.test(r))).toBe(true)
    }
    // AC-12: remove is structural — zero verifier model calls.
    expect(diag.verifierCalls).toBe(0)
    // The retained render is the unchanged echo — the evidence it was not shorter.
    expect(visibleWords(row.htmlSnapshot)).toBe(visibleWords(draft.html))
    expect(diag.export).toBe('stored')
    expect(row.exportUrl).toBeTruthy()
    expect(urlPath(notApplied.previewUrl!)).toContain(row.exportUrl!)
  })

  // TC-FID-02 — the real reduction commits and is measurably shorter (AC-08).
  test('a "reduce the text" that really shortens the text commits', async () => {
    if (!FIDELITY_READY()) { test.skip(); return }
    const draft = await fidelityDraft(api, 'reduce-real', textDoc())
    const settled = await refineCommitted(api, draft, `Reduce the text __REFINE_REDUCE_REAL__ ${uniq('V02')}`)
    expect(visibleWords(settled.htmlContent)).toBeLessThan(visibleWords(draft.html))
    expect(settled.htmlContent).not.toContain(PARAGRAPH_PHRASE)
  })

  // TC-FID-03 — one retry (FR-11): attempt 1 is the no-op, attempt 2 fixes it.
  test('a "reduce the text" that is fixed on the retry commits on attempt 2', async () => {
    if (!FIDELITY_READY()) { test.skip(); return }
    const draft = await fidelityDraft(api, 'reduce-retry', textDoc())
    const settled = await refineCommitted(
      api,
      draft,
      `Reduce the text __REFINE_REDUCE_NOOP__ __REFINE_FIX_ON_RETRY__ ${uniq('V03')}`,
    )
    expect(visibleWords(settled.htmlContent)).toBeLessThan(visibleWords(draft.html))
  })

  // TC-FID-04 — REGRESSION "use the uploaded image as the background" (AC-09,
  // AC-12). The reported failure: the new image was added but the old one was
  // kept alongside it. That export must now fail the replace post-condition.
  test('regression: "use the uploaded image as the background" that keeps the old image is not applied', async () => {
    if (!FIDELITY_READY()) { test.skip(); return }
    const tag = `img-dup-${Date.now()}`
    const oldImage = imageUrlFor(tag)
    const draft = await fidelityDraft(api, tag, imageDoc(tag))
    const instruction = `Use the uploaded image as the background __REFINE_IMAGE_DUP__ ${uniq('V04')}`

    const { row, diag } = await refineNotApplied(api, draft, instruction)

    for (const a of diag.attempts) {
      expect(a.classes).toEqual(['replace'])
      expect(a.effectiveClasses).toEqual(['replace'])
      expect(a.supersedes).toEqual([oldImage])
      expect(a.verdict).toBe('miss')
      expect(a.reasons.some((r) => /^replace: .*still present/.test(r))).toBe(true)
    }
    expect(diag.verifierCalls).toBe(0)
    // The rejected render IS the reported duplicate: old and new image together.
    expect(row.htmlSnapshot).toContain(oldImage)
    expect(row.htmlSnapshot).toContain(MOCK_NEW_IMAGE)
    // …and none of it reached the live design.
    const live = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(live.htmlContent).toContain(oldImage)
    expect(live.htmlContent).not.toContain(MOCK_NEW_IMAGE)
  })

  // TC-FID-05 — the clean replace commits with the superseded image absent (AC-09).
  test('"use the uploaded image as the background" that drops the old image commits', async () => {
    if (!FIDELITY_READY()) { test.skip(); return }
    const tag = `img-replace-${Date.now()}`
    const draft = await fidelityDraft(api, tag, imageDoc(tag))
    const settled = await refineCommitted(
      api,
      draft,
      `Use the uploaded image as the background __REFINE_IMAGE_REPLACE__ ${uniq('V05')}`,
    )
    expect(settled.htmlContent).not.toContain(imageUrlFor(tag))
    expect(settled.htmlContent).toContain(MOCK_NEW_IMAGE)
  })

  // TC-FID-05b — REGRESSION, the REPORTED duplicate shape (AC-09, final F1 /
  // C-1). "The uploaded image" is an image already in the design (an inset);
  // the reply applies it as the background AND keeps the inset, with
  // supersedes naming the old background — which IS gone. The old check
  // certified this; the image-multiplicity rule (upload 1 → 2) misses it.
  test('regression: the inset image applied as the background AND kept as the inset is not applied', async () => {
    if (!FIDELITY_READY()) { test.skip(); return }
    const tag = `img-move-dup-${Date.now()}`
    const oldBg = `http://localhost:9000/images/t21-${tag}-old-bg.png`
    const upload = imageUrlFor(tag)
    const draft = await fidelityDraft(api, tag, moveDoc(oldBg, upload))
    const instruction = `Use the uploaded image as the background __REFINE_IMAGE_MOVE_DUP__ ${uniq('V05b')}`

    const { row, diag } = await refineNotApplied(api, draft, instruction)

    for (const a of diag.attempts) {
      expect(a.classes).toEqual(['replace'])
      expect(a.effectiveClasses).toEqual(['replace'])
      expect(a.supersedes).toEqual([oldBg])
      expect(a.verdict).toBe('miss')
      expect(a.reasons.some((r) => /^replace: .*appears more often/.test(r))).toBe(true)
    }
    expect(diag.verifierCalls).toBe(0)
    // The rejected render IS the reported duplicate: the old background gone,
    // the upload twice (background + inset).
    expect(row.htmlSnapshot).not.toContain(oldBg)
    expect(row.htmlSnapshot.split(upload).length - 1).toBe(2)
    const live = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(live.htmlContent).toBe(draft.html)
  })

  // TC-FID-05c — the correct move commits (AC-09): upload as the background,
  // inset gone — reached on the retry.
  test('the inset image moved to the background (inset gone) commits on the retry', async () => {
    if (!FIDELITY_READY()) { test.skip(); return }
    const tag = `img-move-${Date.now()}`
    const oldBg = `http://localhost:9000/images/t21-${tag}-old-bg.png`
    const upload = imageUrlFor(tag)
    const draft = await fidelityDraft(api, tag, moveDoc(oldBg, upload))
    const settled = await refineCommitted(
      api,
      draft,
      `Use the uploaded image as the background __REFINE_IMAGE_MOVE_DUP__ __REFINE_FIX_ON_RETRY__ ${uniq('V05c')}`,
    )
    expect(settled.htmlContent).not.toContain(oldBg)
    expect(settled.htmlContent.split(upload).length - 1).toBe(1)
  })

  // TC-FID-06 — AC-10: a destructive class with empty supersedes deletes
  // nothing. The mock reply wipes the document; the route downgrades replace to
  // the preserving class, counts it a miss, and never lets the wipe land.
  test('a replace with empty supersedes is downgraded, never verified, and deletes nothing', async () => {
    if (!FIDELITY_READY()) { test.skip(); return }
    const tag = `empty-sup-${Date.now()}`
    const draft = await fidelityDraft(api, tag, imageDoc(tag))
    const instruction = `Swap the background __REFINE_EMPTY_SUPERSEDES__ ${uniq('V06')}`

    const { diag } = await refineNotApplied(api, draft, instruction)

    for (const a of diag.attempts) {
      expect(a.classes).toEqual(['replace'])
      expect(a.effectiveClasses).toEqual(['add'])
      expect(a.downgraded).toEqual(['replace'])
      expect(a.supersedes).toEqual([])
      expect(a.verdict).toBe('skipped')
      expect(a.verifierCalls).toBe(0)
      expect(a.reasons.some((r) => /^replace: supersedes was empty/.test(r))).toBe(true)
    }
    const live = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(live.htmlContent).toContain(imageUrlFor(tag))
    expect(live.htmlContent).not.toContain('Mock empty-supersedes')
  })

  // TC-FID-07 — AC-11: a multi-clause reply (replace + add) commits only when
  // every class passes: the replace structurally, the add through the verifier.
  test('a multi-class refine commits when every returned class passes', async () => {
    if (!FIDELITY_READY()) { test.skip(); return }
    const tag = `multi-pass-${Date.now()}`
    const draft = await fidelityDraft(api, tag, imageDoc(tag))
    const settled = await refineCommitted(
      api,
      draft,
      `Use the uploaded image as the background and add a tagline __REFINE_MULTI_CLASS__ ${uniq('V07')}`,
    )
    expect(settled.htmlContent).not.toContain(imageUrlFor(tag))
  })

  // TC-FID-08 — AC-11 + AC-12: every class is verified, so a failing replace
  // half fails the whole refine even though the add half would pass — and the
  // add verifier call is not spent once a structural check has missed.
  test('a multi-class refine whose replace half misses is not applied, with no verifier call', async () => {
    if (!FIDELITY_READY()) { test.skip(); return }
    // The default mock design has no image, so the replace names one that is
    // not in the current document.
    const draft = await fidelityDraft(api, 'multi-miss')
    const { diag } = await refineNotApplied(
      api,
      draft,
      `Use the uploaded image as the background and add a tagline __REFINE_MULTI_CLASS__ ${uniq('V08')}`,
    )
    for (const a of diag.attempts) {
      expect(a.classes).toEqual(['replace', 'add'])
      expect(a.effectiveClasses).toEqual(['replace', 'add'])
      expect(a.verdict).toBe('miss')
      expect(a.reasons.some((r) => /^replace: /.test(r))).toBe(true)
    }
    expect(diag.verifierCalls).toBe(0)
  })

  // TC-FID-09 — an add refine commits once the verifier passes it; an add
  // FORCED to miss (__VERIFY_FAIL_ALWAYS__, which short-circuits before the
  // model hook — hence verifierCalls 0) is not applied. The real verifier-call
  // path, with its per-attempt count, is TC-FID-16 (AC-13).
  test('an add refine commits on a verifier pass; an add missed twice is not applied', async () => {
    if (!FIDELITY_READY()) { test.skip(); return }
    const draft = await fidelityDraft(api, 'add')
    await refineCommitted(api, draft, `Include a human character ${uniq('V09a')}`)
    const after = { ...draft, pointer: draft.pointer + 1, committed: [...draft.committed, draft.pointer + 1] }
    after.html = (await (await api.get(`/api/drafts/${draft.id}`)).json()).htmlContent

    const { diag } = await refineNotApplied(api, after, `Include a human character __VERIFY_FAIL_ALWAYS__ ${uniq('V09b')}`)
    for (const a of diag.attempts) {
      // A bare document (no envelope header) defaults to the preserving class.
      expect(a.classes).toEqual(['add'])
      expect(a.classificationDefaulted).toBe(true)
      expect(a.verdict).toBe('miss')
    }
    expect(diag.verifierCalls).toBe(0)
  })

  // TC-FID-10 — AC-14 / FR-10: an unavailable verifier is a miss, not a pass.
  // A miss-then-pass (__VERIFY_FAIL_ONCE__) on the same draft commits, so the
  // not-applied outcome is attributable to "unavailable" alone.
  test('an unavailable verifier fails closed; a miss then a pass commits on the retry', async () => {
    if (!FIDELITY_READY()) { test.skip(); return }
    const draft = await fidelityDraft(api, 'unavailable')
    const { diag } = await refineNotApplied(api, draft, `Darken the background __VERIFY_UNAVAILABLE__ ${uniq('V10a')}`)
    for (const a of diag.attempts) {
      expect(a.verdict).toBe('unavailable')
      expect(a.reasons.some((r) => /^verification unavailable \(treated as a miss\)/.test(r))).toBe(true)
    }

    const settled = await refineCommitted(api, draft, `Darken the background __VERIFY_FAIL_ONCE__ ${uniq('V10b')}`)
    expect(settled.notApplied).toBeNull()
  })

  // TC-FID-11 — AC-07 / AC-05 (FR-20): a renamed __INLINE_ASSET_n__ token is not
  // reconcilable — not applied, never verified, no usable render to preview.
  // The same reply with the token intact on the retry reconciles clean and
  // commits with the original data: URI restored.
  test('a renamed inline-asset token is not applied; an intact one commits with the asset restored', async () => {
    if (!FIDELITY_READY()) { test.skip(); return }
    const draft = await fidelityDraft(api, 'token', dataDoc())
    expect(draft.html).toContain(dataUri)

    const { notApplied, row, diag } = await refineNotApplied(
      api,
      draft,
      `Tighten the spacing __REFINE_TOKEN_RENAME__ ${uniq('V11a')}`,
    )
    for (const a of diag.attempts) {
      expect(a.document).toBe('complete')
      expect(a.reconcile.kind).toBe('mismatch')
      expect(a.verdict).toBe('skipped')
      expect(a.verifierCalls).toBe(0)
    }
    expect(diag.export).toBe('none')
    expect(row.exportUrl).toBeNull()
    expect(notApplied.previewUrl).toBeNull()
    // The live design still carries the asset.
    expect((await (await api.get(`/api/drafts/${draft.id}`)).json()).htmlContent).toContain(dataUri)

    const settled = await refineCommitted(
      api,
      draft,
      `Tighten the spacing __REFINE_TOKEN_RENAME__ __REFINE_FIX_ON_RETRY__ ${uniq('V11b')}`,
    )
    expect(settled.htmlContent).toContain(dataUri)
    expect(settled.htmlContent).not.toContain('__INLINE_ASSET_')
  })

  // TC-FID-12 — truncation rule: a reply cut off before </html> is never
  // rendered or verified; there is nothing to preview or adopt.
  test('a truncated reply is not applied with no render', async () => {
    if (!FIDELITY_READY()) { test.skip(); return }
    const draft = await fidelityDraft(api, 'truncated')
    const { notApplied, row, diag } = await refineNotApplied(
      api,
      draft,
      `Add a footer __REFINE_TRUNCATED__ ${uniq('V12')}`,
    )
    for (const a of diag.attempts) {
      expect(a.document).toBe('truncated')
      expect(a.verdict).toBe('skipped')
    }
    expect(diag.verifierCalls).toBe(0)
    expect(diag.export).toBe('none')
    expect(row.exportUrl).toBeNull()
    expect(row.htmlSnapshot).not.toMatch(/<\/html>/i)
    expect(notApplied.previewUrl).toBeNull()
  })

  // TC-FID-13 — AC-15 + AC-16 across inputs: every failure kind, fired in turn
  // at one draft, spends exactly 2 refine calls and at most 2 verifier calls,
  // writes exactly one rejected row, supersedes (discards) the previous one,
  // and never moves the pointer or the chain.
  test('every failure kind stays within 2 refine + 2 verifier calls and never commits', async () => {
    if (!FIDELITY_READY()) { test.skip(); return }
    const tag = `caps-${Date.now()}`
    const draft = await fidelityDraft(api, tag, imageDoc(tag))
    const sentinels = [
      '__REFINE_REDUCE_NOOP__',
      '__REFINE_IMAGE_DUP__',
      '__REFINE_EMPTY_SUPERSEDES__',
      '__REFINE_TRUNCATED__',
      '__VERIFY_FAIL_ALWAYS__',
      '__VERIFY_UNAVAILABLE__',
    ]
    let previous: string | null = null
    for (const [i, s] of sentinels.entries()) {
      const { notApplied } = await refineNotApplied(api, draft, `Edit ${s} ${uniq(`V13-${i}`)}`)
      if (previous) {
        const old = await prisma!.draftRevision.findUnique({ where: { id: previous } })
        expect(old?.discardedAt).not.toBeNull()
      }
      previous = notApplied.revisionId
    }
    const rows = await prisma!.draftRevision.findMany({ where: { draftId: draft.id, rejectedAt: { not: null } } })
    expect(rows).toHaveLength(sentinels.length)
    for (const r of rows) expectWithinCaps(r.rejection as unknown as Diagnostics)
  })

  // TC-FID-14 — AC-20 smoke: regenerate-design and regenerate-copy keep their
  // 202 {ok:true} contract and acquire no verification or not-applied outcome
  // (§Q's TC-ASYNC-01/02 cover them in full).
  test('regenerate-design and regenerate-copy are unchanged: 202 {ok:true}, no verification outcome', async () => {
    if (!FIDELITY_READY()) { test.skip(); return }
    const draft = await fidelityDraft(api, 'regen')

    const design = await api.post(`/api/drafts/${draft.id}/regenerate-design`, {})
    expect(design.status()).toBe(202)
    expect(await design.json()).toEqual({ ok: true })
    const afterDesign = await waitForAction(api, draft.id)
    expect(afterDesign.pendingActionError).toBeNull()
    expect(afterDesign.notApplied).toBeNull()
    expect(afterDesign.currentRevisionNumber).toBe(draft.pointer + 1)

    const copy = await api.post(`/api/drafts/${draft.id}/regenerate-copy`, {})
    expect(copy.status()).toBe(202)
    expect(await copy.json()).toEqual({ ok: true })
    const afterCopy = await waitForAction(api, draft.id)
    expect(afterCopy.pendingActionError).toBeNull()
    expect(afterCopy.notApplied).toBeNull()
    expect(afterCopy.currentRevisionNumber).toBe(draft.pointer + 1)

    expect(await rejectedCount(draft.id)).toBe(0)
  })

  // TC-FID-15 — AC-18 + AC-20a in the browser: the not-applied outcome is a
  // hard failure (role="alert") with a preview of the rejected render and a
  // "Use anyway" action; choosing it commits exactly one revision whose image
  // is the rejected render and clears the failure. (The 409-on-second-adopt
  // half of AC-20a is T19's API case in refine-not-applied.test.ts.)
  test('the UI shows the not-applied failure with a preview, and "Use anyway" adopts it', async ({ page }) => {
    if (!FIDELITY_READY()) { test.skip(); return }
    const draft = await fidelityDraft(api, 'ui', textDoc())
    const instruction = `Reduce the text __REFINE_REDUCE_NOOP__ ${uniq('V15')}`
    const { notApplied } = await refineNotApplied(api, draft, instruction)

    await pageLogin(page)
    await page.goto(`/drafts/${draft.id}`)
    const alert = page.getByRole('alert').filter({ hasText: /Couldn.t apply/ })
    await expect(alert).toBeVisible({ timeout: 20_000 })
    await expect(alert).toContainText(instruction)
    const preview = alert.getByRole('img', { name: 'What the model produced — not applied to your design' })
    await expect(preview).toBeVisible()
    await expect
      .poll(async () => preview.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 15_000 })
      .toBeGreaterThan(0)

    await alert.getByRole('button', { name: 'Use anyway' }).click()
    await expect
      .poll(async () => (await (await api.get(`/api/drafts/${draft.id}`)).json()).currentRevisionNumber, {
        timeout: 15_000,
      })
      .toBe(draft.pointer + 1)
    await expect(alert).toBeHidden({ timeout: 15_000 })

    const after = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(after.notApplied).toBeNull()
    expect(urlPath(after.exportUrl)).toBe(urlPath(notApplied.previewUrl!))
    expect(await committedNumbers(draft.id)).toEqual([...draft.committed, draft.pointer + 1])
    const adopted = await prisma!.draftRevision.findUnique({ where: { id: notApplied.revisionId } })
    expect(adopted?.adoptedAt).not.toBeNull()
    expect(adopted?.adoptedRevisionNumber).toBe(draft.pointer + 1)
  })

  // TC-FID-16 — AC-13 over HTTP: an add whose element is absent after the
  // retry is not applied, having spent exactly ONE real verifier call per
  // attempt. __VERIFIER_SAYS_NO__ makes the mock verifier MODEL answer a
  // well-formed {"applied": false} — not a forced outcome — so the calls are
  // counted and the verdict goes through the real parser.
  test('an add the verifier finds absent is retried once, then not applied — one verifier call per attempt', async () => {
    if (!FIDELITY_READY()) { test.skip(); return }
    const draft = await fidelityDraft(api, 'add-says-no')
    const { diag } = await refineNotApplied(
      api,
      draft,
      `Include a human character __VERIFIER_SAYS_NO__ ${uniq('V16')}`,
    )
    expect(diag.refineCalls).toBe(2)
    expect(diag.verifierCalls).toBe(2)
    for (const a of diag.attempts) {
      expect(a.effectiveClasses).toEqual(['add'])
      expect(a.verifierCalls).toBe(1)
      expect(a.verdict).toBe('miss')
      expect(a.reasons.some((r) => /^add: Mock verifier: the requested element is absent/.test(r))).toBe(true)
    }
  })

  // TC-FID-17 — AC-14 over HTTP: an unparseable or an empty verifier reply is
  // unavailable — treated as a miss, never a pass — after a real call on each
  // attempt (the reply seam, not the forced-outcome seam).
  for (const [sentinel, reason] of [
    ['__VERIFIER_GARBAGE__', 'verifier response was not a valid verdict'],
    ['__VERIFIER_EMPTY__', 'verifier returned an empty response'],
  ] as const) {
    test(`an ${sentinel === '__VERIFIER_EMPTY__' ? 'empty' : 'unparseable'} verifier reply is unavailable on both attempts, then not applied`, async () => {
      if (!FIDELITY_READY()) { test.skip(); return }
      const draft = await fidelityDraft(api, `add-${sentinel}`)
      const { diag } = await refineNotApplied(api, draft, `Include a human character ${sentinel} ${uniq('V17')}`)
      expect(diag.refineCalls).toBe(2)
      expect(diag.verifierCalls).toBe(2)
      for (const a of diag.attempts) {
        expect(a.verifierCalls).toBe(1)
        expect(a.verdict).toBe('unavailable')
        expect(a.reasons).toEqual([`verification unavailable (treated as a miss): ${reason}`])
      }
    })
  }
})
