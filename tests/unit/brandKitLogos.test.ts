import { describe, it, expect } from 'vitest'
import { buildLogoList, shouldBecomePrimary, pickNextPrimaryUrl } from '@/lib/brandkit/logos'

describe('buildLogoList', () => {
  it('lists all logos, primary first and marked', () => {
    const list = buildLogoList(
      [
        { name: 'Full colour', url: 'https://cdn/x/colour.png' },
        { name: 'Reversed white', url: 'https://cdn/x/white.png' },
      ],
      'https://cdn/x/white.png',
    )
    expect(list).toEqual([
      { label: 'Reversed white', url: 'https://cdn/x/white.png', primary: true },
      { label: 'Full colour', url: 'https://cdn/x/colour.png', primary: false },
    ])
  })

  it('returns [] when there are no logos and no logoUrl', () => {
    expect(buildLogoList([], null)).toEqual([])
  })

  it('excludes data: URLs entirely', () => {
    const list = buildLogoList(
      [
        { name: 'Inline', url: 'data:image/png;base64,AAAA' },
        { name: 'Real', url: 'https://cdn/x/r.png' },
      ],
      'https://cdn/x/r.png',
    )
    expect(list).toEqual([{ label: 'Real', url: 'https://cdn/x/r.png', primary: true }])
  })

  it('adds an unlabeled primary for a legacy logoUrl with no matching artifact', () => {
    const list = buildLogoList([], 'https://cdn/x/legacy.png')
    expect(list).toEqual([
      { label: 'Primary logo', url: 'https://cdn/x/legacy.png', primary: true },
    ])
  })

  it('ignores a data: logoUrl (never a primary in prompts)', () => {
    expect(buildLogoList([], 'data:image/png;base64,AAAA')).toEqual([])
  })
})

describe('shouldBecomePrimary', () => {
  it('is true for the first logo with no primary set', () => {
    expect(shouldBecomePrimary(0, null)).toBe(true)
  })
  it('is false when a primary already exists', () => {
    expect(shouldBecomePrimary(0, 'https://cdn/x/p.png')).toBe(false)
  })
  it('is false when other logos already exist', () => {
    expect(shouldBecomePrimary(2, null)).toBe(false)
  })
})

describe('pickNextPrimaryUrl', () => {
  it('returns null when nothing remains', () => {
    expect(pickNextPrimaryUrl([])).toBeNull()
  })
  it('prefers the first non-data URL', () => {
    expect(pickNextPrimaryUrl(['data:image/png;base64,AA', 'https://cdn/x/a.png'])).toBe(
      'https://cdn/x/a.png',
    )
  })
  it('falls back to the first URL when all are data:', () => {
    expect(pickNextPrimaryUrl(['data:image/png;base64,AA'])).toBe('data:image/png;base64,AA')
  })
})
