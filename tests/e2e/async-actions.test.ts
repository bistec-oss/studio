import { test, expect } from '@playwright/test'
import { loginAs, waitForDraft, waitForAction, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'

// §Q — Async draft actions (regenerate design / regenerate copy / refine).
//
// Contract (feature/async-draft-actions — the F1 pattern applied to actions):
//   POST /api/drafts/[id]/regenerate-design | regenerate-copy | refine
//     → all validation SYNCHRONOUS (404/403, 400 NOT_PATH_B, 400 'instruction
//       is required', 422 NO_BRAND_KIT/COPY_ERROR, regenerate-copy 409 unless
//       status EXPORTED/PUBLISHED — legacy shapes unchanged)
//     → atomic claim of Draft.pendingAction; a second action while one is in
//       flight → 409 {error:'Another action is already running on this draft'}
//     → 202 {ok:true}; the model work runs in-process in the background.
//   GET /api/drafts/[id] → pendingAction (enum|null), pendingActionError
//     (string|null), conflict ({conflictId,explanation}|null — NEVER pendingHtml).
//   Success clears pendingAction; failure clears it AND sets pendingActionError,
//   leaving the previous content intact. A stale claim (updatedAt > 15 min) is
//   swept lazily on GET. Restore during a pendingAction → 409. The refine
//   Override path stays synchronous ({reply,revisionId,exportUrl}).
//
// Deterministic seams (MOCK_AI + MOCK_PUPPETEER):
//   - "__FAIL_GEN_ALWAYS__" in the design-agent user message throws
//     (testHooks.shouldMockGenerateFail). Refine puts the INSTRUCTION in the
//     user message; regenerate-design puts the BRIEF TOPIC there — the topic is
//     rewritten in the test DB after a successful first generation.
//   - "conflict_test" in a refine instruction returns a brand-kit conflict.
// DB-dependent cases (direct pendingAction seeding / updatedAt rewind / topic
// rewrite) skip without test-DB access, like the other suites using helpers/db.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'

const IN_FLIGHT_409 = 'Another action is already running on this draft'

// Presigned export URLs re-sign on every GET — compare the stable object path.
const urlPath = (u: unknown) => String(u ?? '').split('?')[0]

async function createExportedDraft(api: ApiClient, topic: string) {
  const kit = await (await api.post('/api/admin/brandkits', { name: `Async Actions Kit ${topic}`, colors: ['#0284c7'] })).json()
  const camp = await (await api.post('/api/campaigns', { name: `Async Actions Camp ${topic}`, brandKitId: kit.id })).json()
  const brief = await (await api.post('/api/briefs', {
    topic, goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
    designMode: 'GENERATE', copyProviderKey: 'cli', campaignId: camp.id,
  })).json()
  const assembleRes = await api.post('/api/generate/assemble-b', { briefId: brief.id })
  expect(assembleRes.status()).toBe(202)
  const { draftId } = await assembleRes.json()
  const draft = await waitForDraft(api, draftId)
  expect(draft.status).toBe('EXPORTED')
  return draft
}

test.describe('§Q — async draft actions', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => { await api.dispose() })

  // TC-ASYNC-01 — regenerate-design: 202 → poll → new revision, pointer advanced.
  test('regenerate-design returns 202 and the new design lands via poll', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await createExportedDraft(api, `Async RD ${Date.now()}`)
    expect(draft.currentRevisionNumber).toBe(1) // v1 "Original design" (F2)

    const res = await api.post(`/api/drafts/${draft.id}/regenerate-design`, {})
    expect(res.status()).toBe(202)
    expect(await res.json()).toEqual({ ok: true })

    const done = await waitForAction(api, draft.id as string)
    expect(done.pendingAction).toBeNull()
    expect(done.pendingActionError).toBeNull()
    expect(done.status).toBe('EXPORTED')
    // The new design is appended as a revision and becomes current.
    expect(done.currentRevisionNumber).toBe(2)
    expect(done.exportUrl).toMatch(/^https?:\/\//)

    const revisions = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()
    expect(revisions.some((r: { instruction: string }) => r.instruction === 'Regenerated design')).toBe(true)
  })

  // TC-ASYNC-02 — regenerate-copy: 202 → poll → copy refreshed, design untouched.
  test('regenerate-copy returns 202; poll completes with the design untouched', async () => {
    if (!MOCKED()) { test.skip(); return }
    const topic = `Async RC ${Date.now()}`
    const draft = await createExportedDraft(api, topic)
    const beforeHtml = draft.htmlContent
    const beforeExportPath = urlPath(draft.exportUrl)

    const res = await api.post(`/api/drafts/${draft.id}/regenerate-copy`, {})
    expect(res.status()).toBe(202)
    expect(await res.json()).toEqual({ ok: true })

    const done = await waitForAction(api, draft.id as string)
    expect(done.pendingAction).toBeNull()
    expect(done.pendingActionError).toBeNull()
    // The mock copy provider embeds the topic — the copy was (re)generated.
    expect(done.copyText).toContain(topic)
    // Copy and design regenerate independently: no new revision, same design,
    // and status is NOT flipped (the old EXPORTED→IN_PROGRESS behavior is gone).
    expect(done.status).toBe('EXPORTED')
    expect(done.currentRevisionNumber).toBe(1)
    expect(done.htmlContent).toBe(beforeHtml)
    expect(urlPath(done.exportUrl)).toBe(beforeExportPath)
  })

  // TC-ASYNC-03 — refine: 202 → poll → revision appended with the instruction.
  test('refine returns 202 and the applied revision lands via poll', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await createExportedDraft(api, `Async RF ${Date.now()}`)

    const res = await api.post(`/api/drafts/${draft.id}/refine`, { instruction: 'Make the background darker' })
    expect(res.status()).toBe(202)
    expect(await res.json()).toEqual({ ok: true })

    const done = await waitForAction(api, draft.id as string)
    expect(done.pendingAction).toBeNull()
    expect(done.pendingActionError).toBeNull()
    expect(done.currentRevisionNumber).toBe(2)
    expect(done.htmlContent).toBeTruthy()

    const revisions = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()
    expect(revisions.some((r: { instruction: string }) => r.instruction === 'Make the background darker')).toBe(true)
  })

  // TC-ASYNC-04 — refine conflict surfaces via poll; Override stays synchronous.
  test('refine conflict arrives via poll (no pendingHtml); Override applies synchronously', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await createExportedDraft(api, `Async CF ${Date.now()}`)
    const originalHtml = draft.htmlContent

    const res = await api.post(`/api/drafts/${draft.id}/refine`, {
      instruction: 'conflict_test: use completely off-brand colors',
    })
    expect(res.status()).toBe(202)

    const done = await waitForAction(api, draft.id as string)
    // A conflict is a clean completion: no pendingAction, no error.
    expect(done.pendingAction).toBeNull()
    expect(done.pendingActionError).toBeNull()
    const conflict = done.conflict as { conflictId?: string; explanation?: string; pendingHtml?: string }
    expect(conflict).toBeTruthy()
    expect(conflict.conflictId).toBeTruthy()
    expect(conflict.explanation).toBeTruthy()
    // The withheld HTML never crosses the wire.
    expect(conflict.pendingHtml).toBeUndefined()
    // Nothing applied yet: content and revision pointer unchanged.
    expect(done.htmlContent).toBe(originalHtml)
    expect(done.currentRevisionNumber).toBe(1)

    // Override commits the stored HTML synchronously (legacy response shape).
    const overrideRes = await api.post(`/api/drafts/${draft.id}/refine`, {
      instruction: 'conflict_test: use completely off-brand colors',
      overrideConflictId: conflict.conflictId,
    })
    expect(overrideRes.status()).toBe(200)
    const overridden = await overrideRes.json()
    expect(overridden.reply).toBe('Design updated')
    expect(overridden.revisionId).toBeTruthy()
    expect(overridden.exportUrl).toMatch(/^https?:\/\//)

    const after = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(after.htmlContent).not.toBe(originalHtml)
    expect(after.conflict).toBeNull()
    expect(after.currentRevisionNumber).toBe(2)
  })

  // TC-ASYNC-05 — while an action is in flight, all three actions AND restore 409.
  test('a second action (and restore) during pendingAction is a 409; the slot recovers', async () => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const draft = await createExportedDraft(api, `Async 409 ${Date.now()}`)

    // Seed an in-flight claim directly (fresh updatedAt → the sweep stays away).
    await prisma!.draft.update({
      where: { id: draft.id as string },
      data: { pendingAction: 'REGENERATE_DESIGN' },
    })

    for (const [path, body] of [
      ['regenerate-design', {}],
      ['regenerate-copy', {}],
      ['refine', { instruction: 'Make it pop' }],
    ] as const) {
      const res = await api.post(`/api/drafts/${draft.id}/${path}`, body)
      expect(res.status()).toBe(409)
      expect((await res.json()).error).toBe(IN_FLIGHT_409)
    }

    // Restore would race the running action's revision-pointer write → 409 too.
    const restoreRes = await api.post(`/api/drafts/${draft.id}/revisions/1/restore`, {})
    expect(restoreRes.status()).toBe(409)
    expect((await restoreRes.json()).error).toBe(IN_FLIGHT_409)

    // Release the slot → the next action claims and completes normally.
    await prisma!.draft.update({
      where: { id: draft.id as string },
      data: { pendingAction: null },
    })
    const retry = await api.post(`/api/drafts/${draft.id}/regenerate-copy`, {})
    expect(retry.status()).toBe(202)
    const done = await waitForAction(api, draft.id as string)
    expect(done.pendingAction).toBeNull()
    expect(done.pendingActionError).toBeNull()
  })

  // TC-ASYNC-06 — a stale claim (updatedAt > 15 min) is swept lazily on GET.
  test('a stale pendingAction is swept on GET with an interruption error, content untouched', async () => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const draft = await createExportedDraft(api, `Async Stale ${Date.now()}`)

    // Simulate a claim orphaned by a server restart: pendingAction set with an
    // old updatedAt. Raw SQL — Prisma's @updatedAt would auto-touch the column.
    await prisma!.$executeRaw`
      UPDATE "Draft"
      SET "pendingAction" = 'REFINE'::"DraftAction",
          "updatedAt" = NOW() - INTERVAL '16 minutes'
      WHERE "id" = ${draft.id as string}`

    const swept = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(swept.pendingAction).toBeNull()
    expect(swept.pendingActionError).toBe('The action was interrupted. Please try again.')
    // The sweep never touches content or status.
    expect(swept.status).toBe('EXPORTED')
    expect(swept.htmlContent).toBe(draft.htmlContent)
    expect(swept.copyText).toBe(draft.copyText)
    expect(swept.currentRevisionNumber).toBe(1)

    // The sweep persisted (not just an in-response fixup).
    const again = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(again.pendingAction).toBeNull()
    expect(again.pendingActionError).toBe('The action was interrupted. Please try again.')
  })

  // TC-ASYNC-07 — refine failure: error recorded, previous content intact.
  test('a failed refine sets pendingActionError and leaves the draft intact', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await createExportedDraft(api, `Async RF Fail ${Date.now()}`)
    const beforeExportPath = urlPath(draft.exportUrl)

    // The refine instruction flows into the design-agent user message, where
    // the __FAIL_GEN_ALWAYS__ sentinel makes the mocked agent throw.
    const res = await api.post(`/api/drafts/${draft.id}/refine`, {
      instruction: '__FAIL_GEN_ALWAYS__ break this refine',
    })
    expect(res.status()).toBe(202)

    const done = await waitForAction(api, draft.id as string)
    expect(done.pendingAction).toBeNull()
    expect(done.pendingActionError).toBeTruthy()
    // Previous content fully intact — no revision appended, nothing overwritten.
    expect(done.status).toBe('EXPORTED')
    expect(done.htmlContent).toBe(draft.htmlContent)
    expect(done.currentRevisionNumber).toBe(1)
    expect(urlPath(done.exportUrl)).toBe(beforeExportPath)
  })

  // TC-ASYNC-08 — regenerate-design failure via the brief-topic sentinel; the
  // next successful action clears pendingActionError (claim resets it).
  test('a failed regenerate-design keeps the old design; the next action clears the error', async () => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const topic = `Async RD Fail ${Date.now()}`
    const draft = await createExportedDraft(api, topic)
    const beforeExportPath = urlPath(draft.exportUrl)

    // The brief topic flows into the Path B user message — rewrite it in the DB
    // so the SECOND generation (the regenerate) hits the failure sentinel while
    // the first (already completed) succeeded.
    await prisma!.brief.update({
      where: { id: draft.briefId as string },
      data: { topic: `__FAIL_GEN_ALWAYS__ ${topic}` },
    })

    const res = await api.post(`/api/drafts/${draft.id}/regenerate-design`, {})
    expect(res.status()).toBe(202)

    const failed = await waitForAction(api, draft.id as string)
    expect(failed.pendingAction).toBeNull()
    expect(failed.pendingActionError).toContain('Mock generation failure')
    // Old design fully intact.
    expect(failed.status).toBe('EXPORTED')
    expect(failed.htmlContent).toBe(draft.htmlContent)
    expect(failed.currentRevisionNumber).toBe(1)
    expect(urlPath(failed.exportUrl)).toBe(beforeExportPath)

    // Restore the topic → re-trigger → success; claiming cleared the error.
    await prisma!.brief.update({ where: { id: draft.briefId as string }, data: { topic } })
    const retry = await api.post(`/api/drafts/${draft.id}/regenerate-design`, {})
    expect(retry.status()).toBe(202)
    const recovered = await waitForAction(api, draft.id as string)
    expect(recovered.pendingAction).toBeNull()
    expect(recovered.pendingActionError).toBeNull()
    expect(recovered.currentRevisionNumber).toBe(2)
  })

  // TC-ASYNC-09 — validation stays synchronous with the legacy response shapes.
  test('validation failures keep their legacy shapes and never claim the slot', async () => {
    if (!MOCKED()) { test.skip(); return }

    // 404 on an unknown draft — all three actions.
    for (const [path, body] of [
      ['regenerate-design', {}],
      ['regenerate-copy', {}],
      ['refine', { instruction: 'x' }],
    ] as const) {
      const res = await api.post(`/api/drafts/nonexistent-draft-id/${path}`, body)
      expect(res.status()).toBe(404)
    }

    // 400 'instruction is required' — refine without an instruction.
    const draft = await createExportedDraft(api, `Async Val ${Date.now()}`)
    const noInstr = await api.post(`/api/drafts/${draft.id}/refine`, {})
    expect(noInstr.status()).toBe(400)
    expect((await noInstr.json()).error).toBe('instruction is required')

    // 400 NOT_PATH_B — regenerate-design on a Path A (template) draft.
    const kit = await (await api.post('/api/admin/brandkits', { name: `Async Val A Kit ${Date.now()}`, colors: ['#0284c7'] })).json()
    const template = await (await api.post(`/api/admin/brandkits/${kit.id}/templates`, {
      name: 'Async Val Template',
      htmlTemplate: '<html><body style="width:1080px;height:1080px;background:#0284c7">{{topic}}</body></html>',
    })).json()
    const camp = await (await api.post('/api/campaigns', { name: `Async Val A Camp ${Date.now()}`, brandKitId: kit.id })).json()
    const briefA = await (await api.post('/api/briefs', {
      topic: `Async Val A ${Date.now()}`, goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
      designMode: 'TEMPLATE', copyProviderKey: 'cli', campaignId: camp.id,
    })).json()
    const assembleA = await api.post('/api/generate/assemble-a', { briefId: briefA.id, templateId: template.id })
    expect(assembleA.status()).toBe(202)
    const { draftId: pathADraftId } = await assembleA.json()
    await waitForDraft(api, pathADraftId)
    const notPathB = await api.post(`/api/drafts/${pathADraftId}/regenerate-design`, {})
    expect(notPathB.status()).toBe(400)
    expect((await notPathB.json()).code).toBe('NOT_PATH_B')

    // 409 'not ready' — regenerate-copy on a FAILED draft (no content to replace).
    const failedBrief = await (await api.post('/api/briefs', {
      topic: `__FAIL_GEN_ALWAYS__ Async Val ${Date.now()}`, goal: 'g', tone: 'professional',
      channels: ['INSTAGRAM'], designMode: 'GENERATE', copyProviderKey: 'cli', campaignId: camp.id,
    })).json()
    const { draftId: failedDraftId } = await (await api.post('/api/generate/assemble-b', { briefId: failedBrief.id })).json()
    const failedDraft = await waitForDraft(api, failedDraftId)
    expect(failedDraft.status).toBe('FAILED')
    const notReady = await api.post(`/api/drafts/${failedDraftId}/regenerate-copy`, {})
    expect(notReady.status()).toBe(409)
    expect((await notReady.json()).error).toBe('Draft is not ready for copy regeneration')
  })
})
