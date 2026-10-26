import { test, expect, type Page } from '@playwright/test'
import { loginAs, waitForDraft, waitForAction, findTeamIdByName, addTeamMember, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'
import { expectNoAxeViolations } from '../helpers/axe'
import { ADMIN_EMAIL, expectNoHorizontalScroll, pageLogin } from '../helpers/ui'

// §AD — Product observability (change 006: TC-OBS-01 onward; the wizard
// cases, TC-OBS-23 to TC-OBS-30, come before the privacy check, which stays last). The event store is written by the server's own
// settle points and read by one super-admin page, so the cases below drive the
// real flows under MOCK_AI and read the events back through the test seam
// GET/DELETE/POST /api/test/analytics-events (404 in prod, 404 without MOCK_AI,
// admin only). Serial; every case clears the store first.
//
// Deterministic seams reused from the other suites (src/lib/testHooks.ts):
//   __FAIL_GEN_ALWAYS__    a generation that always fails
//   __VERIFY_PASS__ / __VERIFY_FAIL_ALWAYS__   the mock verifier
//   conflict_test          a brand-kit conflict on refine
//   __FAIL_ALWAYS__        a publish that always fails (in the topic)
//   POST /api/test/generation-tick   one scheduled-generation tick
// New in this suite (all in the analytics seam): { failNext: n } makes the next
// n event inserts fail; { seed: [...] } inserts rows with an explicit `at`;
// { sweep: true } runs the retention sweep once.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER && process.env.MOCK_SOCIAL)
const PASSWORD = 'BistecStudio2026!'
const EDITOR_EMAIL = 'editor@bisteccare.lk'
const CLIENTX_EMAIL = 'clientx.admin@users.bistec.internal'
const DESC_MARKER = 'OBS-DESC-MARKER-7f3a9c'

test.describe.configure({ mode: 'serial' })

interface AEvent {
  id: string
  at: string
  name: string
  source: string
  teamId: string
  userId: string | null
  draftId: string | null
  durationMs: number | null
  outcome: string | null
  payload: Record<string, unknown>
}
interface Drop {
  name: string
  dropped: number
  rejected: number
  lastReason: string
}

// Every event the suite observed and every caption/headline it created, for the
// no-text check (AC-04) at the end.
const collected: AEvent[] = []
const forbiddenText = new Set<string>()

async function seamGet(api: ApiClient, query = ''): Promise<{ events: AEvent[]; drops: Drop[] }> {
  const res = await api.get(`/api/test/analytics-events${query}`)
  expect(res.status()).toBe(200)
  return res.json()
}
async function events(api: ApiClient, query: Record<string, string> = {}): Promise<AEvent[]> {
  const qs = new URLSearchParams(query).toString()
  return (await seamGet(api, qs ? `?${qs}` : '')).events
}
async function clearStore(api: ApiClient) {
  expect((await api.del('/api/test/analytics-events')).status()).toBe(204)
}
async function seed(api: ApiClient, rows: unknown[]) {
  for (let i = 0; i < rows.length; i += 5000) {
    const res = await api.post('/api/test/analytics-events', { seed: rows.slice(i, i + 5000) })
    expect(res.status()).toBe(200)
  }
}
async function sweep(api: ApiClient): Promise<number> {
  const res = await api.post('/api/test/analytics-events', { sweep: true })
  expect(res.status()).toBe(200)
  return (await res.json()).deleted
}

async function createBrief(api: ApiClient, topic: string, campaignId?: string) {
  const res = await api.post('/api/briefs', {
    topic,
    goal: DESC_MARKER,
    description: DESC_MARKER,
    tone: 'professional',
    channels: ['INSTAGRAM'],
    designMode: 'GENERATE',
    copyProviderKey: 'cli',
    ...(campaignId ? { campaignId } : {}),
  })
  expect(res.status()).toBe(201)
  return res.json()
}

async function createCampaign(api: ApiClient, name: string): Promise<{ id: string }> {
  const kit = await (await api.post('/api/admin/brandkits', { name: `${name} Kit`, colors: ['#0284c7'] })).json()
  return (await api.post('/api/campaigns', { name, brandKitId: kit.id })).json()
}

// A rendered, EXPORTED draft; the captions it carries are remembered so the
// no-text check can look for them.
async function exportedDraft(api: ApiClient, topic: string): Promise<{ id: string } & Record<string, unknown>> {
  // No campaign per draft: the team's default kit serves, and a suite that is run
  // several times must not push the seeded fixtures out of the campaign list
  // (GET /api/campaigns returns the newest 200; team-isolation reads its fixture there).
  const brief = await createBrief(api, topic)
  const assemble = await api.post('/api/generate/assemble-b', { briefId: brief.id })
  expect(assemble.status()).toBe(202)
  const { draftId } = await assemble.json()
  const draft = await waitForDraft(api, draftId)
  expect(draft.status).toBe('EXPORTED')
  rememberText(draft)
  return draft as { id: string } & Record<string, unknown>
}

function rememberText(draft: Record<string, unknown>) {
  for (const c of (draft.captions as { text?: string }[] | undefined) ?? []) {
    if (c.text && c.text.length >= 8) forbiddenText.add(c.text)
  }
  if (typeof draft.headline === 'string' && draft.headline.length >= 8) forbiddenText.add(draft.headline)
}

const byName = (list: AEvent[], name: string) => list.filter((e) => e.name === name)

// Generation and draft actions write their status first and their event right
// after (the event is only emitted once the settle write landed), so a poll that
// sees the new status can beat the event by a few milliseconds. Wait for the
// expected number, then pause briefly so a duplicate would show up too.
async function waitEvents(api: ApiClient, query: Record<string, string>, name: string, count: number): Promise<AEvent[]> {
  await expect
    .poll(async () => byName(await events(api, query), name).length, { message: `${name} events`, timeout: 15_000 })
    .toBeGreaterThanOrEqual(count)
  await new Promise((r) => setTimeout(r, 400))
  return byName(await events(api, query), name)
}
async function waitDrop(api: ApiClient, name: string, count: number) {
  await expect
    .poll(async () => (await seamGet(api)).drops.find((d) => d.name === name)?.dropped ?? 0, { message: `${name} dropped`, timeout: 15_000 })
    .toBe(count)
}

test.describe('§AD — product observability', () => {
  let admin: ApiClient

  test.beforeEach(async ({ request }) => {
    admin = await loginAs(request, ADMIN_EMAIL, PASSWORD)
    if (MOCKED()) await clearStore(admin)
  })
  test.afterEach(async () => {
    if (MOCKED()) collected.push(...(await events(admin)))
    await admin.dispose()
  })
  test.afterAll(async ({ playwright }) => {
    if (!MOCKED()) return
    const ctx = await playwright.request.newContext({ baseURL: process.env.TEST_BASE_URL })
    try {
      const a = await loginAs(ctx, ADMIN_EMAIL, PASSWORD)
      await clearStore(a)
      await a.post('/api/test/analytics-events', { failNext: 0 })
      await a.post('/api/test/worker-heartbeat', { clear: true })
      await a.dispose()
    } finally {
      await ctx.dispose()
    }
  })

  // ── One event per operation (AC-05 to AC-07) ─────────────────────────────

  test('TC-OBS-01: a web generation writes exactly one generation.finished ok, with a duration', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await exportedDraft(admin, `Obs Gen ${Date.now()}`)
    const finished = await waitEvents(admin, { draftId: draft.id }, 'generation.finished', 1)
    expect(finished).toHaveLength(1)
    expect(finished[0]).toMatchObject({ outcome: 'ok', source: 'web' })
    expect(finished[0].payload).toMatchObject({ path: 'B', backgroundSkipped: expect.any(Boolean) })
    expect(finished[0].durationMs).toBeGreaterThan(0)
    expect(finished[0].userId).toBeTruthy()
    expect(finished[0].teamId).toBeTruthy()
  })

  test('TC-OBS-02: a failing generation writes one failed event with its reason', async () => {
    if (!MOCKED()) { test.skip(); return }
    const brief = await createBrief(admin, `__FAIL_GEN_ALWAYS__ obs ${Date.now()}`)
    const { draftId } = await (await admin.post('/api/generate/assemble-b', { briefId: brief.id })).json()
    const draft = await waitForDraft(admin, draftId)
    expect(draft.status).toBe('FAILED')

    const finished = await waitEvents(admin, { draftId }, 'generation.finished', 1)
    expect(finished).toHaveLength(1)
    expect(finished[0].outcome).toBe('failed')
    expect(finished[0].durationMs).toBeGreaterThan(0)
    const reason = String(finished[0].payload.failureReason)
    expect(reason).toContain('__FAIL_GEN_ALWAYS__')
    expect(reason).not.toMatch(/https?:\/\//)
    expect(reason.length).toBeLessThanOrEqual(500)
  })

  test('TC-OBS-03: an applied refine writes one settled event holding the trace', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await exportedDraft(admin, `Obs Refine ${Date.now()}`)
    await clearStore(admin)
    const instruction = 'make the title bigger __VERIFY_PASS__'
    expect((await admin.post(`/api/drafts/${draft.id}/refine`, { instruction })).status()).toBe(202)
    await waitForAction(admin, draft.id)

    const settled = await waitEvents(admin, { draftId: draft.id }, 'draft_action.settled', 1)
    expect(settled).toHaveLength(1)
    expect(settled[0]).toMatchObject({ outcome: 'ok', source: 'web' })
    expect(settled[0].durationMs).toBeGreaterThan(0)
    const p = settled[0].payload as {
      action: string
      instruction: string
      attempts: { verdict: string; classes: string[] }[]
      verifierModelId: string
      verifierPromptVersion: string
    }
    expect(p.action).toBe('REFINE')
    expect(p.instruction).toBe(instruction)
    expect(p.attempts.length).toBeGreaterThanOrEqual(1)
    expect(p.attempts[p.attempts.length - 1].verdict).toBe('pass')
    expect(p.attempts[0].classes.length).toBeGreaterThan(0)
    expect(p.verifierModelId).toBeTruthy()
    expect(p.verifierPromptVersion).toBe('2026-10-24.1')
  })

  test('TC-OBS-04: a refine the verifier rejects twice writes not-applied with its misses; adopting it writes revision.adopted', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await exportedDraft(admin, `Obs NotApplied ${Date.now()}`)
    await clearStore(admin)
    expect((await admin.post(`/api/drafts/${draft.id}/refine`, { instruction: 'darken it __VERIFY_FAIL_ALWAYS__' })).status()).toBe(202)
    const settledDraft = await waitForAction(admin, draft.id)
    const notApplied = settledDraft.notApplied as { revisionId: string }
    expect(notApplied).toBeTruthy()

    const settled = await waitEvents(admin, { draftId: draft.id }, 'draft_action.settled', 1)
    expect(settled).toHaveLength(1)
    expect(settled[0].outcome).toBe('not-applied')
    const attempts = (settled[0].payload as { attempts: { verdict: string }[] }).attempts
    expect(attempts).toHaveLength(2)
    expect(attempts.every((a) => a.verdict !== 'pass')).toBe(true)

    expect((await admin.post(`/api/drafts/${draft.id}/rejected/${notApplied.revisionId}/adopt`)).status()).toBe(200)
    const adopted = byName(await events(admin, { draftId: draft.id }), 'revision.adopted')
    expect(adopted).toHaveLength(1)
    expect(adopted[0].outcome).toBe('ok')
  })

  test('TC-OBS-05: a brand-kit conflict writes one conflict settle, and the override its own event', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await exportedDraft(admin, `Obs Conflict ${Date.now()}`)
    await clearStore(admin)
    const instruction = 'conflict_test: use completely off-brand colors'
    expect((await admin.post(`/api/drafts/${draft.id}/refine`, { instruction })).status()).toBe(202)
    const settledDraft = await waitForAction(admin, draft.id)
    const conflict = settledDraft.conflict as { conflictId: string }
    expect(conflict).toBeTruthy()

    expect((await waitEvents(admin, { draftId: draft.id }, 'draft_action.settled', 1)).map((e) => e.outcome)).toEqual(['conflict'])
    let list = await events(admin, { draftId: draft.id })
    expect(byName(list, 'revision.override')).toHaveLength(0)

    const override = await admin.post(`/api/drafts/${draft.id}/refine`, { instruction, overrideConflictId: conflict.conflictId })
    expect(override.status()).toBe(200)
    list = await events(admin, { draftId: draft.id })
    expect(byName(list, 'draft_action.settled')).toHaveLength(1) // the override is not a second settle
    expect(byName(list, 'revision.override')).toHaveLength(1)
  })

  test('TC-OBS-06: regenerate design and regenerate caption each write one settled event', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await exportedDraft(admin, `Obs Regen ${Date.now()}`)
    await clearStore(admin)
    expect((await admin.post(`/api/drafts/${draft.id}/regenerate-design`, {})).status()).toBe(202)
    await waitForAction(admin, draft.id)
    expect((await admin.post(`/api/drafts/${draft.id}/regenerate-copy`, {})).status()).toBe(202)
    await waitForAction(admin, draft.id)

    const settled = await waitEvents(admin, { draftId: draft.id }, 'draft_action.settled', 2)
    expect(settled).toHaveLength(2)
    expect(settled.map((e) => (e.payload as { action: string }).action).sort()).toEqual(['REGENERATE_COPY', 'REGENERATE_DESIGN'])
    expect(settled.every((e) => e.outcome === 'ok' && (e.durationMs ?? 0) > 0)).toBe(true)
    // only a refine carries a trace
    expect(settled.every((e) => !('attempts' in e.payload))).toBe(true)
  })

  test('TC-OBS-07: inline edit and restore write one revision event each', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await exportedDraft(admin, `Obs Revisions ${Date.now()}`)
    await clearStore(admin)
    const html = '<!doctype html><html><body style="width:1080px;height:1080px">Edited</body></html>'
    expect((await admin.post(`/api/drafts/${draft.id}/inline-edit`, { html })).status()).toBe(200)
    expect((await admin.post(`/api/drafts/${draft.id}/revisions/1/restore`, {})).status()).toBe(200)

    const list = await events(admin, { draftId: draft.id })
    const edited = byName(list, 'revision.edited')
    const restored = byName(list, 'revision.restored')
    expect(edited).toHaveLength(1)
    expect(edited[0].payload).toEqual({ mode: 'document' })
    expect(restored).toHaveLength(1)
    expect(restored[0].payload).toEqual({ from: 2, to: 1 })
  })

  test('TC-OBS-08: a publish writes one publish.settled per attempt: published, and failed', async () => {
    if (!MOCKED()) { test.skip(); return }
    const ok = await exportedDraft(admin, `Obs Publish ${Date.now()}`)
    await clearStore(admin)
    const post = await admin.post('/api/posts', { draftId: ok.id, channel: 'INSTAGRAM' })
    expect(post.status()).toBe(201)
    const published = byName(await events(admin, { draftId: ok.id as string }), 'publish.settled')
    expect(published).toHaveLength(1)
    expect(published[0]).toMatchObject({ outcome: 'published', source: 'web' })
    expect(published[0].payload).toMatchObject({ channel: 'INSTAGRAM', terminal: true })

    const bad = await exportedDraft(admin, `__FAIL_ALWAYS__ obs publish ${Date.now()}`)
    await clearStore(admin)
    const failedPost = await admin.post('/api/posts', { draftId: bad.id, channel: 'INSTAGRAM' })
    expect(failedPost.status()).toBeGreaterThanOrEqual(400)
    const failed = byName(await events(admin, { draftId: bad.id as string }), 'publish.settled')
    expect(failed).toHaveLength(1)
    expect(failed[0].outcome).toBe('failed')
  })

  test('TC-OBS-09: a scheduled generation writes generation.finished (scheduler) and scheduled_generation.settled', async () => {
    if (!MOCKED() || !dbAvailable) { test.skip(); return }
    const camp = await createCampaign(admin, `Obs Sched ${Date.now()}`)
    const entry = await (await admin.post(`/api/campaigns/${camp.id}/queue`, {
      topic: `Obs scheduled ${Date.now()}`,
      goal: 'Awareness',
      tone: 'professional',
      channels: ['INSTAGRAM'],
      designMode: 'GENERATE',
      generateAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
      postAction: 'HOLD',
    })).json()
    await prisma!.scheduledGeneration.update({ where: { id: entry.id }, data: { generateAt: new Date(Date.now() - 1000), nextRetryAt: null } })
    await clearStore(admin)
    expect((await admin.post('/api/test/generation-tick', {})).status()).toBe(200)

    const list = await events(admin)
    const finished = byName(list, 'generation.finished')
    const settled = byName(list, 'scheduled_generation.settled')
    expect(finished).toHaveLength(1)
    expect(finished[0]).toMatchObject({ source: 'scheduler', outcome: 'ok', userId: null })
    expect(settled).toHaveLength(1)
    expect(settled[0]).toMatchObject({ source: 'scheduler', outcome: 'completed' })
  })

  // ── Failure isolation (AC-08) ────────────────────────────────────────────

  test('TC-OBS-10: with the store failing, a generation, a refine and a publish still finish the same, and the loss is counted', async () => {
    if (!MOCKED()) { test.skip(); return }
    // generation. The brief is created first: POST /api/briefs now writes its own
    // brief.submitted event, which would take the one failure meant for the generation.
    const brief = await createBrief(admin, `Obs FailNext ${Date.now()}`)
    expect((await admin.post('/api/test/analytics-events', { failNext: 1 })).status()).toBe(200)
    const assemble = await admin.post('/api/generate/assemble-b', { briefId: brief.id })
    expect(assemble.status()).toBe(202)
    const draft = (await waitForDraft(admin, (await assemble.json()).draftId)) as { id: string } & Record<string, unknown>
    expect(draft.status).toBe('EXPORTED')
    rememberText(draft)
    await waitDrop(admin, 'generation.finished', 1)
    expect(byName(await events(admin, { draftId: draft.id }), 'generation.finished')).toHaveLength(0)

    // refine: the revision still lands
    const before = (await (await admin.get(`/api/drafts/${draft.id}`)).json()).currentRevisionNumber as number
    expect((await admin.post('/api/test/analytics-events', { failNext: 1 })).status()).toBe(200)
    expect((await admin.post(`/api/drafts/${draft.id}/refine`, { instruction: 'make it bolder __VERIFY_PASS__' })).status()).toBe(202)
    const after = await waitForAction(admin, draft.id)
    expect(after.pendingActionError).toBeNull()
    expect(after.currentRevisionNumber).toBe(before + 1)
    await waitDrop(admin, 'draft_action.settled', 1)
    expect(byName(await events(admin, { draftId: draft.id }), 'draft_action.settled')).toHaveLength(0)

    // publish: the post is still PUBLISHED
    expect((await admin.post('/api/test/analytics-events', { failNext: 1 })).status()).toBe(200)
    const post = await admin.post('/api/posts', { draftId: draft.id, channel: 'INSTAGRAM' })
    expect(post.status()).toBe(201)
    expect((await post.json()).status).toBe('PUBLISHED')
    await waitDrop(admin, 'publish.settled', 1)
    expect(byName(await events(admin, { draftId: draft.id }), 'publish.settled')).toHaveLength(0)
    expect((await admin.post('/api/test/analytics-events', { failNext: 0 })).status()).toBe(200)
  })

  // ── The insights page (AC-11, AC-12) ─────────────────────────────────────

  // A known set of events, hand counted. At 'h hours ago', so all sit in 30 days.
  async function seedKnownSet(bistec: string, clientx: string) {
    const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600_000).toISOString()
    const attempt = (classes: string[], verdict: string) => ({ classes, effectiveClasses: classes, verdict, reasons: 0 })
    const refine = (n: number, outcome: string, draftId: string, verifier: [string, string], attempts: unknown[], extra: Record<string, unknown> = {}, durationMs: number | null = null, teamId = bistec) => ({
      name: 'draft_action.settled', source: 'web', teamId, userId: 'u1', draftId, outcome, durationMs, at: at(n),
      payload: { action: 'REFINE', verifierModelId: verifier[0], verifierPromptVersion: verifier[1], attempts, ...extra },
    })
    const gen = (n: number, outcome: string, teamId: string, draftId: string | null, payload: Record<string, unknown>, durationMs: number | null) => ({
      name: 'generation.finished', source: 'web', teamId, userId: 'u1', draftId, outcome, durationMs, at: at(n), payload,
    })
    const A: [string, string] = ['verifier-a', 'v1']
    const B: [string, string] = ['verifier-b', 'v2']
    const rows = [
      // REFINE: ok 3, not-applied 2, conflict 1, failed 1
      refine(1, 'ok', 'dA', A, [attempt(['replace'], 'pass')], { model: { model: 'SONNET' } }, 4000),
      refine(2, 'ok', 'dA', A, [attempt(['replace', 'add'], 'pass')], { model: { model: 'SONNET' } }, 8000),
      refine(3, 'not-applied', 'dB', A, [attempt(['replace'], 'miss'), attempt(['replace'], 'miss')]),
      refine(4, 'ok', 'dC', B, [attempt(['remove'], 'pass')], { model: { model: 'HAIKU' } }, 6000),
      refine(5, 'not-applied', 'dC', B, [attempt(['remove'], 'miss'), attempt(['remove'], 'miss')]),
      refine(6, 'conflict', 'dC', A, []),
      refine(7, 'failed', 'dB', A, [], { failureReason: 'boom A' }),
      // revision events: override 2, adopted 1, restored 3, edited 1
      ...Array.from({ length: 2 }, (_, i) => ({ name: 'revision.override', source: 'web', teamId: bistec, userId: 'u1', draftId: 'dA', outcome: 'ok', at: at(8 + i), payload: {} })),
      { name: 'revision.adopted', source: 'web', teamId: bistec, userId: 'u1', draftId: 'dA', outcome: 'ok', at: at(10), payload: {} },
      ...Array.from({ length: 3 }, (_, i) => ({ name: 'revision.restored', source: 'web', teamId: bistec, userId: 'u1', draftId: 'dA', outcome: 'ok', at: at(11 + i), payload: { from: 2, to: 1 } })),
      { name: 'revision.edited', source: 'web', teamId: bistec, userId: 'u1', draftId: 'dA', outcome: 'ok', at: at(14), payload: { mode: 'document' } },
      // generations: 6 (3 ok, 3 failed)
      gen(15, 'ok', bistec, 'dA', { promptVersion: 'P1', designModel: { model: 'SONNET' }, captionRoute: 'CLI', requestedArchetype: 'editorial-split', appliedArchetype: 'editorial-split' }, 10000),
      gen(16, 'ok', bistec, 'dB', { promptVersion: 'P1', designModel: { model: 'SONNET' }, captionRoute: 'CLI', requestedArchetype: 'editorial-split', appliedArchetype: 'classic', fallbackReason: 'layout-violation' }, 20000),
      gen(17, 'ok', clientx, 'dC', { promptVersion: 'P2', designModel: { model: 'HAIKU' }, captionRoute: 'API_KEY', requestedArchetype: 'classic', appliedArchetype: 'classic' }, 30000),
      gen(18, 'failed', bistec, null, { promptVersion: 'P2', designModel: { model: 'SONNET' }, requestedArchetype: 'classic', failureReason: 'boom A' }, 5000),
      gen(19, 'failed', clientx, null, { promptVersion: 'P2', designModel: { model: 'HAIKU' }, requestedArchetype: 'product-showcase', failureReason: 'boom A' }, 5000),
      gen(20, 'failed', bistec, null, { promptVersion: 'P1', designModel: { model: 'SONNET' }, requestedArchetype: 'classic', failureReason: 'boom B' }, 5000),
      // swept
      { name: 'generation.swept', source: 'web', teamId: bistec, userId: null, draftId: 'dX', outcome: 'failed', at: at(21), payload: { ageMs: 1 } },
      { name: 'generation.swept', source: 'web', teamId: bistec, userId: null, draftId: 'dY', outcome: 'failed', at: at(22), payload: { ageMs: 1 } },
      { name: 'draft_action.swept', source: 'web', teamId: clientx, userId: null, draftId: 'dZ', outcome: 'failed', at: at(23), payload: { action: 'REFINE' } },
    ]
    await seed(admin, rows)
    return rows
  }

  test('TC-OBS-11: every figure on the page equals the hand count over a seeded set', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const [bistec, clientx] = [await findTeamIdByName(admin, 'Bistec'), await findTeamIdByName(admin, 'ClientX')]
    const rows = await seedKnownSet(bistec, clientx)

    const api = await (await admin.get('/api/admin/insights?range=30d')).json()
    // refine: applied rate 3 / (3 + 2)
    expect(api.refine.overall).toMatchObject({ ok: 3, notApplied: 2, conflict: 1, failed: 1 })
    expect(api.refine.overall.appliedRate).toBeCloseTo(0.6)
    const cls = Object.fromEntries(api.refine.byClass.map((c: { class: string }) => [c.class, c]))
    expect(cls.replace).toMatchObject({ ok: 2, notApplied: 1 })
    expect(cls.replace.appliedRate).toBeCloseTo(2 / 3)
    expect(cls.add).toMatchObject({ ok: 1, notApplied: 0, appliedRate: 1 })
    expect(cls.remove).toMatchObject({ ok: 1, notApplied: 1, appliedRate: 0.5 })
    // AC-12: two verifier lines
    const sumFor = (id: string) =>
      api.refine.byWeek
        .filter((w: { verifierModelId: string }) => w.verifierModelId === id)
        .reduce((a: Record<string, number>, w: Record<string, number>) => ({ ok: a.ok + w.ok, notApplied: a.notApplied + w.notApplied, conflict: a.conflict + w.conflict, failed: a.failed + w.failed }), { ok: 0, notApplied: 0, conflict: 0, failed: 0 })
    expect(sumFor('verifier-a')).toEqual({ ok: 2, notApplied: 1, conflict: 1, failed: 1 })
    expect(sumFor('verifier-b')).toEqual({ ok: 1, notApplied: 1, conflict: 0, failed: 0 })
    expect(api.refine.revisions).toEqual({ override: 2, adopted: 1, restored: 3, edited: 1 })
    // failures
    const version = Object.fromEntries(api.failures.byPromptVersion.map((v: { promptVersion: string }) => [v.promptVersion, v]))
    expect(version.P1).toMatchObject({ total: 3, failed: 1 })
    expect(version.P2).toMatchObject({ total: 3, failed: 2 })
    const model = Object.fromEntries(api.failures.byDesignModel.map((v: { model: string }) => [v.model, v]))
    expect(model.SONNET).toMatchObject({ total: 4, failed: 2 })
    expect(model.HAIKU).toMatchObject({ total: 2, failed: 1 })
    expect(api.failures.topReasons).toEqual([{ reason: 'boom A', n: 3 }, { reason: 'boom B', n: 1 }])
    expect(api.failures.swept).toEqual({ generation: 2, action: 1 })
    const daily = api.failures.daily as { kind: string; total: number; failed: number }[]
    expect(daily.filter((d) => d.kind === 'generation').reduce((a, d) => a + d.total, 0)).toBe(6)
    expect(daily.filter((d) => d.kind === 'action').reduce((a, d) => a + d.failed, 0)).toBe(1)
    // styles
    const style = Object.fromEntries(api.styles.map((s: { style: string }) => [s.style, s]))
    expect(style['editorial-split']).toMatchObject({ generations: 2, okGenerations: 2, applied: 1, appliedRate: 0.5, meanRefines: 2, fallbacks: [{ reason: 'layout-violation', n: 1 }] })
    expect(style.classic).toMatchObject({ generations: 3, okGenerations: 1, applied: 1, appliedRate: 1, meanRefines: 3 })
    expect(style['product-showcase']).toMatchObject({ generations: 1, okGenerations: 0, appliedRate: null, meanRefines: null })
    // durations (ok runs): generation sonnet/CLI p50 15 s p90 19 s, haiku/API_KEY 30 s; REFINE sonnet 6 s / 7.6 s, haiku 6 s
    const dur = (surface: string, m: string) => api.durations.find((d: { surface: string; model: string }) => d.surface === surface && d.model === m)
    expect(dur('generation', 'SONNET')).toMatchObject({ n: 2, route: 'CLI', p50: 15000, p90: 19000 })
    expect(dur('generation', 'HAIKU')).toMatchObject({ n: 1, route: 'API_KEY', p50: 30000, p90: 30000 })
    expect(dur('REFINE', 'SONNET')).toMatchObject({ n: 2, p50: 6000 })
    expect(dur('REFINE', 'SONNET').p90).toBeCloseTo(7600)
    expect(dur('REFINE', 'HAIKU')).toMatchObject({ n: 1, p50: 6000, p90: 6000 })
    // team activity: counted over the seeded rows
    const mine = (team: string) => rows.filter((r) => r.teamId === team)
    const teamRow = (id: string) => api.teams.find((t: { teamId: string }) => t.teamId === id)
    expect(teamRow(bistec)).toMatchObject({ teamName: 'Bistec', events: mine(bistec).length, generations: mine(bistec).filter((r) => r.name === 'generation.finished').length })
    expect(teamRow(clientx)).toMatchObject({ teamName: 'ClientX', events: mine(clientx).length, generations: 2 })
    // retention health
    expect(api.retention).toMatchObject({ totalEvents: rows.length })

    // the same figures on the page
    await pageLogin(page)
    await page.goto('/admin/insights')
    await expect(page.getByTestId('insights-body')).toBeVisible()
    await expect(page.getByTestId('refine-overall-rate')).toHaveText('60%')
    await expect(page.getByTestId('refine-overall-ok')).toHaveText('3')
    await expect(page.getByTestId('refine-overall-not-applied')).toHaveText('2')
    await expect(page.getByTestId('refine-override')).toHaveText('2')
    await expect(page.getByTestId('refine-restored')).toHaveText('3')
    await expect(page.getByTestId('refine-class-rate-replace')).toHaveText('66.7%')
    await expect(page.getByTestId('refine-class-rate-add')).toHaveText('100%')
    await expect(page.getByTestId('refine-class-rate-remove')).toHaveText('50%')
    const byVerifier = page.getByRole('region', { name: 'Applied rate by week and verifier' })
    await expect(byVerifier).toContainText('verifier-a')
    await expect(byVerifier).toContainText('verifier-b')
    await expect(page.getByTestId('swept-generation')).toHaveText('2')
    await expect(page.getByTestId('swept-action')).toHaveText('1')
    await expect(page.getByTestId('failure-version-P2')).toContainText('66.7%')
    await expect(page.getByTestId('failure-reason-boom A')).toContainText('3')
    await expect(page.getByTestId('style-rate-editorial-split')).toHaveText('50%')
    await expect(page.getByTestId('style-editorial-split')).toContainText('layout-violation (1)')
    await expect(page.getByTestId('style-editorial-split')).toContainText('2.00')
    await expect(page.getByTestId('duration-generation-SONNET-CLI')).toContainText('15 s')
    await expect(page.getByTestId('duration-generation-SONNET-CLI')).toContainText('19 s')
    await expect(page.getByTestId(`team-${bistec}`)).toContainText('Bistec')
    await expect(page.getByTestId('retention-total')).toHaveText(String(rows.length))
    await expect(page.getByTestId('retention-oldest-age')).toHaveText('0 days')
  })

  test('TC-OBS-12: the range limits every section, and an event 100 days old only shows in retention health', async () => {
    if (!MOCKED()) { test.skip(); return }
    const team = await findTeamIdByName(admin, 'Bistec')
    const at = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
    const row = (days: number) => ({ name: 'revision.restored', source: 'web', teamId: team, userId: 'u1', outcome: 'ok', at: at(days), payload: { from: 2, to: 1 } })
    await seed(admin, [row(2), row(20), row(60), row(100)])
    const restored = async (range: string) => (await (await admin.get(`/api/admin/insights?range=${range}`)).json()).refine.revisions.restored
    expect(await restored('7d')).toBe(1)
    expect(await restored('30d')).toBe(2)
    expect(await restored('90d')).toBe(3)
    const health = (await (await admin.get('/api/admin/insights?range=7d')).json()).retention
    expect(health).toMatchObject({ totalEvents: 4, oldestAgeDays: 100 })
    expect((await admin.get('/api/admin/insights?range=1y')).status()).toBe(400)
  })

  test('TC-OBS-13: events lost show on the page beside the figures, and an empty store reads as zeros not errors', async ({ page }) => {
    if (!MOCKED() || !dbAvailable) { test.skip(); return }
    await pageLogin(page)
    await page.goto('/admin/insights')
    await expect(page.getByTestId('insights-body')).toBeVisible()
    await expect(page.getByTestId('refine-overall-rate')).toHaveText('–')
    await expect(page.getByTestId('lost-notice')).toHaveCount(0)
    await expect(page.getByText('No events have been lost.')).toBeVisible()

    await prisma!.analyticsDrop.upsert({
      where: { name: 'generation.finished' },
      create: { name: 'generation.finished', dropped: 3, rejected: 1, lastAt: new Date(), lastReason: 'insert timed out after 2000 ms' },
      update: { dropped: 3, rejected: 1, lastAt: new Date(), lastReason: 'insert timed out after 2000 ms' },
    })
    await page.reload()
    await expect(page.getByTestId('lost-notice')).toContainText('4 events could not be stored')
    await expect(page.getByTestId('lost-generation.finished')).toContainText('insert timed out')
  })

  // ── Retention (AC-13) ────────────────────────────────────────────────────

  test('TC-OBS-14: a sweep removes events older than 180 days and keeps the newer ones', async () => {
    if (!MOCKED()) { test.skip(); return }
    const team = await findTeamIdByName(admin, 'Bistec')
    const at = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
    const row = (days: number, id: string) => ({ name: 'revision.restored', source: 'web', teamId: team, userId: 'u1', draftId: id, outcome: 'ok', at: at(days), payload: { from: 2, to: 1 } })
    await seed(admin, [row(181, 'old1'), row(181, 'old2'), row(179, 'new1'), row(179, 'new2')])
    expect(await sweep(admin)).toBe(2)
    expect((await events(admin)).map((e) => e.draftId).sort()).toEqual(['new1', 'new2'])
    expect(await sweep(admin)).toBe(0)
  })

  test('TC-OBS-15: a sweep deletes at most 5 000 events, and a backlog drains over ticks', async () => {
    if (!MOCKED()) { test.skip(); return }
    const team = await findTeamIdByName(admin, 'Bistec')
    const old = new Date(Date.now() - 200 * 86_400_000).toISOString()
    const rows = Array.from({ length: 12_000 }, () => ({ name: 'revision.restored', source: 'web', teamId: team, userId: 'u1', outcome: 'ok', at: old, payload: {} }))
    await seed(admin, rows)
    expect(await sweep(admin)).toBe(5000)
    expect(await sweep(admin)).toBe(5000)
    expect(await sweep(admin)).toBe(2000)
    expect(await sweep(admin)).toBe(0)
  })

  test('TC-OBS-16: the retention loop does not disturb the scheduler banner, and its own health shows on the page', async ({ page }) => {
    if (!MOCKED() || !dbAvailable) { test.skip(); return }
    expect((await admin.post('/api/test/worker-heartbeat', { loop: 'scheduler', startedAgoMs: 20_000, endedAgoMs: 10_000 })).status()).toBe(200)
    expect((await admin.post('/api/test/worker-heartbeat', { loop: 'generation', startedAgoMs: 20_000, endedAgoMs: 10_000 })).status()).toBe(200)
    // a retention loop that stopped an hour ago: it must not turn the banner on
    await prisma!.workerHeartbeat.upsert({
      where: { loop: 'retention' },
      create: { loop: 'retention', lastTickStartedAt: new Date(Date.now() - 3_600_000), lastTickEndedAt: new Date(Date.now() - 3_599_000) },
      update: { lastTickStartedAt: new Date(Date.now() - 3_600_000), lastTickEndedAt: new Date(Date.now() - 3_599_000) },
    })
    const status = await (await admin.get('/api/scheduler/status')).json()
    expect(status.offline).toBe(false)
    expect(status.loops.map((l: { loop: string }) => l.loop)).toEqual(['scheduler', 'generation'])

    await pageLogin(page)
    await page.goto('/admin/insights')
    await expect(page.getByTestId('retention-loop-state')).toHaveText('stale')
    await prisma!.workerHeartbeat.update({ where: { loop: 'retention' }, data: { lastTickStartedAt: new Date(), lastTickEndedAt: new Date() } })
    await page.reload()
    await expect(page.getByTestId('retention-loop-state')).toHaveText('online')
    await prisma!.workerHeartbeat.delete({ where: { loop: 'retention' } })
  })

  // ── Deletes (AC-14) ──────────────────────────────────────────────────────

  test('TC-OBS-17: deleting a draft keeps its events with the draft unlinked', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await exportedDraft(admin, `Obs Delete ${Date.now()}`)
    expect(byName(await events(admin, { draftId: draft.id }), 'generation.finished')).toHaveLength(1)
    const del = await admin.del(`/api/drafts/${draft.id}`)
    expect(del.status()).toBe(200)
    expect(await events(admin, { draftId: draft.id })).toHaveLength(0)
    const all = await events(admin)
    const survivor = byName(all, 'generation.finished')
    expect(survivor).toHaveLength(1)
    expect(survivor[0].draftId).toBeNull()
  })

  test('TC-OBS-18: soft-deleting a team removes its events and no other team\'s', async () => {
    if (!MOCKED()) { test.skip(); return }
    const bistec = await findTeamIdByName(admin, 'Bistec')
    const created = await admin.post('/api/admin/teams', { name: `Obs Team ${Date.now()}` })
    expect(created.status()).toBe(201)
    const doomed = (await created.json()).id as string
    const row = (teamId: string) => ({ name: 'revision.restored', source: 'web', teamId, userId: 'u1', outcome: 'ok', at: new Date().toISOString(), payload: { from: 2, to: 1 } })
    await seed(admin, [row(doomed), row(doomed), row(bistec)])
    expect((await admin.del(`/api/admin/teams/${doomed}`)).status()).toBe(204)
    const left = await events(admin)
    expect(left.filter((e) => e.teamId === doomed)).toHaveLength(0)
    expect(left.filter((e) => e.teamId === bistec)).toHaveLength(1)
  })

  // ── Access (AC-11) ───────────────────────────────────────────────────────

  test('TC-OBS-19: the API is super-admin only (401 without a valid session, 403 to an editor and a team admin)', async ({ request, playwright }) => {
    if (!MOCKED()) { test.skip(); return }
    // The proxy redirects a cookie-less request to /login, so a bogus session
    // cookie is what reaches the route's own check (as TC-HB-06).
    const anon = await playwright.request.newContext({
      baseURL: process.env.TEST_BASE_URL,
      extraHTTPHeaders: { cookie: 'better-auth.session_token=not-a-real-session' },
    })
    try {
      expect((await anon.get('/api/admin/insights')).status()).toBe(401)
    } finally {
      await anon.dispose()
    }
    const bare = await playwright.request.newContext({ baseURL: process.env.TEST_BASE_URL })
    try {
      const res = await bare.get('/api/admin/insights', { maxRedirects: 0 })
      expect([301, 302, 307, 308]).toContain(res.status())
    } finally {
      await bare.dispose()
    }
    const editor = await loginAs(request, EDITOR_EMAIL, PASSWORD)
    const teamAdmin = await loginAs(request, CLIENTX_EMAIL, PASSWORD)
    try {
      expect((await editor.get('/api/admin/insights')).status()).toBe(403)
      expect((await teamAdmin.get('/api/admin/insights')).status()).toBe(403)
      expect((await admin.get('/api/admin/insights')).status()).toBe(200)
    } finally {
      await editor.dispose()
      await teamAdmin.dispose()
    }
  })

  async function pageLoginAs(page: Page, email: string) {
    await page.goto('/login')
    await page.getByPlaceholder('Username').fill(email)
    await page.getByPlaceholder('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL((url) => url.pathname === '/' || url.pathname === '/choose-team')
  }

  test('TC-OBS-20: an editor and a team admin see a gate, not the page, and no nav item', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    await pageLoginAs(page, EDITOR_EMAIL)
    await page.goto('/admin/insights')
    await expect(page.getByRole('heading', { name: /Requires/ })).toBeVisible()
    await expect(page.getByTestId('insights-body')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Insights' })).toHaveCount(0)
    await page.context().clearCookies()

    await pageLoginAs(page, CLIENTX_EMAIL)
    await page.goto('/admin/insights')
    await expect(page.getByRole('heading', { name: 'Requires super admin' })).toBeVisible()
    await expect(page.getByTestId('insights-body')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Insights' })).toHaveCount(0)
  })

  test('TC-OBS-21: the super admin has the nav item; the page has no horizontal scroll at 390 px and passes the axe rules', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    await seedKnownSet(await findTeamIdByName(admin, 'Bistec'), await findTeamIdByName(admin, 'ClientX'))
    await pageLogin(page)
    await page.goto('/admin/insights')
    await expect(page.getByTestId('insights-body')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Insights' })).toBeVisible()
    await page.setViewportSize({ width: 390, height: 900 })
    await expectNoHorizontalScroll(page, '/admin/insights at 390 px')
    await expectNoAxeViolations(page, '/admin/insights', { settle: true })
    await page.getByRole('tab', { name: '7 days' }).click()
    await expect(page.getByRole('tab', { name: '7 days' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('insights-body')).toBeVisible()
  })

  // ── The brief wizard (wave 2: AC-09, and the funnel figures of AC-11) ─────

  const WIZ_TOPIC = 'Obs wizard topic marker'
  const WIZ_PROMPT = `${DESC_MARKER} announce the wizard events with a short call to action.`

  // A throwaway team member, so the per-user rate window starts empty on every
  // run (the window lives for a minute inside the server process) and so a
  // foreign user exists for the ownership check.
  async function freshEditor(request: Parameters<typeof loginAs>[0]): Promise<{ api: ApiClient; userId: string }> {
    const username = `obswiz${Date.now()}${Math.floor(Math.random() * 1000)}`
    const created = await admin.post('/api/admin/users', { name: 'Obs Wizard', username, role: 'editor', password: 'ObsWizPass1!' })
    expect(created.status()).toBe(201)
    const user = await created.json()
    await addTeamMember(admin, await findTeamIdByName(admin, 'Bistec'), user.id, 'EDITOR')
    const api = await loginAs(request, `${username}@users.bistec.internal`, 'ObsWizPass1!')
    return { api, userId: user.id }
  }

  const stepsOf = (list: AEvent[]) => byName(list, 'wizard.step').map((e) => e.payload.step)

  async function walkWizardTo(page: Page, last: number) {
    const cont = page.getByRole('button', { name: /continue/i })
    await expect(page.getByRole('heading', { name: 'Select a campaign' })).toBeVisible({ timeout: 20_000 })
    if (last >= 1) {
      await cont.click()
      await expect(page.getByRole('heading', { name: 'Size & Design' })).toBeVisible()
      const kit = page.getByRole('combobox', { name: 'Brand kit' })
      await expect.poll(() => kit.locator('option').count()).toBeGreaterThan(1)
      await kit.selectOption({ index: 1 })
      await page.getByRole('button', { name: /^Freeform/ }).click()
      await expect(page.getByRole('button', { name: 'No reference' })).toBeVisible()
    }
    if (last >= 2) {
      await cont.click()
      await expect(page.getByRole('heading', { name: 'Description & caption direction' })).toBeVisible()
      await page.getByPlaceholder('e.g. Q3 product launch').fill(WIZ_TOPIC)
      await page.locator('textarea').fill(WIZ_PROMPT)
    }
    if (last >= 3) {
      await cont.click()
      await expect(page.getByRole('heading', { name: /Images/ })).toBeVisible()
    }
    if (last >= 4) {
      await cont.click()
      await expect(page.getByRole('heading', { name: 'Review & Generate' })).toBeVisible()
    }
  }

  test('TC-OBS-23: walking the wizard writes one wizard.step per step; going back and forward again adds none; Generate writes brief.submitted', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    forbiddenText.add(WIZ_TOPIC)
    await pageLogin(page)
    await page.goto('/brief')
    await walkWizardTo(page, 4)
    // Back twice and forward twice: the steps were already reported.
    await page.getByRole('button', { name: 'Back' }).click()
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('heading', { name: 'Description & caption direction' })).toBeVisible()
    await page.getByRole('button', { name: /continue/i }).click()
    await page.getByRole('button', { name: /continue/i }).click()
    await expect(page.getByRole('heading', { name: 'Review & Generate' })).toBeVisible()

    await waitEvents(admin, {}, 'wizard.step', 5)
    const steps = byName(await events(admin), 'wizard.step')
    expect(steps.map((e) => e.payload.step)).toEqual([0, 1, 2, 3, 4])
    for (const e of steps) expect(e).toMatchObject({ source: 'web', outcome: null })
    expect(steps.every((e) => e.userId && e.teamId)).toBe(true)

    await page.getByRole('button', { name: 'Generate Post' }).click()
    await page.waitForURL(/\/drafts\/[^/]+$/, { timeout: 30_000 })
    const draftId = new URL(page.url()).pathname.split('/').pop()!
    expect((await waitForDraft(admin, draftId)).status).toBe('EXPORTED')

    const submitted = await waitEvents(admin, {}, 'brief.submitted', 1)
    expect(submitted).toHaveLength(1)
    expect(submitted[0].payload).toEqual({ path: 'B', aspectRatio: 'SQUARE', imageStyle: 'classic', resumed: false, postStyle: 'general' })
    // Generate deletes the brief draft keeping its images: that is not an abandonment.
    const all = await events(admin)
    expect(byName(all, 'brief.abandoned')).toHaveLength(0)
    expect(stepsOf(all)).toEqual([0, 1, 2, 3, 4])
    expect(JSON.stringify(all)).not.toContain(WIZ_TOPIC)
    expect(JSON.stringify(all)).not.toContain(DESC_MARKER)
  })

  test('TC-OBS-24: resuming a brief draft reports no steps up to where it stopped, then the next forward step with its draft id; Generate then writes brief.submitted resumed', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const put = await admin.put('/api/brief-drafts', {
      payload: { step: 3, campaignId: '', aspectRatio: 'SQUARE', brandKitId: '', designMode: 'GENERATE', templateId: '', referenceTemplateId: '', topic: WIZ_TOPIC, prompt: WIZ_PROMPT, goal: 'awareness', tone: 'professional', images: [] },
    })
    expect(put.status()).toBe(200)
    const draftId = (await put.json()).id as string
    await pageLogin(page)
    await page.goto(`/brief?resume=${draftId}`)
    await expect(page.getByRole('heading', { name: /Images/ })).toBeVisible({ timeout: 20_000 })
    await new Promise((r) => setTimeout(r, 1500))
    expect(await events(admin)).toHaveLength(0)

    await page.getByRole('button', { name: /continue/i }).click()
    await expect(page.getByRole('heading', { name: 'Review & Generate' })).toBeVisible()
    const steps = await waitEvents(admin, {}, 'wizard.step', 1)
    expect(steps).toHaveLength(1)
    expect(steps[0].payload).toEqual({ step: 4, briefDraftId: draftId })

    await page.getByRole('button', { name: 'Generate Post' }).click()
    await page.waitForURL(/\/drafts\/[^/]+$/, { timeout: 30_000 })
    expect((await waitForDraft(admin, new URL(page.url()).pathname.split('/').pop()!)).status).toBe('EXPORTED')
    const submitted = await waitEvents(admin, {}, 'brief.submitted', 1)
    expect(submitted[0].payload).toMatchObject({ path: 'B', resumed: true })
    expect(byName(await events(admin), 'brief.abandoned')).toHaveLength(0)
    await admin.del(`/api/brief-drafts/${draftId}`) // already gone after Generate: 404 is fine
  })

  test('TC-OBS-25: discarding a brief draft writes brief.abandoned discarded with its last step; a foreign id and the Generate-success delete write nothing', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const draft = (step: number) => ({
      payload: { step, campaignId: '', aspectRatio: 'SQUARE', brandKitId: '', designMode: 'GENERATE', templateId: '', referenceTemplateId: '', topic: WIZ_TOPIC, prompt: WIZ_PROMPT, goal: 'awareness', tone: 'professional', images: [] },
    })
    const id = (await (await admin.put('/api/brief-drafts', draft(3))).json()).id as string
    const keep = (await (await admin.put('/api/brief-drafts', draft(2))).json()).id as string
    expect((await admin.del(`/api/brief-drafts/${keep}?keepImages=true`)).status()).toBe(200)
    expect(await events(admin)).toHaveLength(0)

    const other = await freshEditor(request)
    try {
      expect((await other.api.del(`/api/brief-drafts/${id}`)).status()).toBe(404)
      expect(await events(admin)).toHaveLength(0)
    } finally {
      await other.api.dispose()
    }

    expect((await admin.del(`/api/brief-drafts/${id}`)).status()).toBe(200)
    const abandoned = byName(await events(admin), 'brief.abandoned')
    expect(abandoned).toHaveLength(1)
    expect(abandoned[0]).toMatchObject({ source: 'web', outcome: null, payload: { reason: 'discarded', step: 3 } })
    expect(JSON.stringify(abandoned)).not.toContain(WIZ_TOPIC)
  })

  test('TC-OBS-26: a brief draft idle for 8 days is swept by the dashboard read and writes brief.abandoned expired', async ({ page }) => {
    if (!MOCKED() || !dbAvailable) { test.skip(); return }
    const put = await admin.put('/api/brief-drafts', {
      payload: { step: 2, campaignId: '', aspectRatio: 'SQUARE', brandKitId: '', designMode: 'GENERATE', templateId: '', referenceTemplateId: '', topic: WIZ_TOPIC, prompt: WIZ_PROMPT, goal: 'awareness', tone: 'professional', images: [] },
    })
    const id = (await put.json()).id as string
    await prisma!.briefDraft.update({ where: { id }, data: { updatedAt: new Date(Date.now() - 8 * 86_400_000) } })
    expect(await events(admin)).toHaveLength(0)

    await pageLogin(page)
    await page.goto('/')
    await expect(page.getByText('Recent Drafts').first()).toBeVisible()
    expect(await prisma!.briefDraft.findUnique({ where: { id } })).toBeNull()
    const abandoned = byName(await events(admin), 'brief.abandoned')
    expect(abandoned).toHaveLength(1)
    expect(abandoned[0]).toMatchObject({ source: 'web', outcome: null, payload: { reason: 'expired', step: 2 } })
    expect(abandoned[0].userId).toBeTruthy()
  })

  test('TC-OBS-27: POST /api/events takes team, user and source from the session, and refuses a foreign draft id, an unknown name, a bad payload, an oversized body and no session', async ({ request, playwright }) => {
    if (!MOCKED()) { test.skip(); return }
    const bistec = await findTeamIdByName(admin, 'Bistec')
    const clientx = await findTeamIdByName(admin, 'ClientX')
    const me = await (await admin.get('/api/me')).json()

    const ok = await admin.post('/api/events', { name: 'wizard.step', teamId: clientx, userId: 'someone-else', source: 'mcp', draftId: 'x', payload: { step: 2, teamId: clientx } })
    expect(ok.status()).toBe(204)
    const [stored] = await waitEvents(admin, {}, 'wizard.step', 1)
    expect(stored).toMatchObject({ teamId: bistec, userId: me.userId, source: 'web', draftId: null, payload: { step: 2 } })

    // A server event name, a missing name, a bad step, a bad payload: 400, nothing stored.
    for (const body of [{ name: 'brief.submitted', payload: {} }, { name: 'generation.finished', payload: {} }, { payload: { step: 1 } }, { name: 'wizard.step', payload: { step: 9 } }, { name: 'wizard.step', payload: { step: 'two' } }]) {
      expect((await admin.post('/api/events', body)).status()).toBe(400)
    }
    // Over 2 KB: 413.
    expect((await admin.post('/api/events', { name: 'wizard.step', payload: { step: 1 }, pad: 'x'.repeat(2500) })).status()).toBe(413)

    // A foreign brief draft id: 404 and no event. The owner's own id is kept.
    const other = await freshEditor(request)
    try {
      const theirs = (await (await other.api.put('/api/brief-drafts', {
        payload: { step: 1, campaignId: '', aspectRatio: 'SQUARE', brandKitId: '', designMode: 'GENERATE', templateId: '', referenceTemplateId: '', topic: 'theirs', prompt: 'their private prompt text', goal: 'awareness', tone: 'professional', images: [] },
      })).json()).id as string
      expect((await admin.post('/api/events', { name: 'wizard.step', payload: { step: 1, briefDraftId: theirs } })).status()).toBe(404)
      expect((await other.api.post('/api/events', { name: 'wizard.step', payload: { step: 1, briefDraftId: theirs } })).status()).toBe(204)
      await other.api.del(`/api/brief-drafts/${theirs}?keepImages=true`)
    } finally {
      await other.api.dispose()
    }
    await new Promise((r) => setTimeout(r, 400))
    const list = byName(await events(admin), 'wizard.step')
    expect(list).toHaveLength(2) // the first call and the owner's own id; nothing for the refusals
    expect(list.filter((e) => e.payload.briefDraftId).map((e) => e.payload.step)).toEqual([1])

    // No valid session: 401 (a bogus cookie reaches the route's own check).
    const anon = await playwright.request.newContext({ baseURL: process.env.TEST_BASE_URL, extraHTTPHeaders: { cookie: 'better-auth.session_token=not-a-real-session' } })
    try {
      expect((await anon.post('/api/events', { data: { name: 'wizard.step', payload: { step: 1 } } })).status()).toBe(401)
    } finally {
      await anon.dispose()
    }
  })

  test('TC-OBS-28: the 61st event in a minute is dropped and counted, and the first 60 are stored', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const user = await freshEditor(request)
    try {
      for (let i = 0; i < 63; i++) {
        expect((await user.api.post('/api/events', { name: 'wizard.step', payload: { step: i % 5 } })).status()).toBe(204)
      }
      await expect
        .poll(async () => (await events(admin)).filter((e) => e.userId === user.userId).length, { timeout: 15_000 })
        .toBe(60)
      await new Promise((r) => setTimeout(r, 400))
      expect((await events(admin)).filter((e) => e.userId === user.userId)).toHaveLength(60)
      await waitDrop(admin, 'wizard.step', 3)
      const drop = (await seamGet(admin)).drops.find((d) => d.name === 'wizard.step')
      expect(drop).toMatchObject({ dropped: 3, rejected: 0, lastReason: 'rate-limit' })
      // The loss is on the page too.
      const lost = (await (await admin.get('/api/admin/insights?range=7d')).json()).lost
      expect(lost.find((l: { name: string }) => l.name === 'wizard.step')).toMatchObject({ dropped: 3 })
    } finally {
      await user.api.dispose()
    }
  })

  test('TC-OBS-29: the funnel figures on the API and the page equal a hand count over a seeded set', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const team = await findTeamIdByName(admin, 'Bistec')
    const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600_000).toISOString()
    const step = (n: number, s: number, hoursAgo = 2) => Array.from({ length: n }, () => ({ name: 'wizard.step', source: 'web', teamId: team, userId: 'u1', outcome: null, at: at(hoursAgo), payload: { step: s } }))
    const rows = [
      ...step(10, 0), ...step(8, 1), ...step(6, 2), ...step(3, 3), ...step(2, 4),
      ...Array.from({ length: 2 }, () => ({ name: 'brief.submitted', source: 'web', teamId: team, userId: 'u1', outcome: null, at: at(2), payload: { path: 'B', aspectRatio: 'SQUARE', imageStyle: 'classic', resumed: false } })),
      ...Array.from({ length: 4 }, () => ({ name: 'brief.submitted', source: 'web', teamId: team, userId: 'u1', outcome: null, at: at(2), payload: { path: 'B', aspectRatio: 'SQUARE', imageStyle: 'classic', resumed: true } })),
      ...Array.from({ length: 3 }, () => ({ name: 'brief.abandoned', source: 'web', teamId: team, userId: 'u1', outcome: null, at: at(3), payload: { reason: 'expired', step: 2 } })),
      { name: 'brief.abandoned', source: 'web', teamId: team, userId: 'u1', outcome: null, at: at(3), payload: { reason: 'discarded', step: 1 } },
      // outside the 30-day range: counted by nothing
      ...step(7, 0, 24 * 40),
    ]
    await seed(admin, rows)

    const funnel = (await (await admin.get('/api/admin/insights?range=30d')).json()).funnel
    expect(funnel.reached.map((r: { n: number }) => r.n)).toEqual([10, 8, 6, 3, 2])
    expect(funnel.reached.map((r: { ofStart: number }) => r.ofStart)).toEqual([1, 0.8, 0.6, 0.3, 0.2])
    // 2 fresh submissions are rated against step 0; the 4 resumed ones have no step 0 and no rate
    expect(funnel.submitted).toEqual({ n: 2, ofStart: 0.2 })
    expect(funnel.submittedResumed).toEqual({ n: 4 })
    expect(funnel.abandoned).toEqual({ expired: 3, discarded: 1 })
    const wide = (await (await admin.get('/api/admin/insights?range=90d')).json()).funnel
    expect(wide.reached[0].n).toBe(17)

    await pageLogin(page)
    await page.goto('/admin/insights')
    await expect(page.getByTestId('insights-body')).toBeVisible()
    await expect(page.getByTestId('funnel-step-0')).toContainText('10')
    await expect(page.getByTestId('funnel-step-4')).toContainText('2')
    await expect(page.getByTestId('funnel-rate-step-1')).toHaveText('80%')
    await expect(page.getByTestId('funnel-rate-step-3')).toHaveText('30%')
    await expect(page.getByTestId('funnel-rate-submitted')).toHaveText('20%')
    await expect(page.getByTestId('funnel-submitted')).toContainText('2')
    await expect(page.getByTestId('funnel-submitted-resumed')).toContainText('4')
    await expect(page.getByTestId('funnel-rate-submitted-resumed')).toHaveText('–')
    await expect(page.getByTestId('funnel-abandoned-expired')).toHaveText('3')
    await expect(page.getByTestId('funnel-abandoned-discarded')).toHaveText('1')
  })

  test('TC-OBS-30: token totals count reported events only, and the page shows the not-reported share', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    // The MOCK_AI seam bypasses createMessage, so the events are seeded; the
    // summing itself is proven by tests/unit/analyticsUsage.test.ts.
    await clearStore(admin)
    const team = await findTeamIdByName(admin, 'Bistec')
    const gen = (hoursAgo: number, route: string, tokens: [number, number] | null) => ({
      name: 'generation.finished', source: 'web', teamId: team, userId: 'u1', draftId: null, outcome: 'ok', durationMs: 10000,
      at: new Date(Date.now() - hoursAgo * 3600_000).toISOString(),
      payload: { designModel: { model: 'SONNET' }, captionRoute: route, inputTokens: tokens ? tokens[0] : null, outputTokens: tokens ? tokens[1] : null },
    })
    await seed(admin, [
      gen(1, 'API_KEY', [1000, 200]), gen(2, 'API_KEY', [500, 100]), gen(3, 'API_KEY', null),
      gen(4, 'CLI', null), gen(5, 'CLI', null),
    ])
    const rows = (await (await admin.get('/api/admin/insights?range=7d')).json()).durations
    const api = rows.find((d: { route: string }) => d.route === 'API_KEY')
    const cli = rows.find((d: { route: string }) => d.route === 'CLI')
    expect(api).toMatchObject({ n: 3, inputTokens: 1500, outputTokens: 300, notReported: 1 })
    expect(cli).toMatchObject({ n: 2, inputTokens: 0, outputTokens: 0, notReported: 2 })

    await pageLogin(page)
    await page.goto('/admin/insights')
    await expect(page.getByTestId('insights-body')).toBeVisible()
    const apiRow = page.getByTestId('duration-generation-SONNET-API_KEY')
    await expect(apiRow).toContainText('1,500')
    await expect(apiRow).toContainText('300')
    await expect(apiRow).toContainText('33%')
    const cliRow = page.getByTestId('duration-generation-SONNET-CLI')
    await expect(cliRow).toContainText('100%')
  })

  // ── Post styles (027 FR-14, AC-14) ───────────────────────────────────────

  test('TC-OBS-31: brief.submitted, generation.finished and scheduled_generation.settled carry the post style, the facts status and held; none holds a flagged value', async () => {
    if (!MOCKED() || !dbAvailable) { test.skip(); return }
    const generate = async (topic: string, postStyle: string) => {
      const res = await admin.post('/api/briefs', { topic, postStyle, channels: ['INSTAGRAM'], designMode: 'GENERATE', copyProviderKey: 'cli' })
      expect(res.status()).toBe(201)
      const brief = await res.json()
      const assemble = await admin.post('/api/generate/assemble-b', { briefId: brief.id })
      expect(assemble.status()).toBe(202)
      const draft = await waitForDraft(admin, (await assemble.json()).draftId)
      expect(draft.status).toBe('EXPORTED')
      rememberText(draft)
      return draft as { id: string }
    }
    const flagged = await generate(`__MOCK_FACT_PRICE__ __MOCK_FACT_DATE__ Obs styled ${Date.now()}`, 'promotion')
    const clear = await generate(`Obs clear ${Date.now()}`, 'tip')

    const submitted = byName(await events(admin), 'brief.submitted')
    expect(submitted.map((e) => e.payload.postStyle).sort()).toEqual(['promotion', 'tip'])

    // two invented values, each placed in the headline and both captions: six flags
    const [f] = await waitEvents(admin, { draftId: flagged.id }, 'generation.finished', 1)
    expect(f.payload).toMatchObject({ postStyle: 'promotion', factsStatus: 'flagged', factsFlagCount: 6 })
    const [c] = await waitEvents(admin, { draftId: clear.id }, 'generation.finished', 1)
    expect(c.payload).toMatchObject({ postStyle: 'tip', factsStatus: 'clear', factsFlagCount: 0 })

    // The scheduler: a flagged check holds a PUBLISH_NOW entry, a HOLD entry is not held.
    const camp = await createCampaign(admin, `Obs Style Sched ${Date.now()}`)
    const addEntry = async (topic: string, postAction: string) => {
      const entry = await (await admin.post(`/api/campaigns/${camp.id}/queue`, {
        topic, postStyle: 'launch', channels: ['INSTAGRAM'], designMode: 'GENERATE',
        generateAt: new Date(Date.now() + 24 * 3600_000).toISOString(), postAction,
      })).json()
      await prisma!.scheduledGeneration.update({ where: { id: entry.id }, data: { generateAt: new Date(Date.now() - 1000), nextRetryAt: null } })
      return entry.id as string
    }
    await clearStore(admin)
    await addEntry(`__MOCK_FACT_PRICE__ Obs held ${Date.now()}`, 'PUBLISH_NOW')
    expect((await admin.post('/api/test/generation-tick', {})).status()).toBe(200)
    const heldEvent = byName(await events(admin), 'scheduled_generation.settled')
    expect(heldEvent).toHaveLength(1)
    expect(heldEvent[0]).toMatchObject({ outcome: 'completed' })
    expect(heldEvent[0].payload).toMatchObject({ postStyle: 'launch', held: true })

    await clearStore(admin)
    await addEntry(`Obs hold ${Date.now()}`, 'HOLD')
    expect((await admin.post('/api/test/generation-tick', {})).status()).toBe(200)
    const holdEvent = byName(await events(admin), 'scheduled_generation.settled')
    expect(holdEvent).toHaveLength(1)
    expect(holdEvent[0].payload).toMatchObject({ postStyle: 'launch', held: false })

    // NFR-05: the invented values the mock wrote never reach an event.
    for (const e of [...submitted, f, c, ...heldEvent, ...holdEvent]) {
      const text = JSON.stringify(e.payload)
      expect(text, `${e.name} payload`).not.toContain('$49')
      expect(text, `${e.name} payload`).not.toContain('30 March 2027')
    }
  })

  // ── Privacy (AC-04) ──────────────────────────────────────────────────────

  test('TC-OBS-22: no event the suite collected holds the brief text, a caption, the headline or HTML', async () => {
    if (!MOCKED()) { test.skip(); return }
    expect(collected.length).toBeGreaterThan(10)
    expect(forbiddenText.size).toBeGreaterThan(0)
    for (const e of collected) {
      const text = JSON.stringify(e.payload)
      expect(text, `${e.name} payload`).not.toContain(DESC_MARKER)
      expect(text, `${e.name} payload`).not.toMatch(/<html|<!doctype|<body/i)
      for (const v of ['$49', '35% off', '30 March 2027', '1,250 customers']) expect(text, `${e.name} payload holds a flagged value`).not.toContain(v)
      for (const t of forbiddenText) expect(text, `${e.name} payload holds a caption`).not.toContain(t)
    }
  })
})
