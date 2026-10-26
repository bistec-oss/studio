import { describe, it, expect } from 'vitest'
import {
  CATALOGUE,
  MODEL_KEYS,
  USER_SURFACES,
  type ModelKey,
  type UserSurface,
} from '@/lib/models/catalogue'
import {
  decideModel,
  effectiveSet,
  type CredentialTier,
  type PipelineMode,
} from '@/lib/models/resolve'
import {
  gatedHint,
  isStalePick,
  hintText,
  pickerOptions,
  pickerState,
  preselection,
  reportedValue,
  teamTokenNotice,
  type PickerModels,
} from '@/lib/models/pickerState'

// 008 AC-26 (FR-18, FR-22): the model picker's pure half
// (src/lib/models/pickerState.ts). The component's rendering is in
// uiPrimitives.test.ts.

const ALL: ModelKey[] = ['HAIKU', 'SONNET', 'OPUS']
const models = (over: Partial<PickerModels> = {}): PickerModels => ({
  allowed: ALL,
  defaults: {},
  gateOn: false,
  mode: 'api',
  credential: 'n/a',
  envDefault: null,
  captionProviderIsClaude: true,
  ...over,
})
const pre = (
  surface: UserSurface,
  m: PickerModels,
  stamp?: string | null,
  designPath?: 'A' | 'B',
) => {
  const r = preselection(surface, m, { stamp, designPath })
  if (!r.ok) throw new Error(`expected ok, got ${r.code}`)
  return r.resolved
}

// ── AC-26: the pre-selection is decideModel, over AC-03's product ────────────

// AC-03's dimensions (tests/unit/modelResolve.test.ts), sampled with a seeded PRNG.
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

// mulberry32: a fixed seed gives the same 20 combinations on every run.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
// 8015 is the first seed from 8014 whose draws cover every outcome (asserted below).
const next = rng(8015)
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]

const SEEDED = Array.from({ length: 20 }, () => ({
  surface: pick(USER_SURFACES),
  stamp: pick(STAMPS),
  team: pick(TEAM_DEFAULTS),
  allowed: pick(SUBSETS),
  gateOn: pick([false, true]),
  credential: pick(CREDENTIALS),
  mode: pick(MODES),
  env: pick(ENV_DEFAULTS),
  path: pick(PATHS),
}))

const seededModels = (c: (typeof SEEDED)[number]): PickerModels =>
  models({
    allowed: c.allowed,
    defaults: c.team ? { [c.surface]: c.team } : {},
    gateOn: c.gateOn,
    credential: c.credential,
    mode: c.mode,
    envDefault: c.env,
  })

describe('AC-26: the pre-selection equals decideModel', () => {
  it('draws 20 distinct combinations from AC-03 product', () => {
    expect(new Set(SEEDED.map((c) => JSON.stringify(c))).size).toBe(20)
  })

  it('the draws cover every source tier and the hidden branch, so the sample cannot degenerate', () => {
    const outcomes = new Set(
      SEEDED.map((c) => {
        const r = preselection(c.surface, seededModels(c), { stamp: c.stamp, designPath: c.path })
        return r.ok ? r.resolved.source : 'hidden'
      }),
    )
    expect(outcomes).toEqual(new Set(['stamp', 'team', 'system', 'fallback', 'hidden']))
  })

  it.each(SEEDED.map((c, i) => [i, c] as const))('combination %i', (_, c) => {
    const m = seededModels(c)
    const expected = decideModel(c.surface, {
      stamp: c.stamp,
      policy: {
        allowed: c.allowed,
        defaults: c.team ? { [c.surface]: c.team } : {},
        gateOn: c.gateOn,
      },
      credential: c.credential,
      mode: c.mode,
      envDefault: c.env,
      designPath: c.path,
    })
    expect(preselection(c.surface, m, { stamp: c.stamp, designPath: c.path })).toEqual(expected)

    // The rendered state agrees: the same pre-selection, and the options are the effective set.
    const state = pickerState(c.surface, m, { stamp: c.stamp, designPath: c.path })
    if (!expected.ok) {
      expect(state).toEqual({ kind: 'hidden' })
      return
    }
    if (state.kind === 'hidden') throw new Error('expected a picker')
    expect(state.preselected).toEqual(expected.resolved)
    const set = effectiveSet(c.surface, {
      policy: { allowed: c.allowed, defaults: {}, gateOn: c.gateOn },
      credential: c.credential,
      mode: c.mode,
    }).map((e) => e.key)
    expect(state.options.map((o) => o.value)).toEqual(set)
    expect(set).toContain(state.preselected.key)
  })
})

// ── AC-26 / FR-22: the team-token notice ─────────────────────────────────────

