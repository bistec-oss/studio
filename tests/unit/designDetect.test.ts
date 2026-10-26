// 007 AC-01 to AC-03: the live detector.
import { describe, it, expect } from 'vitest'
import {
  detectVagueDesign,
  suggestionFor,
  MAX_CANDIDATES,
  MAX_SCAN_CHARS,
} from '@/lib/designData/authoring/detect'
import { isMeasurable } from '@/lib/designData/authoring/measurable'
import {
  HEARTS_ADJECTIVE_TEXT,
  HEARTS_PHRASES,
  BRAND_VOICE_TEXT,
  BRAND_VOICE_WORDS,
} from './fixtures/hearts-kit-adjectives'

describe('AC-01: the detector flags the Hearts adjectives', () => {
  const { candidates } = detectVagueDesign(HEARTS_ADJECTIVE_TEXT)

  it('yields exactly four candidates with the right entry keys, in text order', () => {
    expect(candidates.map((c) => c.entryKey)).toEqual([
      'mark-size-match',
      'logo-clear-space',
      'canvas-share',
      'edge-blend',
    ])
    expect(candidates.map((c) => c.quote)).toEqual([
      HEARTS_PHRASES.markSizeMatch,
      HEARTS_PHRASES.clearSpace,
      HEARTS_PHRASES.canvasShare,
      HEARTS_PHRASES.edgeBlend,
    ])
  })

  it('each start/end slices the text to its quote', () => {
    for (const c of candidates) expect(HEARTS_ADJECTIVE_TEXT.slice(c.start, c.end)).toBe(c.quote)
  })

  it('"IRP is fine on-image" is outside the detector', () => {
    expect(detectVagueDesign('IRP is fine on-image.').candidates).toEqual([])
  })
})

describe('AC-02: no brand voice, no measured text', () => {
  it('brand-voice words flag nothing', () => {
    expect(detectVagueDesign(BRAND_VOICE_TEXT).candidates).toEqual([])
    for (const w of BRAND_VOICE_WORDS) expect(detectVagueDesign(`Be ${w}.`).candidates).toEqual([])
  })

  it('an ambiguous word needs a design noun', () => {
    expect(detectVagueDesign('We make a generous offer.').candidates).toEqual([])
    expect(detectVagueDesign('Use a soft tone.').candidates).toEqual([])
    expect(detectVagueDesign('A large crowd attends.').candidates).toEqual([])
    expect(detectVagueDesign('A balanced diet.').candidates).toEqual([])
  })

  it('a measurable sentence is not flagged', () => {
    expect(
      detectVagueDesign('Use generous clear space (about 1.5 wordmark letters).').candidates,
    ).toEqual([])
    expect(detectVagueDesign('The primary canvas, 60% of the width.').candidates).toEqual([])
  })

  it('matches mixed case and slices correctly after a dotted capital I', () => {
    const text = 'İstanbul post: Keep GENEROUS Clear Space around the logo.'
    const { candidates } = detectVagueDesign(text)
    expect(candidates).toHaveLength(1)
    expect(candidates[0].quote).toBe('GENEROUS Clear Space')
    expect(text.slice(candidates[0].start, candidates[0].end)).toBe(candidates[0].quote)
  })
})

describe('AC-03: bounds and overlaps', () => {
  it('candidate id is <entryKey>:<start>', () => {
    const { candidates } = detectVagueDesign('Keep generous clear space.')
    expect(candidates[0].id).toBe(`logo-clear-space:${candidates[0].start}`)
  })

  it('overlapping matches keep the earlier start, then the longer match', () => {
    // "breathing room around the layout" (whitespace-share) is longer than
    // "breathing room" (logo-clear-space) from the same start.
    const { candidates } = detectVagueDesign('Give it breathing room around the layout.')
    expect(candidates).toHaveLength(1)
    expect(candidates[0].entryKey).toBe('whitespace-share')
    expect(candidates[0].quote).toBe('breathing room around the layout')
  })

  it('returns at most 12 and says more existed', () => {
    const text = Array.from({ length: 15 }, () => 'Use generous space.').join(' ')
    const r = detectVagueDesign(text)
    expect(r.candidates).toHaveLength(MAX_CANDIDATES)
    expect(r.more).toBe(true)
    expect(r.truncated).toBe(false)
  })

  it('scans only the first 20 000 characters and says so', () => {
    const filler = 'x '.repeat(MAX_SCAN_CHARS)
    const r = detectVagueDesign(`${filler} generous space.`)
    expect(r.truncated).toBe(true)
    expect(r.candidates).toEqual([])
  })
})

describe('suggestionFor', () => {
  it('fills the entry template with its defaults, with no model', () => {
    const s = suggestionFor({ entryKey: 'logo-clear-space' })!
    expect(s.text).toBe('clear space of 1 to 2 wordmark letters on every side')
    expect(isMeasurable(s.text)).toBe(true)
    expect(s.label).toBeTruthy()
    expect(suggestionFor({ entryKey: 'nope' })).toBeNull()
  })
})

describe('031 FR-26: the typography triggers', () => {
  const keys = (t: string) => detectVagueDesign(t).candidates.map((c) => c.entryKey)

  it('flags the vague type phrases', () => {
    expect(keys('Make the headline big.')).toEqual(['type-scale'])
    expect(keys('Use a big headline.')).toEqual(['type-scale'])
    expect(keys('Keep the text readable.')).toEqual(['body-min-size'])
    expect(keys('Use readable body text.')).toEqual(['body-min-size'])
    expect(keys('A tight headline works best.')).toEqual(['heading-line-height'])
  })

  it('does not flag measurable type rules or unrelated words', () => {
    expect(keys('The headline is 2.5× the body text size.')).toEqual([])
    expect(keys('Set the headline in the headline font.')).toEqual([])
  })
})
