// T17 (change 004 Phase 2) — the refine attempt loop, with the refine model and
// the verifier injected (Ruling F). Proves:
//   - AC-15: never more than 2 refine calls and 2 verifier calls, for ANY input
//     (miss, unavailable, unparseable envelope, truncated doc, token mismatch,
//     downgrade) — exhaustively over reply × verdict combinations;
//   - AC-16: not-applied → nothing committed (settleRefine);
//   - AC-10: an empty-supersedes replace/remove is a miss, never a delete;
//   - Ruling C: token reconciliation on the envelope html;
//   - AC-12 / AC-13 / AC-20b through the REAL verifyRefine (API mode, SDK and
//     DOM extraction mocked): structural classes spend zero verifier calls, add
//     spends exactly one per attempt, every verifier call is Haiku while the
//     retry runs on the model the route received.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DomElementFact } from '@/lib/agent/instructionClasses'

const h = vi.hoisted(() => ({
  extract: vi.fn(),
  anthropicCreate: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: h.anthropicCreate }
  },
}))
vi.mock('@/providers/registry', () => ({ resolveAnthropicApiKey: async () => 'sk-ant-api-test' }))
vi.mock('@/lib/renderer/domFacts', () => ({ extractDomFacts: h.extract }))
vi.mock('@/lib/agent/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agent/config')>()
  return { ...actual, isCliMode: () => false }
})
vi.mock('@/lib/testHooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/testHooks')>()
  return { ...actual, MOCK_AI: false }
})

const { runRefineAttempts, settleRefine, reconcileTokens, MAX_REFINE_ATTEMPTS } = await import('@/lib/drafts/refineAttempt')
const { verifyRefine, VERIFIER_MODEL } = await import('@/lib/drafts/refineVerify')
const { rejectionDiagnosticsSchema } = await import('@/lib/drafts/revisions')
type Deps = import('@/lib/drafts/refineAttempt').RefineAttemptDeps<{ conflict: true }>
type VerifyResult = import('@/lib/drafts/refineVerify').VerifyResult
type InstructionClass = import('@/lib/agent/instructionClasses').InstructionClass

// ── Reply fixtures ───────────────────────────────────────────────────────────

const doc = (body: string) => `<!DOCTYPE html>\n<html><head><style>body{margin:0}</style></head><body>${body}</body></html>`
const header = (classes: string[], supersedes: string[] = [], constrains: unknown[] = []) =>
  '```json\n' + JSON.stringify({ classes, supersedes, constrains }) + '\n```\n'
const reply = (classes: string[], body: string, supersedes: string[] = []) => `${header(classes, supersedes)}${doc(body)}`

const ASSETS = { __INLINE_ASSET_0__: 'data:image/png;base64,AAAA', __INLINE_ASSET_1__: 'data:image/png;base64,BBBB' }
const withTokens = (extra = '') =>
  `<img src="__INLINE_ASSET_0__"><div style="background:url(__INLINE_ASSET_1__)"></div>${extra}`

const REPLIES = {
  good: reply(['add'], 'ok'),
  noDocument: 'I could not do that, sorry.',
  truncated: `${header(['add'])}<!DOCTYPE html>\n<html><body>cut off`,
  downgraded: reply(['replace'], 'deleted things', []),
  tokenRename: reply(['add'], '<img src="__INLINE_ASSET_0_RENAMED__"><div style="background:url(__INLINE_ASSET_1__)"></div>'),
  tokenDuplicate: reply(['add'], withTokens('<img src="__INLINE_ASSET_0__">')),
  tokenTruncatedPrefix: reply(['add'], `${withTokens()}<img src="__INLINE_ASSET_`),
  tokenDropped: reply(['add'], '<img src="__INLINE_ASSET_0__">'),
} as const

// ── Fakes ────────────────────────────────────────────────────────────────────

