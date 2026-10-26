// 007 AC-05: "measurable" is defined. A text check, nothing about renders.
import { describe, it, expect } from 'vitest'
import {
  isMeasurable,
  measurableTokens,
  measurableSpans,
  spanFacts,
} from '@/lib/designData/authoring/measurable'

describe('isMeasurable (AC-05 table)', () => {
  it.each([
    '60%',
    '45-60%',
    '45–60 %',
    '~12 px',
    '3:2',
    '2x',
    'one or two wordmark letters',
    '1.5 wordmark capitals',
    'about 20% of the canvas width',
    'a gap of 1 to 2 wordmark letters on every side',
    'margins of 48px',
  ])('measurable: %s', (t) => expect(isMeasurable(t)).toBe(true))

  it.each([
    'generous',
    'a lot of space',
    'similar heights',
    '2 apples',
    '60',
    'the 2026 launch',
    'colour #00A99D',
    '2 xylophones',
    'ten people',
  ])('not measurable: %s', (t) => expect(isMeasurable(t)).toBe(false))
})

describe('measurableTokens', () => {
  it('normalises spacing, the tilde and the dash so two spellings are one token', () => {
    expect(measurableTokens('~45 – 60 %')).toEqual(['45-60%'])
    expect(measurableTokens('45-60%')).toEqual(['45-60%'])
    expect(measurableTokens('45 to 60%')).toEqual(['45-60%'])
  })
  it('returns each span, in order, with its original spelling kept in measurableSpans', () => {
    const spans = measurableSpans('Gap of 1.5 Wordmark Letters, margin ~48 px.')
    expect(spans.map((s) => s.text)).toEqual(['1.5 Wordmark Letters', '48 px'])
    expect(spans.map((s) => s.token)).toEqual(['1.5wordmarkletters', '48px'])
    const text = 'Gap of 1.5 Wordmark Letters, margin ~48 px.'
    for (const s of spans) expect(text.slice(s.start, s.end)).toBe(s.text)
  })
})

describe('spanFacts', () => {
  it('reads numbers and a unit', () => {
    expect(spanFacts('45–60 %')).toEqual({ numbers: [45, 60], unit: '%' })
    expect(spanFacts('1 to 2 wordmark letters')).toEqual({ numbers: [1, 2], unit: 'letters' })
    expect(spanFacts('one or two wordmark capitals')).toEqual({ numbers: [1, 2], unit: 'letters' })
    expect(spanFacts('48 px')).toEqual({ numbers: [48], unit: 'px' })
    expect(spanFacts('2x')).toEqual({ numbers: [2], unit: 'x' })
    expect(spanFacts('3:2')).toEqual({ numbers: [3, 2], unit: 'ratio' })
  })
})
