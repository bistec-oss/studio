// 008 T4 — the server half of model selection (FR-03 I/O wrapper, FR-05 store,
// FR-13 views and routes; AC-05's I/O half). Prisma, the pipeline mode and env
// are mocked; the catalogue, decideModel and validatePolicy are real. The pure
// FR-05 rules themselves are pinned in modelResolve.test.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ZodType } from 'zod'

const h = vi.hoisted(() => ({
  policyFindUnique: vi.fn(),
  tokenFindFirst: vi.fn(),
  providerFindFirst: vi.fn(),
  providerFindMany: vi.fn(),
  teamFindUnique: vi.fn(),
  transaction: vi.fn(),
  txUpsert: vi.fn(),
  txDeleteMany: vi.fn(),
  txCreateMany: vi.fn(),
  mode: vi.fn((): 'api' | 'cli' => 'cli'),
  env: { CLAUDE_CLI_MODEL: undefined as string | undefined },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    teamModelPolicy: { findUnique: h.policyFindUnique },
    userClaudeToken: { findFirst: h.tokenFindFirst },
    availableProvider: { findFirst: h.providerFindFirst, findMany: h.providerFindMany },
    team: { findUnique: h.teamFindUnique },
    $transaction: h.transaction,
  },
}))
vi.mock('@/lib/env', () => ({ env: h.env }))
vi.mock('@/lib/agent/config', () => ({
  pipelineMode: h.mode,
  isCliMode: () => h.mode() === 'cli',
}))
// The real handler pulls in auth; the routes need only the wrapper and a body
// parse that runs their zod schema the way the real parseBody does.
vi.mock('@/lib/api/handler', async () => {
  const { NextResponse } = await import('next/server')
  const wrap =
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx?.params }, { userId: 'u1', teamId: 'team1' })
  const parseBody = async (req: Request, schema: ZodType) => {
    const parsed = schema.safeParse(await req.json())
    if (parsed.success) return { data: parsed.data }
    const issue = parsed.error.issues[0]
    const path = issue.path.join('.')
    return {
      response: NextResponse.json(
        { error: path ? `${path}: ${issue.message}` : issue.message },
        { status: 400 },
      ),
    }
  }
  return { parseBody, withTeamAuth: wrap, withTeamAdmin: wrap }
})

const { credentialTier, loadModelsView, loadTeamPolicy, policyInfo, resolveModel, saveTeamPolicy } =
  await import('@/lib/models/policy')
const policyRoute = await import('@/app/api/team/model-policy/route')
const modelsRoute = await import('@/app/api/models/route')

const ALL = ['HAIKU', 'SONNET', 'OPUS']
const ALL_NULL = {
  CAPTION: null,
  DESIGN_TEMPLATE: null,
  DESIGN_FREEFORM: null,
  REFINE: null,
  ASSISTANT_BRIEFING: null,
  ASSISTANT_BRANDKIT: null,
}

function storedRow(over: Record<string, unknown> = {}) {
  return { allowedModels: ALL, requirePersonalTokenForGated: false, defaults: [], ...over }
}

let info: ReturnType<typeof vi.spyOn>
let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  for (const fn of [
    h.policyFindUnique,
    h.tokenFindFirst,
    h.providerFindFirst,
    h.providerFindMany,
    h.teamFindUnique,
    h.txUpsert,
    h.txDeleteMany,
    h.txCreateMany,
  ]) {
    fn.mockReset()
  }
  h.policyFindUnique.mockResolvedValue(null)
  h.tokenFindFirst.mockResolvedValue(null)
  h.providerFindFirst.mockResolvedValue(null)
  // 024: the caption route reads the team's setting and its enabled COPY rows.
  h.providerFindMany.mockResolvedValue([])
  h.teamFindUnique.mockResolvedValue(null)
  h.txUpsert.mockResolvedValue({})
  h.txDeleteMany.mockResolvedValue({ count: 0 })
  h.txCreateMany.mockResolvedValue({ count: 0 })
  h.transaction.mockReset().mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      teamModelPolicy: { upsert: h.txUpsert },
      teamModelDefault: { deleteMany: h.txDeleteMany, createMany: h.txCreateMany },
    }),
  )
  h.mode.mockReset().mockReturnValue('cli')
  h.env.CLAUDE_CLI_MODEL = undefined
  info = vi.spyOn(console, 'info').mockImplementation(() => {})
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  info.mockRestore()
  warn.mockRestore()
})