function fakes(replies: string[], verdicts: VerifyResult[] = []) {
  const runs: Array<{ attempt: number; model: string; retryReasons?: string[] }> = []
  const verifies: Array<{ attempt: number; classes: InstructionClass[]; supersedes: string[]; afterHtml: string }> = []
  const deps: Deps = {
    runRefine: async (req) => {
      runs.push(req)
      return replies[Math.min(runs.length - 1, replies.length - 1)]
    },
    verify: async (req) => {
      verifies.push(req)
      const result = verdicts[Math.min(verifies.length - 1, verdicts.length - 1)] ?? { kind: 'pass' }
      // Mirror verifyRefine's policy: only add spends a model call.
      return { result, modelCalls: req.classes.includes('add') ? 1 : 0 }
    },
  }
  return { deps, runs, verifies }
}

const input = (inlineAssets: Record<string, string> = ASSETS) => ({ model: 'claude-opus-4-1', inlineAssets })
const MISS: VerifyResult = { kind: 'miss', reasons: ['add: no new figure appears in the AFTER facts'] }
const UNAVAILABLE: VerifyResult = { kind: 'unavailable', reason: 'verifier call failed: timeout' }

// ── The loop with fakes ──────────────────────────────────────────────────────

describe('runRefineAttempts — accept / retry / not applied', () => {
  it('accepts on attempt 1: one refine call, one verification, assets restored in the committed document', async () => {
    const f = fakes([reply(['add'], withTokens('<p>new figure</p>'))])
    const r = await runRefineAttempts(input(), f.deps)
    expect(r.kind).toBe('accepted')
    if (r.kind !== 'accepted') return
    expect(f.runs).toHaveLength(1)
    expect(f.verifies).toHaveLength(1)
    // Verify and commit the SAME document: tokens in what was verified, data URIs in what is committed.
    expect(f.verifies[0].afterHtml).toContain('__INLINE_ASSET_0__')
    expect(r.html).toBe(f.verifies[0].afterHtml.replace('__INLINE_ASSET_0__', ASSETS.__INLINE_ASSET_0__).replace('__INLINE_ASSET_1__', ASSETS.__INLINE_ASSET_1__))
    expect(r).toMatchObject({ refineCalls: 1, verifierCalls: 1 })
  })

  it('a miss retries ONCE on the same model, with the miss reasons, then accepts', async () => {
    const f = fakes([reply(['add'], withTokens())], [MISS, { kind: 'pass' }])
    const r = await runRefineAttempts(input(), f.deps)
    expect(r.kind).toBe('accepted')
    expect(f.runs.map((x) => x.attempt)).toEqual([1, 2])
    expect(f.runs.map((x) => x.model)).toEqual(['claude-opus-4-1', 'claude-opus-4-1'])
    expect(f.runs[0].retryReasons).toBeUndefined()
    expect(f.runs[1].retryReasons).toEqual(MISS.kind === 'miss' ? MISS.reasons : [])
    expect(f.verifies.map((x) => x.attempt)).toEqual([1, 2])
  })

  it('two misses end as not applied, with typed diagnostics and the last usable document', async () => {
    const f = fakes([reply(['add'], withTokens('<p>first</p>')), reply(['add'], withTokens('<p>second</p>'))], [MISS, MISS])
    const r = await runRefineAttempts(input(), f.deps)
    expect(r.kind).toBe('not-applied')
    if (r.kind !== 'not-applied') return
    expect(r.html).toContain('<p>second</p>')
    expect(r.html).toContain(ASSETS.__INLINE_ASSET_0__)
    expect(r.unusableHtml).toBeNull()
    expect(r.reason).toMatch(/could not be applied/)
    expect(r.reason).toContain('no new figure')
    const d = rejectionDiagnosticsSchema.parse({ ...r.diagnostics, export: 'none' })
    expect(d).toMatchObject({ refineCalls: 2, verifierCalls: 2 })
    expect(d.attempts.map((a) => [a.attempt, a.verdict, a.verifierCalls])).toEqual([
      [1, 'miss', 1],
      [2, 'miss', 1],
    ])
    expect(d.attempts[1].classes).toEqual(['add'])
  })

  it('unavailable is routed exactly like a miss (FR-10 / AC-14)', async () => {
    const f = fakes([REPLIES.good], [UNAVAILABLE, UNAVAILABLE])
    const r = await runRefineAttempts(input({}), f.deps)
    expect(r.kind).toBe('not-applied')
    if (r.kind !== 'not-applied') return
    expect(r.diagnostics.attempts.map((a) => a.verdict)).toEqual(['unavailable', 'unavailable'])
    expect(r.diagnostics.reasons[0]).toMatch(/unavailable \(treated as a miss\)/)
  })

  it('a verify that rejects fails closed (unavailable), never accepts', async () => {
    const f = fakes([REPLIES.good])
    f.deps.verify = async () => {
      throw new Error('boom')
    }
    const r = await runRefineAttempts(input({}), f.deps)
    expect(r.kind).toBe('not-applied')
  })

  it('a runRefine throw propagates — the crashed-run channel, not a not-applied outcome', async () => {
    const f = fakes([REPLIES.good])
    f.deps.runRefine = async () => {
      throw new Error('Claude CLI timed out')
    }
    await expect(runRefineAttempts(input({}), f.deps)).rejects.toThrow('timed out')
  })
})

