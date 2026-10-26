import { describe, it, expect } from 'vitest'
import { MODEL_KEYS, type ModelKey } from '@/lib/models/catalogue'
import type { PickerModels } from '@/lib/models/pickerState'
import {
  designPath,
  designPickForPath,
  designSurface,
  refusedModelField,
  reviewModelName,
} from '@/lib/brief/modelPicks'

// 008 FR-19: the brief wizard's model picks (src/lib/brief/modelPicks.ts).
// The Review step's rendering is covered by the T18 E2E (AC-28).

const models = (over: Partial<PickerModels> = {}): PickerModels => ({
  allowed: ['HAIKU', 'SONNET', 'OPUS'],
  defaults: {},
  gateOn: false,
  mode: 'api',
  credential: 'n/a',
  envDefault: null,
  captionProviderIsClaude: true,
  ...over,
})

describe('designSurface / designPath (the POST /api/briefs mapping)', () => {
  it('Path A is template fill, Path B freeform', () => {
    expect(designSurface('TEMPLATE')).toBe('DESIGN_TEMPLATE')
    expect(designSurface('GENERATE')).toBe('DESIGN_FREEFORM')
    expect(designPath('TEMPLATE')).toBe('A')
    expect(designPath('GENERATE')).toBe('B')
  })
})

describe('designPickForPath (FR-19 reset on a path change)', () => {
  it('Opus picked, then Path A: resets to undefined with the resolver’s message', () => {
    expect(designPickForPath('OPUS', 'TEMPLATE')).toEqual({
      pick: undefined,
      note: "Opus 5.5 isn't available for template fill",
    })
  })

  it('keeps a pick the new path can run, with no note', () => {
    for (const pick of ['HAIKU', 'SONNET'] as ModelKey[]) {
      expect(designPickForPath(pick, 'TEMPLATE')).toEqual({ pick, note: null })
    }
    for (const pick of MODEL_KEYS) {
      expect(designPickForPath(pick, 'GENERATE')).toEqual({ pick, note: null })
    }
  })

  it('an untouched pick stays untouched', () => {
    expect(designPickForPath(undefined, 'TEMPLATE')).toEqual({ pick: undefined, note: null })
    expect(designPickForPath(undefined, 'GENERATE')).toEqual({ pick: undefined, note: null })
  })
})

describe('reviewModelName (the Review summary rows)', () => {
  it('an untouched picker names the pre-selection: system, then team default', () => {
    expect(reviewModelName('CAPTION', models(), {}, undefined)).toBe('Haiku 4.5')
    expect(reviewModelName('DESIGN_FREEFORM', models(), { designPath: 'B' }, undefined)).toBe(
      'Sonnet 5.5',
    )
    expect(
      reviewModelName('DESIGN_FREEFORM', models({ defaults: { DESIGN_FREEFORM: 'OPUS' } }), {}, undefined),
    ).toBe('Opus 5.5')
  })

  it('names the pick while it is offered', () => {
    expect(reviewModelName('DESIGN_FREEFORM', models(), {}, 'OPUS')).toBe('Opus 5.5')
    expect(reviewModelName('CAPTION', models(), {}, 'SONNET')).toBe('Sonnet 5.5')
  })

  it('a pick that is no longer offered names the pre-selection the server will run', () => {
    // Opus can't fill a template; the team unticked Opus; the gate left it out.
    expect(reviewModelName('DESIGN_TEMPLATE', models(), { designPath: 'A' }, 'OPUS')).toBe('Haiku 4.5')
    expect(reviewModelName('CAPTION', models({ allowed: ['HAIKU', 'SONNET'] }), {}, 'OPUS')).toBe(
      'Haiku 4.5',
    )
    expect(
      reviewModelName(
        'DESIGN_FREEFORM',
        models({ gateOn: true, mode: 'cli', credential: 'team' }),
        {},
        'OPUS',
      ),
    ).toBe('Sonnet 5.5')
  })

  it('no row when the picker is hidden', () => {
    expect(reviewModelName('CAPTION', models({ captionProviderIsClaude: false }), {}, undefined)).toBeNull()
    expect(reviewModelName('CAPTION', models({ allowed: [] }), {}, undefined)).toBeNull()
  })
})

describe('refusedModelField (a 400 MODEL_NOT_ALLOWED → its picker, by the body’s field)', () => {
  it('reads the field the route named', () => {
    expect(refusedModelField('captionModel')).toBe('captionModel')
    expect(refusedModelField('designModel')).toBe('designModel')
  })

  it('no field, or one the wizard has no picker for, is not placed (the step’s general error)', () => {
    for (const field of [undefined, null, '', 'model', 'CAPTION', 42]) {
      expect(refusedModelField(field)).toBeNull()
    }
  })
})
