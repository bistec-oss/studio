// 007 AC-14 (unit half): Improve with AI flags measurable rules the rewrite dropped.
import { describe, it, expect } from 'vitest'
import { lostMeasurableRules } from '@/lib/designData/authoring/measurable'

const BASE = 'Logos fill 45-60% of canvas width. Keep clear space of 1.5 wordmark letters.'

describe('lostMeasurableRules', () => {
  it('returns the dropped span in its original spelling', () => {
    expect(
      lostMeasurableRules(BASE, 'Logos fill 45-60% of canvas width. Keep generous space.'),
    ).toEqual(['1.5 wordmark letters'])
  })
  it('returns [] when both rules are kept', () => {
    expect(
      lostMeasurableRules(
        BASE,
        'Clear space of 1.5 wordmark letters; logos fill 45-60% of canvas width.',
      ),
    ).toEqual([])
  })
  it('reformatting is not a loss', () => {
    expect(
      lostMeasurableRules(
        BASE,
        'Logos fill 45 – 60 % of canvas width. Clear space: 1.5 Wordmark Letters.',
      ),
    ).toEqual([])
    expect(
      lostMeasurableRules(
        BASE,
        'Logos fill ~45-60% of canvas width. Clear space: 1.5 wordmark letters.',
      ),
    ).toEqual([])
  })
  it('a base with no measurable rule loses nothing; each lost token is listed once', () => {
    expect(lostMeasurableRules('Be bold and warm.', 'Anything')).toEqual([])
    expect(lostMeasurableRules('Use 20% here and 20% there.', 'none')).toEqual(['20%'])
  })
})
