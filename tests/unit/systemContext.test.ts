import { describe, it, expect } from 'vitest'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import { buildBrandKitSystemContext } from '@/lib/brandkit/systemContext'

const kit: ResolvedBrandKit = {
  id: 'kit-1',
  name: 'Bistec',
  colors: ['#0f2d4e', '#ff5a1f'],
  fonts: [{ name: 'Inter', url: 'https://fonts.example.com/inter.woff2' }],
  logoUrl: 'https://cdn.example.com/logo.svg',
  voicePrompt: 'Warm, confident, human.',
  source: 'system',
}

describe('buildBrandKitSystemContext', () => {
  it('emits a normal http(s) logo URL as-is', () => {
    const context = buildBrandKitSystemContext(kit)
    expect(context).toContain('Logo URL: https://cdn.example.com/logo.svg')
    expect(context).toContain('#0f2d4e')
    expect(context).toContain('Inter (https://fonts.example.com/inter.woff2)')
    expect(context).toContain('Warm, confident, human.')
  })

  it('renders a data: URI logo as none — base64 never reaches the prompt', () => {
    const context = buildBrandKitSystemContext({
      ...kit,
      logoUrl: `data:image/png;base64,${'A'.repeat(1000)}`,
    })
    expect(context).toContain('Logo URL: none')
    expect(context).not.toContain('data:')
  })

  it('handles a null kit with fallbacks throughout', () => {
    const context = buildBrandKitSystemContext(null)
    expect(context).toContain('Colors: none specified')
    expect(context).toContain('Fonts: system fonts')
    expect(context).toContain('Logo URL: none')
    expect(context).toContain('Brand voice: not specified')
  })
})