describe('teamTokenNotice', () => {
  const cases = MODES.flatMap((mode) =>
    CREDENTIALS.flatMap((credential) => MODEL_KEYS.map((key) => ({ mode, credential, key }))),
  )
  it.each(cases)('$mode / $credential / $key', ({ mode, credential, key }) => {
    const want = mode === 'cli' && credential === 'team' && key === 'OPUS'
    expect(teamTokenNotice({ mode, credential }, key)).toBe(want)
  })

  it('is false with no key', () => {
    expect(teamTokenNotice({ mode: 'cli', credential: 'team' }, undefined)).toBe(false)
    expect(teamTokenNotice({ mode: 'cli', credential: 'team' }, null)).toBe(false)
  })
})

// ── AC-26 / FR-22: the gated state ───────────────────────────────────────────

describe('gateOn: the gated key is not offered', () => {
  const GATED_MSG = 'Opus requires a personal Claude token on this team — connect one in Settings'

  it.each(USER_SURFACES.filter((s) => s !== 'DESIGN_TEMPLATE'))(
    '%s: absent in CLI mode on the team token, with the Settings hint',
    (surface) => {
      const m = models({ gateOn: true, mode: 'cli', credential: 'team' })
      expect(pickerOptions(surface, m).map((o) => o.value)).not.toContain('OPUS')
      expect(gatedHint(surface, m)).toBe(GATED_MSG)
      const state = pickerState(surface, m)
      if (state.kind === 'hidden') throw new Error('expected a picker')
      expect(state.gated).toBe(GATED_MSG)
    },
  )

  it.each([
    ['a personal token', { gateOn: true, mode: 'cli', credential: 'personal' }],
    ['API mode', { gateOn: true, mode: 'api', credential: 'n/a' }],
    ['the switch off', { gateOn: false, mode: 'cli', credential: 'team' }],
  ] as const)('offered, with no gated hint, on %s', (_, over) => {
    const m = models(over)
    expect(pickerOptions('REFINE', m).map((o) => o.value)).toContain('OPUS')
    expect(gatedHint('REFINE', m)).toBeNull()
  })

  it('no gated hint where Opus was never offered: template fill, or Opus not allowed', () => {
    const on = { gateOn: true, mode: 'cli', credential: 'team' } as const
    expect(gatedHint('DESIGN_TEMPLATE', models(on))).toBeNull()
    expect(gatedHint('REFINE', models({ ...on, allowed: ['HAIKU', 'SONNET'] }))).toBeNull()
  })

  it('a stamped Opus pre-selection substitutes visibly', () => {
    const m = models({ gateOn: true, mode: 'cli', credential: 'team' })
    const r = pre('CAPTION', m, 'claude-opus-5-5')
    expect([r.key, r.substitutedFrom]).toEqual(['HAIKU', 'claude-opus-5-5'])
    expect(hintText('CAPTION', r, { stamp: 'claude-opus-5-5' })).toBe(
      'Opus 5.5 is no longer available on this team — using Haiku 4.5',
    )
  })
})

// ── FR-18: the hint line ─────────────────────────────────────────────────────

describe('hintText (FR-18 strings)', () => {
  it('stamp: names the current caption, headline or design', () => {
    const m = models()
    const caption = pre('CAPTION', m, 'claude-sonnet-5-5')
    expect(caption.source).toBe('stamp')
    expect(hintText('CAPTION', caption, { stamp: 'claude-sonnet-5-5' })).toBe(
      'Same model as the current caption',
    )
    expect(
      hintText('CAPTION', caption, { stamp: 'claude-sonnet-5-5', stampNoun: 'headline' }),
    ).toBe('Same model as the current headline')
    const design = pre('DESIGN_FREEFORM', m, 'claude-opus-5-5')
    expect(hintText('DESIGN_FREEFORM', design, { stamp: 'claude-opus-5-5' })).toBe(
      'Same model as the current design',
    )
  })

  it('team, system and fallback', () => {
    const team = pre('REFINE', models({ defaults: { REFINE: 'OPUS' } }))
    expect([team.source, hintText('REFINE', team)]).toEqual(['team', 'Team default'])
    const system = pre('REFINE', models(), null, 'A')
    expect([system.key, system.source, hintText('REFINE', system)]).toEqual([
      'HAIKU',
      'system',
      'Default',
    ])
    const fallback = pre('DESIGN_FREEFORM', models({ allowed: ['HAIKU', 'OPUS'] }))
    expect([fallback.source, hintText('DESIGN_FREEFORM', fallback)]).toEqual([
      'fallback',
      "Default (the team's choice isn't available)",
    ])
  })

  it('a refused stamp names itself: a current ID by name, a retired or foreign one raw', () => {
    const noOpus = models({ allowed: ['HAIKU', 'SONNET'] })
    const r = pre('DESIGN_FREEFORM', noOpus, 'claude-opus-5-5')
    expect(hintText('DESIGN_FREEFORM', r, { stamp: 'claude-opus-5-5' })).toBe(
      'Opus 5.5 is no longer available on this team — using Sonnet 5.5',
    )
    // A retired ID maps to its family, recorded as a substitution (FR-09).
    const retired = pre('CAPTION', models(), 'claude-sonnet-4-6')
    expect([retired.key, retired.source]).toEqual(['SONNET', 'stamp'])
    expect(hintText('CAPTION', retired, { stamp: 'claude-sonnet-4-6' })).toBe(
      'claude-sonnet-4-6 is no longer available on this team — using Sonnet 5.5',
    )
    const foreign = pre('CAPTION', models(), 'gpt-4o')
    expect(hintText('CAPTION', foreign, { stamp: 'gpt-4o' })).toBe(
      'gpt-4o is no longer available on this team — using Haiku 4.5',
    )
  })
})

