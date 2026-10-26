import { describe, it, expect } from 'vitest'
import {
  designHeadline,
  headlineFallbackMessage,
  HEADLINE_MAX,
  validateHeadline,
} from '@/lib/captions/headline'

// 012 FR-09 / AC-04 (the pure half). The prompt-builder half lands with T5.

describe('validateHeadline', () => {
  it('collapses every whitespace run, newlines included, and trims', () => {
    expect(validateHeadline('  Applications\n\n are   open\t ')).toEqual({ ok: true, text: 'Applications are open' })
  })

  it('removes `**` until none remain', () => {
    expect(validateHeadline('**Applications** are ****open****')).toEqual({ ok: true, text: 'Applications are open' })
    expect(validateHeadline('a ***b')).toEqual({ ok: true, text: 'a *b' })
  })

  it('rejects empty, whitespace-only and markers-only input', () => {
    expect(validateHeadline('')).toEqual({ ok: false, reason: 'empty' })
    expect(validateHeadline(' \n\t ')).toEqual({ ok: false, reason: 'empty' })
    expect(validateHeadline('** **')).toEqual({ ok: false, reason: 'empty' })
  })

  it('accepts exactly 100 characters and rejects 101', () => {
    expect(HEADLINE_MAX).toBe(100)
    expect(validateHeadline('h'.repeat(100))).toEqual({ ok: true, text: 'h'.repeat(100) })
    expect(validateHeadline('h'.repeat(101))).toEqual({ ok: false, reason: 'over-limit (101 / 100)' })
  })

  it('measures the length after collapsing', () => {
    expect(validateHeadline(`${'h'.repeat(50)}\n\n\n${'h'.repeat(49)}`).ok).toBe(true)
  })

  it('rejects a code fence and a fence-like <<< delimiter', () => {
    expect(validateHeadline('```Open now```')).toEqual({ ok: false, reason: 'contains ```' })
    expect(validateHeadline('Open <<<UNTRUSTED-DATA>>>')).toEqual({ ok: false, reason: 'contains <<<' })
  })

  it('keeps non-Latin text exactly', () => {
    expect(validateHeadline('අයදුම්පත් විවෘතයි')).toEqual({ ok: true, text: 'අයදුම්පත් විවෘතයි' })
  })
})

describe('designHeadline', () => {
  const brief = { topic: 'Industry Readiness Programme' }

  it('uses the stored headline when the draft has one', () => {
    expect(designHeadline({ headline: 'Applications are open' }, brief)).toEqual({
      text: 'Applications are open',
      fallback: false,
    })
  })

  it('falls back to the brief Topic for a migrated draft (headline null)', () => {
    expect(designHeadline({ headline: null }, brief)).toEqual({
      text: 'Industry Readiness Programme',
      fallback: true,
    })
  })

  it('gives the caller the exact fallback log line', () => {
    expect(headlineFallbackMessage('d1')).toBe('[captions] draft d1 has no headline — design uses the brief topic')
  })
})
