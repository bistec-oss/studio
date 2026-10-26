// 007 T2: POST /api/admin/brandkits/[id]/prompts/upgrade and the additive
// `lostRules` on improve. Prisma, auth and the model are faked; the real route
// wrapper, detector, validator and seam run. No real model call.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  user: vi.fn(),
  team: vi.fn(),
  resolve: vi.fn(),
  run: vi.fn(),
  sampler: vi.fn(),
  draft: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { brandKit: { findUnique: h.findUnique } } }))
vi.mock('@/lib/auth', async () => {
  const roles = await import('@/lib/roles')
  return { getCurrentUser: h.user, hasRole: roles.hasRole }
})
vi.mock('@/lib/authz/teamContext', () => ({
  ACTIVE_TEAM_COOKIE: 'bistec-active-team',
  resolveActiveTeam: h.team,
}))
vi.mock('@/lib/agent/userToken', () => ({
  withClaudeAuth: (_u: unknown, _t: unknown, fn: () => unknown) => fn(),
}))
vi.mock('@/lib/agent/config', () => ({ pipelineMode: () => 'cli' }))
vi.mock('@/lib/renderer/puppeteer', () => ({ sampleImageColors: h.sampler }))
vi.mock('@/lib/brandkit/voiceDraft', () => ({ draftBrandVoice: h.draft }))
vi.mock('@/lib/campaign/briefingAssistant', () => {
  class AssistantModelError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message)
    }
  }
  return { AssistantModelError, resolveAssistantModel: h.resolve, runBriefingModel: h.run }
})

import type { ModelCallRecord } from '@/lib/models/modelCalls'

const MODEL = {
  surface: 'ASSISTANT_BRANDKIT',
  key: 'SONNET',
  arg: 'sonnet',
  source: 'system',
  substitutedFrom: null,
}
const TEXT =
  'Give the logo generous clear space. Keep the logo a similar size to the wordmark. Leave plenty of breathing room around the logo.'

const kit = (over: Record<string, unknown> = {}) => ({
  id: 'k1',
  teamId: 'team1',
  isDeleted: false,
  colors: ['#0b3d91', '#00a88f'],
  fonts: [{ name: 'Poppins', url: 'u' }],
  prompts: [{ version: 3, content: 'active' }],
  ...over,
})

const reply = (proposals: unknown) => '```kitedits\n' + JSON.stringify(proposals) + '\n```'

let calls: ModelCallRecord[]
let logs: string[]

