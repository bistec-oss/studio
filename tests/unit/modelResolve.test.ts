import { describe, it, expect } from 'vitest'
import {
  CATALOGUE,
  MODEL_KEYS,
  USER_SURFACES,
  INTERNAL_SURFACES,
  type ModelKey,
  type UserSurface,
} from '@/lib/models/catalogue'
import {
  decideModel,
  effectiveSet,
  internalModel,
  type CredentialTier,
  type DecideInput,
  type ModelPolicy,
  type PipelineMode,
} from '@/lib/models/resolve'
import { DEFAULT_POLICY, validatePolicy, type PolicyInput } from '@/lib/models/policyRules'

// 008 FR-03 / AC-02, AC-03. AC-03 is exhaustive over its stated product, with
// an oracle built from hand-written tables (not from the catalogue helpers), so
// a resolver bug can't hide behind the same bug in a shared helper.

const ALL: ModelKey[] = ['HAIKU', 'SONNET', 'OPUS']
const policy = (over: Partial<ModelPolicy> = {}): ModelPolicy => ({
  allowed: ALL,
  defaults: {},
  gateOn: false,
  ...over,
})
const input = (over: Partial<DecideInput> = {}): DecideInput => ({
  policy: policy(),
  credential: 'personal',
  mode: 'cli',
  ...over,
})
const ok = (surface: UserSurface, i: DecideInput) => {
  const r = decideModel(surface, i)
  if (!r.ok) throw new Error(`expected ok, got ${r.code}: ${r.message}`)
  return r.resolved
}

describe('decideModel — AC-02(a): the tiers, first match wins', () => {
  it('tier 1: an explicit request beats a stamp, a team default and the system default', () => {
    const r = ok(
      'DESIGN_FREEFORM',
      input({
        requested: 'HAIKU',
        stamp: 'claude-opus-5-5',
        policy: policy({ defaults: { DESIGN_FREEFORM: 'OPUS' } }),
      }),
    )
    expect([r.key, r.source, r.substitutedFrom]).toEqual(['HAIKU', 'request', null])
  })

  it('tier 2: a current stamp beats the team default', () => {
    const r = ok(
      'DESIGN_FREEFORM',
      input({
        stamp: 'claude-opus-5-5',
        policy: policy({ defaults: { DESIGN_FREEFORM: 'HAIKU' } }),
      }),
    )
    expect([r.key, r.source, r.substitutedFrom]).toEqual(['OPUS', 'stamp', null])
  })

  it('tier 3: the team default beats the system default', () => {
    const r = ok('CAPTION', input({ policy: policy({ defaults: { CAPTION: 'SONNET' } }) }))
    expect([r.key, r.source, r.substitutedFrom]).toEqual(['SONNET', 'team', null])
  })

  it('tier 4: the system default', () => {
    const r = ok('DESIGN_FREEFORM', input())
    expect([r.key, r.source, r.substitutedFrom]).toEqual(['SONNET', 'system', null])
  })

  it('tier 5: the fallback is the cheapest entry of the effective set, recording the refused default', () => {
    const r = ok('DESIGN_FREEFORM', input({ policy: policy({ allowed: ['HAIKU', 'OPUS'] }) }))
    expect([r.key, r.source, r.substitutedFrom]).toEqual(['HAIKU', 'fallback', 'SONNET'])
  })

  it('a refused stamp falls through to the team default, and substitutedFrom keeps the FIRST refused value', () => {
    const r = ok(
      'DESIGN_FREEFORM',
      input({
        stamp: 'claude-opus-5-5',
        policy: policy({ allowed: ['HAIKU', 'SONNET'], defaults: { DESIGN_FREEFORM: 'SONNET' } }),
      }),
    )
    expect([r.key, r.source, r.substitutedFrom]).toEqual(['SONNET', 'team', 'claude-opus-5-5'])
  })

  it('a retired-ID stamp maps to its family and is itself a substitution', () => {
    const r = ok('DESIGN_FREEFORM', input({ stamp: 'claude-sonnet-4-6' }))
    expect([r.key, r.source, r.substitutedFrom]).toEqual(['SONNET', 'stamp', 'claude-sonnet-4-6'])
  })

  it('an unmapped stamp (an OpenAI caption) falls through with substitutedFrom', () => {
    const r = ok('CAPTION', input({ stamp: 'gpt-4o' }))
    expect([r.key, r.source, r.substitutedFrom]).toEqual(['HAIKU', 'system', 'gpt-4o'])
  })

  it('arg is the apiId in API mode and the cliArg in CLI mode; timeoutMs is the surface’s', () => {
    const api = ok('CAPTION', input({ mode: 'api', credential: 'n/a', requested: 'OPUS' }))
    expect([api.arg, api.timeoutMs, api.entry.key, api.surface]).toEqual([
      'claude-opus-5-5',
      240_000,
      'OPUS',
      'CAPTION',
    ])
    const cli = ok('REFINE', input({ requested: 'SONNET' }))
    expect([cli.arg, cli.timeoutMs]).toEqual(['claude-sonnet-5-5', 360_000])
  })
})

