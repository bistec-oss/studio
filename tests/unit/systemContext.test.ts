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
    expect(context).toContain('Inter (https://fonts.example.com/inter.woff2)')
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

  it('handles a null kit with fallbacks throughout', () => {
    const context = buildBrandKitSystemContext(null)
    expect(context).toContain('Colors: none specified')
    expect(context).toContain('Fonts: system fonts')
    expect(context).toContain('Logos: none')
    expect(context).toContain('Brand voice: not specified')
  })
})