describe('loadTeamPolicy — AC-05: what a team reads as', () => {
  it('no stored row → all three allowed, no defaults, switch off, not saved (A2)', async () => {
    expect(await loadTeamPolicy('team1')).toEqual({
      allowed: ALL,
      defaults: {},
      gateOn: false,
      saved: false,
    })
    expect(h.policyFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamId: 'team1' } }),
    )
  })

  it('a stored row reads its list (catalogue order), its defaults and its switch', async () => {
    h.policyFindUnique.mockResolvedValue(
      storedRow({
        allowedModels: ['SONNET', 'HAIKU'],
        requirePersonalTokenForGated: true,
        defaults: [
          { surface: 'CAPTION', model: 'SONNET' },
          { surface: 'REFINE', model: 'HAIKU' },
        ],
      }),
    )
    expect(await loadTeamPolicy('team1')).toEqual({
      allowed: ['HAIKU', 'SONNET'],
      defaults: { CAPTION: 'SONNET', REFINE: 'HAIKU' },
      gateOn: true,
      saved: true,
    })
  })

  it.each([
    ['an empty', []],
    ['a NULL', null],
  ])('%s stored allowedModels reads as [] — never as "all allowed"', async (_label, stored) => {
    h.policyFindUnique.mockResolvedValue(storedRow({ allowedModels: stored }))
    const policy = await loadTeamPolicy('team1')
    expect(policy.allowed).toEqual([])
    expect(policy.saved).toBe(true)
  })

  it('…so resolveModel fails closed with NO_ALLOWED_MODEL (edge case: a hand-edited row)', async () => {
    h.policyFindUnique.mockResolvedValue(storedRow({ allowedModels: null }))
    const result = await resolveModel('CAPTION', { userId: 'u1', teamId: 'team1' })
    expect(result).toMatchObject({ ok: false, code: 'NO_ALLOWED_MODEL' })
  })

  it('drops stored values outside the closed vocabularies', async () => {
    h.policyFindUnique.mockResolvedValue(
      storedRow({
        allowedModels: ['HAIKU', 'FABLE'],
        defaults: [
          { surface: 'CAPTION', model: 'FABLE' },
          { surface: 'INTERNAL_VERIFIER', model: 'HAIKU' },
          { surface: 'REFINE', model: 'HAIKU' },
        ],
      }),
    )
    const policy = await loadTeamPolicy('team1')
    expect(policy.allowed).toEqual(['HAIKU'])
    expect(policy.defaults).toEqual({ REFINE: 'HAIKU' })
  })
})