describe('pre-verification misses spend no verification', () => {
  it('no document at all, twice → not applied, verify never called, nothing usable', async () => {
    const f = fakes([REPLIES.noDocument])
    const r = await runRefineAttempts(input(), f.deps)
    expect(f.verifies).toHaveLength(0)
    expect(r).toMatchObject({ kind: 'not-applied', html: null, unusableHtml: null })
    if (r.kind === 'not-applied') expect(r.diagnostics.attempts.map((a) => a.document)).toEqual(['none', 'none'])
  })

  it('a document with no closing </html> is not applied (truncation rule) and is never rendered', async () => {
    const f = fakes([REPLIES.truncated])
    const r = await runRefineAttempts(input({}), f.deps)
    expect(f.verifies).toHaveLength(0)
    expect(r.kind).toBe('not-applied')
    if (r.kind !== 'not-applied') return
    expect(r.html).toBeNull()
    expect(r.unusableHtml).toContain('cut off')
    expect(r.diagnostics.attempts[0]).toMatchObject({ document: 'truncated', verdict: 'skipped' })
  })

  it('truncated on attempt 1, complete on attempt 2 → accepted', async () => {
    const f = fakes([REPLIES.truncated, REPLIES.good])
    const r = await runRefineAttempts(input({}), f.deps)
    expect(r.kind).toBe('accepted')
    expect(f.runs[1].retryReasons?.[0]).toMatch(/cut off before <\/html>/)
  })

  it('AC-10: replace with an empty supersedes deletes nothing — it is a miss, the retry is told why, a second downgrade is not applied', async () => {
    const f = fakes([REPLIES.downgraded])
    const r = await runRefineAttempts(input({}), f.deps)
    expect(f.verifies).toHaveLength(0)
    expect(f.runs[1].retryReasons?.[0]).toMatch(/replace: supersedes was empty/)
    expect(r.kind).toBe('not-applied')
    if (r.kind === 'not-applied') {
      expect(r.diagnostics.attempts[1]).toMatchObject({ classes: ['replace'], effectiveClasses: ['add'], downgraded: ['replace'] })
    }
  })

  it('AC-10: remove with an empty supersedes is the same miss', async () => {
    const f = fakes([reply(['remove'], 'shorter')])
    const r = await runRefineAttempts(input({}), f.deps)
    expect(f.verifies).toHaveLength(0)
    expect(r.kind).toBe('not-applied')
  })

  it('a downgraded constrain stays add and IS verified (the Haiku verifier)', async () => {
    const f = fakes([reply(['constrain'], 'smaller')])
    const r = await runRefineAttempts(input({}), f.deps)
    expect(r.kind).toBe('accepted')
    expect(f.verifies[0].classes).toEqual(['add'])
  })

  it('downgraded on attempt 1, correctly named on attempt 2 → verified and accepted', async () => {
    const f = fakes([REPLIES.downgraded, reply(['replace'], 'new bg', ['https://x/old.png'])])
    const r = await runRefineAttempts(input({}), f.deps)
    expect(r.kind).toBe('accepted')
    expect(f.verifies).toHaveLength(1)
    expect(f.verifies[0]).toMatchObject({ attempt: 2, classes: ['replace'], supersedes: ['https://x/old.png'] })
  })
})

