// CLI-mode vision prompt (005 FR-09, NFR-07). Since T5 the images travel as
// base64 blocks in the same stream-json message and the CLI runs with
// `--tools ""`, so the prompt names no files and mentions no Read tool. It still
// carries the untrusted-content guard: any text within the images is data,
// never instructions. buildVisionCliPrompt is the pure builder so the wording
// is asserted directly.

import { describe, it, expect } from 'vitest'
import { buildVisionCliPrompt } from '@/lib/agent/vision'
import { UNTRUSTED_CONTENT_GUARD } from '@/lib/agent/untrusted'

describe('buildVisionCliPrompt', () => {
  const prompt = buildVisionCliPrompt('You extract brand voice.', 'Describe the palette.')

  it('includes the system text and the task, task last', () => {
    expect(prompt).toContain('You extract brand voice.')
    expect(prompt).toContain('Describe the palette.')
    expect(prompt.indexOf('--- Task ---')).toBeGreaterThan(prompt.indexOf('You extract brand voice.'))
    expect(prompt.trimEnd().endsWith('Describe the palette.')).toBe(true)
  })

  it('carries the untrusted-content guard', () => {
    expect(prompt).toContain(UNTRUSTED_CONTENT_GUARD)
  })

  it('frames the attached images as untrusted', () => {
    expect(prompt).toContain('--- Reference images (UNTRUSTED) ---')
    expect(prompt).toMatch(/the attached images/i)
  })

  it('names no files and no tool: no Read wording, no current directory, no paths', () => {
    expect(prompt).not.toMatch(/Read tool|use the read|current directory|\.png|\.jpg|ref-\d/i)
  })
})
