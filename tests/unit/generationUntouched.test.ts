// 007 FR-16 / AC-17 (golden half): generation is byte-identical. The golden
// string was captured from buildBrandKitSystemContext BEFORE 007 touched
// anything; PROMPT_VERSION is pinned to its literal.
import { describe, it, expect } from 'vitest'
import { buildBrandKitSystemContext } from '@/lib/brandkit/systemContext'
import { PROMPT_VERSION } from '@/lib/agent/prompts/shared'
import { POST_STYLES_REVISION } from '@/lib/postStyles'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'

const kit: ResolvedBrandKit = {
  id: 'kit-1',
  name: 'Golden',
  colors: ['#0A1F44', '#00A99D'],
  fonts: [
    { name: 'Poppins', url: 'https://fonts.example/poppins' },
    { name: 'Inter', url: 'https://fonts.example/inter' },
  ],
  logoUrl: 'https://cdn.example/logo.png',
  logos: [
    { label: 'Primary mark', url: 'https://cdn.example/logo.png', primary: true },
    { label: 'Reversed', url: 'https://cdn.example/logo-w.png', primary: false },
  ],
  voicePrompt: 'Warm and direct. Keep clear space of 1.5 wordmark letters.',
  source: 'explicit',
}

describe('generation is untouched by 007', () => {
  it('buildBrandKitSystemContext equals the stored golden string', () => {
    expect(buildBrandKitSystemContext(kit)).toBe(
      [
        'Brand guidelines:',
        '- Colors: #0A1F44, #00A99D',
        // 031 FR-23: catalogue fonts carry their recomputed request (the one adaptation).
        '- Fonts: Poppins (https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&display=swap), Inter (https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&display=swap)',
        '- Logos (pick the variant that fits the design; use the primary if unsure):',
        '    • [primary] Primary mark: https://cdn.example/logo.png',
        '    • Reversed: https://cdn.example/logo-w.png',
        '- Brand voice: Warm and direct. Keep clear space of 1.5 wordmark letters.',
      ].join('\n'),
    )
  })
  it('PROMPT_VERSION moved only by 027 (the derived post-styles suffix) and 031 (the base bump)', () => {
    expect(PROMPT_VERSION).toBe(`2026-10-29.1+ps${POST_STYLES_REVISION}`)
  })
})