describe('decideModel — AC-02(b): an explicit request outside the effective set is refused', () => {
  it('NOT_ALLOWED', () => {
    expect(
      decideModel(
        'DESIGN_FREEFORM',
        input({ requested: 'OPUS', policy: policy({ allowed: ['HAIKU', 'SONNET'] }) }),
      ),
    ).toEqual({ ok: false, code: 'NOT_ALLOWED', message: "Opus 5.5 isn't allowed on this team" })
  })

  it('NOT_ELIGIBLE: Opus on template fill', () => {
    expect(decideModel('DESIGN_TEMPLATE', input({ requested: 'OPUS' }))).toEqual({
      ok: false,
      code: 'NOT_ELIGIBLE',
      message: "Opus 5.5 isn't available for template fill",
    })
  })

  it('NEEDS_PERSONAL_TOKEN: gated, team credential, CLI mode', () => {
    expect(
      decideModel(
        'REFINE',
        input({ requested: 'OPUS', credential: 'team', policy: policy({ gateOn: true }) }),
      ),
    ).toEqual({
      ok: false,
      code: 'NEEDS_PERSONAL_TOKEN',
      message: 'Your team requires a personal Claude token for Opus 5.5 — connect one in Settings',
    })
  })

  it('the same gated request is ok in API mode, and with a personal token', () => {
    const gate = policy({ gateOn: true })
    expect(
      ok('REFINE', input({ requested: 'OPUS', mode: 'api', credential: 'n/a', policy: gate })).key,
    ).toBe('OPUS')
    expect(
      ok('REFINE', input({ requested: 'OPUS', credential: 'personal', policy: gate })).key,
    ).toBe('OPUS')
  })

  it('UNKNOWN_MODEL for a value outside the catalogue (zod rejects it first at a route)', () => {
    const r = decideModel('CAPTION', input({ requested: 'gpt-4o' as ModelKey }))
    expect(r).toMatchObject({ ok: false, code: 'UNKNOWN_MODEL' })
  })
})