describe('inline-asset reconciliation on the envelope html (Ruling C, AC-05/07)', () => {
  it('AC-05: every token returned once → clean, verified, committed with the assets restored', async () => {
    const f = fakes([reply(['add'], withTokens())])
    const r = await runRefineAttempts(input(), f.deps)
    expect(r.kind).toBe('accepted')
    if (r.kind === 'accepted') expect(r.html).not.toContain('__INLINE_ASSET_')
  })

  for (const [name, raw] of [
    ['renamed', REPLIES.tokenRename],
    ['duplicated', REPLIES.tokenDuplicate],
    ['truncated prefix', REPLIES.tokenTruncatedPrefix],
  ] as const) {
    it(`AC-07: a ${name} token is a mismatch → not applied, no verification, no usable document`, async () => {
      const f = fakes([raw])
      const r = await runRefineAttempts(input(), f.deps)
      expect(f.verifies).toHaveLength(0)
      expect(r.kind).toBe('not-applied')
      if (r.kind !== 'not-applied') return
      expect(r.html).toBeNull()
      expect(r.diagnostics.attempts[0].reconcile.kind).toBe('mismatch')
    })
  }

  it('a dropped token NOT named in supersedes is a preservation miss (never silently committed)', async () => {
    const f = fakes([REPLIES.tokenDropped])
    const r = await runRefineAttempts(input(), f.deps)
    expect(f.verifies).toHaveLength(0)
    expect(r.kind).toBe('not-applied')
    if (r.kind !== 'not-applied') return
    expect(r.diagnostics.attempts[0].reconcile).toMatchObject({ kind: 'preservation-miss', missing: ['__INLINE_ASSET_1__'] })
    expect(r.diagnostics.reasons[0]).toMatch(/__INLINE_ASSET_1__/)
    // The document is still usable — kept for the preview / "Use anyway".
    expect(r.html).toContain(ASSETS.__INLINE_ASSET_0__)
  })

  it('a dropped token named by a replace supersedes fragment is intended → verified and committed with it gone', async () => {
    const f = fakes([reply(['replace'], '<img src="__INLINE_ASSET_0__"><div style="background:url(https://x/new.png)"></div>', ['url(__INLINE_ASSET_1__)'])])
    const r = await runRefineAttempts(input(), f.deps)
    expect(r.kind).toBe('accepted')
    if (r.kind !== 'accepted') return
    expect(r.html).toContain(ASSETS.__INLINE_ASSET_0__)
    expect(r.html).not.toContain(ASSETS.__INLINE_ASSET_1__)
  })

  it('a supersedes naming the token does not excuse the drop when the class was downgraded / not destructive', () => {
    expect(reconcileTokens(Object.keys(ASSETS), '<img src="__INLINE_ASSET_0__">', []).kind).toBe('preservation-miss')
  })

  it('caps the mismatch reason length', () => {
    const many = Array.from({ length: 50 }, (_, i) => `__INLINE_ASSET_${i + 100}__`).join(' ')
    const rec = reconcileTokens(['__INLINE_ASSET_0__'], `__INLINE_ASSET_0__ ${many}`, [])
    expect(rec.kind).toBe('mismatch')
    expect(rec.reason!.length).toBeLessThanOrEqual(300)
  })
})