async function load(mock: boolean) {
  vi.resetModules()
  vi.stubEnv('MOCK_AI', mock ? 'true' : 'false')
  // resetModules gave the route a fresh recorder; install the sink on that one.
  const recorder = await import('@/lib/models/modelCalls')
  recorder.setModelCallSink({
    record: (r) => calls.push(r),
    read: () => calls,
    clear: () => (calls.length = 0),
  })
  const upgrade = await import('@/app/api/admin/brandkits/[id]/prompts/upgrade/route')
  const improve = await import('@/app/api/admin/brandkits/[id]/prompts/improve/route')
  return { upgrade: upgrade.POST, improve: improve.POST }
}
type Handler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
const post = (fn: unknown, body: unknown, id = 'k1') =>
  (fn as Handler)(
    new NextRequest('http://localhost/api', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset()
  h.user.mockResolvedValue({ userId: 'u1', role: 'editor' })
  h.team.mockResolvedValue({ kind: 'ok', teamId: 'team1', teamRole: 'ADMIN' })
  h.resolve.mockResolvedValue(MODEL)
  h.findUnique.mockResolvedValue(kit())
  calls = []
  logs = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void logs.push(a.join(' ')))
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('upgrade route: auth, tenancy, body', () => {
  it('401 with no session', async () => {
    h.user.mockResolvedValue(null)
    const { upgrade } = await load(false)
    expect((await post(upgrade, { text: TEXT, baseVersion: 3 })).status).toBe(401)
  })
  it('403 for a team editor', async () => {
    h.team.mockResolvedValue({ kind: 'ok', teamId: 'team1', teamRole: 'EDITOR' })
    const { upgrade } = await load(false)
    expect((await post(upgrade, { text: TEXT, baseVersion: 3 })).status).toBe(403)
  })
  it('404 for a missing kit, a deleted kit and another team kit (never 403)', async () => {
    const { upgrade } = await load(false)
    for (const found of [null, kit({ isDeleted: true }), kit({ teamId: 'other' })]) {
      h.findUnique.mockResolvedValue(found)
      expect((await post(upgrade, { text: TEXT, baseVersion: 3 })).status).toBe(404)
    }
    expect(h.run).not.toHaveBeenCalled()
  })
  it('400 for a bad body', async () => {
    const { upgrade } = await load(false)
    for (const body of [
      {},
      { baseVersion: 3 },
      { text: TEXT },
      { text: TEXT, baseVersion: -1 },
      { text: TEXT, baseVersion: 1.5 },
      { text: '', baseVersion: 3 },
      { text: 'x'.repeat(20_001), baseVersion: 3 },
      { text: TEXT, baseVersion: 3, extra: 1 },
      'not json',
    ]) {
      expect((await post(upgrade, body)).status).toBe(400)
    }
    expect(h.run).not.toHaveBeenCalled()
  })
})

describe('upgrade route: before the model', () => {
  it('409 STALE_BASE with the active version and no model call', async () => {
    const { upgrade } = await load(false)
    const res = await post(upgrade, { text: TEXT, baseVersion: 2 })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ code: 'STALE_BASE', activeVersion: 3 })
    expect(h.resolve).not.toHaveBeenCalled()
    expect(h.run).not.toHaveBeenCalled()
  })
  it('baseVersion 0 is valid only when the kit has no active prompt', async () => {
    const { upgrade } = await load(false)
    expect((await post(upgrade, { text: TEXT, baseVersion: 0 })).status).toBe(409)
    h.findUnique.mockResolvedValue(kit({ prompts: [] }))
    h.run.mockResolvedValue(reply([]))
    expect((await post(upgrade, { text: TEXT, baseVersion: 0 })).status).toBe(200)
  })
  it('no candidates: 200 none / no-candidates, no model call, still logged', async () => {
    const { upgrade } = await load(false)
    const res = await post(upgrade, { text: 'Use the colours at 45% width.', baseVersion: 3 })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      outcome: 'none',
      reason: 'no-candidates',
      rejected: [],
      candidates: 0,
    })
    expect(h.resolve).not.toHaveBeenCalled()
    expect(h.run).not.toHaveBeenCalled()
    expect(logs.some((l) => l.startsWith('[kit-upgrade] team=team1 kit=k1 candidates=0'))).toBe(
      true,
    )
  })
  it('422 when no model can run', async () => {
    const { AssistantModelError } = await import('@/lib/campaign/briefingAssistant')
    h.resolve.mockRejectedValue(new AssistantModelError('MODEL_NOT_ALLOWED' as never, 'nope'))
    const { upgrade } = await load(false)
    const res = await post(upgrade, { text: TEXT, baseVersion: 3 })
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ code: 'MODEL_NOT_ALLOWED', message: 'nope' })
    expect(h.run).not.toHaveBeenCalled()
  })
})