describe('decideModel — AC-02(c), (d), (e)', () => {
  it('(c) REFINE’s system default is Haiku on Path A and Sonnet on Path B', () => {
    expect(ok('REFINE', input({ designPath: 'A' })).key).toBe('HAIKU')
    expect(ok('REFINE', input({ designPath: 'B' })).key).toBe('SONNET')
  })

  it('(c) a team REFINE default applies to both paths (A8)', () => {
    const p = policy({ defaults: { REFINE: 'OPUS' } })
    expect(ok('REFINE', input({ designPath: 'A', policy: p })).key).toBe('OPUS')
    expect(ok('REFINE', input({ designPath: 'B', policy: p })).key).toBe('OPUS')
  })

  it('(d) envDefault OPUS in CLI mode: DESIGN_FREEFORM is Opus (system); DESIGN_TEMPLATE stays Haiku', () => {
    const free = ok('DESIGN_FREEFORM', input({ envDefault: 'OPUS' }))
    expect([free.key, free.source, free.substitutedFrom]).toEqual(['OPUS', 'system', null])
    const tmpl = ok('DESIGN_TEMPLATE', input({ envDefault: 'OPUS' }))
    expect([tmpl.key, tmpl.source, tmpl.substitutedFrom]).toEqual(['HAIKU', 'system', null])
  })

  it('(d) envDefault is ignored in API mode', () => {
    const r = ok('DESIGN_FREEFORM', input({ mode: 'api', credential: 'n/a', envDefault: 'OPUS' }))
    expect([r.key, r.source]).toEqual(['SONNET', 'system'])
  })

  it('(d) an env model the team refuses is a substitution; the table default still runs', () => {
    const noOpus = ok(
      'DESIGN_FREEFORM',
      input({ envDefault: 'OPUS', policy: policy({ allowed: ['HAIKU', 'SONNET'] }) }),
    )
    expect([noOpus.key, noOpus.source, noOpus.substitutedFrom]).toEqual([
      'SONNET',
      'system',
      'OPUS',
    ])
    const gated = ok(
      'DESIGN_FREEFORM',
      input({ envDefault: 'OPUS', credential: 'team', policy: policy({ gateOn: true }) }),
    )
    expect([gated.key, gated.source, gated.substitutedFrom]).toEqual(['SONNET', 'system', 'OPUS'])
  })

  it('(d) env refused AND table default refused → fallback, substitutedFrom is the env key', () => {
    const r = ok(
      'DESIGN_FREEFORM',
      input({ envDefault: 'OPUS', policy: policy({ allowed: ['HAIKU'] }) }),
    )
    expect([r.key, r.source, r.substitutedFrom]).toEqual(['HAIKU', 'fallback', 'OPUS'])
  })

  it('(d) an env model equal to the table default is tried once', () => {
    const r = ok(
      'DESIGN_FREEFORM',
      input({ envDefault: 'SONNET', policy: policy({ allowed: ['HAIKU'] }) }),
    )
    expect([r.key, r.source, r.substitutedFrom]).toEqual(['HAIKU', 'fallback', 'SONNET'])
  })

  it('(d) envDefault sits below the team default', () => {
    const r = ok(
      'CAPTION',
      input({ envDefault: 'OPUS', policy: policy({ defaults: { CAPTION: 'SONNET' } }) }),
    )
    expect([r.key, r.source]).toEqual(['SONNET', 'team'])
  })

  it('(e) an empty effective set gives NO_ALLOWED_MODEL', () => {
    const r = decideModel('DESIGN_TEMPLATE', input({ policy: policy({ allowed: ['OPUS'] }) }))
    expect(r).toMatchObject({ ok: false, code: 'NO_ALLOWED_MODEL' })
    const gated = decideModel(
      'CAPTION',
      input({ credential: 'team', policy: policy({ allowed: ['OPUS'], gateOn: true }) }),
    )
    expect(gated).toMatchObject({ ok: false, code: 'NO_ALLOWED_MODEL' })
  })
})

// 008 T6: a STORED request (Brief.captionModel / designModel, FR-10) is tried
// right after tier 1, but a miss falls through and is recorded — never refused.
describe('decideModel — storedRequest (FR-10: a stored value is never a 400)', () => {
  it('an allowed stored request runs as the request, with no substitution', () => {
    const r = ok(
      'DESIGN_FREEFORM',
      input({ storedRequest: 'OPUS', policy: policy({ defaults: { DESIGN_FREEFORM: 'HAIKU' } }) }),
    )
    expect([r.key, r.source, r.substitutedFrom]).toEqual(['OPUS', 'request', null])
  })

  it('a stored request since disallowed falls through to the team default, recorded', () => {
    const r = ok(
      'DESIGN_FREEFORM',
      input({
        storedRequest: 'OPUS',
        policy: policy({ allowed: ['HAIKU', 'SONNET'], defaults: { DESIGN_FREEFORM: 'HAIKU' } }),
      }),
    )
    expect([r.key, r.source, r.substitutedFrom]).toEqual(['HAIKU', 'team', 'OPUS'])
  })

  it('a stored request that is gated or not eligible falls through to the system default, recorded', () => {
    const gated = ok(
      'CAPTION',
      input({ storedRequest: 'OPUS', credential: 'team', policy: policy({ gateOn: true }) }),
    )
    expect([gated.key, gated.source, gated.substitutedFrom]).toEqual(['HAIKU', 'system', 'OPUS'])
    // Opus is not eligible for template fill (FR-01): falls through, never NOT_ELIGIBLE.
    const tmpl = ok('DESIGN_TEMPLATE', input({ storedRequest: 'OPUS' }))
    expect([tmpl.key, tmpl.source, tmpl.substitutedFrom]).toEqual(['HAIKU', 'system', 'OPUS'])
  })

  it('a stored request that falls all the way through keeps it as substitutedFrom on the fallback', () => {
    const r = ok(
      'DESIGN_FREEFORM',
      input({ storedRequest: 'OPUS', policy: policy({ allowed: ['HAIKU'] }) }),
    )
    expect([r.key, r.source, r.substitutedFrom]).toEqual(['HAIKU', 'fallback', 'OPUS'])
  })

  it('an explicit request still wins over a stored one, and is still refused on a miss', () => {
    const r = ok('CAPTION', input({ requested: 'SONNET', storedRequest: 'OPUS' }))
    expect([r.key, r.source]).toEqual(['SONNET', 'request'])
    const refused = decideModel(
      'CAPTION',
      input({ requested: 'OPUS', storedRequest: 'HAIKU', policy: policy({ allowed: ['HAIKU'] }) }),
    )
    expect(refused).toMatchObject({ ok: false, code: 'NOT_ALLOWED' })
  })

  it('a stored request never turns an empty effective set into anything but NO_ALLOWED_MODEL', () => {
    const r = decideModel('DESIGN_TEMPLATE', input({ storedRequest: 'HAIKU', policy: policy({ allowed: ['OPUS'] }) }))
    expect(r).toMatchObject({ ok: false, code: 'NO_ALLOWED_MODEL' })
  })

  it('every stored key on every user surface resolves (never a refusal) when the set is non-empty', () => {
    for (const surface of ['CAPTION', 'DESIGN_TEMPLATE', 'DESIGN_FREEFORM', 'REFINE', 'ASSISTANT_BRIEFING', 'ASSISTANT_BRANDKIT'] as const) {
      for (const stored of ALL) {
        for (const allowed of [['HAIKU'], ['SONNET'], ['HAIKU', 'SONNET'], ALL] as ModelKey[][]) {
          const i = input({ storedRequest: stored, policy: policy({ allowed }) })
          const r = decideModel(surface, i)
          expect(r.ok).toBe(true)
          if (r.ok) expect(effectiveSet(surface, i).map((e) => e.key)).toContain(r.resolved.key)
        }
      }
    }
  })
})

