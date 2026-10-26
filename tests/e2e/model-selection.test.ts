import { test, expect, type APIResponse, type Locator, type Page, type Request } from '@playwright/test'
import { loginAs, waitForDraft, waitForAction, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'
import { expectNoAxeViolations } from '../helpers/axe'
import { ADMIN_EMAIL, ADMIN_PASSWORD, briefDraftIds, pageLogin } from '../helpers/ui'

// §Y — Model selection (change 008, wave 1: AC-15 → AC-22; wave 2: AC-27 →
// AC-31 and AC-33's axe scans, TC-MODEL-13 onward). AC-23's rollback round
// trip (TC-MODEL-12) was removed with the 008 down script by change 016.
//
// Contract (spec FR-03 → FR-16):
//   Every model call resolves through one resolver: request > stamp > team
//     default > system default > fallback, each tier checked against the
//     team's effective set at call time.
//   The stamps (FR-08) are the arg that crossed the boundary — the full apiId
//     here, because the mock E2E runs API mode:
//       captions[].model, headlineModel, designModel (= the current revision's
//       DraftRevision.model), each with a …SubstitutedFrom sibling.
//   GET/PUT /api/team/model-policy (team admins) and GET /api/models (members).
//
// Deterministic seams (MOCK_AI + MOCK_PUPPETEER):
//   - every MOCK_AI branch on a model surface records the ResolvedModel it was
//     handed (FR-16); GET /api/test/model-calls reads the ring buffer, DELETE
//     clears it. Each case clears it before the action it asserts on.
//   - stamps are seeded straight into the test DB, as §W does.
//
// Every case that changes a team's policy deletes the TeamModelPolicy row
// afterwards (afterEach), which is the exact "never saved" state, so no later
// suite inherits a changed team.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const PASSWORD = 'BistecStudio2026!'
const EDITOR_EMAIL = 'editor@bisteccare.lk'
const CLIENTX_EMAIL = 'clientx.admin@users.bistec.internal'

// The catalogue's apiIds (spec FR-01). API mode passes the apiId, so these
// are exactly the stamps and the recorded args.
const HAIKU = 'claude-haiku-4-5'
const SONNET = 'claude-sonnet-5-5'
const OPUS = 'claude-opus-5-5'

type Key = 'HAIKU' | 'SONNET' | 'OPUS'
type Surface =
  | 'CAPTION'
  | 'DESIGN_TEMPLATE'
  | 'DESIGN_FREEFORM'
  | 'REFINE'
  | 'ASSISTANT_BRIEFING'
  | 'ASSISTANT_BRANDKIT'
  | 'INTERNAL_BACKGROUND'
  | 'INTERNAL_VERIFIER'
  | 'INTERNAL_TOKEN_PING'
type Call = {
  surface: Surface
  key: Key
  arg: string
  mode: 'api' | 'cli'
  source: 'request' | 'stamp' | 'team' | 'system' | 'fallback'
  substitutedFrom: string | null
  label: string | null
}
type Caption = {
  channel: 'INSTAGRAM' | 'LINKEDIN'
  text: string
  status: string
  updatedAt: string
  model: string | null
  modelSubstitutedFrom: string | null
}
type Draft = Record<string, unknown>

const ALL: Key[] = ['HAIKU', 'SONNET', 'OPUS']

// ── The recorder ─────────────────────────────────────────────────────────────

const CALLS = '/api/test/model-calls'
async function clearCalls(api: ApiClient) {
  expect((await api.del(CALLS)).status()).toBe(204)
}
async function readCalls(api: ApiClient): Promise<Call[]> {
  const res = await api.get(CALLS)
  expect(res.status()).toBe(200)
  return (await res.json()).calls as Call[]
}
const on = (calls: Call[], surface: Surface) => calls.filter((c) => c.surface === surface)

// Every record on `surface` ran `arg` from `source`, and there is at least one.
function expectRan(calls: Call[], surface: Surface, arg: string, source: Call['source']) {
  const mine = on(calls, surface)
  expect(mine.length, `${surface} was recorded`).toBeGreaterThan(0)
  for (const c of mine) {
    expect(c.arg, `${surface} arg`).toBe(arg)
    expect(c.source, `${surface} source`).toBe(source)
    expect(c.mode, `${surface} mode`).toBe('api')
  }
}

// ── The policy ───────────────────────────────────────────────────────────────

type PolicyBody = {
  allowed: Key[]
  defaults: Partial<Record<Surface, Key | null>>
  requirePersonalTokenForGated: boolean
}
const policy = (over: Partial<PolicyBody> = {}): PolicyBody => ({
  allowed: ALL,
  defaults: {},
  requirePersonalTokenForGated: false,
  ...over,
})
async function putPolicy(api: ApiClient, body: PolicyBody) {
  const res = await api.put('/api/team/model-policy', body)
  expect(res.status(), JSON.stringify(await res.json())).toBe(200)
}
const activeTeamId = async (api: ApiClient): Promise<string> =>
  (await (await api.get('/api/me')).json()).activeTeamId as string
async function resetPolicy(teamId: string | null) {
  if (teamId && prisma) await prisma.teamModelPolicy.deleteMany({ where: { teamId } })
}

// ── Drafts ───────────────────────────────────────────────────────────────────

const captionsOf = (d: Draft) => d.captions as Caption[]
const captionOf = (d: Draft, channel: Caption['channel']) => captionsOf(d).find((c) => c.channel === channel)!
const read = async (api: ApiClient, id: unknown): Promise<Draft> => (await api.get(`/api/drafts/${id}`)).json()
const revisionModel = async (draftId: string, revisionNumber: number) =>
  prisma!.draftRevision.findFirstOrThrow({
    where: { draftId, revisionNumber },
    select: { model: true, modelSubstitutedFrom: true },
  })

// One kit (with a square template) + campaign per worker, shared by the suite.
let fixture: { kitId: string; kitName: string; templateId: string; templateName: string; campaignId: string } | null = null
async function suiteFixture(api: ApiClient) {
  if (fixture) return fixture
  const stamp = Date.now()
  const kit = await (await api.post('/api/admin/brandkits', { name: `Models Kit ${stamp}`, colors: ['#0b6e4f'] })).json()
  const template = await (
    await api.post(`/api/admin/brandkits/${kit.id}/templates`, {
      name: `Models Template ${stamp}`,
      htmlTemplate: '<html><body style="width:1080px;height:1080px;background:#0b6e4f;color:#fff">{{topic}}</body></html>',
    })
  ).json()
  const camp = await (await api.post('/api/campaigns', { name: `Models Camp ${stamp}`, brandKitId: kit.id })).json()
  fixture = { kitId: kit.id, kitName: kit.name, templateId: template.id, templateName: template.name, campaignId: camp.id }
  return fixture
}

async function generate(api: ApiClient, path: 'A' | 'B', topic: string): Promise<Draft> {
  const f = await suiteFixture(api)
  const brief = await api.post('/api/briefs', {
    topic,
    goal: 'g',
    tone: 'professional',
    channels: ['INSTAGRAM'],
    designMode: path === 'A' ? 'TEMPLATE' : 'GENERATE',
    copyProviderKey: 'cli',
    campaignId: f.campaignId,
  })
  expect(brief.status()).toBe(201)
  const briefId = (await brief.json()).id
  const res =
    path === 'A'
      ? await api.post('/api/generate/assemble-a', { briefId, templateId: f.templateId })
      : await api.post('/api/generate/assemble-b', { briefId })
  expect(res.status()).toBe(202)
  const draft = await waitForDraft(api, (await res.json()).draftId)
  expect(draft.status, String(draft.failureReason)).toBe('EXPORTED')
  return draft
}

async function act(api: ApiClient, id: unknown, path: string, body: unknown): Promise<Draft> {
  const res = await api.post(`/api/drafts/${id}/${path}`, body)
  expect(res.status(), `${path} → ${await res.text()}`).toBe(202)
  const done = await waitForAction(api, id as string)
  expect(done.pendingActionError, `${path} settled cleanly`).toBeNull()
  return done
}

// ── AC-15 → AC-21: the stamps, the policy and the recorder ───────────────────

test.describe('§Y — model selection: stamps, policy and the recorder', () => {
  let api: ApiClient
  let teamId: string | null = null
  test.beforeEach(async ({ request }) => {
    test.skip(!dbAvailable, 'requires test DB access')
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    teamId = await activeTeamId(api)
    await resetPolicy(teamId)
  })
  test.afterEach(async () => {
    await resetPolicy(teamId)
    await api?.dispose()
  })

  // TC-MODEL-01 — AC-15 (FR-08, FR-04): a Path B generation on system defaults.
  test('a Path B draft stamps Haiku on the captions and the headline and Sonnet on the design', async () => {
    if (!MOCKED()) { test.skip(); return }
    await clearCalls(api)
    const draft = await generate(api, 'B', `Models PathB ${Date.now()}`)

    expect(captionsOf(draft)).toHaveLength(2)
    for (const c of captionsOf(draft)) {
      expect(c.model, c.channel).toBe(HAIKU)
      expect(c.modelSubstitutedFrom, c.channel).toBeNull()
    }
    expect(draft.headlineModel).toBe(HAIKU)
    expect(draft.headlineModelSubstitutedFrom).toBeNull()
    expect(draft.designModel).toBe(SONNET)
    expect(draft.designModelSubstitutedFrom).toBeNull()
    expect(await revisionModel(draft.id as string, 1)).toEqual({ model: SONNET, modelSubstitutedFrom: null })
    // The revisions list carries the stamp too (FR-16, additive).
    const revisions = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()
    expect(revisions.map((r: { revisionNumber: number; model: string }) => [r.revisionNumber, r.model])).toEqual([[1, SONNET]])

    const calls = await readCalls(api)
    expectRan(calls, 'CAPTION', HAIKU, 'system')
    expectRan(calls, 'DESIGN_FREEFORM', SONNET, 'system')
    expect(on(calls, 'CAPTION').every((c) => c.key === 'HAIKU' && c.substitutedFrom === null)).toBe(true)
  })

  // TC-MODEL-02 — AC-15 (FR-08): a Path A generation runs template fill on Haiku.
  test('a Path A draft stamps Haiku on the design (template fill)', async () => {
    if (!MOCKED()) { test.skip(); return }
    await clearCalls(api)
    const draft = await generate(api, 'A', `Models PathA ${Date.now()}`)

    expect(draft.designModel).toBe(HAIKU)
    expect(await revisionModel(draft.id as string, 1)).toEqual({ model: HAIKU, modelSubstitutedFrom: null })
    const calls = await readCalls(api)
    expectRan(calls, 'DESIGN_TEMPLATE', HAIKU, 'system')
    expect(on(calls, 'DESIGN_FREEFORM')).toEqual([])
  })

  // TC-MODEL-03 — AC-16 (FR-05, FR-13): a team default reaches the next generation.
  test('a team DESIGN_FREEFORM default of Opus makes the next generation design on Opus', async () => {
    if (!MOCKED()) { test.skip(); return }
    const res = await api.put('/api/team/model-policy', policy({ defaults: { DESIGN_FREEFORM: 'OPUS' } }))
    expect(res.status()).toBe(200)
    const saved = await res.json()
    expect(saved.saved).toBe(true)
    expect(saved.defaults.DESIGN_FREEFORM).toBe('OPUS')
    expect(saved.defaults.CAPTION).toBeNull()

    await clearCalls(api)
    const draft = await generate(api, 'B', `Models TeamOpus ${Date.now()}`)
    expect(draft.designModel).toBe(OPUS)
    expect(draft.designModelSubstitutedFrom).toBeNull()
    expect(await revisionModel(draft.id as string, 1)).toEqual({ model: OPUS, modelSubstitutedFrom: null })
    // Only the surface with a team default moved.
    expect(captionOf(draft, 'INSTAGRAM').model).toBe(HAIKU)

    const calls = await readCalls(api)
    expectRan(calls, 'DESIGN_FREEFORM', OPUS, 'team')
    expectRan(calls, 'CAPTION', HAIKU, 'system')
  })

  // TC-MODEL-04 — AC-16 (FR-05, FR-13, FR-16): validation, permissions, the
  // picker view, the recorder's gate.
  test('the policy PUT refuses invalid policies and editors; GET /api/models carries no ID or price', async ({ request }) => {
    const before = await (await api.get('/api/team/model-policy')).json()
    expect(before).toMatchObject({ allowed: ALL, saved: false, requirePersonalTokenForGated: false, newModels: [] })

    const opusOnly = await api.put('/api/team/model-policy', policy({ allowed: ['OPUS'] }))
    expect(opusOnly.status()).toBe(400)
    expect((await opusOnly.json()).error).toBe('Template fill needs Haiku or Sonnet allowed')

    const outside = await api.put(
      '/api/team/model-policy',
      policy({ allowed: ['HAIKU', 'SONNET'], defaults: { DESIGN_FREEFORM: 'OPUS' } }),
    )
    expect(outside.status()).toBe(400)
    expect((await outside.json()).error).toBeTruthy()

    // Closed vocabularies at the boundary (NFR-05).
    expect((await api.put('/api/team/model-policy', policy({ allowed: ['opus' as Key] }))).status()).toBe(400)
    expect((await api.put('/api/team/model-policy', { ...policy(), teamId: 'x' })).status()).toBe(400)

    // Nothing above was written.
    expect((await (await api.get('/api/team/model-policy')).json()).saved).toBe(false)

    const editor = await loginAs(request, EDITOR_EMAIL, PASSWORD)
    try {
      expect((await editor.put('/api/team/model-policy', policy())).status()).toBe(403)
      expect((await editor.get('/api/team/model-policy')).status()).toBe(403)
      // Any member reads the picker view; it never names an apiId or a price.
      const view = await editor.get('/api/models')
      expect(view.status()).toBe(200)
      const body = await view.json()
      expect(body.mode).toBe('api')
      expect(body.credential).toBe('n/a')
      expect(body.allowed).toEqual(ALL)
      expect(body.catalogue.map((e: { key: Key; tier: string }) => [e.key, e.tier])).toEqual([
        ['HAIKU', '$'],
        ['SONNET', '$$'],
        ['OPUS', '$$$'],
      ])
      const opus = body.catalogue.find((e: { key: Key }) => e.key === 'OPUS')
      expect(opus.surfaces).not.toContain('DESIGN_TEMPLATE')
      const text = JSON.stringify(body)
      expect(text).not.toMatch(/claude-/)
      expect(text).not.toMatch(/price/i)
      // The recorder seam is admin-only.
      expect((await editor.get(CALLS)).status()).toBe(403)
    } finally {
      await editor.dispose()
    }
  })

  // TC-MODEL-05 — AC-16 (FR-13): team B's policy never reaches team A.
  test("ClientX's Opus default leaves Bistec's generations on Sonnet", async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const clientx = await loginAs(request, CLIENTX_EMAIL, PASSWORD, { team: 'ClientX' })
    const clientxTeam = await activeTeamId(clientx)
    expect(clientxTeam).not.toBe(teamId)
    try {
      await putPolicy(clientx, policy({ defaults: { DESIGN_FREEFORM: 'OPUS', CAPTION: 'SONNET' } }))
      expect((await (await clientx.get('/api/team/model-policy')).json()).defaults.DESIGN_FREEFORM).toBe('OPUS')
      // Bistec's own policy is untouched: still never saved.
      expect((await (await api.get('/api/team/model-policy')).json()).saved).toBe(false)

      await clearCalls(api)
      const draft = await generate(api, 'B', `Models Isolation ${Date.now()}`)
      expect(draft.designModel).toBe(SONNET)
      expect(captionOf(draft, 'LINKEDIN').model).toBe(HAIKU)
      const calls = await readCalls(api)
      expectRan(calls, 'DESIGN_FREEFORM', SONNET, 'system')
      expectRan(calls, 'CAPTION', HAIKU, 'system')
    } finally {
      await resetPolicy(clientxTeam)
      await clientx.dispose()
    }
  })

  // TC-MODEL-06 — AC-17 (FR-03, FR-09, security BLOCK): removing Opus applies
  // to stored stamps, not just to new requests.
  test('after Opus is removed, an Opus-stamped design and caption regenerate on the defaults, recorded as substitutions', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await generate(api, 'B', `Models Removal ${Date.now()}`)
    const id = draft.id as string
    await prisma!.draft.update({ where: { id }, data: { designModel: OPUS } })
    await prisma!.draftCaption.update({
      where: { draftId_channel: { draftId: id, channel: 'LINKEDIN' } },
      data: { model: OPUS },
    })
    const seeded = await read(api, id)
    expect(seeded.designModel).toBe(OPUS)
    expect(captionOf(seeded, 'LINKEDIN').model).toBe(OPUS)

    await putPolicy(api, policy({ allowed: ['HAIKU', 'SONNET'] }))
    await clearCalls(api)

    const designed = await act(api, id, 'regenerate-design', {})
    expect(designed.currentRevisionNumber).toBe(2)
    expect(designed.designModel).toBe(SONNET)
    expect(designed.designModelSubstitutedFrom).toBe(OPUS)
    expect(await revisionModel(id, 2)).toEqual({ model: SONNET, modelSubstitutedFrom: OPUS })

    const recaptioned = await act(api, id, 'regenerate-copy', { channel: 'LINKEDIN' })
    expect(captionOf(recaptioned, 'LINKEDIN')).toMatchObject({ model: HAIKU, modelSubstitutedFrom: OPUS })
    // The other row was never written: same stamp, same updatedAt.
    for (const channel of ['INSTAGRAM'] as const) {
      expect(captionOf(recaptioned, channel)).toEqual(captionOf(seeded, channel))
    }
    expect(recaptioned.designModel).toBe(SONNET) // a caption action leaves the design stamp

    const calls = await readCalls(api)
    expect(calls.filter((c) => c.key === 'OPUS' || c.arg === OPUS)).toEqual([])
    expect(on(calls, 'DESIGN_FREEFORM').map((c) => [c.arg, c.source, c.substitutedFrom])).toEqual([[SONNET, 'system', OPUS]])
    expect(on(calls, 'CAPTION').map((c) => [c.arg, c.source, c.substitutedFrom])).toEqual([[HAIKU, 'system', OPUS]])
  })

  // TC-MODEL-07 — AC-18 (FR-09): Regenerate all is like for like, by the stamps.
  test('Regenerate all keeps a uniform stamp, uses the team default on mixed stamps, and the system default on null ones', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await generate(api, 'B', `Models LikeForLike ${Date.now()}`)
    const id = draft.id as string
    const setStamps = async (models: [string | null, string | null]) => {
      const channels = ['INSTAGRAM', 'LINKEDIN'] as const
      for (const [i, channel] of channels.entries()) {
        await prisma!.draftCaption.update({
          where: { draftId_channel: { draftId: id, channel } },
          data: { model: models[i], modelSubstitutedFrom: null },
        })
      }
    }
    const stampsOf = (d: Draft) => captionsOf(d).map((c) => [c.model, c.modelSubstitutedFrom])

    // (a) Two equal stamps: the stamp tier.
    await setStamps([SONNET, SONNET])
    await clearCalls(api)
    let done = await act(api, id, 'regenerate-copy', {})
    expect(stampsOf(done)).toEqual([[SONNET, null], [SONNET, null]])
    expectRan(await readCalls(api), 'CAPTION', SONNET, 'stamp')

    // (b) Mixed stamps (Opus allowed) and a team CAPTION default of Haiku: no
    // stamp tier, the team default, and no substitution recorded.
    await putPolicy(api, policy({ defaults: { CAPTION: 'HAIKU' } }))
    await setStamps([SONNET, OPUS])
    await clearCalls(api)
    done = await act(api, id, 'regenerate-copy', {})
    expect(stampsOf(done)).toEqual([[HAIKU, null], [HAIKU, null]])
    let calls = await readCalls(api)
    expectRan(calls, 'CAPTION', HAIKU, 'team')
    expect(on(calls, 'CAPTION').every((c) => c.substitutedFrom === null)).toBe(true)

    // (c) Null stamps (a pre-008 draft) with no team default: the system default.
    await resetPolicy(teamId)
    await setStamps([null, null])
    await clearCalls(api)
    done = await act(api, id, 'regenerate-copy', {})
    expect(stampsOf(done)).toEqual([[HAIKU, null], [HAIKU, null]])
    calls = await readCalls(api)
    expectRan(calls, 'CAPTION', HAIKU, 'system')
    expect(on(calls, 'CAPTION').every((c) => c.substitutedFrom === null)).toBe(true)
    // Regenerate all never touches the headline or its stamp.
    expect(done.headlineModel).toBe(HAIKU)
    expect(done.headline).toBe(draft.headline)
  })

  // TC-MODEL-08 — AC-19 (FR-08, A8): refine by path, the Haiku verifier, a team
  // REFINE default, and restore.
  test('refine runs Sonnet on Path B with a Haiku verifier, Haiku on Path A, Opus by team default, and restore brings back the old stamp', async () => {
    if (!MOCKED()) { test.skip(); return }
    const b = await generate(api, 'B', `Models Refine B ${Date.now()}`)
    const bId = b.id as string
    await clearCalls(api)
    // An "add" instruction: a bare mock document defaults to the add class,
    // whose post-condition is the verifier (004 TC-FID-09).
    let done = await act(api, bId, 'refine', { instruction: 'Include a human character' })
    expect(done.currentRevisionNumber).toBe(2)
    expect(await revisionModel(bId, 2)).toEqual({ model: SONNET, modelSubstitutedFrom: null })
    expect(done.designModel).toBe(SONNET)
    let calls = await readCalls(api)
    expectRan(calls, 'REFINE', SONNET, 'system')
    expectRan(calls, 'INTERNAL_VERIFIER', HAIKU, 'system')
    expect(on(calls, 'INTERNAL_VERIFIER').every((c) => c.key === 'HAIKU' && c.label === 'verify')).toBe(true)

    // Path A: the REFINE system default follows the draft's path.
    const a = await generate(api, 'A', `Models Refine A ${Date.now()}`)
    await clearCalls(api)
    const aDone = await act(api, a.id, 'refine', { instruction: 'Make the background darker' })
    expect(aDone.currentRevisionNumber).toBe(2)
    expect(await revisionModel(a.id as string, 2)).toEqual({ model: HAIKU, modelSubstitutedFrom: null })
    expect(aDone.designModel).toBe(HAIKU)
    expectRan(await readCalls(api), 'REFINE', HAIKU, 'system')

    // A team REFINE default of Opus.
    await putPolicy(api, policy({ defaults: { REFINE: 'OPUS' } }))
    await clearCalls(api)
    done = await act(api, bId, 'refine', { instruction: 'Make the headline bolder' })
    expect(done.currentRevisionNumber).toBe(3)
    expect(await revisionModel(bId, 3)).toEqual({ model: OPUS, modelSubstitutedFrom: null })
    expect(done.designModel).toBe(OPUS)
    calls = await readCalls(api)
    expectRan(calls, 'REFINE', OPUS, 'team')
    // The verifier is internal: never the team's choice.
    for (const c of on(calls, 'INTERNAL_VERIFIER')) expect(c.arg).toBe(HAIKU)

    // Restore revision 1: the draft's design stamp is that revision's own.
    const restore = await api.post(`/api/drafts/${bId}/revisions/1/restore`, {})
    expect(restore.status()).toBe(200)
    const restored = await read(api, bId)
    expect(restored.currentRevisionNumber).toBe(1)
    expect(restored.designModel).toBe(SONNET)
    expect(restored.designModelSubstitutedFrom).toBeNull()
  })

  // TC-MODEL-09 — AC-20 (FR-11): the scheduler and ACP use the team default.
  test('a scheduled HOLD entry and ACP generate_post both design on the team default', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    await putPolicy(api, policy({ defaults: { DESIGN_FREEFORM: 'OPUS' } }))

    // The scheduler (userId null → credential 'team'; API mode, so not gated).
    const f = await suiteFixture(api)
    const entryRes = await api.post(`/api/campaigns/${f.campaignId}/queue`, {
      topic: `Models Scheduled ${Date.now()}`,
      goal: 'Awareness',
      tone: 'professional',
      channels: ['INSTAGRAM'],
      designMode: 'GENERATE',
      generateAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
      postAction: 'HOLD',
    })
    expect(entryRes.status()).toBe(201)
    const entry = await entryRes.json()
    await prisma!.scheduledGeneration.update({
      where: { id: entry.id },
      data: { generateAt: new Date(Date.now() - 1000), nextRetryAt: null },
    })
    await clearCalls(api)
    expect((await api.post('/api/test/generation-tick', {})).status()).toBe(200)
    const after = await prisma!.scheduledGeneration.findUniqueOrThrow({ where: { id: entry.id } })
    expect(after.status).toBe('COMPLETED')
    expect(after.errorReason).toBeNull()
    const scheduled = await read(api, after.draftId)
    expect(scheduled.status).toBe('EXPORTED')
    expect(scheduled.designModel).toBe(OPUS)
    expect(await revisionModel(after.draftId!, 1)).toEqual({ model: OPUS, modelSubstitutedFrom: null })
    const tickCalls = (await readCalls(api)).filter((c) => c.surface === 'DESIGN_FREEFORM' && c.arg === OPUS)
    expect(tickCalls.length).toBeGreaterThan(0)
    expect(tickCalls.every((c) => c.source === 'team')).toBe(true)

    // ACP generate_post, on a team API key. The `request` fixture carries no
    // session, so the key is the only credential. An unknown `model` in the
    // input is ignored (FR-11: MCP/ACP have no model input).
    const created = await (await api.post('/api/team/api-keys', { label: `Models suite ${Date.now()}` })).json()
    try {
      await clearCalls(api)
      const gen = await request.post('/api/acp/run', {
        headers: { 'x-bistec-api-key': created.plaintext },
        data: {
          capability: 'generate_post',
          input: {
            topic: `Models ACP ${Date.now()}`,
            goal: 'Drive signups',
            tone: 'professional',
            channels: ['INSTAGRAM'],
            designMode: 'GENERATE',
            model: 'HAIKU',
          },
        },
      })
      expect(gen.status()).toBe(200)
      const { draftId } = (await gen.json()).output
      const acpDraft = await read(api, draftId)
      expect(acpDraft.designModel).toBe(OPUS)
      expect(captionOf(acpDraft, 'INSTAGRAM').model).toBe(HAIKU)
      expectRan(await readCalls(api), 'DESIGN_FREEFORM', OPUS, 'team')
    } finally {
      await api.del(`/api/team/api-keys/${created.id}`)
    }
  })

  // TC-MODEL-10 — AC-21 (FR-02, A7): the assistants and the stamp-less
  // surfaces record Sonnet (system), then Haiku (team) after a team default.
  test('the briefing chat, both Enhances, the brand-kit chat, image → template and both voice drafts follow the assistant defaults', async () => {
    if (!MOCKED()) { test.skip(); return }
    const f = await suiteFixture(api)
    const kitId = f.kitId
    // The improve route needs an active voice prompt to improve.
    expect((await api.post(`/api/admin/brandkits/${kitId}/prompts`, { content: 'You are the Models voice.' })).status()).toBe(201)
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    )

    const surfaces: { what: string; surface: Surface; label: string; run: () => Promise<number> }[] = [
      {
        what: 'campaign briefing chat',
        surface: 'ASSISTANT_BRIEFING',
        label: 'briefing',
        run: async () =>
          (await api.post(`/api/campaigns/${f.campaignId}/briefing/chat`, {
            messages: [{ role: 'user', content: 'Plan the launch' }],
          })).status(),
      },
      {
        what: 'campaign Enhance',
        surface: 'ASSISTANT_BRIEFING',
        label: 'briefing',
        run: async () =>
          (await api.post(`/api/campaigns/${f.campaignId}/briefing/enhance`, { content: 'rough briefing' })).status(),
      },
      {
        what: 'post-brief Enhance',
        surface: 'ASSISTANT_BRIEFING',
        label: 'briefing',
        run: async () =>
          (await api.post('/api/briefs/enhance', { topic: 'Models', content: 'rough post brief', campaignId: f.campaignId })).status(),
      },
      {
        what: 'brand-kit assistant chat',
        surface: 'ASSISTANT_BRANDKIT',
        label: 'brandkit',
        run: async () =>
          (await api.post(`/api/admin/brandkits/${kitId}/assistant/chat`, {
            messages: [{ role: 'user', content: 'Extract the brand voice' }],
          })).status(),
      },
      {
        what: 'image → template',
        surface: 'ASSISTANT_BRANDKIT',
        label: 'image-template',
        run: async () =>
          (await api.multipart(`/api/admin/brandkits/${kitId}/templates/from-image`, {
            file: { name: 'ref.png', mimeType: 'image/png', buffer: png },
          })).status(),
      },
      {
        what: 'voice draft (generate)',
        surface: 'ASSISTANT_BRANDKIT',
        label: 'brand-voice',
        run: async () =>
          (await api.post(`/api/admin/brandkits/${kitId}/prompts/generate`, { description: 'A calm, precise voice' })).status(),
      },
      {
        what: 'voice draft (improve)',
        surface: 'ASSISTANT_BRANDKIT',
        label: 'brand-voice',
        run: async () => (await api.post(`/api/admin/brandkits/${kitId}/prompts/improve`, {})).status(),
      },
    ]

    const runAll = async (arg: string, source: Call['source']) => {
      for (const s of surfaces) {
        await clearCalls(api)
        expect(await s.run(), s.what).toBe(200)
        const calls = await readCalls(api)
        expect(calls.map((c) => [c.surface, c.arg, c.source, c.label]), s.what).toEqual([[s.surface, arg, source, s.label]])
      }
    }

    await runAll(SONNET, 'system')
    await putPolicy(api, policy({ defaults: { ASSISTANT_BRIEFING: 'HAIKU', ASSISTANT_BRANDKIT: 'HAIKU' } }))
    await runAll(HAIKU, 'team')
  })
})