describe('API-mode brand conflict', () => {
  it('is detected BEFORE envelope parsing and ends the refine without verification', async () => {
    const f = fakes(['{"conflict": true, "explanation": "off-brand", "pendingHtml": "<html></html>"}'])
    f.deps.parseConflict = (raw) => (raw.includes('"conflict"') ? { conflict: true } : null)
    const r = await runRefineAttempts(input(), f.deps)
    expect(r).toEqual({ kind: 'conflict', conflict: { conflict: true }, refineCalls: 1, verifierCalls: 0 })
    expect(f.verifies).toHaveLength(0)
  })
})

describe('AC-15 — the hard cap holds for ANY input', () => {
  const replies = Object.values(REPLIES)
  const verdicts: VerifyResult[] = [{ kind: 'pass' }, MISS, UNAVAILABLE]
  it(`never more than ${MAX_REFINE_ATTEMPTS} refine calls and 2 verifier calls over every reply × verdict pair`, async () => {
    let cases = 0
    for (const r1 of replies)
      for (const r2 of replies)
        for (const v1 of verdicts)
          for (const v2 of verdicts) {
            const f = fakes([r1, r2], [v1, v2])
            const r = await runRefineAttempts(input(), f.deps)
            cases++
            expect(f.runs.length).toBeLessThanOrEqual(2)
            expect(f.verifies.length).toBeLessThanOrEqual(2)
            const counts = r.kind === 'not-applied' ? r.diagnostics : r
            expect(counts.refineCalls).toBe(f.runs.length)
            expect(counts.verifierCalls).toBeLessThanOrEqual(2)
            if (r.kind === 'not-applied') {
              expect(f.runs.length).toBe(2)
              rejectionDiagnosticsSchema.parse({ ...r.diagnostics, export: 'none' })
            }
          }
    expect(cases).toBe(replies.length ** 2 * verdicts.length ** 2)
  })
})

describe('AC-16 — settleRefine: not applied commits nothing', () => {
  const sinks = () => ({ commit: vi.fn(async () => {}), reject: vi.fn(async () => {}), conflict: vi.fn(async () => {}) })

  it('not-applied → reject only, and the completion keeps the outcome', async () => {
    const f = fakes([REPLIES.good], [MISS, MISS])
    const s = sinks()
    const completion = await settleRefine(await runRefineAttempts(input({}), f.deps), s)
    expect(completion).toBe('not-applied')
    expect(s.commit).not.toHaveBeenCalled()
    expect(s.reject).toHaveBeenCalledTimes(1)
  })

  it('accepted → commit only, a plain (clearing) completion', async () => {
    const s = sinks()
    const completion = await settleRefine(await runRefineAttempts(input({}), fakes([REPLIES.good]).deps), s)
    expect(completion).toBeUndefined()
    expect(s.commit).toHaveBeenCalledTimes(1)
    expect(s.reject).not.toHaveBeenCalled()
  })
})

// ── Through the REAL verifyRefine ────────────────────────────────────────────

