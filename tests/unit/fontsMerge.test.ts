// 031 AC-14: the refresh contract (pure) and the committed snapshot.
import { describe, it, expect } from 'vitest'
import { mergeCatalogue } from '@/lib/fonts/merge'
import type { FontCatalogue, FontFamily } from '@/lib/fonts/types'
import data from '@/lib/fonts/catalogue.json'

const fam = (family: string, over: Partial<FontFamily> = {}): FontFamily => ({
  family,
  category: 'sans-serif',
  weights: [400],
  italics: false,
  scripts: ['latin'],
  ...over,
})
const prev = (families: FontFamily[]): FontCatalogue => ({
  snapshotDate: '2026-01-01',
  source: 'src',
  families,
})

describe('mergeCatalogue', () => {
  it('keeps a family missing from the fetch with delisted: true', () => {
    const out = mergeCatalogue(prev([fam('A'), fam('B')]), [fam('A')], '2026-02-02')
    expect(out.families.find((f) => f.family === 'B')).toEqual({ ...fam('B'), delisted: true })
    expect(out.families.find((f) => f.family === 'A')?.delisted).toBeUndefined()
  })
  it('clears the flag when the family returns', () => {
    const out = mergeCatalogue(prev([fam('B', { delisted: true })]), [fam('B')], '2026-02-02')
    expect(out.families[0].delisted).toBeUndefined()
  })
  it('sets the date, adds new families and sorts by name', () => {
    const out = mergeCatalogue(prev([fam('Zed')]), [fam('Zed'), fam('Alpha')], '2026-02-02')
    expect(out.snapshotDate).toBe('2026-02-02')
    expect(out.families.map((f) => f.family)).toEqual(['Alpha', 'Zed'])
  })
  it('never removes a family and works with no previous snapshot', () => {
    expect(mergeCatalogue(null, [fam('A')], 'd').families).toHaveLength(1)
    expect(mergeCatalogue(prev([fam('A'), fam('B'), fam('C')]), [], 'd').families).toHaveLength(3)
  })
})

describe('the committed snapshot', () => {
  const cat = data as unknown as FontCatalogue
  const find = (n: string) => cat.families.find((f) => f.family === n)
  it('has a date and a source', () => {
    expect(cat.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(cat.source).toContain('fonts.google.com')
  })
  it('includes the named families, with sinhala where Google lists it', () => {
    for (const n of ['Instrument Serif', 'JetBrains Mono']) expect(find(n)).toBeTruthy()
    for (const n of [
      'Noto Sans Sinhala',
      'Noto Serif Sinhala',
      'Abhaya Libre',
      'Yaldevi',
      'Gemunu Libre',
    ]) {
      expect(find(n)?.scripts).toContain('sinhala')
    }
  })
  it('holds only the FR-16 fields', () => {
    const allowed = ['family', 'category', 'weights', 'italics', 'scripts', 'delisted']
    for (const f of cat.families) {
      expect(Object.keys(f).every((k) => allowed.includes(k))).toBe(true)
    }
  })
})
