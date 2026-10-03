import { test, expect } from '@playwright/test'
import { loginAs, waitForDraft, waitForAction, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'

// §U — Rejected refine renders stay out of the revision chain (change 004
// Phase 2, T15/T16 — FR-12/13/14).
//
// A refine that fails verification twice will keep its render as a
// DraftRevision with NO revisionNumber and a rejectedAt stamp (FR-13), and the
// draft carries notAppliedReason/notAppliedRevisionId. T17 writes those rows;
// these cases seed one directly in the test DB so every consumer of the chain
// can be proven blind to it before that writer exists:
//   - GET /revisions (version-switch list) never lists it
//   - GET /api/drafts/[id] revisionCount/pointer/status ignore it (recovery)
//   - restore (= Undo) can't reach it: by row id → 400, by number → 404
//   - next-number allocation skips it: refine / regenerate-design / inline-edit
//     keep the chain contiguous and never collide with it
//   - the DB itself rejects a numbered rejected row and a committed row
//     carrying rejection diagnostics (FR-02)
//   - the admin hard-delete still removes a draft that has one
//
// Needs MOCK_AI + MOCK_PUPPETEER (deterministic generation) and test-DB access.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'

const REJECTED_INSTRUCTION = 'REJECTED: make the logo three times bigger'
const REJECTED_HTML = '<!doctype html><html><body>REJECTED RENDER — must never go live</body></html>'

async function createExportedDraft(api: ApiClient, topic: string) {
  const kit = await (
    await api.post('/api/admin/brandkits', { name: `Rejected Rev Kit ${topic}`, colors: ['#0284c7'] })
  ).json()
  const camp = await (
    await api.post('/api/campaigns', { name: `Rejected Rev Camp ${topic}`, brandKitId: kit.id })
  ).json()
  const brief = await (
    await api.post('/api/briefs', {
      topic,
      goal: 'g',
      tone: 'professional',
      channels: ['INSTAGRAM'],
      designMode: 'GENERATE',
      copyProviderKey: 'cli',
      campaignId: camp.id,
    })
  ).json()
  const assembleRes = await api.post('/api/generate/assemble-b', { briefId: brief.id })
  expect(assembleRes.status()).toBe(202)
  const { draftId } = await assembleRes.json()
  const draft = await waitForDraft(api, draftId)
  expect(draft.status).toBe('EXPORTED')
  expect(draft.currentRevisionNumber).toBe(1)
  return draft as Record<string, unknown> & { id: string }
}

// What T17 will write on a twice-failed refine: an unnumbered rejected row plus
// the draft's not-applied outcome. Pointer, status and content are untouched.
async function seedRejected(draftId: string) {
  const row = await prisma!.draftRevision.create({
    data: {
      draftId,
      revisionNumber: null,
      rejectedAt: new Date(),
      instruction: REJECTED_INSTRUCTION,
      htmlSnapshot: REJECTED_HTML,
      exportUrl: `exports/rejected-${draftId}.png`,
      rejection: { classes: ['resize'], miss: 'logo width unchanged (verifier)' },
    },
  })
  await prisma!.draft.update({
    where: { id: draftId },
    data: { notAppliedReason: 'logo width unchanged', notAppliedRevisionId: row.id },
  })
  return row
}

type Rev = { id: string; revisionNumber: number; instruction: string }

async function listRevisions(api: ApiClient, draftId: string): Promise<Rev[]> {
  const res = await api.get(`/api/drafts/${draftId}/revisions`)
  expect(res.status()).toBe(200)
  return res.json()
}

test.describe('§U — rejected revisions stay out of the chain', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => {
    await api.dispose()
  })

  // TC-REJ-01 — list, draft GET (count / pointer / recovery) and restore/Undo.
  test('a rejected row is absent from the list, the count, and restore', async () => {
    if (!MOCKED() || !dbAvailable) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Rejected List ${Date.now()}`)
    const rejected = await seedRejected(draft.id)

    // Version-switch list: only v1.
    const revisions = await listRevisions(api, draft.id)
    expect(revisions.map((r) => r.revisionNumber)).toEqual([1])
    expect(revisions.some((r) => r.id === rejected.id)).toBe(false)
    expect(revisions.some((r) => r.instruction === REJECTED_INSTRUCTION)).toBe(false)

    // Draft GET: count is the chain only; pointer, status and content untouched;
    // the lazy recovery neither heals, fails nor errors on it.
    const got = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(got.revisionCount).toBe(1)
    expect(got.currentRevisionNumber).toBe(1)
    expect(got.status).toBe('EXPORTED')
    expect(got.failureReason).toBeNull()
    expect(got.pendingActionError).toBeNull()
    expect(got.htmlContent).not.toContain('REJECTED RENDER')

    // Restore (which is also Undo's path): the rejected row is unaddressable.
    const byId = await api.post(`/api/drafts/${draft.id}/revisions/${rejected.id}/restore`, {})
    expect(byId.status()).toBe(400)
    const byNextNumber = await api.post(`/api/drafts/${draft.id}/revisions/2/restore`, {})
    expect(byNextNumber.status()).toBe(404)
    const byZero = await api.post(`/api/drafts/${draft.id}/revisions/0/restore`, {})
    expect(byZero.status()).toBe(404)

    // Restoring the real v1 still works and never lands the rejected render.
    const ok = await api.post(`/api/drafts/${draft.id}/revisions/1/restore`, {})
    expect(ok.status()).toBe(200)
    const after = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(after.currentRevisionNumber).toBe(1)
    expect(after.htmlContent).not.toContain('REJECTED RENDER')

    // The rejected row itself is untouched and still retrievable (FR-13).
    const row = await prisma!.draftRevision.findUnique({ where: { id: rejected.id } })
    expect(row).toMatchObject({ revisionNumber: null, instruction: REJECTED_INSTRUCTION })
    expect(row?.rejectedAt).not.toBeNull()
    expect(row?.rejection).toEqual({ classes: ['resize'], miss: 'logo width unchanged (verifier)' })
  })

  // TC-REJ-02 — next-number allocation across every writer that uses it.
  test('refine, regenerate-design and inline-edit number past a rejected row contiguously', async () => {
    if (!MOCKED() || !dbAvailable) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Rejected Next ${Date.now()}`)
    const rejected = await seedRejected(draft.id)

    // refine → commitDraftRevision → withNextRevisionNumber
    const refine = await api.post(`/api/drafts/${draft.id}/refine`, { instruction: 'Make the background darker' })
    expect(refine.status()).toBe(202)
    const afterRefine = await waitForAction(api, draft.id)
    expect(afterRefine.pendingActionError).toBeNull()
    expect(afterRefine.currentRevisionNumber).toBe(2)

    // A second rejected row in between must not shift numbering either.
    await seedRejected(draft.id)

    // regenerate-design → withNextRevisionNumber (AC-20: behaviour unchanged)
    const regen = await api.post(`/api/drafts/${draft.id}/regenerate-design`, {})
    expect(regen.status()).toBe(202)
    const afterRegen = await waitForAction(api, draft.id)
    expect(afterRegen.pendingActionError).toBeNull()
    expect(afterRegen.currentRevisionNumber).toBe(3)

    // inline-edit → commitDraftRevision (synchronous)
    const edit = await api.post(`/api/drafts/${draft.id}/inline-edit`, {
      html: '<!doctype html><html><body style="width:1080px;height:1080px">Inline edited</body></html>',
    })
    expect(edit.status()).toBe(200)

    const revisions = await listRevisions(api, draft.id)
    expect(revisions.map((r) => r.revisionNumber)).toEqual([4, 3, 2, 1])
    expect(revisions.some((r) => r.instruction === REJECTED_INSTRUCTION)).toBe(false)

    const got = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(got.currentRevisionNumber).toBe(4)
    expect(got.revisionCount).toBe(4)

    // Undo back to the refine result (the client restores the number it
    // captured) — lands v2, never the rejected render.
    const undo = await api.post(`/api/drafts/${draft.id}/revisions/2/restore`, {})
    expect(undo.status()).toBe(200)
    const undone = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(undone.currentRevisionNumber).toBe(2)
    expect(undone.htmlContent).not.toContain('REJECTED RENDER')

    // DB truth: committed numbers 1..4 exactly, both rejected rows still unnumbered.
    const rows = await prisma!.draftRevision.findMany({ where: { draftId: draft.id } })
    const numbers = rows
      .map((r) => r.revisionNumber)
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b)
    expect(numbers).toEqual([1, 2, 3, 4])
    const unnumbered = rows.filter((r) => r.revisionNumber === null)
    expect(unnumbered).toHaveLength(2)
    expect(unnumbered.every((r) => r.rejectedAt !== null)).toBe(true)
    expect(rows.find((r) => r.id === rejected.id)?.adoptedAt).toBeNull()
  })

  // TC-REJ-03 — the invariant is enforced by the database, not just by callers.
  test('the DB rejects a numbered rejected row and a committed row with rejection data', async () => {
    if (!MOCKED() || !dbAvailable) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Rejected Check ${Date.now()}`)

    // Rejected but numbered → CHECK violation.
    await expect(
      prisma!.draftRevision.create({
        data: {
          draftId: draft.id,
          revisionNumber: 2,
          rejectedAt: new Date(),
          instruction: 'x',
          htmlSnapshot: '<html></html>',
        },
      }),
    ).rejects.toThrow(/DraftRevision_rejected_iff_unnumbered/)

    // Unnumbered but not rejected → CHECK violation.
    await expect(
      prisma!.draftRevision.create({
        data: { draftId: draft.id, revisionNumber: null, instruction: 'x', htmlSnapshot: '<html></html>' },
      }),
    ).rejects.toThrow(/DraftRevision_rejected_iff_unnumbered/)

    // A committed row never carries classes / verifier output (FR-02).
    await expect(
      prisma!.draftRevision.create({
        data: {
          draftId: draft.id,
          revisionNumber: 2,
          instruction: 'x',
          htmlSnapshot: '<html></html>',
          rejection: { classes: ['recolor'] },
        },
      }),
    ).rejects.toThrow(/DraftRevision_rejection_fields_only_when_rejected/)

    // Adoption bookkeeping is all-or-nothing.
    await expect(
      prisma!.draftRevision.create({
        data: {
          draftId: draft.id,
          revisionNumber: null,
          rejectedAt: new Date(),
          adoptedAt: new Date(),
          instruction: 'x',
          htmlSnapshot: '<html></html>',
        },
      }),
    ).rejects.toThrow(/DraftRevision_adoption_complete/)

    // Any number of rejected rows coexist under @@unique([draftId, revisionNumber]).
    await seedRejected(draft.id)
    await seedRejected(draft.id)
    const count = await prisma!.draftRevision.count({ where: { draftId: draft.id, revisionNumber: null } })
    expect(count).toBe(2)
    expect(await listRevisions(api, draft.id)).toHaveLength(1)
  })

  // TC-REJ-04 — the admin hard-delete removes a draft that has a rejected row
  // referenced by notAppliedRevisionId (FK is ON DELETE SET NULL).
  test('deleting a draft with a rejected render succeeds and removes every row', async () => {
    if (!MOCKED() || !dbAvailable) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Rejected Delete ${Date.now()}`)
    await seedRejected(draft.id)

    const res = await api.del(`/api/drafts/${draft.id}`)
    expect(res.status()).toBe(200)
    expect(await prisma!.draftRevision.count({ where: { draftId: draft.id } })).toBe(0)
    expect(await prisma!.draft.findUnique({ where: { id: draft.id } })).toBeNull()
  })
})
