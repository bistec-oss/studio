import { describe, it, expect } from 'vitest'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import { buildBrandKitSystemContext } from '@/lib/brandkit/systemContext'

const base: ResolvedBrandKit = {
  id: 'kit-1',
  name: 'Bistec',
  colors: ['#0f2d4e', '#ff5a1f'],
  fonts: [{ name: 'Inter', url: 'https://fonts.example.com/inter.woff2' }],
  logoUrl: 'https://cdn.example.com/logo.svg',
  logos: [
    { label: 'Full colour', url: 'https://cdn.example.com/logo.svg', primary: true },
    { label: 'Reversed white', url: 'https://cdn.example.com/white.svg', primary: false },
  ],
  voicePrompt: 'Warm, confident, human.',
  source: 'system',
}

describe('buildBrandKitSystemContext', () => {
  it('lists all logos, primary marked, with labels and URLs', () => {
    const context = buildBrandKitSystemContext(base)
    expect(context).toContain('[primary] Full colour: https://cdn.example.com/logo.svg')
    expect(context).toContain('Reversed white: https://cdn.example.com/white.svg')
    expect(context).toContain('#0f2d4e')
    // 031 FR-23: a catalogue family's request is recomputed; the stored url never reaches a prompt.
    expect(context).toContain('Inter (https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&display=swap)')
    expect(context).not.toContain('fonts.example.com')
    expect(context).toContain('Warm, confident, human.')
  })

  it('renders "Logos: none" when there are no logos', () => {
    const context = buildBrandKitSystemContext({ ...base, logos: [], logoUrl: null })
    expect(context).toContain('Logos: none')
  })

  it('never emits a data: URI (excluded upstream in the list)', () => {
    const context = buildBrandKitSystemContext({ ...base, logos: [], logoUrl: null })
    expect(context).not.toContain('data:')
  })

  // 031 FR-23: a non-catalogue entry (a FONT artifact upload) keeps its stored url.
  it('keeps the stored url of a font that is not in the catalogue', () => {
    const context = buildBrandKitSystemContext({
      ...base,
      fonts: [{ name: 'Brand Display Upload', url: 'https://minio.example.com/kits/brand.woff2' }],
    })
    expect(context).toContain('Brand Display Upload (https://minio.example.com/kits/brand.woff2)')
  })

  // 031 FR-23: one line per script font, after the fonts line.
  it('lists a script font as "Sinhala text: {family} (loaded for you)"', () => {
    const context = buildBrandKitSystemContext({ ...base, scriptFonts: { sinhala: 'Noto Sans Sinhala' } })
    expect(context).toContain(
      `- Fonts: Inter (https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&display=swap)
- Sinhala text: Noto Sans Sinhala (loaded for you)
- Logos`,
    )
  })

  it('adds no script line for no script fonts, an unoffered script or a family without the script', () => {
    const cases: Array<Record<string, string> | null> = [null, {}, { tamil: 'Noto Sans Tamil' }, { sinhala: 'Inter' }, { sinhala: 'No Such Font' }]
    for (const scriptFonts of cases) {
      expect(buildBrandKitSystemContext({ ...base, scriptFonts })).not.toContain(' text: ')
    }
  })

  it('handles a null kit with fallbacks throughout', () => {
    const context = buildBrandKitSystemContext(null)
    expect(context).toContain('Colors: none specified')
    expect(context).toContain('Fonts: system fonts')
    expect(context).toContain('Logos: none')
    expect(context).toContain('Brand voice: not specified')
  })
})
