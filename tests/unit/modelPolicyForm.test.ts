import { describe, it, expect } from 'vitest'
import {
  CATALOGUE,
  USER_SURFACES,
  isEligible,
  modelTier,
  type ModelKey,
  type UserSurface,
} from '@/lib/models/catalogue'
import {
  defaultOptions,
  formFromPolicy,
  policyBody,
  systemDefaultName,
  toggleAllowed,
} from '@/lib/models/policyForm'
import { validatePolicy } from '@/lib/models/policyRules'
import type { ModelsView, TeamModelPolicyInfo } from '@/lib/api-types'

// 008 FR-14: the /team → Models form's pure half (src/lib/models/policyForm.ts).

const nullDefaults = () =>
  Object.fromEntries(USER_SURFACES.map((s) => [s, null])) as Record<UserSurface, ModelKey | null>

const info = (over: Partial<TeamModelPolicyInfo> = {}): TeamModelPolicyInfo => ({
  allowed: ['HAIKU', 'SONNET', 'OPUS'],
  defaults: nullDefaults(),
  requirePersonalTokenForGated: false,
  saved: false,
  newModels: [],
  ...over,
})

const view = (over: Partial<ModelsView> = {}): ModelsView => ({
  catalogue: CATALOGUE.map((e) => ({
    key: e.key,
    displayName: e.displayName,
    tier: modelTier(e),
    speed: e.speed,
    surfaces: USER_SURFACES.filter((s) => isEligible(e, s)),
    personalTokenGated: e.personalTokenGated,
  })),
  allowed: ['HAIKU', 'SONNET', 'OPUS'],
  defaults: {},
  gateOn: false,
  mode: 'api',
  credential: 'n/a',
  captionCredential: 'n/a',
  envDefault: null,
  captionProviderIsClaude: true,
  ...over,
})

describe('formFromPolicy', () => {
  it('reads the policy in catalogue order, and drops a default outside the allowed list', () => {
    const form = formFromPolicy(
      info({
        allowed: ['OPUS', 'HAIKU'],
        defaults: { ...nullDefaults(), CAPTION: 'HAIKU', REFINE: 'SONNET' },
        requirePersonalTokenForGated: true,
      }),
    )
    expect(form.allowed).toEqual(['HAIKU', 'OPUS'])
    expect(form.defaults.CAPTION).toBe('HAIKU')
    expect(form.defaults.REFINE).toBeNull()
    expect(form.gateOn).toBe(true)
  })
})

describe('toggleAllowed', () => {
  it('ticking keeps catalogue order', () => {
    const form = toggleAllowed(formFromPolicy(info({ allowed: ['OPUS'] })), 'HAIKU', true)
    expect(form.allowed).toEqual(['HAIKU', 'OPUS'])
  })

  it('unticking resets the defaults that named the model, and only those', () => {
    const start = formFromPolicy(
      info({
        defaults: { ...nullDefaults(), CAPTION: 'OPUS', REFINE: 'OPUS', DESIGN_FREEFORM: 'SONNET' },
      }),
    )
    const form = toggleAllowed(start, 'OPUS', false)
    expect(form.allowed).toEqual(['HAIKU', 'SONNET'])
    expect(form.defaults.CAPTION).toBeNull()
    expect(form.defaults.REFINE).toBeNull()
    expect(form.defaults.DESIGN_FREEFORM).toBe('SONNET')
    // The untick-Opus save AC-22 runs is valid as built.
    expect(validatePolicy(policyBody(form)).ok).toBe(true)
  })
})

