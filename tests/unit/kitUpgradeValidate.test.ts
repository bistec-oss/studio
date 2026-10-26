// 007 AC-06 to AC-09 (unit half): validation, provenance and roles.
import { describe, it, expect, vi } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const sampler = vi.hoisted(() => ({ sampleImageColors: vi.fn() }))
vi.mock('@/lib/renderer/puppeteer', () => sampler)

import { detectVagueDesign } from '@/lib/designData/authoring/detect'
import { isMeasurable } from '@/lib/designData/authoring/measurable'
import { buildRoleList, containsForbidden } from '@/lib/designData/authoring/roles'
import {
  validateProposals,
  setProvenance,
  countSentences,
  type Proposal,
  type RejectionReason,
} from '@/lib/designData/authoring/validate'
import { HEARTS_ADJECTIVE_TEXT } from './fixtures/hearts-kit-adjectives'

const KIT = {
  colors: ['#0A1F44', '#00A99D'],
  fonts: [{ name: 'Poppins' }, { name: 'JetBrains Mono' }],
}
const TEXT = 'Keep generous clear space around the logo. Logos need similar visual heights.'
const { candidates } = detectVagueDesign(TEXT)
const space = candidates.find((c) => c.entryKey === 'logo-clear-space')!
const heights = candidates.find((c) => c.entryKey === 'mark-size-match')!
const GOOD = 'clear space of 1 to 2 wordmark letters on every side'

const run = (proposals: Proposal[], text = TEXT, cands = candidates) =>
  validateProposals(cands, proposals, KIT, text)
const reasonFor = (p: Proposal, text = TEXT, cands = candidates): RejectionReason | undefined =>
  run([p], text, cands).rejected[0]?.reason

describe('AC-07: validation, one case per reason', () => {
  it('a valid proposal becomes an Edit built from the candidate', () => {
    const { edits, rejected } = run([{ candidateId: space.id, replacement: GOOD }])
    expect(rejected).toEqual([])
    expect(edits).toEqual([
      {
        id: space.id,
        kind: 'replace',
        quote: 'generous clear space',
        replacement: GOOD,
        entryKey: 'logo-clear-space',
        provenance: 'dataset',
        rationale: expect.any(String),
      },
    ])
    expect(isMeasurable(edits[0].replacement)).toBe(true)
  })

  it('unknown-candidate', () =>
    expect(reasonFor({ candidateId: 'nope:1', replacement: GOOD })).toBe('unknown-candidate'))

  it('duplicate: the first wins', () => {
    const r = run([
      { candidateId: space.id, replacement: GOOD },
      { candidateId: space.id, replacement: 'clear space of 2 wordmark letters on every side' },
    ])
    expect(r.edits).toHaveLength(1)
    expect(r.edits[0].replacement).toBe(GOOD)
    expect(r.rejected).toEqual([{ candidateId: space.id, reason: 'duplicate' }])
  })

  it('too-long (over 400) and too-short (under 8)', () => {
    expect(reasonFor({ candidateId: space.id, replacement: `${GOOD} ${'x'.repeat(400)}` })).toBe(
      'too-long',
    )
    expect(reasonFor({ candidateId: space.id, replacement: '1 px' })).toBe('too-short')
    expect(reasonFor({ candidateId: space.id, replacement: '' })).toBe('too-short')
  })

  it('multi-sentence (three sentences)', () => {
    expect(
      reasonFor({
        candidateId: space.id,
        replacement: 'Keep 2 wordmark letters. Keep it tidy. Keep it clear.',
      }),
    ).toBe('multi-sentence')
    expect(countSentences('Keep 1.5 wordmark letters. Done.')).toBe(2)
  })

  it.each([
    ['a hex value', 'clear space of 2 wordmark letters in #00A99D'],
    ['a URL', 'clear space of 2 wordmark letters, see https://example.com'],
    ['an HTML tag', 'clear space of 2 wordmark letters <b>always</b>'],
    ['a code fence', 'clear space of 2 wordmark letters ```x```'],
    ['a kit font name, any case', 'clear space of 2 wordmark letters set in pOPPins'],
    ['a kit font name with a space', 'clear space of 2 wordmark letters in JetBrains Mono'],
  ])('forbidden-content: %s', (_n, replacement) =>
    expect(reasonFor({ candidateId: space.id, replacement })).toBe('forbidden-content'),
  )

  it('not-measurable', () => {
    expect(reasonFor({ candidateId: space.id, replacement: 'a really nice amount of room' })).toBe(
      'not-measurable',
    )
  })

  it('stale-quote: the quote occurs twice or not at all in the posted text', () => {
    const twice = `${TEXT} Keep generous clear space again.`
    expect(reasonFor({ candidateId: space.id, replacement: GOOD }, twice)).toBe('stale-quote')
    expect(reasonFor({ candidateId: space.id, replacement: GOOD }, 'The text changed.')).toBe(
      'stale-quote',
    )
  })

  it('role names are not forbidden', () => {
    expect(containsForbidden('brand colour 1 and the headline font at 2x', KIT)).toBe(false)
  })

  it('apply bounds: only the quote is removed (replace) or nothing is (insert)', () => {
    const { edits } = run([
      { candidateId: space.id, replacement: GOOD },
      {
        candidateId: heights.id,
        replacement: 'Set the wordmark capitals of each logo to the same height, within 5%.',
      },
    ])
    expect(edits.map((e) => e.kind)).toEqual(['replace', 'insert'])
    for (const e of edits) expect(e.quote.length).toBeLessThanOrEqual(160)
  })
})