describe('saveTeamPolicy — AC-05: validation, then one transaction', () => {
  const body = (over: Record<string, unknown> = {}) => ({
    allowed: ALL,
    defaults: {},
    requirePersonalTokenForGated: false,
    ...over,
  })

  it('a validation failure is surfaced with its message and writes nothing', async () => {
    expect(await saveTeamPolicy('team1', body({ allowed: ['OPUS'] }))).toEqual({
      ok: false,
      message: 'Template fill needs Haiku or Sonnet allowed',
    })
    expect(h.transaction).not.toHaveBeenCalled()
  })

  it('upserts the row and replaces the default rows; a null default writes no row', async () => {
    const result = await saveTeamPolicy(
      'team1',
      body({
        allowed: ['SONNET', 'HAIKU'],
        defaults: { DESIGN_FREEFORM: 'SONNET', CAPTION: null, REFINE: 'HAIKU' },
        requirePersonalTokenForGated: true,
      }),
    )
    expect(result).toEqual({
      ok: true,
      policy: {
        allowed: ['HAIKU', 'SONNET'],
        defaults: { DESIGN_FREEFORM: 'SONNET', REFINE: 'HAIKU' },
        gateOn: true,
        saved: true,
      },
    })
    expect(h.transaction).toHaveBeenCalledTimes(1)
    const data = { allowedModels: ['HAIKU', 'SONNET'], requirePersonalTokenForGated: true }
    expect(h.txUpsert).toHaveBeenCalledWith({
      where: { teamId: 'team1' },
      create: { teamId: 'team1', ...data },
      update: data,
    })
    expect(h.txDeleteMany).toHaveBeenCalledWith({ where: { teamId: 'team1' } })
    expect(h.txCreateMany).toHaveBeenCalledWith({
      data: [
        { teamId: 'team1', surface: 'DESIGN_FREEFORM', model: 'SONNET' },
        { teamId: 'team1', surface: 'REFINE', model: 'HAIKU' },
      ],
    })
    // Delete before create, inside the one transaction.
    expect(h.txDeleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      h.txCreateMany.mock.invocationCallOrder[0],
    )
  })

  it('no defaults → the old rows are deleted and none are created', async () => {
    await saveTeamPolicy('team1', body({ defaults: { CAPTION: null } }))
    expect(h.txDeleteMany).toHaveBeenCalledTimes(1)
    expect(h.txCreateMany).not.toHaveBeenCalled()
  })

  it('a saved policy round-trips through load', async () => {
    const saved = await saveTeamPolicy(
      'team1',
      body({ allowed: ['HAIKU', 'SONNET'], defaults: { CAPTION: 'SONNET' } }),
    )
    if (!saved.ok) throw new Error('expected a save')
    const [{ data: defaultsWritten }] = h.txCreateMany.mock.calls[0]
    const [{ create }] = h.txUpsert.mock.calls[0]
    h.policyFindUnique.mockResolvedValue({
      allowedModels: create.allowedModels,
      requirePersonalTokenForGated: create.requirePersonalTokenForGated,
      defaults: defaultsWritten.map((d: { surface: string; model: string }) => ({
        surface: d.surface,
        model: d.model,
      })),
    })
    expect(await loadTeamPolicy('team1')).toEqual(saved.policy)
  })
})

describe('policyInfo — GET /api/team/model-policy shape (FR-13)', () => {
  it('names every user surface (null = system default); unsaved → newModels []', () => {
    expect(
      policyInfo({
        allowed: ALL as never,
        defaults: { CAPTION: 'SONNET' },
        gateOn: false,
        saved: false,
      }),
    ).toEqual({
      allowed: ALL,
      defaults: { ...ALL_NULL, CAPTION: 'SONNET' },
      requirePersonalTokenForGated: false,
      saved: false,
      newModels: [],
    })
  })

  it('a saved list missing a defaultAllowed entry lists it in newModels (A2)', () => {
    const v = policyInfo({ allowed: ['HAIKU', 'SONNET'], defaults: {}, gateOn: true, saved: true })
    expect(v.newModels).toEqual(['OPUS'])
    expect(v.requirePersonalTokenForGated).toBe(true)
  })
})

