// 024 FR-06 / AC-07: the Opus gate follows the credential that bills. A CAPTION
// run on a team that chose the API key route is credential tier 'team' whoever
// the caller is; every other surface, and every team that has not chosen, keeps
// the caller's own tier. Prisma and the pipeline mode are faked; decideModel,
// the catalogue and the picker rules are real.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  mode: 'cli' as 'api' | 'cli',
  captionRoute: null as null | 'CLI' | 'API_KEY',
  gateOn: true,
  personalToken: false,
  rows: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    team: { findUnique: async () => ({ captionRoute: h.captionRoute }) },
    teamModelPolicy: {
      findUnique: async () => ({
        allowedModels: ['HAIKU', 'SONNET', 'OPUS'],
        requirePersonalTokenForGated: h.gateOn,
        defaults: [],
      }),
    },
    userClaudeToken: { findFirst: async () => (h.personalToken ? { id: 't1' } : null) },
    availableProvider: { findMany: async () => h.rows },
  },
}))
vi.mock('@/lib/agent/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/agent/config')>()),
  isCliMode: () => h.mode === 'cli',
  pipelineMode: () => h.mode,
}))

const { resolveModel, loadModelsView } = await import('@/lib/models/policy')
const { pickerOptions, pickerState, teamTokenNotice } = await import('@/lib/models/pickerState')

const TEAM = 'team-1'

beforeEach(() => {
  h.mode = 'cli'
  h.captionRoute = null
  h.gateOn = true
  h.personalToken = false
  h.rows = []
})

const caption = (userId: string | null, requested: 'OPUS' | 'HAIKU' = 'OPUS') =>
  resolveModel('CAPTION', { requested, userId, teamId: TEAM })

describe('resolveModel — CAPTION on the API key route (CLI mode, gate on)', () => {
  it('refuses Opus to a caller with an active personal token (the team key bills)', async () => {
    h.captionRoute = 'API_KEY'
    h.personalToken = true
    expect(await caption('u1')).toMatchObject({ ok: false, code: 'NEEDS_PERSONAL_TOKEN' })
  })

  it('the same call on a never-chosen team (personal credential) is allowed', async () => {
    h.personalToken = true
    expect(await caption('u1')).toMatchObject({ ok: true })
  })

  it('a chosen CLI route keeps the caller tier (a personal token still lifts the gate)', async () => {
    h.captionRoute = 'CLI'
    h.personalToken = true
    expect(await caption('u1')).toMatchObject({ ok: true })
  })

  it('with the gate off, Opus is allowed on API_KEY', async () => {
    h.captionRoute = 'API_KEY'
    h.gateOn = false
    h.personalToken = true
    expect(await caption('u1')).toMatchObject({ ok: true })
  })

  it('a caller with userId null is team, as before, on either team', async () => {
    expect(await caption(null)).toMatchObject({ ok: false, code: 'NEEDS_PERSONAL_TOKEN' })
    h.captionRoute = 'API_KEY'
    expect(await caption(null)).toMatchObject({ ok: false, code: 'NEEDS_PERSONAL_TOKEN' })
  })

  it("other surfaces keep the caller's own credential whatever the team's route", async () => {
    h.captionRoute = 'API_KEY'
    h.personalToken = true
    for (const surface of ['DESIGN_FREEFORM', 'REFINE'] as const) {
      const r = await resolveModel(surface, { requested: 'OPUS', userId: 'u1', teamId: TEAM })
      expect(r, surface).toMatchObject({ ok: true })
    }
  })

  it('API mode: no surface is gated, and an API_KEY team is unchanged (the gate never applied there)', async () => {
    h.mode = 'api'
    h.captionRoute = 'API_KEY'
    expect(await caption('u1')).toMatchObject({ ok: true })
    h.captionRoute = null
    expect(await caption('u1')).toMatchObject({ ok: true })
  })
})

describe('GET /api/models — captionCredential', () => {
  it("is 'team' for an API_KEY team, whoever the caller is, and the plain credential for the rest", async () => {
    h.captionRoute = 'API_KEY'
    h.personalToken = true
    expect(await loadModelsView({ userId: 'u1', teamId: TEAM })).toMatchObject({
      credential: 'personal',
      captionCredential: 'team',
    })
    h.captionRoute = null
    expect(await loadModelsView({ userId: 'u1', teamId: TEAM })).toMatchObject({
      credential: 'personal',
      captionCredential: 'personal',
    })
    h.captionRoute = 'CLI'
    expect(await loadModelsView({ userId: 'u1', teamId: TEAM })).toMatchObject({ captionCredential: 'personal' })
  })

  it("API mode: the API_KEY team reads 'team' (the gate itself needs CLI mode)", async () => {
    h.mode = 'api'
    h.captionRoute = 'API_KEY'
    expect(await loadModelsView({ userId: 'u1', teamId: TEAM })).toMatchObject({
      credential: 'n/a',
      captionCredential: 'team',
    })
  })
})

describe('the pickers read captionCredential for CAPTION', () => {
  const view = {
    allowed: ['HAIKU', 'SONNET', 'OPUS'] as const,
    defaults: {},
    gateOn: true,
    mode: 'cli' as const,
    credential: 'personal' as const,
    captionCredential: 'team' as const,
    envDefault: null,
    captionProviderIsClaude: true,
  }
  const models = { ...view, allowed: [...view.allowed] }

  it('offers no gated model on CAPTION, but still on the surfaces the personal token covers', () => {
    expect(pickerOptions('CAPTION', models).map((o) => o.value)).not.toContain('OPUS')
    expect(pickerOptions('DESIGN_FREEFORM', models).map((o) => o.value)).toContain('OPUS')
    const state = pickerState('CAPTION', models)
    expect(state.kind).not.toBe('hidden')
    if (state.kind !== 'hidden') expect(state.gated).toMatch(/personal Claude token/)
  })

  it('teamTokenNotice uses the surface credential', () => {
    expect(teamTokenNotice(models, 'OPUS', 'CAPTION')).toBe(true)
    expect(teamTokenNotice(models, 'OPUS', 'DESIGN_FREEFORM')).toBe(false)
    expect(teamTokenNotice(models, 'OPUS')).toBe(false)
  })

  it('an absent captionCredential reads as the plain credential', () => {
    const { captionCredential: _c, ...plain } = models
    expect(pickerOptions('CAPTION', plain).map((o) => o.value)).toContain('OPUS')
  })
})
