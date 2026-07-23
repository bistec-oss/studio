// CLI-mode vision prompt hardening (security review item 2, now live on prod):
// the `claude -p --allowedTools Read` vision path must instruct the model to read
// ONLY the listed reference files and treat their contents (and any image text)
// as untrusted data — never as instructions. buildVisionCliPrompt is the pure
// builder so the wording is asserted directly.

import { describe, it, expect } from 'vitest'
import { buildVisionCliPrompt } from '@/lib/agent/vision'
import { UNTRUSTED_CONTENT_GUARD } from '@/lib/agent/untrusted'

describe('buildVisionCliPrompt', () => {
  const prompt = buildVisionCliPrompt('You extract brand voice.', 'Describe the palette.', [
    'ref-0.png',
    'ref-1.jpg',
  ])

  it('includes the system text and the task', () => {
    expect(prompt).toContain('You extract brand voice.')
    expect(prompt).toContain('Describe the palette.')
  })

  it('lists each reference file', () => {
    expect(prompt).toContain('ref-0.png')
    expect(prompt).toContain('ref-1.jpg')
  })

  it('carries the untrusted-content guard', () => {
    expect(prompt).toContain(UNTRUSTED_CONTENT_GUARD)
  })

  it('restricts the Read tool to only the listed files', () => {
    expect(prompt).toMatch(/only these|do not read any other/i)
  })
})
