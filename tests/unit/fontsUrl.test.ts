// 031 AC-15: exact css2 URLs, with the real catalogue as the lookup.
import { describe, it, expect, vi } from 'vitest'
import { googleFontsUrl } from '@/lib/fonts/url'
import { findFamily } from '@/lib/fonts/catalogue'

const BASE = 'https://fonts.googleapis.com/css2?'

describe('googleFontsUrl', () => {
  it('one weight with italics (Instrument Serif): ital axis only', () => {
    expect(googleFontsUrl(['Instrument Serif'], findFamily)).toBe(
      `${BASE}family=Instrument+Serif:ital,wght@0,400;1,400&display=swap`,
    )
  })
  it('a variable family keeps its weights in 400 to 700 (JetBrains Mono, with italics)', () => {
    expect(googleFontsUrl(['JetBrains Mono'], findFamily)).toBe(
      `${BASE}family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&display=swap`,
    )
  })
  it('Noto Sans Sinhala (no italics)', () => {
    expect(googleFontsUrl(['Noto Sans Sinhala'], findFamily)).toBe(
      `${BASE}family=Noto+Sans+Sinhala:wght@400;500;600;700&display=swap`,
    )
  })
  it('two families in one URL, de-duplicated, in order', () => {
    expect(googleFontsUrl(['Noto Sans Sinhala', 'Noto Serif Sinhala', 'Noto Sans Sinhala'], findFamily)).toBe(
      `${BASE}family=Noto+Sans+Sinhala:wght@400;500;600;700&family=Noto+Serif+Sinhala:wght@400;500;600;700&display=swap`,
    )
  })
  it('an unknown family has no axis and logs one line per process', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const url = googleFontsUrl(['Fredoka One'], findFamily)
    googleFontsUrl(['Fredoka One'], findFamily)
    expect(url).toBe(`${BASE}family=Fredoka+One&display=swap`)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('[fonts] unknown family')
    warn.mockRestore()
  })
  it('falls back to the family weights when none is in 400 to 700', () => {
    const f = {
      family: 'Thin',
      category: 'display',
      weights: [100, 200],
      italics: false,
      scripts: ['latin'],
    }
    expect(googleFontsUrl(['Thin'], (n) => (n === 'Thin' ? f : null))).toBe(
      `${BASE}family=Thin:wght@100;200&display=swap`,
    )
  })
})