// ── AC-22: /team → Models ────────────────────────────────────────────────────

// 014's AC-19 axe scan is tests/helpers/axe.ts (018 FR-07). No settle step:
// each case waits for the state it asserts on, as it always has.

test.describe('§Y — /team → Models', () => {
  let api: ApiClient
  let teamId: string | null = null
  test.beforeEach(async ({ request }) => {
    test.skip(!dbAvailable, 'requires test DB access')
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    teamId = await activeTeamId(api)
    await resetPolicy(teamId)
  })
  test.afterEach(async () => {
    await resetPolicy(teamId)
    await api?.dispose()
  })

  // TC-MODEL-11 — AC-22 (FR-14).
  test('the Models section names every control, saves an Opus-less list, and shows the template-fill 400 inline', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto('/team')

    await expect(page.getByRole('heading', { level: 2, name: 'Models', exact: true })).toBeVisible({ timeout: 20_000 })
    const models = page.getByRole('region', { name: 'Models', exact: true })
    const save = models.getByRole('button', { name: 'Save', exact: true })
    await expect(save).toBeVisible()

    // Every control has an accessible name.
    const allowed = models.getByRole('group', { name: 'Allowed models', exact: true })
    const haiku = allowed.getByRole('checkbox', { name: 'Haiku 4.5 · $ · fast', exact: true })
    const sonnet = allowed.getByRole('checkbox', { name: 'Sonnet 5.5 · $$ · medium', exact: true })
    const opus = allowed.getByRole('checkbox', { name: 'Opus 5.5 · $$$ · slow', exact: true })
    await expect(allowed.getByRole('checkbox')).toHaveCount(3)
    for (const box of [haiku, sonnet, opus]) await expect(box).toBeChecked()
    const defaults = models.getByRole('group', { name: 'Defaults', exact: true })
    await expect(defaults.getByRole('combobox')).toHaveCount(6)
    const systemDefaults: [string, string][] = [
      ['Captions', 'Haiku 4.5'],
      ['Template fill', 'Haiku 4.5'],
      ['Freeform design', 'Sonnet 5.5'],
      // 018 FR-02: refine's system default follows the draft's path.
      ['Refine', 'Sonnet 5.5; Haiku 4.5 on template drafts'],
      ['Campaign briefing assistant', 'Sonnet 5.5'],
      ['Brand kit assistant', 'Sonnet 5.5'],
    ]
    for (const [name, model] of systemDefaults) {
      const select = defaults.getByRole('combobox', { name, exact: true })
      await expect(select).toHaveCount(1)
      await expect(select.locator('option').first()).toHaveText(`System default (${model})`)
    }
    // Template fill never offers Opus.
    await expect(defaults.getByRole('combobox', { name: 'Template fill', exact: true }).locator('option')).toHaveText([
      'System default (Haiku 4.5)',
      'Haiku 4.5',
      'Sonnet 5.5',
    ])
    // The switch: named, described, and disabled in API mode.
    const gate = models.getByRole('checkbox', { name: 'Opus requires a personal token', exact: true })
    await expect(gate).toBeDisabled()
    await expect(gate).toHaveAccessibleDescription(/Scheduled posts, MCP and ACP always use the team token\..*Only applies in CLI mode\./)
    await expectNoAxeViolations(page, '/team (Models section)')

    // Untick Opus and save: the GET shows it, and Opus is now a "New" entry.
    await opus.uncheck()
    await save.click()
    await expect(page.getByText('Models saved', { exact: true })).toBeVisible()
    await expect
      .poll(async () => (await (await api.get('/api/team/model-policy')).json()).allowed)
      .toEqual(['HAIKU', 'SONNET'])
    const stored = await (await api.get('/api/team/model-policy')).json()
    expect(stored).toMatchObject({ saved: true, newModels: ['OPUS'] })
    await expect(opus).not.toBeChecked()
    await expect(models.getByText('New', { exact: true })).toHaveCount(1)

    // Only Opus ticked: the server's 400, inline, and nothing saved.
    await opus.check()
    await haiku.uncheck()
    await sonnet.uncheck()
    await expect(defaults.getByRole('combobox', { name: 'Template fill', exact: true }).locator('option').first()).toHaveText(
      'System default (none allowed)',
    )
    await save.click()
    const error = models.getByTestId('models-save-error')
    await expect(error).toBeVisible()
    await expect(error).toHaveRole('alert')
    await expect(error).toHaveText('Template fill needs Haiku or Sonnet allowed')
    expect((await (await api.get('/api/team/model-policy')).json()).allowed).toEqual(['HAIKU', 'SONNET'])
    await expectNoAxeViolations(page, '/team (Models section, save error showing)')
  })
})