describe('effectiveSet', () => {
  it('is eligible ∩ allowed, minus gated entries only for a team credential in CLI mode', () => {
    const gate = policy({ gateOn: true })
    const keys = (c: CredentialTier, m: PipelineMode) =>
      effectiveSet('CAPTION', { policy: gate, credential: c, mode: m }).map((e) => e.key)
    expect(keys('team', 'cli')).toEqual(['HAIKU', 'SONNET'])
    expect(keys('personal', 'cli')).toEqual(['HAIKU', 'SONNET', 'OPUS'])
    expect(keys('n/a', 'api')).toEqual(['HAIKU', 'SONNET', 'OPUS'])
    expect(
      effectiveSet('DESIGN_TEMPLATE', {
        policy: policy(),
        credential: 'personal',
        mode: 'cli',
      }).map((e) => e.key),
    ).toEqual(['HAIKU', 'SONNET'])
  })
})

describe('internalModel (A14)', () => {
  it('is Haiku for every internal surface, source system, in both modes', () => {
    for (const surface of INTERNAL_SURFACES) {
      const api = internalModel(surface, 'api')
      expect([api.key, api.source, api.substitutedFrom, api.arg, api.surface]).toEqual([
        'HAIKU',
        'system',
        null,
        'claude-haiku-4-5',
        surface,
      ])
      expect(internalModel(surface, 'cli').arg).toBe('claude-haiku-4-5')
    }
    expect(internalModel('INTERNAL_BACKGROUND', 'cli').timeoutMs).toBe(90_000)
    expect(internalModel('INTERNAL_VERIFIER', 'cli').timeoutMs).toBe(60_000)
    expect(internalModel('INTERNAL_TOKEN_PING', 'api').timeoutMs).toBe(60_000)
  })
})

// ── AC-03: a disallowed stored value is never returned, at any tier ──────────

