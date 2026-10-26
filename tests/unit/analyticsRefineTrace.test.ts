// 006 T2: the refine analytics data (FR-05). Three layers:
//   - runRefineAttempts' `accepted` result carries every attempt (the miss, if
//     any, and the pass), as counts and classes, never reason text;
//   - the verifier's identity: VERIFIER_PROMPT_VERSION, and VERIFIER_SYSTEM's
//     text pinned by a golden hash, so a prompt edit cannot go unrecorded;
//   - the refine route fills the ActionTrace that startDraftAction turns into
//     the event: instruction, model, verifier model and prompt version, calls,
//     attempts; `conflict` is marked on the trace; a not-applied refine carries
//     its diagnostics' attempts.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'

const h = vi.hoisted(() => ({
  draft: null as null | Record<string, unknown>,
  claim: vi.fn(),
  commit: vi.fn(),
  reject: vi.fn(),
  refineApi: vi.fn(),
  result: null as null | Record<string, unknown>,
  traces: [] as unknown[],
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    draft: { findUnique: async () => h.draft, update: vi.fn(), updateMany: async () => ({ count: 1 }) },
    teamModelPolicy: { findUnique: async () => null },
    userClaudeToken: { findFirst: async () => null },
  },
}))
vi.mock('@/lib/api/handler', () => ({
  parseBody: async (req: Request) => ({ data: await req.json() }),
  withTeamAuth:
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx.params }, { userId: 'u1', teamId: 'team1' }),
}))
vi.mock('@/lib/authz/visibility', () => ({ canAccessContent: () => true }))
vi.mock('@/lib/brandkit/resolve', () => ({ resolveBrandKit: async () => ({ id: 'kit', name: 'Kit', colors: [], fonts: [], logos: [], artifacts: [] }) }))
vi.mock('@/lib/storage/minio', () => ({ resolveExportUrl: async (k: string | null) => k }))
vi.mock('@/lib/agent/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agent/config')>()
  return { ...actual, isCliMode: () => false, pipelineMode: () => 'api' as const }
})
vi.mock('@/lib/agent/designAgent', () => ({ runDesignAgentRefine: h.refineApi }))
vi.mock('@/lib/agent/designAgentCli', () => ({ runDesignAgentCliRefine: vi.fn() }))
vi.mock('@/lib/agent/background', () => ({
  generateBackgroundForRefine: async () => ({ url: null, skip: 'NOT_NEEDED', detail: null }),
}))
// The real VERIFIER_PROMPT_VERSION; only the model call is faked.
vi.mock('@/lib/drafts/refineVerify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/drafts/refineVerify')>()
  return { ...actual, verifyRefine: vi.fn() }
})
vi.mock('@/lib/renderer/domFacts', () => ({ extractDomFacts: async () => ({ elements: [] }) }))
vi.mock('@/lib/drafts/draftActions', () => ({
  claimDraftAction: h.claim,
  touchDraftAction: async () => {},
  // Run the work inline and keep the trace the route passed (the 7th argument).
  startDraftAction: async (
    _d: string,
    _u: string,
    _t: string,
    _a: unknown,
    work: () => Promise<unknown>,
    _onError: unknown,
    trace: unknown,
  ) => {
    await work()
    h.traces.push(trace)
  },
}))
vi.mock('@/lib/drafts/refineAttempt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/drafts/refineAttempt')>()
  return {
    ...actual,
    runRefineAttempts: async (
      input: { model: unknown },
      deps: { runRefine: (r: { attempt: 1; model: unknown }) => Promise<string> },
    ) => {
      await deps.runRefine({ attempt: 1, model: input.model })
      return h.result
    },
  }
})
vi.mock('@/lib/drafts/revisions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/drafts/revisions')>()
  return { ...actual, commitDraftRevision: h.commit, recordRejectedRender: h.reject }
})

