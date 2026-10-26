// Change 028 T3 — the fixture table covers every current contract (AC-08).
import { describe, expect, it } from 'vitest'
import { archetypes, type ArchetypeMap } from '@/lib/designData'
import {
  CANDIDATE_FIXTURES,
  SUPERSEDED_FIXTURES,
  INTENDED_BACKDROP,
  LOOK_FIXTURES,
  fixtureCompletenessProblems,
} from '../render/lookFixtureTable'

describe('look fixture completeness', () => {
  it('the table covers exactly every current (key, version, size) with the three kinds', () => {
    expect(fixtureCompletenessProblems(archetypes, LOOK_FIXTURES)).toEqual([])
    // 36 for the four released looks, plus 21 for device-screen (A1: pass, busy, contrast, screen,
    // pass-offset, text-overlap and small-screen at each of three sizes).
    expect(LOOK_FIXTURES).toHaveLength(57)
  })

  it('a dataset with an added size names the missing ids', () => {
    const sp = archetypes.spotlight
    const square = sp.versions[sp.current].sizes.SQUARE!
    const withNewLook = {
      ...archetypes,
      'new-look': {
        ...sp,
        key: 'new-look',
        current: 1,
        versions: { 1: { ...sp.versions[sp.current], sizes: { SQUARE: square } } },
      },
    } as unknown as ArchetypeMap
    const problems = fixtureCompletenessProblems(withNewLook, LOOK_FIXTURES)
    expect(problems).toEqual([
      'missing fixture new-look@1:SQUARE#pass',
      'missing fixture new-look@1:SQUARE#busy',
      'missing fixture new-look@1:SQUARE#contrast',
    ])
  })

  it('names a row removed from the table, and a duplicate', () => {
    const short = LOOK_FIXTURES.filter((f) => !(f.key === 'spotlight' && f.size === 'STORY' && f.kind === 'busy'))
    expect(fixtureCompletenessProblems(archetypes, short)).toEqual(['missing fixture spotlight@2:STORY#busy'])
    const dup = [...LOOK_FIXTURES, LOOK_FIXTURES[0]]
    expect(fixtureCompletenessProblems(archetypes, dup).join('\n')).toContain('duplicate fixture')
  })

  it('a composite contract without a screen row is a problem, and a screen row without a composite is too', () => {
    const noScreen = LOOK_FIXTURES.filter((f) => !(f.key === 'device-screen' && f.size === 'SQUARE' && f.kind === 'screen'))
    expect(fixtureCompletenessProblems(archetypes, noScreen)).toEqual(['missing fixture device-screen@1:SQUARE#screen'])
    const extra = [...LOOK_FIXTURES, { ...LOOK_FIXTURES.find((f) => f.key === 'spotlight')!, kind: 'screen' as const }]
    expect(fixtureCompletenessProblems(archetypes, extra)).toEqual(['extra fixture spotlight@2:SQUARE#screen'])
  })

  it('candidate fixtures (031 T16) are pass, busy and contrast for contracts above `current`, and are not in the main table; none is open after T18', () => {
    expect(CANDIDATE_FIXTURES).toEqual([])
    // spotlight@2 passed OP-031 and is the current contract: its nine rows are in the main table.
    expect(LOOK_FIXTURES.filter((f) => f.key === 'spotlight').map((f) => f.version)).toEqual(Array(9).fill(2))
    for (const f of CANDIDATE_FIXTURES) {
      expect(archetypes[f.key].versions[f.version]?.sizes[f.size], f.id).toBeDefined()
      expect(f.version, f.id).toBeGreaterThan(archetypes[f.key].current)
      expect(LOOK_FIXTURES.some((m) => m.id === f.id && m.kind === f.kind), f.id).toBe(false)
    }
  })

  it('superseded fixtures (031 T18) are released contracts below `current` and are not in the main table', () => {
    expect(SUPERSEDED_FIXTURES).toHaveLength(9)
    for (const f of SUPERSEDED_FIXTURES) {
      expect(archetypes[f.key].versions[f.version]?.sizes[f.size], f.id).toBeDefined()
      expect(f.version, f.id).toBeLessThan(archetypes[f.key].current)
      expect(LOOK_FIXTURES.some((m) => m.id === f.id && m.kind === f.kind), f.id).toBe(false)
    }
  })

  it('the intended backdrop is dark exactly when the current textTone is light', () => {
    for (const a of Object.values(archetypes)) {
      expect(INTENDED_BACKDROP[a.key], a.key).toBeDefined()
      expect(INTENDED_BACKDROP[a.key] === 'dark', a.key).toBe(a.versions[a.current].textTone === 'light')
    }
  })
})