// ── Wave 2: the pickers (AC-27 → AC-31, AC-33) ───────────────────────────────
//
// The picker contract (FR-18, A5): a picker pre-selects exactly what the server
// would run (decideModel with no request), and sends `model` only once the
// user picks something else. The cases read:
//   - the request bodies the UI sends (page.waitForRequest), for A5;
//   - the stamps and the recorder, for what ran;
//   - each picker's hint line (#<id>-hint) and refusal (#<id>-error).
// CLI mode never runs under MOCK_AI, so AC-31's CLI state is faked client-side:
// page.route rewrites /api/me and /api/models from their real responses. The
// server stays in API mock mode. Picker names are matched with exact: true,
// because "Instagram caption model" contains "caption model".

const NOT_ALLOWED = "Opus 5.5 isn't allowed on this team"
const TEAM_TOKEN_NOTICE = "This run uses your team's Claude allowance. Connect your own token in Settings to use yours."

const picker = (scope: Page | Locator, name: string) => scope.getByRole('combobox', { name, exact: true })
const hintOf = (page: Page, id: string) => page.locator(`#${id}-hint`)
const errorOf = (page: Page, id: string) => page.locator(`#${id}-error`)
const optionValues = (select: Locator) =>
  select.locator('option').evaluateAll((os) => (os as HTMLOptionElement[]).map((o) => o.value))