describe('systemDefaultName', () => {
  it('names the table default when it is ticked', () => {
    expect(systemDefaultName('CAPTION', ['HAIKU', 'SONNET'], 'api', null)).toBe('Haiku 4.5')
    expect(systemDefaultName('DESIGN_FREEFORM', ['HAIKU', 'SONNET'], 'api', null)).toBe(
      'Sonnet 5.5',
    )
  })

  it('names the cheapest ticked model when the table default is not ticked', () => {
    expect(systemDefaultName('DESIGN_FREEFORM', ['HAIKU', 'OPUS'], 'api', null)).toBe('Haiku 4.5')
  })

  it('follows CLAUDE_CLI_MODEL in CLI mode only, and only where it is eligible', () => {
    const all: ModelKey[] = ['HAIKU', 'SONNET', 'OPUS']
    expect(systemDefaultName('CAPTION', all, 'cli', 'OPUS')).toBe('Opus 5.5')
    expect(systemDefaultName('CAPTION', all, 'api', 'OPUS')).toBe('Haiku 4.5')
    expect(systemDefaultName('DESIGN_TEMPLATE', all, 'cli', 'OPUS')).toBe('Haiku 4.5')
  })

  it('is null when nothing ticked can run the surface (the save would 400)', () => {
    expect(systemDefaultName('DESIGN_TEMPLATE', ['OPUS'], 'api', null)).toBeNull()
  })

  // 018 FR-02 / AC-02: REFINE's system default follows the draft's path (A8).
  it('names both REFINE defaults when Path B and Path A differ', () => {
    const all: ModelKey[] = ['HAIKU', 'SONNET', 'OPUS']
    expect(systemDefaultName('REFINE', all, 'api', null)).toBe(
      'Sonnet 5.5; Haiku 4.5 on template drafts',
    )
    expect(systemDefaultName('REFINE', ['HAIKU', 'SONNET'], 'cli', null)).toBe(
      'Sonnet 5.5; Haiku 4.5 on template drafts',
    )
  })

  it('names one REFINE default when both paths resolve to the same model', () => {
    // Haiku not ticked: Path A falls to the cheapest allowed, which is Sonnet.
    expect(systemDefaultName('REFINE', ['SONNET', 'OPUS'], 'api', null)).toBe('Sonnet 5.5')
    // Sonnet not ticked: Path B falls to the cheapest allowed, which is Haiku.
    expect(systemDefaultName('REFINE', ['HAIKU', 'OPUS'], 'api', null)).toBe('Haiku 4.5')
    // CLAUDE_CLI_MODEL applies to both paths in CLI mode.
    expect(systemDefaultName('REFINE', ['HAIKU', 'SONNET', 'OPUS'], 'cli', 'OPUS')).toBe('Opus 5.5')
  })

  it('leaves every other surface on one name', () => {
    const all: ModelKey[] = ['HAIKU', 'SONNET', 'OPUS']
    for (const surface of [
      'CAPTION',
      'DESIGN_TEMPLATE',
      'DESIGN_FREEFORM',
      'ASSISTANT_BRIEFING',
      'ASSISTANT_BRANDKIT',
    ] as const) {
      expect(systemDefaultName(surface, all, 'api', null)).not.toContain(';')
    }
  })
})

describe('defaultOptions', () => {
  it('is the system default, then each ticked model eligible for the surface', () => {
    const form = formFromPolicy(info())
    expect(defaultOptions('DESIGN_TEMPLATE', form, view())).toEqual([
      { value: '', label: 'System default (Haiku 4.5)' },
      { value: 'HAIKU', label: 'Haiku 4.5' },
      { value: 'SONNET', label: 'Sonnet 5.5' },
    ])
    expect(
      defaultOptions('CAPTION', toggleAllowed(form, 'SONNET', false), view()).map((o) => o.value),
    ).toEqual(['', 'HAIKU', 'OPUS'])
  })

  it('labels the REFINE system default with both paths', () => {
    const form = formFromPolicy(info())
    expect(defaultOptions('REFINE', form, view())[0]).toEqual({
      value: '',
      label: 'System default (Sonnet 5.5; Haiku 4.5 on template drafts)',
    })
  })

  it('says so when nothing ticked can run the surface', () => {
    const form = formFromPolicy(info({ allowed: ['OPUS'] }))
    expect(defaultOptions('DESIGN_TEMPLATE', form, view())).toEqual([
      { value: '', label: 'System default (none allowed)' },
    ])
  })
})

describe('policyBody', () => {
  it('is the PUT body: every surface named, null = system default', () => {
    const form = formFromPolicy(info({ defaults: { ...nullDefaults(), REFINE: 'OPUS' } }))
    expect(policyBody({ ...form, gateOn: true })).toEqual({
      allowed: ['HAIKU', 'SONNET', 'OPUS'],
      defaults: { ...nullDefaults(), REFINE: 'OPUS' },
      requirePersonalTokenForGated: true,
    })
  })

  it('an Opus-only form is the 400 AC-22 shows inline', () => {
    const form = formFromPolicy(info({ allowed: ['OPUS'] }))
    const v = validatePolicy(policyBody(form))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.message).toBe('Template fill needs Haiku or Sonnet allowed')
  })
})