const { POST: refine } = await import('@/app/api/drafts/[id]/refine/route')
const { runRefineAttempts, summariseAttempt } = await vi.importActual<typeof import('@/lib/drafts/refineAttempt')>(
  '@/lib/drafts/refineAttempt',
)
const verifier = await vi.importActual<typeof import('@/lib/drafts/refineVerify')>('@/lib/drafts/refineVerify')
const { internalModel, decideModel } = await import('@/lib/models/resolve')

const ctx = { params: { id: 'd1' } } as never
const post = (body: Record<string, unknown>) =>
  refine(new Request('http://test/x', { method: 'POST', body: JSON.stringify(body) }) as never, ctx) as Promise<Response>

function draft() {
  return {
    id: 'd1',
    teamId: 'team1',
    htmlContent: '<html>current</html>',
    designModel: null,
    designModelSubstitutedFrom: null,
    pendingConflict: null,
    brief: { id: 'b1', userId: 'u1', campaignId: null, brandKitId: null, aspectRatio: 'SQUARE', designMode: 'GENERATE' },
  }
}

const ATTEMPT = {
  attempt: 1,
  document: 'complete',
  classes: ['replace', 'add'],
  classificationDefaulted: false,
  effectiveClasses: ['add'],
  downgraded: ['replace'],
  supersedes: [],
  constrains: [],
  reconcile: { kind: 'clean', missing: [] },
  verdict: 'miss',
  reasons: ['the headline text still says the old thing', 'second reason'],
  verifierCalls: 1,
}