describe('credentialTier (design §3)', () => {
  it('an ACTIVE token on a non-disabled user → personal, in one query', async () => {
    h.tokenFindFirst.mockResolvedValue({ id: 'tok1' })
    expect(await credentialTier('u1', 'cli')).toBe('personal')
    expect(h.tokenFindFirst).toHaveBeenCalledTimes(1)
    expect(h.tokenFindFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', status: 'ACTIVE', user: { disabled: false } },
      select: { id: true },
    })
  })

  it('an INVALID token or a disabled user (no matching row) → team', async () => {
    h.tokenFindFirst.mockResolvedValue(null)
    expect(await credentialTier('u1', 'cli')).toBe('team')
  })

  it('userId null (scheduler, MCP, ACP) → team, with no query', async () => {
    expect(await credentialTier(null, 'cli')).toBe('team')
    expect(h.tokenFindFirst).not.toHaveBeenCalled()
  })

  it("API mode → 'n/a', with no query", async () => {
    h.tokenFindFirst.mockResolvedValue({ id: 'tok1' })
    expect(await credentialTier('u1', 'api')).toBe('n/a')
    expect(await credentialTier(null, 'api')).toBe('n/a')
    expect(h.tokenFindFirst).not.toHaveBeenCalled()
  })

  it('defaults to the pipeline mode', async () => {
    h.mode.mockReturnValue('api')
    expect(await credentialTier('u1')).toBe('n/a')
  })
})

describe('resolveModel — the I/O wrapper (FR-03)', () => {
  it('system default on a team with no policy, arg per mode', async () => {
    const cli = await resolveModel('DESIGN_FREEFORM', { userId: 'u1', teamId: 'team1' })
    expect(cli).toMatchObject({ ok: true, resolved: { key: 'SONNET', source: 'system' } })
    h.mode.mockReturnValue('api')
    const api = await resolveModel('DESIGN_FREEFORM', { userId: 'u1', teamId: 'team1' })
    if (!cli.ok || !api.ok) throw new Error('expected ok')
    expect(api.resolved.arg).toBe(api.resolved.entry.apiId)
    expect(cli.resolved.arg).toBe(cli.resolved.entry.cliArg)
  })

  it('CLAUDE_CLI_MODEL is the envDefault in CLI mode only', async () => {
    h.env.CLAUDE_CLI_MODEL = 'OPUS'
    const cli = await resolveModel('DESIGN_FREEFORM', { userId: 'u1', teamId: 'team1' })
    expect(cli).toMatchObject({ ok: true, resolved: { key: 'OPUS', source: 'system' } })
    h.mode.mockReturnValue('api')
    const api = await resolveModel('DESIGN_FREEFORM', { userId: 'u1', teamId: 'team1' })
    expect(api).toMatchObject({ ok: true, resolved: { key: 'SONNET', source: 'system' } })
  })

  it('the team default and the gate read from the stored policy and the credential', async () => {
    h.policyFindUnique.mockResolvedValue(
      storedRow({
        requirePersonalTokenForGated: true,
        defaults: [{ surface: 'DESIGN_FREEFORM', model: 'OPUS' }],
      }),
    )
    h.tokenFindFirst.mockResolvedValue({ id: 'tok1' })
    expect(await resolveModel('DESIGN_FREEFORM', { userId: 'u1', teamId: 'team1' })).toMatchObject({
      ok: true,
      resolved: { key: 'OPUS', source: 'team', substitutedFrom: null },
    })
    // The scheduler (userId null) runs on the team token: Opus is gated out.
    expect(await resolveModel('DESIGN_FREEFORM', { userId: null, teamId: 'team1' })).toMatchObject({
      ok: true,
      resolved: { key: 'SONNET', source: 'system', substitutedFrom: 'OPUS' },
    })
  })

  it('an explicit request outside the effective set comes back as the refusal, unchanged', async () => {
    h.policyFindUnique.mockResolvedValue(storedRow({ allowedModels: ['HAIKU', 'SONNET'] }))
    expect(
      await resolveModel('CAPTION', { requested: 'OPUS', userId: 'u1', teamId: 'team1' }),
    ).toEqual({ ok: false, code: 'NOT_ALLOWED', message: "Opus 5.5 isn't allowed on this team" })
  })

  it('REFINE follows designPath (A8)', async () => {
    const a = await resolveModel('REFINE', { userId: 'u1', teamId: 'team1', designPath: 'A' })
    expect(a).toMatchObject({ ok: true, resolved: { key: 'HAIKU' } })
  })

  it('a substitution logs at warn for a non-interactive caller (userId null), JSON-quoted', async () => {
    h.policyFindUnique.mockResolvedValue(storedRow({ allowedModels: ['HAIKU', 'SONNET'] }))
    const stamp = 'claude-opus-5-5'
    await resolveModel('DESIGN_FREEFORM', { stamp, userId: null, teamId: 'team1' })
    expect(warn).toHaveBeenCalledWith(
      `[models] DESIGN_FREEFORM: "${stamp}" not available (not allowed on this team) → SONNET (system)`,
    )
    expect(info).not.toHaveBeenCalled()
  })

  it('…and at info for an interactive one', async () => {
    await resolveModel('CAPTION', { stamp: 'gpt-4o', userId: 'u1', teamId: 'team1' })
    expect(info).toHaveBeenCalledWith(
      '[models] CAPTION: "gpt-4o" not available (unknown model) → HAIKU (system)',
    )
    expect(warn).not.toHaveBeenCalled()
  })

  it('a hostile stamp is quoted and capped, never interpolated raw', async () => {
    const stamp = 'x"\n[models] forged line' + 'y'.repeat(200)
    await resolveModel('CAPTION', { stamp, userId: null, teamId: 'team1' })
    const line = warn.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .find((l: string) => l.startsWith('[models] CAPTION'))
    expect(line).toBeDefined()
    expect(line).not.toContain('\n')
    expect(line).toContain(JSON.stringify(stamp.slice(0, 80)))
  })

  it('a retired stamp names the reason', async () => {
    await resolveModel('DESIGN_FREEFORM', {
      stamp: 'claude-sonnet-4-6',
      userId: 'u1',
      teamId: 'team1',
    })
    expect(info).toHaveBeenCalledWith(
      '[models] DESIGN_FREEFORM: "claude-sonnet-4-6" not available (retired ID of Sonnet 5.5) → SONNET (stamp)',
    )
  })

  it('no substitution → no log line', async () => {
    await resolveModel('CAPTION', { userId: null, teamId: 'team1' })
    expect(warn).not.toHaveBeenCalled()
    expect(info).not.toHaveBeenCalled()
  })
})