// The oracle's own tables (spec FR-01, FR-04), deliberately not read from the catalogue.
const ELIGIBLE: Record<UserSurface, ModelKey[]> = {
  CAPTION: ALL,
  DESIGN_TEMPLATE: ['HAIKU', 'SONNET'],
  DESIGN_FREEFORM: ALL,
  REFINE: ALL,
  ASSISTANT_BRIEFING: ALL,
  ASSISTANT_BRANDKIT: ALL,
}
const TABLE: Record<UserSurface, { A: ModelKey; B: ModelKey }> = {
  CAPTION: { A: 'HAIKU', B: 'HAIKU' },
  DESIGN_TEMPLATE: { A: 'HAIKU', B: 'HAIKU' },
  DESIGN_FREEFORM: { A: 'SONNET', B: 'SONNET' },
  REFINE: { A: 'HAIKU', B: 'SONNET' },
  ASSISTANT_BRIEFING: { A: 'SONNET', B: 'SONNET' },
  ASSISTANT_BRANDKIT: { A: 'SONNET', B: 'SONNET' },
}
const STAMP_FAMILY: Record<string, { key: ModelKey; previous: boolean } | null> = {
  'claude-haiku-4-5': { key: 'HAIKU', previous: false },
  'claude-haiku-4-5-20251001': { key: 'HAIKU', previous: true },
  'claude-sonnet-5-5': { key: 'SONNET', previous: false },
  'claude-sonnet-4-6': { key: 'SONNET', previous: true },
  'claude-opus-5-5': { key: 'OPUS', previous: false },
  'gpt-4o': null,
}
const GATED: ModelKey[] = ['OPUS']
const API_ID: Record<ModelKey, string> = {
  HAIKU: 'claude-haiku-4-5',
  SONNET: 'claude-sonnet-5-5',
  OPUS: 'claude-opus-5-5',
}

// Every apiId, cliArg and previousApiId, plus the two named extras, plus null.
const STAMPS: (string | null)[] = [
  ...new Set([
    ...CATALOGUE.flatMap((e) => [e.apiId, e.cliArg, ...e.previousApiIds]),
    'claude-sonnet-4-6',
    'gpt-4o',
  ]),
  null,
]
const SUBSETS: ModelKey[][] = Array.from({ length: 7 }, (_, i) =>
  ALL.filter((_, bit) => (i + 1) & (1 << bit)),
)
const TEAM_DEFAULTS: (ModelKey | null)[] = [...ALL, null]
const ENV_DEFAULTS: (ModelKey | null)[] = [...ALL, null]
const CREDENTIALS: CredentialTier[] = ['personal', 'team', 'n/a']
const MODES: PipelineMode[] = ['api', 'cli']
const PATHS = ['A', 'B', undefined] as const

interface Expected {
  key: ModelKey
  source: string
  substitutedFrom: string | null
}

function oracle(
  surface: UserSurface,
  c: {
    stamp: string | null
    team: ModelKey | null
    allowed: ModelKey[]
    gateOn: boolean
    credential: CredentialTier
    mode: PipelineMode
    env: ModelKey | null
    path: 'A' | 'B' | undefined
  },
): { effective: ModelKey[]; expected: Expected | null } {
  const gate = c.gateOn && c.credential === 'team' && c.mode === 'cli'
  const effective = ALL.filter(
    (k) => ELIGIBLE[surface].includes(k) && c.allowed.includes(k) && !(gate && GATED.includes(k)),
  )
  if (effective.length === 0) return { effective, expected: null }

  let first: string | null = null
  const skip = (v: string) => (first ??= v)

  if (c.stamp !== null) {
    const fam = STAMP_FAMILY[c.stamp]
    if (fam === undefined) throw new Error(`oracle has no row for stamp ${c.stamp}`)
    if (fam && effective.includes(fam.key)) {
      if (fam.previous) skip(c.stamp)
      return { effective, expected: { key: fam.key, source: 'stamp', substitutedFrom: first } }
    }
    skip(c.stamp)
  }
  if (c.team !== null) {
    if (effective.includes(c.team)) {
      return { effective, expected: { key: c.team, source: 'team', substitutedFrom: first } }
    }
    skip(c.team)
  }
  const env = c.mode === 'cli' && c.env && ELIGIBLE[surface].includes(c.env) ? c.env : null
  // Two steps (T1 fix round 1): an applicable env model, then the table default.
  for (const system of [env, TABLE[surface][c.path ?? 'B']]) {
    if (system === null) continue
    if (effective.includes(system)) {
      return { effective, expected: { key: system, source: 'system', substitutedFrom: first } }
    }
    skip(system)
  }
  return { effective, expected: { key: effective[0], source: 'fallback', substitutedFrom: first } }
}