describe('upgrade route: the model call (real mode path, model faked)', () => {
  it('edits: one call, provenance set by code, reply provenance and entryKey ignored', async () => {
    h.run.mockResolvedValue(
      reply([
        {
          candidateId: 'logo-clear-space:14',
          replacement: 'clear space of 9 wordmark letters on every side',
          provenance: 'dataset',
          entryKey: 'canvas-share',
          quote: 'anything',
        },
        {
          candidateId: 'mark-size-match:52',
          replacement: 'a mark height of 1.5 wordmark letters',
        },
      ]),
    )
    const { upgrade } = await load(false)
    const res = await post(upgrade, { text: TEXT, baseVersion: 3 })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(h.run).toHaveBeenCalledTimes(1)
    expect(body.outcome).toBe('edits')
    expect(body.baseVersion).toBe(3)
    expect(body.candidates).toBe(3)
    const first = body.edits.find((e: { id: string }) => e.id === 'logo-clear-space:14')
    expect(first.provenance).toBe('unverified')
    expect(first.entryKey).toBe('logo-clear-space')
    expect(first.quote).toBe('generous clear space')
    for (const e of body.edits) expect(['dataset', 'unverified']).toContain(e.provenance)
  })

  it('none / model-proposed-none and none / all-rejected', async () => {
    const { upgrade } = await load(false)
    h.run.mockResolvedValueOnce(reply([]))
    expect(await (await post(upgrade, { text: TEXT, baseVersion: 3 })).json()).toMatchObject({
      outcome: 'none',
      reason: 'model-proposed-none',
    })
    h.run.mockResolvedValueOnce(
      reply([{ candidateId: 'logo-clear-space:14', replacement: 'make it roomier please' }]),
    )
    expect(await (await post(upgrade, { text: TEXT, baseVersion: 3 })).json()).toMatchObject({
      outcome: 'none',
      reason: 'all-rejected',
      rejected: [{ candidateId: 'logo-clear-space:14', reason: 'not-measurable' }],
    })
  })

  it('502 UPGRADE_PARSE_FAILED, logging the raw reply capped at 2000 chars, newlines escaped', async () => {
    h.run.mockResolvedValue('line one\nline two ' + 'z'.repeat(5000))
    const { upgrade } = await load(false)
    const res = await post(upgrade, { text: TEXT, baseVersion: 3 })
    expect(res.status).toBe(502)
    expect((await res.json()).code).toBe('UPGRADE_PARSE_FAILED')
    const line = logs.find((l) => l.startsWith('[kit-upgrade] parse-failed'))!
    expect(line).toContain('team=team1 kit=k1 reason=missing reply=line one\\nline two ')
    expect(line).not.toContain('\n')
    const raw = line.split('reply=')[1]
    // 2000 source chars, one of which is a newline escaped to two characters.
    expect(raw.length).toBeLessThanOrEqual(2001)
    expect(logs.some((l) => l.startsWith('[kit-upgrade] team='))).toBe(false)
  })

  it('invalid JSON and schema failures are 502 too', async () => {
    const { upgrade } = await load(false)
    h.run.mockResolvedValueOnce('```kitedits\n{not json\n```')
    expect((await post(upgrade, { text: TEXT, baseVersion: 3 })).status).toBe(502)
    h.run.mockResolvedValueOnce(reply([{ candidateId: 1 }]))
    expect((await post(upgrade, { text: TEXT, baseVersion: 3 })).status).toBe(502)
    expect(logs.filter((l) => l.includes('reason=invalid-json')).length).toBe(1)
    expect(logs.filter((l) => l.includes('reason=schema')).length).toBe(1)
  })

  it('logs the FR-05 fields and none of the prompt text or key', async () => {
    h.run.mockResolvedValue(
      reply([
        {
          candidateId: 'logo-clear-space:14',
          replacement: 'clear space of 1 to 2 wordmark letters',
        },
      ]),
    )
    const { upgrade } = await load(false)
    await post(upgrade, { text: TEXT, baseVersion: 3 })
    expect(logs).toContain(
      '[kit-upgrade] team=team1 kit=k1 candidates=3 edits=1 rejected=0 entries=logo-clear-space,mark-size-match',
    )
    expect(logs.join('\n')).not.toContain('generous')
  })

  it('builds a prompt with roles and no kit font or hex, and never calls the sampler', async () => {
    h.run.mockResolvedValue(reply([]))
    const { upgrade } = await load(false)
    await post(upgrade, { text: TEXT, baseVersion: 3 })
    const [system, messages, , , opts] = h.run.mock.calls[0]
    const all = system + JSON.stringify(messages)
    expect(all).toContain('the headline font')
    expect(all).not.toMatch(/#0b3d91|#00a88f|Poppins/i)
    expect(all).toContain('<<<UNTRUSTED-DATA>>>')
    expect(opts).toMatchObject({ label: 'kit-upgrade' })
    expect(h.sampler).not.toHaveBeenCalled()
  })
})

describe('upgrade route: the MOCK_AI seam', () => {
  it('records one kit-upgrade call for the ASSISTANT_BRANDKIT model and makes no model call', async () => {
    const { upgrade } = await load(true)
    const res = await post(upgrade, { text: TEXT, baseVersion: 3 })
    const body = await res.json()
    expect(body.outcome).toBe('edits')
    expect(body.edits).toHaveLength(3)
    expect(body.edits.every((e: { provenance: string }) => e.provenance === 'dataset')).toBe(true)
    expect(h.run).not.toHaveBeenCalled()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      label: 'kit-upgrade',
      surface: 'ASSISTANT_BRANDKIT',
      key: 'SONNET',
      arg: 'sonnet',
    })
  })

  it('no record for the 409 or the no-candidates case', async () => {
    const { upgrade } = await load(true)
    await post(upgrade, { text: TEXT, baseVersion: 1 })
    await post(upgrade, { text: 'nothing vague here', baseVersion: 3 })
    expect(calls).toHaveLength(0)
  })

  it('UNPARSEABLE gives 502, NONE gives model-proposed-none', async () => {
    const { upgrade } = await load(true)
    const bad = await post(upgrade, {
      text: TEXT + ' __MOCK_UPGRADE_UNPARSEABLE__',
      baseVersion: 3,
    })
    expect(bad.status).toBe(502)
    const none = await post(upgrade, { text: TEXT + ' __MOCK_UPGRADE_NONE__', baseVersion: 3 })
    expect(await none.json()).toMatchObject({ outcome: 'none', reason: 'model-proposed-none' })
  })

  it('BAD gives one edit and three rejections', async () => {
    const { upgrade } = await load(true)
    const res = await post(upgrade, { text: TEXT + ' __MOCK_UPGRADE_BAD__', baseVersion: 3 })
    const body = await res.json()
    expect(body.outcome).toBe('edits')
    expect(body.edits).toHaveLength(1)
    expect(body.rejected.map((r: { reason: string }) => r.reason).sort()).toEqual([
      'forbidden-content',
      'not-measurable',
      'unknown-candidate',
    ])
  })

  it('OUTOFRANGE gives an unverified edit that is still measurable', async () => {
    const { upgrade } = await load(true)
    const res = await post(upgrade, { text: TEXT + ' __MOCK_UPGRADE_OUTOFRANGE__', baseVersion: 3 })
    const body = await res.json()
    expect(body.outcome).toBe('edits')
    expect(body.edits[0].provenance).toBe('unverified')
    expect(body.edits[0].replacement).toContain('997')
  })
})

