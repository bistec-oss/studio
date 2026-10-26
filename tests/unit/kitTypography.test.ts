// 031 AC-26: the coded kit typography rules.
import { describe, it, expect } from 'vitest'
import { ASPECT_DIMENSIONS } from '@/lib/aspectRatio'
import {
  MIN_BODY_PX_BY_WIDTH,
  checkKitTypography,
} from '@/lib/designData/authoring/typography'

const CATS: Record<string, string> = {
  Inter: 'sans-serif',
  Poppins: 'sans-serif',
  Lora: 'serif',
  Merriweather: 'serif',
  'Noto Sans Sinhala': 'sans-serif',
}
const lookup = (name: string) =>
  name in CATS ? { family: name, category: CATS[name] } : null
const kit = (names: string[], scriptFonts: Record<string, string> | null = null) => ({
  fonts: names.map((name) => ({ name })),
  scriptFonts,
})
const codes = (k: ReturnType<typeof kit>) => checkKitTypography(k, lookup).map((f) => f.code)

describe('checkKitTypography', () => {
  it('none for a sans heading with a serif body', () => {
    expect(codes(kit(['Inter', 'Lora']))).toEqual([])
  })

  it('none for one font, or none', () => {
    expect(codes(kit(['Inter']))).toEqual([])
    expect(codes(kit([]))).toEqual([])
  })

  it('same-category names both fonts', () => {
    const f = checkKitTypography(kit(['Inter', 'Poppins']), lookup)
    expect(f.map((x) => x.code)).toEqual(['same-category'])
    expect(f[0].detail).toContain('Inter')
    expect(f[0].detail).toContain('Poppins')
  })

  it('the same family twice is not same-category', () => {
    expect(codes(kit(['Inter', 'Inter']))).toEqual([])
  })

  it('too-many-families above two Latin fonts, naming them', () => {
    const f = checkKitTypography(kit(['Inter', 'Lora', 'Merriweather']), lookup)
    expect(f.map((x) => x.code)).toEqual(['too-many-families'])
    expect(f[0].detail).toContain('Merriweather')
  })

  it('a script font does not count toward the two', () => {
    expect(codes(kit(['Inter', 'Lora'], { sinhala: 'Noto Sans Sinhala' }))).toEqual([])
  })

  it('unknown-family for a font or script font not in the snapshot', () => {
    const f = checkKitTypography(kit(['Inter', 'Zzz Font'], { sinhala: 'Nope' }), lookup)
    expect(f.map((x) => x.code)).toEqual(['unknown-family', 'unknown-family'])
    expect(f[0].detail).toContain('Zzz Font')
    expect(f[1].detail).toContain('Nope')
  })
})

describe('MIN_BODY_PX_BY_WIDTH', () => {
  it('has an entry for every AspectRatio canvas width', () => {
    for (const [ratio, d] of Object.entries(ASPECT_DIMENSIONS)) {
      expect(MIN_BODY_PX_BY_WIDTH[d.width], `${ratio} width ${d.width}`).toBeGreaterThan(0)
    }
  })
})