describe('loadModelsView — GET /api/models (FR-13)', () => {
  it('the catalogue without prices or apiIds, plus the policy, mode, credential and envDefault', async () => {
    h.env.CLAUDE_CLI_MODEL = 'SONNET'
    h.tokenFindFirst.mockResolvedValue({ id: 'tok1' })
    h.policyFindUnique.mockResolvedValue(
      storedRow({
        requirePersonalTokenForGated: true,
        defaults: [{ surface: 'CAPTION', model: 'SONNET' }],
      }),
    )
    const view = await loadModelsView({ userId: 'u1', teamId: 'team1' })
    expect(view).toMatchObject({
      allowed: ALL,
      defaults: { CAPTION: 'SONNET' },
      gateOn: true,
      mode: 'cli',
      credential: 'personal',
      envDefault: 'SONNET',
      captionProviderIsClaude: true,
    })
    expect(view.catalogue.map((e) => [e.key, e.tier, e.speed, e.personalTokenGated])).toEqual([
      ['HAIKU', '$', 'fast', false],
      ['SONNET', '$$', 'medium', false],
      ['OPUS', '$$$', 'slow', true],
    ])
    expect(view.catalogue[2].surfaces).not.toContain('DESIGN_TEMPLATE')
    expect(view.catalogue[0].surfaces).not.toContain('INTERNAL_VERIFIER')
    for (const e of view.catalogue) {
      expect(Object.keys(e).sort()).toEqual([
        'displayName',
        'key',
        'personalTokenGated',
        'speed',
        'surfaces',
        'tier',
      ])
    }
    expect(JSON.stringify(view)).not.toMatch(/claude-|price/i)
  })

  it("API mode: credential 'n/a' and envDefault null (ignored, A4)", async () => {
    h.mode.mockReturnValue('api')
    h.env.CLAUDE_CLI_MODEL = 'OPUS'
    const view = await loadModelsView({ userId: 'u1', teamId: 'team1' })
    expect(view).toMatchObject({ mode: 'api', credential: 'n/a', envDefault: null })
  })

  // Spec open question 1 → FR-18: the CAPTION picker is hidden when the team's
  // default caption provider isn't Claude.
  it.each([
    ['no COPY row (claude -p / the ANTHROPIC_API_KEY fallback)', null, true],
    ['a cli row', { providerName: 'cli' }, true],
    ['an anthropic row', { providerName: 'Anthropic' }, true],
    ['an OpenAI row', { providerName: 'openai' }, false],
  ])('captionProviderIsClaude: %s → %s', async (_label, row, expected) => {
    for (const mode of ['cli', 'api'] as const) {
      h.mode.mockReturnValue(mode)
      h.providerFindMany.mockResolvedValue(
        row ? [{ id: 'r1', providerKey: 'k1', createdAt: new Date(0), isDefault: true, ...row }] : [],
      )
      const view = await loadModelsView({ userId: 'u1', teamId: 'team1' })
      expect(view.captionProviderIsClaude).toBe(expected)
    }
    // The team's enabled COPY rows, scoped to the session team, never reading
    // the encrypted key (018 FR-04, 024 FR-03).
    expect(h.providerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slot: 'COPY', teamId: 'team1', isEnabled: true },
        select: { id: true, providerKey: true, providerName: true, isDefault: true, createdAt: true },
      }),
    )
  })
})

