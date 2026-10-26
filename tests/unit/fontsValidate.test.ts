// 031 AC-17 (pure part): kit fonts and script fonts validation.
import { describe, it, expect } from 'vitest'
import { validateKitFonts, validateScriptFonts } from '@/lib/fonts/validateKitFonts'
import { findFamily } from '@/lib/fonts/catalogue'
import { googleFontsUrl } from '@/lib/fonts/url'

const inter = { name: 'Inter', url: googleFontsUrl(['Inter'], findFamily) }

describe('validateKitFonts', () => {
  it('replaces a submitted Google url with the computed one', () => {
    const r = validateKitFonts([{ name: 'Inter', url: 'https://evil.example/x.css' }], [], findFamily)
    expect(r).toEqual({ ok: true, fonts: [inter] })
  })
  it('keeps an unchanged stored entry as is: a FONT artifact URL and a family missing from the snapshot', () => {
    const artifact = { name: 'Brand Sans', url: 'http://minio/brand-kits/k/brand.woff2' }
    const gone = { name: 'Fredoka One', url: 'https://fonts.googleapis.com/css2?family=Fredoka+One' }
    const r = validateKitFonts([artifact, gone, { name: 'Inter', url: 'x' }], [artifact, gone], findFamily)
    expect(r).toEqual({ ok: true, fonts: [artifact, gone, inter] })
  })
  it('refuses an unknown new family, and a stored name with a changed url', () => {
    expect(validateKitFonts([{ name: 'Nope Sans', url: 'u' }], [], findFamily)).toEqual({
      ok: false,
      error: 'Unknown font: Nope Sans',
    })
    const stored = [{ name: 'Brand Sans', url: 'http://a/b.woff2' }]
    expect(
      validateKitFonts([{ name: 'Brand Sans', url: 'http://a/other.woff2' }], stored, findFamily).ok,
    ).toBe(false)
  })
  it('is case-sensitive', () => {
    expect(validateKitFonts([{ name: 'inter', url: 'u' }], [], findFamily).ok).toBe(false)
  })
  it('allows 6 entries and refuses 7', () => {
    const six = ['Inter', 'Poppins', 'Roboto', 'Lato', 'Montserrat', 'Oswald'].map((name) => ({
      name,
      url: 'u',
    }))
    expect(validateKitFonts(six, [], findFamily).ok).toBe(true)
    expect(validateKitFonts([...six, { name: 'Raleway', url: 'u' }], [], findFamily)).toMatchObject({
      ok: false,
    })
  })
})

describe('validateScriptFonts', () => {
  it('accepts a Sinhala family for sinhala', () => {
    expect(validateScriptFonts({ sinhala: 'Noto Sans Sinhala' }, findFamily)).toEqual({
      ok: true,
      scriptFonts: { sinhala: 'Noto Sans Sinhala' },
    })
  })
  it('null, undefined and {} clear the map', () => {
    for (const v of [null, undefined, {}]) {
      expect(validateScriptFonts(v, findFamily)).toEqual({ ok: true, scriptFonts: null })
    }
  })
  it('refuses a script that is not offered', () => {
    expect(validateScriptFonts({ tamil: 'Noto Sans Tamil' }, findFamily)).toMatchObject({ ok: false })
  })
  it('refuses an unknown family and a family without the script', () => {
    expect(validateScriptFonts({ sinhala: 'Nope Sans' }, findFamily)).toMatchObject({ ok: false })
    expect(validateScriptFonts({ sinhala: 'Inter' }, findFamily)).toMatchObject({ ok: false })
  })
})