// The panel a picker sits in: its nearest ancestor holding a section heading.
const panelOf = (page: Page, pickerId: string) => page.locator(`#${pickerId}`).locator('xpath=ancestor::div[.//h3][1]')
// "Generated with …" lines (FR-20). The Versions cells carry the sentence in a
// title and sr-only text on a <span>, so a <p> is a panel's or the design's.
const generatedWithIn = (scope: Locator) => scope.locator('p').filter({ hasText: /^Generated with / })
const generatedWithLines = (page: Page, name: string) =>
  page.locator('p').filter({ hasText: new RegExp(`^Generated with ${name.replace('.', '\\.')}`) })

// A JSON GET answered from its real response, with fields replaced.
async function rewrite(page: Page, path: string, over: Record<string, unknown>) {
  await page.route(`**${path}`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const res = await route.fetch()
    await route.fulfill({ status: res.status(), json: { ...(await res.json()), ...over } })
  })
}

// The next POST whose path ends with `suffix`, and its JSON body.
const nextPost = (page: Page, suffix: string) =>
  page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname.endsWith(suffix))
const bodyOf = (req: Request) => req.postDataJSON() as Record<string, unknown>

// The draft once no action is running and `ready` holds. Polled: a UI click
// posts asynchronously, so the claim may not exist yet when polling starts.
async function until(api: ApiClient, id: string, ready: (d: Draft) => boolean, what: string): Promise<Draft> {
  let last: Draft = {}
  await expect
    .poll(
      async () => {
        last = await read(api, id)
        return last.pendingAction == null && ready(last)
      },
      { message: what, timeout: 30_000 },
    )
    .toBe(true)
  return last
}