// ── A5: the send rule ────────────────────────────────────────────────────────

describe('reportedValue (A5)', () => {
  it('reports undefined for the pre-selected model, and the key for any other', () => {
    expect(reportedValue('SONNET', 'SONNET')).toBeUndefined()
    expect(reportedValue('OPUS', 'SONNET')).toBe('OPUS')
  })
})

// ── Review NOTE 1: a pick that is no longer offered is reset ─────────────────

describe('isStalePick', () => {
  it('no pick is never stale', () => {
    expect(isStalePick(pickerState('REFINE', models()), undefined)).toBe(false)
    expect(isStalePick({ kind: 'hidden' }, undefined)).toBe(false)
  })

  it('an offered pick is not stale', () => {
    expect(isStalePick(pickerState('REFINE', models()), 'OPUS')).toBe(false)
    expect(isStalePick(pickerState('CAPTION', models({ allowed: ['HAIKU'] })), 'HAIKU')).toBe(false)
  })

  it.each([
    ['an admin unticked it', 'REFINE', models({ allowed: ['HAIKU', 'SONNET'] })],
    ['the gate switched on', 'REFINE', models({ gateOn: true, mode: 'cli', credential: 'team' })],
    ['the design path moved to template fill', 'DESIGN_TEMPLATE', models()],
  ] as const)('stale when %s', (_, surface, m) => {
    expect(isStalePick(pickerState(surface, m), 'OPUS')).toBe(true)
  })

  it('stale when the picker is hidden (a non-Claude caption provider, or nothing allowed)', () => {
    expect(
      isStalePick(pickerState('CAPTION', models({ captionProviderIsClaude: false })), 'HAIKU'),
    ).toBe(true)
    expect(
      isStalePick(pickerState('DESIGN_TEMPLATE', models({ allowed: ['OPUS'] })), 'HAIKU'),
    ).toBe(true)
  })
})

// ── FR-18: options, and when the picker hides ────────────────────────────────

describe('pickerState', () => {
  it('labels each option "<displayName> · <tier>", with the speed beside it, cheapest first', () => {
    expect(pickerOptions('CAPTION', models())).toEqual([
      { value: 'HAIKU', label: 'Haiku 4.5 · $', speed: 'fast' },
      { value: 'SONNET', label: 'Sonnet 5.5 · $$', speed: 'medium' },
      { value: 'OPUS', label: 'Opus 5.5 · $$$', speed: 'slow' },
    ])
    expect(pickerOptions('DESIGN_TEMPLATE', models()).map((o) => o.value)).toEqual([
      'HAIKU',
      'SONNET',
    ])
  })

  it('one option → single (shown as plain text)', () => {
    const state = pickerState('CAPTION', models({ allowed: ['HAIKU'] }))
    expect(state.kind).toBe('single')
    if (state.kind === 'hidden') throw new Error('expected a picker')
    expect(state.preselected.entry.displayName).toBe('Haiku 4.5')
  })

  it('CAPTION hides when the caption provider is not Claude; the override wins either way', () => {
    const openai = models({ captionProviderIsClaude: false })
    expect(pickerState('CAPTION', openai)).toEqual({ kind: 'hidden' })
    expect(pickerState('CAPTION', openai, {}, true).kind).toBe('select')
    expect(pickerState('CAPTION', models(), {}, false)).toEqual({ kind: 'hidden' })
    // Only CAPTION reads it.
    expect(pickerState('REFINE', openai).kind).toBe('select')
  })

  it('hides when nothing can run the surface (NO_ALLOWED_MODEL)', () => {
    expect(pickerState('DESIGN_TEMPLATE', models({ allowed: ['OPUS'] }))).toEqual({
      kind: 'hidden',
    })
  })
})