describe('decideModel — AC-03: exhaustive over the stated product', () => {
  it('never returns a model outside the effective set, and records every skip', () => {
    const failures: string[] = []
    let runs = 0
    const fail = (msg: string) => {
      if (failures.length < 20) failures.push(msg)
    }

    for (const surface of USER_SURFACES)
      for (const stamp of STAMPS)
        for (const team of TEAM_DEFAULTS)
          for (const allowed of SUBSETS)
            for (const gateOn of [false, true])
              for (const credential of CREDENTIALS)
                for (const mode of MODES)
                  for (const env of ENV_DEFAULTS)
                    for (const path of PATHS) {
                      runs++
                      const c = { stamp, team, allowed, gateOn, credential, mode, env, path }
                      const label = JSON.stringify({ surface, ...c })
                      const r = decideModel(surface, {
                        stamp,
                        policy: { allowed, defaults: team ? { [surface]: team } : {}, gateOn },
                        credential,
                        mode,
                        envDefault: env,
                        designPath: path,
                      })
                      const { effective, expected } = oracle(surface, c)

                      if (!expected) {
                        if (r.ok || r.code !== 'NO_ALLOWED_MODEL')
                          fail(`expected NO_ALLOWED_MODEL: ${label}`)
                        continue
                      }
                      if (!r.ok) {
                        fail(`expected ok, got ${r.code}: ${label}`)
                        continue
                      }
                      const m = r.resolved
                      if (!effective.includes(m.key))
                        fail(`returned ${m.key} outside the set: ${label}`)
                      if (
                        m.key !== expected.key ||
                        m.source !== expected.source ||
                        m.substitutedFrom !== expected.substitutedFrom
                      ) {
                        fail(
                          `got ${m.key}/${m.source}/${m.substitutedFrom}, want ${JSON.stringify(expected)}: ${label}`,
                        )
                      }
                      // A retired-ID stamp maps to its family and is a substitution.
                      const fam = stamp ? STAMP_FAMILY[stamp] : null
                      if (
                        fam?.previous &&
                        m.source === 'stamp' &&
                        (m.key !== fam.key || m.substitutedFrom !== stamp)
                      ) {
                        fail(`previous stamp not substituted: ${label}`)
                      }
                      const id = mode === 'api' ? m.entry.apiId : m.entry.cliArg
                      if (
                        m.arg !== id ||
                        m.entry.apiId !== API_ID[m.key] ||
                        m.entry.key !== m.key ||
                        m.surface !== surface
                      ) {
                        fail(`bad arg/entry ${m.arg}: ${label}`)
                      }
                      if (m.timeoutMs !== m.entry.surfaces[surface]?.timeoutMs)
                        fail(`bad timeout: ${label}`)
                    }

    expect(failures).toEqual([])
    expect(runs).toBe(6 * STAMPS.length * 4 * 7 * 2 * 3 * 2 * 4 * 3)
  }, 2000)

  it('the stamp list covers every catalogue ID and the named extras', () => {
    expect(STAMPS).toEqual([
      'claude-haiku-4-5',
      'claude-haiku-4-5-20251001',
      'claude-sonnet-5-5',
      'claude-sonnet-4-6',
      'claude-opus-5-5',
      'gpt-4o',
      null,
    ])
    expect(MODEL_KEYS).toEqual(ALL)
  })

  it('an explicit request is ok exactly when it is in the effective set, else refused with the right code', () => {
    const failures: string[] = []
    for (const surface of USER_SURFACES)
      for (const requested of ALL)
        for (const allowed of SUBSETS)
          for (const gateOn of [false, true])
            for (const credential of CREDENTIALS)
              for (const mode of MODES) {
                const r = decideModel(surface, {
                  requested,
                  policy: { allowed, defaults: {}, gateOn },
                  credential,
                  mode,
                })
                const { effective } = oracle(surface, {
                  stamp: null,
                  team: null,
                  allowed,
                  gateOn,
                  credential,
                  mode,
                  env: null,
                  path: undefined,
                })
                const want = effective.includes(requested)
                  ? 'ok'
                  : !ELIGIBLE[surface].includes(requested)
                    ? 'NOT_ELIGIBLE'
                    : !allowed.includes(requested)
                      ? 'NOT_ALLOWED'
                      : 'NEEDS_PERSONAL_TOKEN'
                const got = r.ok
                  ? r.resolved.source === 'request' && r.resolved.key === requested
                    ? 'ok'
                    : 'bad-ok'
                  : r.code
                if (got !== want && failures.length < 20) {
                  failures.push(
                    `${surface} ${requested} ${JSON.stringify({ allowed, gateOn, credential, mode })}: got ${got}, want ${want}`,
                  )
                }
              }
    expect(failures).toEqual([])
  })
})

