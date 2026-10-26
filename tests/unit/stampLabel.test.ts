// 008 FR-20 (T16): the "Generated with" line's pure half — a stamp's display
// name, the raw-ID fallback, and the "(substituted)" title.

import { describe, it, expect } from 'vitest'
import { generatedWith, stampName } from '@/lib/models/stampLabel'

describe('stampName', () => {
  it("a current entry's apiId reads as its display name", () => {
    expect(stampName('claude-sonnet-5-5')).toBe('Sonnet 5.5')
    expect(stampName('claude-haiku-4-5')).toBe('Haiku 4.5')
    expect(stampName('claude-opus-5-5')).toBe('Opus 5.5')
  })

  it('a retired ID of a family shows raw: no current entry describes it', () => {
    expect(stampName('claude-sonnet-4-6')).toBe('claude-sonnet-4-6')
    expect(stampName('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5-20251001')
  })

  it('an unmapped (foreign) stamp shows raw', () => {
    expect(stampName('gpt-4o')).toBe('gpt-4o')
  })
})

describe('generatedWith', () => {
  it('no stamp (pre-008, or no model output) → null, so nothing is shown', () => {
    expect(generatedWith(null)).toBeNull()
    expect(generatedWith(undefined)).toBeNull()
    expect(generatedWith('')).toBeNull()
  })

  it('a mapped stamp → "Generated with <name>", with no substitution', () => {
    expect(generatedWith('claude-sonnet-5-5')).toEqual({
      text: 'Generated with Sonnet 5.5',
      name: 'Sonnet 5.5',
      substitutedTitle: null,
    })
    expect(generatedWith('claude-sonnet-5-5', null)?.substitutedTitle).toBeNull()
  })

  it('an unmapped stamp falls back to the raw ID', () => {
    expect(generatedWith('gpt-4o')).toEqual({
      text: 'Generated with gpt-4o',
      name: 'gpt-4o',
      substitutedTitle: null,
    })
  })

  it('a substitution from a refused key names that key\'s model', () => {
    expect(generatedWith('claude-sonnet-5-5', 'OPUS')?.substitutedTitle).toBe('Substituted for Opus 5.5')
  })

  it('a substitution from a refused stamp names the stamp (display name, or raw)', () => {
    expect(generatedWith('claude-sonnet-5-5', 'claude-opus-5-5')?.substitutedTitle).toBe(
      'Substituted for Opus 5.5',
    )
    expect(generatedWith('claude-sonnet-5-5', 'claude-sonnet-4-6')?.substitutedTitle).toBe(
      'Substituted for claude-sonnet-4-6',
    )
  })
})