describe('the routes', () => {
  const put = (body: unknown) =>
    policyRoute.PUT(
      new Request('http://test/api/team/model-policy', {
        method: 'PUT',
        body: JSON.stringify(body),
      }) as never,
      { params: {} } as never,
    )
  const valid = {
    allowed: ALL,
    defaults: { DESIGN_FREEFORM: 'OPUS' },
    requirePersonalTokenForGated: false,
  }

  it('GET /api/team/model-policy returns the policy for the session team', async () => {
    const res = await policyRoute.GET(new Request('http://test') as never, { params: {} } as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      allowed: ALL,
      defaults: ALL_NULL,
      requirePersonalTokenForGated: false,
      saved: false,
      newModels: [],
    })
    expect(h.policyFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamId: 'team1' } }),
    )
  })

  it('PUT saves and returns the GET shape', async () => {
    const res = await put(valid)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      allowed: ALL,
      defaults: { ...ALL_NULL, DESIGN_FREEFORM: 'OPUS' },
      requirePersonalTokenForGated: false,
      saved: true,
      newModels: [],
    })
  })

  it("PUT allowed: ['OPUS'] → 400 with FR-05's message", async () => {
    const res = await put({ ...valid, allowed: ['OPUS'], defaults: {} })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Template fill needs Haiku or Sonnet allowed' })
    expect(h.transaction).not.toHaveBeenCalled()
  })

  it('PUT a default outside allowed → 400', async () => {
    const res = await put({ ...valid, allowed: ['HAIKU', 'SONNET'] })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/isn't in the allowed models/)
  })

  it.each([
    ['an unknown key', { ...valid, allowed: ['HAIKU', 'FABLE'] }],
    ['an unknown surface', { ...valid, defaults: { INTERNAL_VERIFIER: 'HAIKU' } }],
    ['an unknown field', { ...valid, teamId: 'team2' }],
    ['a missing field', { allowed: ALL, defaults: {} }],
    ['a lowercase key', { ...valid, defaults: { CAPTION: 'haiku' } }],
  ])('PUT with %s → 400 (strict zod), nothing written', async (_label, body) => {
    const res = await put(body)
    expect(res.status).toBe(400)
    expect(h.transaction).not.toHaveBeenCalled()
  })

  it('GET /api/models returns the view for the session user and team', async () => {
    const res = await modelsRoute.GET(new Request('http://test') as never, { params: {} } as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ mode: 'cli', credential: 'team', allowed: ALL })
    expect(h.tokenFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'u1' }) }),
    )
  })
})