// ── FR-05: the policy rules (AC-05's pure half; T4's modelPolicy.test covers the I/O) ──

describe('DEFAULT_POLICY — a team with no saved policy (A2)', () => {
  it('reads as all three allowed, no defaults, switch off', () => {
    expect(DEFAULT_POLICY).toEqual({
      allowed: ['HAIKU', 'SONNET', 'OPUS'],
      defaults: {},
      gateOn: false,
    })
  })

  it('is the catalogue’s defaultAllowed entries', () => {
    expect(DEFAULT_POLICY.allowed).toEqual(
      CATALOGUE.filter((e) => e.defaultAllowed).map((e) => e.key),
    )
  })
})

describe('validatePolicy — FR-05 rules 1–4', () => {
  const body = (over: Partial<PolicyInput> = {}): PolicyInput => ({
    allowed: ['HAIKU', 'SONNET', 'OPUS'],
    defaults: {},
    requirePersonalTokenForGated: false,
    ...over,
  })

  it('a valid policy normalizes: catalogue order, duplicates and null defaults dropped', () => {
    expect(
      validatePolicy(
        body({
          allowed: ['OPUS', 'HAIKU', 'OPUS'],
          defaults: { DESIGN_FREEFORM: 'OPUS', CAPTION: null, REFINE: undefined },
          requirePersonalTokenForGated: true,
        }),
      ),
    ).toEqual({
      ok: true,
      policy: { allowed: ['HAIKU', 'OPUS'], defaults: { DESIGN_FREEFORM: 'OPUS' }, gateOn: true },
    })
  })

  it('rule 1: a key or a surface outside the vocabulary', () => {
    expect(validatePolicy(body({ allowed: ['HAIKU', 'gpt-4o'] }))).toEqual({
      ok: false,
      message: 'Unknown model "gpt-4o"',
    })
    expect(validatePolicy(body({ defaults: { CAPTION: 'opus' } }))).toEqual({
      ok: false,
      message: 'Unknown model "opus"',
    })
    expect(validatePolicy(body({ defaults: { INTERNAL_VERIFIER: 'HAIKU' } }))).toEqual({
      ok: false,
      message: 'Unknown surface "INTERNAL_VERIFIER"',
    })
  })

  it('rule 2: allowed empty', () => {
    expect(validatePolicy(body({ allowed: [] }))).toEqual({
      ok: false,
      message: 'Allow at least one model',
    })
  })

  it('rule 3: a user surface left with nothing — Opus alone empties template fill', () => {
    expect(validatePolicy(body({ allowed: ['OPUS'] }))).toEqual({
      ok: false,
      message: 'Template fill needs Haiku or Sonnet allowed',
    })
  })

  it('rule 3 names the surface’s plain name (planted: a catalogue where only Haiku serves REFINE)', () => {
    const c = CATALOGUE.map((e) =>
      e.key === 'HAIKU' ? e : { ...e, surfaces: { ...e.surfaces, REFINE: undefined } },
    )
    expect(validatePolicy(body({ allowed: ['SONNET', 'OPUS'] }), c)).toEqual({
      ok: false,
      message: 'Refine needs Haiku allowed',
    })
  })

  it('rule 4: a default outside allowed', () => {
    expect(
      validatePolicy(body({ allowed: ['HAIKU', 'SONNET'], defaults: { DESIGN_FREEFORM: 'OPUS' } })),
    ).toEqual({
      ok: false,
      message: "The Freeform design default, Opus 5.5, isn't in the allowed models",
    })
  })

  it('rule 4: a default not eligible for its surface', () => {
    expect(validatePolicy(body({ defaults: { DESIGN_TEMPLATE: 'OPUS' } }))).toEqual({
      ok: false,
      message: "Opus 5.5 isn't available for template fill",
    })
  })

  it('every saved policy leaves every user surface a model, even with the switch on (FR-05)', () => {
    for (const allowed of SUBSETS) {
      const v = validatePolicy(body({ allowed, requirePersonalTokenForGated: true }))
      if (!v.ok) continue
      for (const surface of USER_SURFACES) {
        expect(
          effectiveSet(surface, { policy: v.policy, credential: 'team', mode: 'cli' }),
        ).not.toEqual([])
      }
    }
  })
})