describe('AC-08: provenance is set only by code', () => {
  it('a reply provenance and entryKey are ignored', () => {
    const forged = {
      candidateId: space.id,
      replacement: 'clear space of 9 wordmark letters on every side',
      provenance: 'dataset',
      entryKey: 'canvas-share',
      kind: 'insert',
      quote: 'Keep',
    } as Proposal
    const { edits } = run([forged])
    expect(edits[0].provenance).toBe('unverified')
    expect(edits[0].entryKey).toBe('logo-clear-space')
    expect(edits[0].kind).toBe('replace')
    expect(edits[0].quote).toBe('generous clear space')
  })

  it('in-range for a real entry is dataset; out of range or unknown unit is unverified', () => {
    expect(setProvenance('logo-clear-space', 'clear space of 1 to 2 wordmark letters')).toBe(
      'dataset',
    )
    expect(setProvenance('logo-clear-space', 'clear space of 4 wordmark letters')).toBe(
      'unverified',
    )
    expect(setProvenance('logo-clear-space', 'clear space of 20%')).toBe('unverified')
    expect(
      setProvenance(
        'canvas-share',
        'Brand colour 1 covers 60% of the canvas, brand colour 2 no more than 30%.',
      ),
    ).toBe('dataset')
    expect(setProvenance('canvas-share', 'Brand colour 1 covers 90% of the canvas.')).toBe(
      'unverified',
    )
    expect(setProvenance('not-an-entry', '60%')).toBe('unverified')
    expect(setProvenance('canvas-share', 'no numbers here')).toBe('unverified')
  })

  it('the Provenance type has no sampled member', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/lib/designData/authoring/validate.ts'),
      'utf8',
    )
    expect(source).toMatch(/type Provenance = 'dataset' \| 'unverified'/)
    expect(source).not.toMatch(/'sampled'/)
  })

  it('nothing in the upgrade code calls or imports the colour sampler', () => {
    const files = [
      ...readdirSync(join(process.cwd(), 'src/lib/designData/authoring')).map(
        (f) => `src/lib/designData/authoring/${f}`,
      ),
      ...readdirSync(join(process.cwd(), 'src/lib/kitUpgrade')).map(
        (f) => `src/lib/kitUpgrade/${f}`,
      ),
    ]
    for (const f of files)
      expect(readFileSync(join(process.cwd(), f), 'utf8'), f).not.toContain('sampleImageColors')
    // And running the whole detect + validate path calls it zero times.
    run([{ candidateId: space.id, replacement: GOOD }])
    detectVagueDesign(HEARTS_ADJECTIVE_TEXT)
    expect(sampler.sampleImageColors).not.toHaveBeenCalled()
  })
})

describe('AC-09 (unit half): roles, not literals', () => {
  it('buildRoleList names fonts by position and colours by index', () => {
    expect(buildRoleList(KIT)).toEqual([
      'the headline font',
      'the body font',
      'brand colour 1',
      'brand colour 2',
    ])
    expect(buildRoleList({ colors: [], fonts: [] })).toEqual([])
    expect(buildRoleList({ colors: ['#fff'], fonts: [{ name: 'A' }] })).toEqual([
      'the headline font',
      'brand colour 1',
    ])
  })

  it('containsForbidden finds a kit colour even without a hex shape check', () => {
    expect(containsForbidden('use #0a1f44 here', KIT)).toBe(true)
    expect(containsForbidden('a font like Poppinsish', KIT)).toBe(false)
  })
})