beforeEach(() => {
  h.draft = draft()
  h.traces = []
  h.result = { kind: 'accepted', html: '<html>refined</html>', refineCalls: 1, verifierCalls: 1, attempts: [] }
  for (const fn of [h.claim, h.commit, h.reject, h.refineApi]) fn.mockReset()
  h.claim.mockResolvedValue({ action: 'REFINE', claimId: 'c1' })
  h.commit.mockResolvedValue({ revisionId: 'rev-2', exportKey: 'exports/r.png', revisionNumber: 2 })
  h.reject.mockResolvedValue({ revisionId: 'rej-1', exportKey: null })
  h.refineApi.mockResolvedValue('<html>reply</html>')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

type Trace = { fields: Record<string, unknown>; outcome?: string }

describe('the refine route fills the ActionTrace (FR-05)', () => {
  it('accepted: instruction, resolved model, verifier model and prompt version, calls and attempts', async () => {
    const attempts = [summariseAttempt(ATTEMPT as never), { classes: ['add'], effectiveClasses: ['add'], verdict: 'pass', reasons: 0 }]
    h.result = { kind: 'accepted', html: '<html>refined</html>', refineCalls: 2, verifierCalls: 2, attempts }
    expect((await post({ instruction: 'make the logo bigger' })).status).toBe(202)
    expect(h.traces).toHaveLength(1)
    const t = h.traces[0] as Trace
    expect(t.fields).toMatchObject({
      instruction: 'make the logo bigger',
      model: { model: 'SONNET', modelId: 'claude-sonnet-5-5', substitutedFrom: null },
      verifierModelId: internalModel('INTERNAL_VERIFIER', 'api').arg,
      verifierPromptVersion: verifier.VERIFIER_PROMPT_VERSION,
      refineCalls: 2,
      verifierCalls: 2,
      attempts,
    })
    expect(t.outcome).toBeUndefined()
  })

  it('not-applied: the diagnostics attempts, summarised, and the calls from the diagnostics', async () => {
    h.result = {
      kind: 'not-applied',
      reason: 'missed twice',
      html: '<html>rejected</html>',
      unusableHtml: null,
      diagnostics: { version: 1, refineCalls: 2, verifierCalls: 1, attempts: [ATTEMPT, { ...ATTEMPT, attempt: 2 }], reasons: [] },
    }
    await post({ instruction: 'remove the footer' })
    const t = h.traces[0] as Trace
    expect(t.fields.refineCalls).toBe(2)
    expect(t.fields.verifierCalls).toBe(1)
    expect(t.fields.attempts).toEqual([
      { classes: ['replace', 'add'], effectiveClasses: ['add'], verdict: 'miss', reasons: 2 },
      { classes: ['replace', 'add'], effectiveClasses: ['add'], verdict: 'miss', reasons: 2 },
    ])
    expect(h.reject).toHaveBeenCalledTimes(1)
  })

  it('conflict: the trace is marked so the settle reports outcome conflict', async () => {
    h.result = { kind: 'conflict', conflict: { conflict: true, explanation: 'clashes', pendingHtml: '<html/>' }, refineCalls: 1, verifierCalls: 0 }
    await post({ instruction: 'use a pink background' })
    expect((h.traces[0] as Trace).outcome).toBe('conflict')
  })

  it('a reason text never reaches the trace', async () => {
    h.result = {
      kind: 'not-applied',
      reason: 'x',
      html: null,
      unusableHtml: null,
      diagnostics: { version: 1, refineCalls: 1, verifierCalls: 1, attempts: [ATTEMPT], reasons: ['secret reason text'] },
    }
    await post({ instruction: 'x' })
    expect(JSON.stringify((h.traces[0] as Trace).fields)).not.toContain('the headline text still says')
    expect(JSON.stringify((h.traces[0] as Trace).fields)).not.toContain('secret reason text')
  })
})

describe('runRefineAttempts reports its attempts (FR-05)', () => {
  const doc = (body: string) => `<!DOCTYPE html>\n<html><head></head><body>${body}</body></html>`
  const reply = (classes: string[], body: string) =>
    '```json\n' + JSON.stringify({ classes, supersedes: [], constrains: [] }) + '\n```\n' + doc(body)
  const model = (() => {
    const r = decideModel('REFINE', {
      requested: 'SONNET',
      policy: { allowed: ['HAIKU', 'SONNET', 'OPUS'], defaults: {}, gateOn: false },
      credential: 'n/a',
      mode: 'api',
    })
    if (!r.ok) throw new Error(r.message)
    return r.resolved
  })()

  it('a first-try pass has one attempt; a miss then a pass has two, the pass last', async () => {
    const pass = { kind: 'pass' } as const
    const first = await runRefineAttempts(
      { model, inlineAssets: {} },
      { runRefine: async () => reply(['add'], 'a'), verify: async () => ({ result: pass, modelCalls: 1 }) },
    )
    expect(first.kind).toBe('accepted')
    if (first.kind !== 'accepted') return
    expect(first.attempts).toEqual([{ classes: ['add'], effectiveClasses: ['add'], verdict: 'pass', reasons: 0 }])

    const verify = vi
      .fn()
      .mockResolvedValueOnce({ result: { kind: 'miss', reasons: ['one', 'two'] }, modelCalls: 1 })
      .mockResolvedValueOnce({ result: pass, modelCalls: 1 })
    const second = await runRefineAttempts(
      { model, inlineAssets: {} },
      { runRefine: async () => reply(['add'], 'b'), verify },
    )
    expect(second.kind).toBe('accepted')
    if (second.kind !== 'accepted') return
    expect(second.attempts.map((a) => [a.verdict, a.reasons])).toEqual([
      ['miss', 2],
      ['pass', 0],
    ])
    expect(second.refineCalls).toBe(2)
    expect(second.verifierCalls).toBe(2)
  })
})

describe('the verifier prompt identity (FR-05)', () => {
  it('VERIFIER_PROMPT_VERSION is the design value', () => {
    expect(verifier.VERIFIER_PROMPT_VERSION).toBe('2026-10-24.1')
  })

  // Golden: 006 did not change the verifier's wording. If this fails after an
  // intended edit to VERIFIER_SYSTEM, bump VERIFIER_PROMPT_VERSION in the same
  // change and update the hash here.
  it('VERIFIER_SYSTEM is byte-for-byte the text 006 recorded the version against', () => {
    const hash = createHash('sha256').update(verifier.VERIFIER_SYSTEM).digest('hex')
    expect(hash).toBe('086c319a7ca920902688e8ee2cb7da437741ffc0e18b905b7a30dc37e14f9604')
  })
})