const STYLE = { color: 'rgb(0, 0, 0)', backgroundColor: 'rgba(0, 0, 0, 0)', fontFamily: 'Inter', fontWeight: '400', fontStyle: 'normal', letterSpacing: 'normal' }
const el = (p: Partial<DomElementFact>) => ({ tag: 'div', id: null, classes: [], text: '', imageSources: [], fontSizePx: 16, box: { width: 100, height: 20 }, ...p, style: STYLE })
const OLD_BG = 'https://minio.example.com/images/old-bg.png'
const NEW_BG = 'https://minio.example.com/images/new-bg.png'
const LONG = 'Join us for an unforgettable evening of ideas and workshops led by experts'
function factsOf(elements: ReturnType<typeof el>[]) {
  return { text: elements.map((e) => e.text).filter(Boolean).join(' '), imageSources: elements.flatMap((e) => e.imageSources), elementCount: elements.length, elements }
}
const BEFORE_FACTS = factsOf([el({ classes: ['bg'], imageSources: [OLD_BG] }), el({ tag: 'p', text: LONG })])
// The extractor is keyed by a marker in the document body.
const FACTS: Record<string, ReturnType<typeof factsOf>> = {
  BEFORE: BEFORE_FACTS,
  SWAPPED: factsOf([el({ classes: ['bg'], imageSources: [NEW_BG] }), el({ tag: 'p', text: LONG })]),
  DUPLICATED: factsOf([el({ classes: ['bg'], imageSources: [OLD_BG] }), el({ classes: ['bg2'], imageSources: [NEW_BG] }), el({ tag: 'p', text: LONG })]),
  SHORTER: factsOf([el({ classes: ['bg'], imageSources: [OLD_BG] }), el({ tag: 'p', text: 'Join us for workshops' })]),
  UNCHANGED: BEFORE_FACTS,
}

function realVerify(counter: { calls: number }): Deps['verify'] {
  return async (req) => {
    let modelCalls = 0
    const result = await verifyRefine({
      instruction: 'the instruction',
      classes: req.classes,
      supersedes: req.supersedes,
      constrains: req.constrains,
      beforeHtml: doc('BEFORE'),
      afterHtml: req.afterHtml,
      width: 1080,
      height: 1080,
      teamId: 'team-1',
      attempt: req.attempt,
      beforeFacts: BEFORE_FACTS,
      onVerifierCall: () => {
        modelCalls++
        counter.calls++
      },
    })
    return { result, modelCalls }
  }
}

