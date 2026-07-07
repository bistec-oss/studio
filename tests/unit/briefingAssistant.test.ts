// Briefing assistant pure parts: the ```briefing block extraction the chat UI
// depends on, and the deterministic MOCK_AI seams the E2E suite asserts on.

import { describe, it, expect } from 'vitest'
import { extractBriefingBlock } from '@/lib/campaign/briefingAssistant'
import { buildMockBriefingReply, buildMockBriefingEnhance } from '@/lib/testHooks'

describe('extractBriefingBlock', () => {
  it('extracts the fenced briefing content', () => {
    const text = 'Here is my draft:\n```briefing\nGoal: signups.\nAudience: SMBs.\n```\nThoughts?'
    expect(extractBriefingBlock(text)).toBe('Goal: signups.\nAudience: SMBs.')
  })

  it('returns the LAST block when the reply restates the draft', () => {
    const text = [
      '```briefing\nold draft\n```',
      'Updated per your note:',
      '```briefing\nnew draft\n```',
    ].join('\n')
    expect(extractBriefingBlock(text)).toBe('new draft')
  })

  it('returns null when no block or an empty block is present', () => {
    expect(extractBriefingBlock('no fences here')).toBeNull()
    expect(extractBriefingBlock('```briefing\n\n```')).toBeNull()
    // A generic code fence is not a briefing block.
    expect(extractBriefingBlock('```\nsome code\n```')).toBeNull()
  })
})

describe('MOCK_AI briefing seams', () => {
  it('buildMockBriefingReply embeds the last user message and a briefing block', () => {
    const reply = buildMockBriefingReply('Promote the July webinar')
    expect(reply).toContain('[Promote the July webinar]')
    expect(extractBriefingBlock(reply)).toContain('Promote the July webinar')
  })

  it('buildMockBriefingEnhance is a deterministic transform', () => {
    expect(buildMockBriefingEnhance('my briefing')).toBe('Enhanced: my briefing')
    expect(buildMockBriefingEnhance('')).toBe(
      'Enhanced: Mock briefing drafted from campaign context.'
    )
  })
})