describe('improve route: lostRules (FR-15)', () => {
  const active = (content: string) => kit({ prompts: [{ version: 3, content }] })

  it('flags the dropped rule in its original spelling and keeps `draft`', async () => {
    h.findUnique.mockResolvedValue(
      active('Logo 45-60% of canvas width and 1.5 wordmark letters apart.'),
    )
    h.draft.mockResolvedValue('Logo 45-60% of canvas width.')
    const { improve } = await load(false)
    const body = await (await post(improve, {})).json()
    expect(body.draft).toBe('Logo 45-60% of canvas width.')
    expect(body.lostRules).toEqual(['1.5 wordmark letters'])
  })

  it('keeping both, or only reformatting, loses nothing', async () => {
    h.findUnique.mockResolvedValue(
      active('Logo 45-60% of canvas width and 1.5 wordmark letters apart.'),
    )
    h.draft.mockResolvedValue('Logo ~45 – 60 % of canvas width, 1.5 wordmark letters apart.')
    const { improve } = await load(false)
    expect((await (await post(improve, {})).json()).lostRules).toEqual([])
  })

  it('passes the unchanged prompt text to the draft helper', async () => {
    h.findUnique.mockResolvedValue(active('CURRENT'))
    h.draft.mockResolvedValue('x')
    const { improve } = await load(false)
    await post(improve, {})
    const { buildImprovePrompt } = await import('@/lib/kitUpgrade/prompt')
    expect(h.draft.mock.calls[0][2]).toBe(buildImprovePrompt('CURRENT'))
  })

  it('the DROP_RULES sentinel drops the rules in the mock draft; without it the mock draft is the old string', async () => {
    h.draft.mockImplementation(
      async (_t: string, _u: string, _p: string, o: { mockDraft?: string }) => o.mockDraft,
    )
    const { improve } = await load(true)
    h.findUnique.mockResolvedValue(
      active('Logo 45-60% of canvas width __MOCK_IMPROVE_DROP_RULES__'),
    )
    const dropped = await (await post(improve, {})).json()
    expect(dropped.lostRules).toEqual(['45-60%'])
    h.findUnique.mockResolvedValue(active('Logo 45-60% of canvas width'))
    const plain = await (await post(improve, {})).json()
    expect(plain.draft).toBe(
      'Logo 45-60% of canvas width [MOCK improved brand voice prompt for E2E tests — deterministic.]',
    )
    expect(plain.lostRules).toEqual([])
  })
})