describe('with the real verifyRefine (API mode; SDK + DOM extraction mocked)', () => {
  beforeEach(() => {
    h.extract.mockReset().mockImplementation(async (html: string) => {
      const key = Object.keys(FACTS).find((k) => html.includes(`<body>${k}`))
      if (!key) throw new Error(`no facts for ${html.slice(0, 80)}`)
      return FACTS[key]
    })
    h.anthropicCreate.mockReset().mockResolvedValue({ content: [{ type: 'text', text: '{"applied": false, "reason": "no figure"}' }] })
  })

  const run = async (replies: string[]) => {
    const counter = { calls: 0 }
    const f = fakes(replies)
    f.deps.verify = realVerify(counter)
    const r = await runRefineAttempts({ model: 'claude-opus-4-1', inlineAssets: {} }, f.deps)
    return { r, f, counter }
  }

  it('AC-09 + AC-12: replace that drops the old background passes with ZERO verifier model calls', async () => {
    const { r, counter } = await run([reply(['replace'], 'SWAPPED', [OLD_BG])])
    expect(r.kind).toBe('accepted')
    expect(counter.calls).toBe(0)
    expect(h.anthropicCreate).not.toHaveBeenCalled()
  })

  it('AC-09: the duplicate-image failure (old background kept alongside the new) misses twice → not applied, zero model calls', async () => {
    const { r, f } = await run([reply(['replace'], 'DUPLICATED', [OLD_BG])])
    expect(f.runs).toHaveLength(2)
    expect(r.kind).toBe('not-applied')
    if (r.kind !== 'not-applied') return
    expect(r.diagnostics.verifierCalls).toBe(0)
    expect(r.diagnostics.reasons[0]).toMatch(/still present/)
    expect(h.anthropicCreate).not.toHaveBeenCalled()
  })

  it('AC-08: remove whose text is not shorter retries once, then not applied; a real reduction passes', async () => {
    const noop = await run([reply(['remove'], 'UNCHANGED', ['unforgettable evening'])])
    expect(noop.f.runs).toHaveLength(2)
    expect(noop.r.kind).toBe('not-applied')
    const fixed = await run([reply(['remove'], 'UNCHANGED', ['unforgettable evening']), reply(['remove'], 'SHORTER', ['unforgettable evening'])])
    expect(fixed.r.kind).toBe('accepted')
    expect(h.anthropicCreate).not.toHaveBeenCalled()
  })

  it('AC-13 + AC-20b: add spends exactly one Haiku verifier call per attempt, reports not applied when absent after retry; the retry runs on the route model', async () => {
    const { r, f, counter } = await run([reply(['add'], 'UNCHANGED')])
    expect(r.kind).toBe('not-applied')
    expect(counter.calls).toBe(2)
    expect(h.anthropicCreate).toHaveBeenCalledTimes(2)
    for (const [args] of h.anthropicCreate.mock.calls) expect(args.model).toBe(VERIFIER_MODEL.api)
    expect(f.runs.map((x) => x.model)).toEqual(['claude-opus-4-1', 'claude-opus-4-1'])
    if (r.kind === 'not-applied') expect(r.diagnostics).toMatchObject({ refineCalls: 2, verifierCalls: 2 })
  })

  it('AC-11: a multi-clause reply verifies every class — replace structurally AND add with one model call', async () => {
    h.anthropicCreate.mockResolvedValue({ content: [{ type: 'text', text: '{"applied": true, "reason": "figure present"}' }] })
    const { r, counter } = await run([reply(['replace', 'add'], 'SWAPPED', [OLD_BG])])
    expect(r.kind).toBe('accepted')
    expect(counter.calls).toBe(1)
    // And a structural miss in the replace half fails the whole instruction without a model call.
    h.anthropicCreate.mockClear()
    const dup = await run([reply(['replace', 'add'], 'DUPLICATED', [OLD_BG])])
    expect(dup.r.kind).toBe('not-applied')
    expect(h.anthropicCreate).not.toHaveBeenCalled()
  })

  it('AC-14: an unparseable verifier reply is a miss, not a pass', async () => {
    h.anthropicCreate.mockResolvedValue({ content: [{ type: 'text', text: 'looks great!' }] })
    const { r } = await run([reply(['add'], 'UNCHANGED')])
    expect(r.kind).toBe('not-applied')
    if (r.kind === 'not-applied') expect(r.diagnostics.attempts.map((a) => a.verdict)).toEqual(['unavailable', 'unavailable'])
  })

  it('the before-facts are never re-extracted (retry cost)', async () => {
    await run([reply(['add'], 'UNCHANGED')])
    expect(h.extract.mock.calls.every(([html]) => !String(html).includes('<body>BEFORE'))).toBe(true)
  })
})

describe('the retry is always told why', () => {
  it('a miss with no stated reasons still produces a retry note', async () => {
    const f = fakes([REPLIES.good], [{ kind: 'miss', reasons: [] }, { kind: 'pass' }])
    await runRefineAttempts(input({}), f.deps)
    expect(f.runs[1].retryReasons).toEqual(['the check found the instruction not applied'])
  })
})

// Fix round 1, Minor 1: the verifier-call count is recorded as spent, never
// clamped — an over-spending verify is caught by the schema, not hidden.
describe('verifierCalls is the true count', () => {
  it('a verify that reports 2 model calls is recorded as 2, and the rejected-row schema refuses it', async () => {
    const f = fakes([REPLIES.good], [MISS, MISS])
    const inner = f.deps.verify
    f.deps.verify = async (req) => ({ ...(await inner(req)), modelCalls: 2 })
    const r = await runRefineAttempts(input({}), f.deps)
    expect(r.kind).toBe('not-applied')
    if (r.kind !== 'not-applied') return
    expect(r.diagnostics.verifierCalls).toBe(4)
    expect(r.diagnostics.attempts.map((a) => a.verifierCalls)).toEqual([2, 2])
    expect(() => rejectionDiagnosticsSchema.parse({ ...r.diagnostics, export: 'none' })).toThrow()
  })
})