async function openDraft(page: Page, id: string) {
  await page.goto(`/drafts/${id}`)
  await expect(page.getByRole('button', { name: 'View full screen', exact: true })).toBeVisible({ timeout: 20_000 })
  // The pickers render once /api/models has loaded.
  await expect(picker(page, 'Refine model')).toBeVisible({ timeout: 20_000 })
}

// ── The wizard ──

// The Review step's summary value for a row.
const summary = (page: Page, label: string) =>
  page.getByRole('term').filter({ hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]')

async function choosePath(page: Page, path: 'A' | 'B', template?: string) {
  if (path === 'B') {
    await page.getByRole('button', { name: /^Freeform/ }).click()
    await expect(page.getByRole('button', { name: 'No reference' })).toBeVisible()
  } else {
    await page.getByRole('button', { name: /^Template/ }).click()
    await page.getByRole('button', { name: new RegExp(template!) }).click()
  }
}

// From a valid Size & Design step to Review, through Content and Images.
async function continueToReview(page: Page) {
  const cont = page.getByRole('button', { name: /continue/i })
  for (const heading of ['Description & caption direction', /Images/, 'Review & Generate']) {
    await cont.click()
    await expect(page.getByRole('heading', { name: heading })).toBeVisible()
  }
  // The pickers render once /api/models has loaded.
  await expect(picker(page, 'Design model')).toBeVisible({ timeout: 20_000 })
}

// A Path B walk on `kitId` to the Review step, touching no picker.
async function walkToReview(page: Page, kitId: string, topic: string) {
  await page.goto('/brief')
  await expect(page.getByRole('heading', { name: 'Select a campaign' })).toBeVisible({ timeout: 20_000 })
  const cont = page.getByRole('button', { name: /continue/i })
  await cont.click()
  await expect(page.getByRole('heading', { name: 'Size & Design' })).toBeVisible()
  const kit = page.getByRole('combobox', { name: 'Brand kit' })
  await expect(kit.locator(`option[value="${kitId}"]`)).toBeAttached()
  await kit.selectOption(kitId)
  await choosePath(page, 'B')
  await cont.click()
  await expect(page.getByRole('heading', { name: 'Description & caption direction' })).toBeVisible()
  await page.getByPlaceholder('e.g. Q3 product launch').fill(topic)
  await page.locator('textarea').fill('Announce the model pickers with a short call to action.')
  for (const heading of [/Images/, 'Review & Generate']) {
    await cont.click()
    await expect(page.getByRole('heading', { name: heading })).toBeVisible()
  }
  await expect(picker(page, 'Design model')).toBeVisible({ timeout: 20_000 })
}

// The autosave PUT whose payload satisfies `match`.
const autosaved = (page: Page, match: (payload: Record<string, unknown>) => boolean) =>
  page.waitForResponse((r) => {
    if (r.request().method() !== 'PUT' || new URL(r.url()).pathname !== '/api/brief-drafts') return false
    return match((r.request().postDataJSON() as { payload: Record<string, unknown> }).payload)
  })

// Generate from the Review step: the POST /api/briefs body, and the draft.
async function generateFromReview(page: Page, api: ApiClient) {
  const posted = nextPost(page, '/api/briefs')
  await page.getByRole('button', { name: 'Generate Post' }).click()
  const body = bodyOf(await posted)
  await page.waitForURL(/\/drafts\/[^/]+$/, { timeout: 30_000 })
  const draft = await waitForDraft(api, new URL(page.url()).pathname.split('/').pop()!)
  expect(draft.status, String(draft.failureReason)).toBe('EXPORTED')
  return { body, draft }
}

test.describe('§Y — the pickers (wave 2)', () => {
  let api: ApiClient
  let teamId: string | null = null
  let briefDraftsBefore: Set<string>
  test.beforeEach(async ({ request }) => {
    test.skip(!dbAvailable, 'requires test DB access')
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    teamId = await activeTeamId(api)
    await resetPolicy(teamId)
    briefDraftsBefore = new Set(await briefDraftIds(api))
  })
  test.afterEach(async () => {
    // beforeEach skipped (no test DB): nothing was set up, and `api` is unset.
    if (!dbAvailable) return
    await resetPolicy(teamId)
    // A wizard walk autosaves an unfinished brief; discard any this suite left.
    for (const id of await briefDraftIds(api)) {
      if (!briefDraftsBefore.has(id)) await api.del(`/api/brief-drafts/${id}`)
    }
    await api?.dispose()
  })

  // TC-MODEL-13 — AC-27 (FR-17): an explicit disallowed request is refused
  // before anything is claimed, written or run.
  test('an explicit Opus pick on an Opus-less team is a 400 MODEL_NOT_ALLOWED on every route, and claims, writes and runs nothing', async () => {
    if (!MOCKED()) { test.skip(); return }
    const f = await suiteFixture(api)
    const draft = await generate(api, 'B', `Models Refused ${Date.now()}`)
    const id = draft.id as string
    await putPolicy(api, policy({ allowed: ['HAIKU', 'SONNET'] }))
    await clearCalls(api)

    const briefBody = (topic: string, designMode: 'TEMPLATE' | 'GENERATE') => ({
      topic,
      goal: 'g',
      tone: 'professional',
      channels: ['INSTAGRAM'],
      designMode,
      copyProviderKey: 'cli',
      campaignId: f.campaignId,
    })
    const expectRefused = async (what: string, res: APIResponse, error = NOT_ALLOWED) => {
      expect(res.status(), what).toBe(400)
      const body = await res.json()
      expect(body.code, what).toBe('MODEL_NOT_ALLOWED')
      expect(body.error, what).toBe(error)
      return body
    }

    // POST /api/briefs: refused before the Brief row is written.
    const topic = `Models Refused Brief ${Date.now()}`
    const brief = await expectRefused(
      'POST /api/briefs',
      await api.post('/api/briefs', { ...briefBody(topic, 'GENERATE'), designModel: 'OPUS' }),
    )
    expect(brief.field).toBe('designModel')
    expect(await prisma!.brief.count({ where: { topic } })).toBe(0)

    // Every draft action, refused before its claim.
    const actions: [string, string, Record<string, unknown>][] = [
      ['regenerate-copy (all captions)', 'regenerate-copy', {}],
      ['regenerate-copy (one channel)', 'regenerate-copy', { channel: 'LINKEDIN' }],
      ['regenerate-copy (headline)', 'regenerate-copy', { headline: true }],
      ['regenerate-design', 'regenerate-design', {}],
      ['refine', 'refine', { instruction: 'Make the headline bolder' }],
    ]
    for (const [what, path, body] of actions) {
      await expectRefused(what, await api.post(`/api/drafts/${id}/${path}`, { ...body, model: 'OPUS' }))
      expect((await read(api, id)).pendingAction, `${what}: nothing claimed`).toBeNull()
    }
    // The two assistant chats.
    const turn = { messages: [{ role: 'user', content: 'Plan the launch' }], model: 'OPUS' }
    await expectRefused('briefing chat', await api.post(`/api/campaigns/${f.campaignId}/briefing/chat`, turn))
    await expectRefused('brand-kit chat', await api.post(`/api/admin/brandkits/${f.kitId}/assistant/chat`, turn))

    // Nothing ran, and the draft is exactly as it was.
    expect(await readCalls(api)).toEqual([])
    const after = await read(api, id)
    expect(after.currentRevisionNumber).toBe(draft.currentRevisionNumber)
    expect(captionsOf(after)).toEqual(captionsOf(draft))
    expect([after.headline, after.headlineModel, after.designModel]).toEqual([
      draft.headline,
      draft.headlineModel,
      draft.designModel,
    ])

    // Template fill never runs Opus, even with every model allowed.
    await resetPolicy(teamId)
    const fill = `Models Refused Fill ${Date.now()}`
    const refusedFill = await expectRefused(
      'POST /api/briefs (TEMPLATE)',
      await api.post('/api/briefs', { ...briefBody(fill, 'TEMPLATE'), designModel: 'OPUS' }),
      "Opus 5.5 isn't available for template fill",
    )
    expect(refusedFill.field).toBe('designModel')
    expect(await prisma!.brief.count({ where: { topic: fill } })).toBe(0)
  })

  // TC-MODEL-14 — AC-28 (FR-19, A5) and AC-33 (the Review step's axe scan).
  // 018 FR-07 (008 verify gap 4): the Caption picker is changed too, so a
  // regression that drops `captionModel` from the autosave, the resume or the
  // POST turns this case red.
  test('the wizard: the Review pickers pre-select the defaults, a path change resets an Opus pick with the reason, a resume restores both picks, and they reach the brief', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(180_000)
    const f = await suiteFixture(api)
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    const topic = `Models Wizard ${Date.now()}`
    await walkToReview(page, f.kitId, topic)

    // Pre-selected to what the server would run, with the reason.
    const caption = picker(page, 'Caption model')
    const design = picker(page, 'Design model')
    await expect(caption).toHaveValue('HAIKU')
    await expect(design).toHaveValue('SONNET')
    await expect(hintOf(page, 'brief-caption-model')).toHaveText('Default')
    await expect(hintOf(page, 'brief-design-model')).toHaveText('Default')
    expect(await optionValues(design)).toEqual(ALL)
    // The summary names the effective choices, in two more rows (13 with
    // 009's Image style row, which a Path B brief carries).
    await expect(page.getByRole('term')).toHaveCount(13)
    await expect(summary(page, 'Caption model')).toHaveText('Haiku 4.5')
    await expect(summary(page, 'Design model')).toHaveText('Sonnet 5.5')
    await expectNoAxeViolations(page, '/brief Review step (with the model pickers)')

    // Pick Sonnet for the caption and Opus for the design: the summary follows,
    // and the autosave carries both picks.
    const savedOpus = autosaved(page, (p) => p.captionModel === 'SONNET' && p.designModel === 'OPUS')
    await caption.selectOption('SONNET')
    await expect(summary(page, 'Caption model')).toHaveText('Sonnet 5.5')
    await expect(hintOf(page, 'brief-caption-model')).toHaveCount(0)
    await design.selectOption('OPUS')
    await expect(summary(page, 'Design model')).toHaveText('Opus 5.5')
    await expect(hintOf(page, 'brief-design-model')).toHaveCount(0) // the default's reason no longer applies
    const briefDraftId = ((await (await savedOpus).json()) as { id: string }).id

    // Path A can't run Opus: the pick resets to the pre-selection, with the reason.
    const sizeStep = page.getByRole('button', { name: /Size & Design$/ })
    await sizeStep.click()
    await expect(page.getByRole('heading', { name: 'Size & Design' })).toBeVisible()
    await choosePath(page, 'A', f.templateName)
    await continueToReview(page)
    await expect(design).toHaveValue('HAIKU')
    await expect(caption).toHaveValue('SONNET') // the path never touches the caption pick
    await expect(hintOf(page, 'brief-design-model')).toContainText("Opus 5.5 isn't available for template fill")
    expect(await optionValues(design)).toEqual(['HAIKU', 'SONNET'])
    await expect(summary(page, 'Design model')).toHaveText('Haiku 4.5')

    // Back on Path B the reset pick stays reset, and the note is gone.
    await sizeStep.click()
    await expect(page.getByRole('heading', { name: 'Size & Design' })).toBeVisible()
    await choosePath(page, 'B')
    await continueToReview(page)
    await expect(design).toHaveValue('SONNET')
    await expect(hintOf(page, 'brief-design-model')).toHaveText('Default')

    // Pick Opus again; a resumed brief restores both picks.
    const savedAgain = autosaved(
      page,
      (p) => p.captionModel === 'SONNET' && p.designModel === 'OPUS' && p.designMode === 'GENERATE',
    )
    await design.selectOption('OPUS')
    expect(((await (await savedAgain).json()) as { id: string }).id).toBe(briefDraftId)
    await page.goto(`/brief?resume=${briefDraftId}`)
    await expect(page.getByRole('heading', { name: 'Review & Generate' })).toBeVisible({ timeout: 20_000 })
    await expect(design).toHaveValue('OPUS', { timeout: 20_000 })
    await expect(caption).toHaveValue('SONNET')
    await expect(summary(page, 'Design model')).toHaveText('Opus 5.5')
    await expect(summary(page, 'Caption model')).toHaveText('Sonnet 5.5')

    // Generate: the body carries both changed picks (A5); the brief stores
    // them, the captions are stamped Sonnet, and both run as the request.
    await clearCalls(api)
    const { body, draft } = await generateFromReview(page, api)
    expect(body.designModel).toBe('OPUS')
    expect(body.captionModel).toBe('SONNET')
    expect(draft.designModel).toBe(OPUS)
    expect(captionsOf(draft).length).toBeGreaterThan(0)
    for (const c of captionsOf(draft)) expect(c.model, c.channel).toBe(SONNET)
    expect(
      await prisma!.brief.findFirstOrThrow({ where: { topic }, select: { captionModel: true, designModel: true } }),
    ).toEqual({ captionModel: 'SONNET', designModel: 'OPUS' })
    const calls = await readCalls(api)
    expectRan(calls, 'DESIGN_FREEFORM', OPUS, 'request')
    expectRan(calls, 'CAPTION', SONNET, 'request')
    // The unfinished brief went with the generation.
    await expect.poll(() => briefDraftIds(api)).not.toContain(briefDraftId)
  })

  // TC-MODEL-15 — AC-28 (A5): untouched pickers send nothing.
  test('the wizard with untouched pickers sends neither field, stores null on the brief, and generates on the defaults', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(120_000)
    const f = await suiteFixture(api)
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    const topic = `Models Wizard Untouched ${Date.now()}`
    await walkToReview(page, f.kitId, topic)
    await expect(picker(page, 'Caption model')).toHaveValue('HAIKU')
    await expect(picker(page, 'Design model')).toHaveValue('SONNET')

    await clearCalls(api)
    const { body, draft } = await generateFromReview(page, api)
    expect(body).not.toHaveProperty('captionModel')
    expect(body).not.toHaveProperty('designModel')
    expect(draft.designModel).toBe(SONNET)
    for (const c of captionsOf(draft)) expect(c.model, c.channel).toBe(HAIKU)
    expect(
      await prisma!.brief.findFirstOrThrow({ where: { topic }, select: { captionModel: true, designModel: true } }),
    ).toEqual({ captionModel: null, designModel: null })
    const calls = await readCalls(api)
    expectRan(calls, 'DESIGN_FREEFORM', SONNET, 'system')
    expectRan(calls, 'CAPTION', HAIKU, 'system')
  })

  // TC-MODEL-16 — AC-29 (FR-20, A5) and AC-33 (the draft page's axe scan).
  test('the draft page: each picker pre-selects from its stamp, a pick reaches only its own row, and each panel says what generated it', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(180_000)
    const draft = await generate(api, 'B', `Models Draft Page ${Date.now()}`)
    const id = draft.id as string
    // A Sonnet stamp on LinkedIn only: its picker pre-selects from the stamp,
    // and "Regenerate all" sees mixed stamps (so no stamp tier).
    await prisma!.draftCaption.update({
      where: { draftId_channel: { draftId: id, channel: 'LINKEDIN' } },
      data: { model: SONNET },
    })
    const seeded = await read(api, id)

    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await openDraft(page, id)

    const preselected: [string, string, string, string][] = [
      ['LinkedIn caption model', 'draft-caption-model-linkedin', 'SONNET', 'Same model as the current caption'],
      ['Instagram caption model', 'draft-caption-model-instagram', 'HAIKU', 'Same model as the current caption'],
      ['Headline model', 'draft-headline-model', 'HAIKU', 'Same model as the current headline'],
      ['All captions model', 'draft-all-captions-model', 'HAIKU', 'Default'],
      ['Design model', 'draft-design-model', 'SONNET', 'Same model as the current design'],
      ['Refine model', 'draft-refine-model', 'SONNET', 'Default'],
    ]
    for (const [name, pickerId, value, hint] of preselected) {
      await expect(picker(page, name), name).toHaveValue(value)
      await expect(hintOf(page, pickerId), name).toHaveText(hint)
    }

    // "Generated with": each caption panel, the headline, the design, and the
    // Versions cell (the name, with the sentence in its title).
    await expect(generatedWithIn(panelOf(page, 'draft-caption-model-linkedin'))).toHaveText('Generated with Sonnet 5.5')
    for (const channel of ['instagram']) {
      await expect(generatedWithIn(panelOf(page, `draft-caption-model-${channel}`))).toHaveText('Generated with Haiku 4.5')
    }
    await expect(generatedWithIn(panelOf(page, 'draft-headline-model'))).toHaveText('Generated with Haiku 4.5')
    await expect(generatedWithLines(page, 'Sonnet 5.5')).toHaveCount(2) // the design and LinkedIn
    await expect(generatedWithLines(page, 'Haiku 4.5')).toHaveCount(2) // Instagram, the headline
    await expect(page.locator('span[title="Generated with Sonnet 5.5"]')).toHaveText('Generated with Sonnet 5.5')
    await expectNoAxeViolations(page, '/drafts/[id] (with the model pickers)')

    // LinkedIn on Opus: only that row is rewritten.
    await clearCalls(api)
    const linkedInPost = nextPost(page, '/regenerate-copy')
    await picker(page, 'LinkedIn caption model').selectOption('OPUS')
    await page.getByRole('button', { name: 'Regenerate LinkedIn caption', exact: true }).click()
    expect(bodyOf(await linkedInPost)).toEqual({ channel: 'LINKEDIN', model: 'OPUS' })
    let now = await until(api, id, (d) => captionOf(d, 'LINKEDIN').model === OPUS, 'LinkedIn rewritten on Opus')
    for (const channel of ['INSTAGRAM'] as const) {
      expect(captionOf(now, channel), channel).toEqual(captionOf(seeded, channel))
    }
    expect(now.headlineModel).toBe(HAIKU)
    expect(on(await readCalls(api), 'CAPTION').map((c) => [c.arg, c.source])).toEqual([[OPUS, 'request']])
    await expect(generatedWithIn(panelOf(page, 'draft-caption-model-linkedin'))).toHaveText('Generated with Opus 5.5')

    // The headline on Sonnet: headlineModel, and no caption row.
    const captionsBefore = captionsOf(now)
    await clearCalls(api)
    const headlinePost = nextPost(page, '/regenerate-copy')
    await picker(page, 'Headline model').selectOption('SONNET')
    await page.getByRole('button', { name: 'Regenerate headline', exact: true }).click()
    expect(bodyOf(await headlinePost)).toEqual({ headline: true, model: 'SONNET' })
    now = await until(api, id, (d) => d.headlineModel === SONNET, 'headline rewritten on Sonnet')
    expect(captionsOf(now)).toEqual(captionsBefore)
    expectRan(await readCalls(api), 'CAPTION', SONNET, 'request')
    await expect(generatedWithIn(panelOf(page, 'draft-headline-model'))).toHaveText('Generated with Sonnet 5.5')

    // Refine on Haiku (Path B's default is Sonnet): revision 2 is Haiku.
    await clearCalls(api)
    const refinePost = nextPost(page, '/refine')
    await picker(page, 'Refine model').selectOption('HAIKU')
    const ask = page.getByPlaceholder('e.g. Make the logo larger…')
    await ask.fill('Make the background darker')
    await ask.press('Enter')
    expect(bodyOf(await refinePost)).toEqual({ instruction: 'Make the background darker', model: 'HAIKU' })
    now = await until(api, id, (d) => d.currentRevisionNumber === 2, 'refined')
    expect(now.designModel).toBe(HAIKU)
    expect(await revisionModel(id, 2)).toEqual({ model: HAIKU, modelSubstitutedFrom: null })
    expectRan(await readCalls(api), 'REFINE', HAIKU, 'request')
    await expect(page.getByRole('region', { name: 'Refine requests' }).getByText('Applied', { exact: true })).toBeVisible({
      timeout: 20_000,
    })

    // The design regenerate: pre-selected from the new stamp, then Opus.
    const design = picker(page, 'Design model')
    await expect(design).toHaveValue('HAIKU')
    await clearCalls(api)
    const designPost = nextPost(page, '/regenerate-design')
    await design.selectOption('OPUS')
    await page.getByRole('button', { name: 'Regenerate design', exact: true }).click()
    expect(bodyOf(await designPost)).toEqual({ model: 'OPUS' })
    now = await until(api, id, (d) => d.currentRevisionNumber === 3, 'redesigned')
    expect(now.designModel).toBe(OPUS)
    expect(await revisionModel(id, 3)).toEqual({ model: OPUS, modelSubstitutedFrom: null })
    expectRan(await readCalls(api), 'DESIGN_FREEFORM', OPUS, 'request')
    await expect(generatedWithLines(page, 'Opus 5.5')).toHaveCount(2) // LinkedIn and the design
  })

  // TC-MODEL-17 — AC-29 (the AC-17 seeded draft) and the "Generated with"
  // hide rules (reviews/T16.md).
  test('a removed Opus shows as a substitution on the design picker, a substituted stamp says so, and a failed caption row or design shows no "Generated with"', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(120_000)
    const draft = await generate(api, 'B', `Models Substituted ${Date.now()}`)
    const id = draft.id as string
    await prisma!.draft.update({ where: { id }, data: { designModel: OPUS } })
    await prisma!.draftCaption.update({
      where: { draftId_channel: { draftId: id, channel: 'LINKEDIN' } },
      data: { model: HAIKU, modelSubstitutedFrom: OPUS },
    })
    // A FAILED row may keep the stamp of text since cleared (reviews/T7.md).
    await prisma!.draftCaption.update({
      where: { draftId_channel: { draftId: id, channel: 'INSTAGRAM' } },
      data: { status: 'FAILED', text: '', failureReason: 'Seeded failure (008 T18)' },
    })
    await putPolicy(api, policy({ allowed: ['HAIKU', 'SONNET'] }))

    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await openDraft(page, id)

    // The stamped Opus substitutes visibly (FR-18), and Opus is not offered.
    const design = picker(page, 'Design model')
    await expect(design).toHaveValue('SONNET')
    await expect(hintOf(page, 'draft-design-model')).toHaveText(
      'Opus 5.5 is no longer available on this team — using Sonnet 5.5',
    )
    expect(await optionValues(design)).toEqual(['HAIKU', 'SONNET'])
    // The design still says what made it.
    await expect(generatedWithLines(page, 'Opus 5.5')).toHaveCount(1)

    // A substituted stamp: "(substituted)", titled with the refused model.
    const linkedIn = generatedWithIn(panelOf(page, 'draft-caption-model-linkedin'))
    await expect(linkedIn).toHaveText(/^Generated with Haiku 4\.5 \(substituted\)/)
    await expect(linkedIn.locator('span[title="Substituted for Opus 5.5"]')).toHaveText('(substituted)')

    // The FAILED row: its failure notice, and no "Generated with".
    const instagram = panelOf(page, 'draft-caption-model-instagram')
    await expect(instagram.getByText(/The Instagram caption failed to generate/)).toBeVisible()
    await expect(generatedWithIn(instagram)).toHaveCount(0)

    // A failed design: no design line and no design picker; the caption and
    // headline lines stay.
    await prisma!.draft.update({
      where: { id },
      data: { status: 'FAILED', exportUrl: null, failureReason: 'Seeded failure (008 T18)' },
    })
    await page.reload()
    await expect(page.getByText('Generation failed', { exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(generatedWithLines(page, 'Haiku 4.5')).toHaveCount(2) // LinkedIn and the headline (Instagram is the FAILED row)
    await expect(generatedWithLines(page, 'Opus 5.5')).toHaveCount(0)
    await expect(page.locator('p').filter({ hasText: /^Generated with / })).toHaveCount(2)
    await expect(picker(page, 'Design model')).toHaveCount(0)
  })

  // TC-MODEL-18 — FR-17 in the UI (reviews/T16.md): a refused pick restores
  // what it replaced and shows the reason on its own picker.
  test('a refused pick leaves no trace: refine puts its instruction back, the design and caption regenerates leave no Undo, and each picker shows why', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(120_000)
    const draft = await generate(api, 'B', `Models Refused UI ${Date.now()}`)
    const id = draft.id as string
    await putPolicy(api, policy({ allowed: ['HAIKU', 'SONNET'] }))

    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    // A stale view that still offers Opus: the server refuses the pick.
    await rewrite(page, '/api/models', { allowed: ALL })
    await openDraft(page, id)
    await clearCalls(api)

    // Refine: the request leaves the log, and the instruction goes back in the field.
    const refine = picker(page, 'Refine model')
    await refine.selectOption('OPUS')
    const ask = page.getByPlaceholder('e.g. Make the logo larger…')
    await ask.fill('Make the headline bolder')
    await ask.press('Enter')
    await expect(errorOf(page, 'draft-refine-model')).toHaveText(NOT_ALLOWED)
    await expect(refine).toHaveAttribute('aria-invalid', 'true')
    await expect(ask).toHaveValue('Make the headline bolder')
    await expect(page.getByRole('region', { name: 'Refine requests' }).getByText('Make the headline bolder')).toHaveCount(0)

    // The design regenerate: no Undo is left behind.
    const design = picker(page, 'Design model')
    await design.selectOption('OPUS')
    await page.getByRole('button', { name: 'Regenerate design', exact: true }).click()
    await expect(errorOf(page, 'draft-design-model')).toHaveText(NOT_ALLOWED)
    await expect(design).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0)

    // A caption regenerate: the same, on its own panel.
    await picker(page, 'LinkedIn caption model').selectOption('OPUS')
    await page.getByRole('button', { name: 'Regenerate LinkedIn caption', exact: true }).click()
    await expect(errorOf(page, 'draft-caption-model-linkedin')).toHaveText(NOT_ALLOWED)
    await expect(page.getByRole('button', { name: 'Undo LinkedIn caption', exact: true })).toHaveCount(0)

    // Nothing was claimed, written or run.
    const after = await read(api, id)
    expect(after.pendingAction).toBeNull()
    expect(after.currentRevisionNumber).toBe(draft.currentRevisionNumber)
    expect(captionsOf(after)).toEqual(captionsOf(draft))
    expect(after.headlineModel).toBe(draft.headlineModel)
    expect(await readCalls(api)).toEqual([])

    // A new pick clears the refusal.
    await refine.selectOption('HAIKU')
    await expect(errorOf(page, 'draft-refine-model')).toHaveCount(0)
    await expect(refine).not.toHaveAttribute('aria-invalid', 'true')
  })

  // TC-MODEL-19 — AC-30 (FR-21, A5).
  test('the assistant headers: a pick is sent on every turn of the open chat, a reload resets it, and the brand-kit chat runs its own pick', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(120_000)
    const f = await suiteFixture(api)
    // AC-30's setup: no team ASSISTANT_BRIEFING default, so Haiku is a change
    // from the pre-selection (picking the pre-selected model sends nothing).
    expect((await (await api.get('/api/models')).json()).defaults.ASSISTANT_BRIEFING ?? null).toBeNull()

    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    const openBriefingChat = async () => {
      await page.goto(`/campaigns/${f.campaignId}`)
      await page.getByRole('button', { name: 'Draft with AI' }).click()
      const drawer = page.getByRole('dialog', { name: 'Draft briefing with AI' })
      await expect(picker(drawer, 'Briefing assistant model')).toBeVisible({ timeout: 20_000 })
      return drawer
    }
    const send = async (drawer: Locator, suffix: string, text: string) => {
      const posted = nextPost(page, suffix)
      const answered = page.waitForResponse(
        (r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith(suffix),
      )
      const ask = drawer.getByLabel('Message', { exact: true })
      await ask.fill(text)
      await ask.press('Enter')
      const body = bodyOf(await posted)
      expect((await answered).status(), `${suffix} answered`).toBe(200)
      await expect(drawer.getByText(/^Thinking/)).toHaveCount(0)
      return body
    }

    let drawer = await openBriefingChat()
    let model = picker(drawer, 'Briefing assistant model')
    await expect(model).toHaveValue('SONNET')
    await expect(hintOf(page, 'briefing-assistant-model')).toHaveText('Default')
    await model.selectOption('HAIKU')
    await clearCalls(api)
    expect((await send(drawer, '/briefing/chat', 'Plan the launch')).model).toBe('HAIKU')
    // The next turn, untouched: the pick lasts for the chat.
    expect((await send(drawer, '/briefing/chat', 'Make it shorter')).model).toBe('HAIKU')
    expect(on(await readCalls(api), 'ASSISTANT_BRIEFING').map((c) => [c.arg, c.source])).toEqual([
      [HAIKU, 'request'],
      [HAIKU, 'request'],
    ])

    // No remembered choice: a reload pre-selects the default and sends today's body.
    drawer = await openBriefingChat()
    model = picker(drawer, 'Briefing assistant model')
    await expect(model).toHaveValue('SONNET')
    await clearCalls(api)
    expect(Object.keys(await send(drawer, '/briefing/chat', 'Plan the launch'))).toEqual(['messages'])
    expect(on(await readCalls(api), 'ASSISTANT_BRIEFING').map((c) => [c.arg, c.source])).toEqual([[SONNET, 'system']])

    // The brand-kit assistant's header: the same picker, its own surface.
    await page.goto('/admin/brandkits')
    await page
      .getByRole('region', { name: 'Brand kits', exact: true })
      .getByRole('button', { name: new RegExp(`^${f.kitName}`) })
      .click()
    await page.getByRole('button', { name: 'Extract from references' }).click()
    const kitDrawer = page.getByRole('dialog', { name: 'Extract brand from references' })
    const kitModel = picker(kitDrawer, 'Brand kit assistant model')
    await expect(kitModel).toHaveValue('SONNET', { timeout: 20_000 })
    await kitModel.selectOption('HAIKU')
    await clearCalls(api)
    expect((await send(kitDrawer, '/assistant/chat', 'Extract the brand voice')).model).toBe('HAIKU')
    expect(on(await readCalls(api), 'ASSISTANT_BRANDKIT').map((c) => [c.arg, c.source])).toEqual([[HAIKU, 'request']])
  })

  // TC-MODEL-20 — AC-31 (FR-22). CLI mode is faked client-side; the server
  // stays in API mock mode.
  test('in CLI mode on the team token, picking Opus in the refine box shows the team-token notice; with the switch on, Opus is not offered and the hint names Settings', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(120_000)
    const draft = await generate(api, 'B', `Models Team Token ${Date.now()}`)
    const id = draft.id as string

    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    const cli = { mode: 'cli', credential: 'team', envDefault: null }
    await rewrite(page, '/api/me', { cliMode: true, claudeToken: null })
    await rewrite(page, '/api/models', { ...cli, gateOn: false })
    await openDraft(page, id)

    const refine = picker(page, 'Refine model')
    const refineSection = page.locator('section').filter({ has: page.getByRole('heading', { name: /Refine design/ }) })
    const notice = refineSection.getByRole('status').filter({ hasText: TEAM_TOKEN_NOTICE })
    await expect(refine).toHaveValue('SONNET')
    expect(await optionValues(refine)).toEqual(ALL)
    await expect(notice).toHaveCount(0)
    await refine.selectOption('OPUS')
    await expect(notice).toBeVisible()
    await expect(notice).toHaveText(TEAM_TOKEN_NOTICE)
    // Back to a model that isn't gated: no notice.
    await refine.selectOption('SONNET')
    await expect(notice).toHaveCount(0)

    // The switch on: Opus leaves the effective set, and the hint says why.
    await page.unroute('**/api/models')
    await rewrite(page, '/api/models', { ...cli, gateOn: true })
    await page.reload()
    await expect(refine).toHaveValue('SONNET', { timeout: 20_000 })
    expect(await optionValues(refine)).toEqual(['HAIKU', 'SONNET'])
    await expect(hintOf(page, 'draft-refine-model')).toContainText(
      'Opus requires a personal Claude token on this team — connect one in Settings',
    )
    expect(await optionValues(picker(page, 'Design model'))).toEqual(['HAIKU', 'SONNET'])
    await expect(notice).toHaveCount(0)
  })
})
