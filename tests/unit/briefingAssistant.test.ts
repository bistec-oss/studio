// Briefing assistant pure parts: the ```briefing block extraction the chat UI
// depends on, and the deterministic MOCK_AI seams the E2E suite asserts on.

import { describe, it, expect } from 'vitest'
import { extractBriefingBlock, extractSchedulePlan } from '@/lib/campaign/briefingAssistant'
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

describe('extractSchedulePlan (F4)', () => {
  it('parses a valid ```schedule block into normalized items', () => {
    const text = [
      'Here is a plan:',
      '```schedule',
      JSON.stringify({
        posts: [
          { topic: 'Launch teaser', goal: 'awareness', tone: 'bold', daysFromNow: 2, postAction: 'HOLD' },
          { topic: 'Feature deep-dive', daysFromNow: 5 },
        ],
      }),
      '```',
    ].join('\n')
    const plan = extractSchedulePlan(text)
    expect(plan).toHaveLength(2)
    expect(plan![0]).toMatchObject({ topic: 'Launch teaser', daysFromNow: 2, postAction: 'HOLD' })
    // Defaults applied where the model omitted fields.
    expect(plan![1]).toMatchObject({ topic: 'Feature deep-dive', goal: 'awareness', tone: 'professional', postAction: 'HOLD' })
  })

  it('returns null for a missing, empty, or malformed block', () => {
    expect(extractSchedulePlan('no plan here')).toBeNull()
    expect(extractSchedulePlan('```schedule\nnot json\n```')).toBeNull()
    expect(extractSchedulePlan('```schedule\n{"posts":[]}\n```')).toBeNull() // min(1)
  })

  it('takes the LAST block when the plan is restated', () => {
    const text = [
      '```schedule\n{"posts":[{"topic":"old"}]}\n```',
      '```schedule\n{"posts":[{"topic":"new"}]}\n```',
    ].join('\n')
    expect(extractSchedulePlan(text)![0].topic).toBe('new')
  })
})

describe('MOCK_AI briefing seams', () => {
  it('buildMockBriefingReply embeds the last user message and a briefing block', () => {
    const reply = buildMockBriefingReply('Promote the July webinar')
    expect(reply).toContain('[Promote the July webinar]')
    expect(extractBriefingBlock(reply)).toContain('Promote the July webinar')
  })

  it('buildMockBriefingReply emits a schedule plan when asked to schedule a scheme', () => {
    const reply = buildMockBriefingReply('Schedule 2 posts as per this scheme')
    const plan = extractSchedulePlan(reply)
    expect(plan).toHaveLength(2)
    expect(extractBriefingBlock(reply)).toBeNull() // scheduling reply, not a briefing draft
  })

  it('buildMockBriefingEnhance is a deterministic transform', () => {
    expect(buildMockBriefingEnhance('my briefing')).toBe('Enhanced: my briefing')
    expect(buildMockBriefingEnhance('')).toBe(
      'Enhanced: Mock briefing drafted from campaign context.'
    )
  })
})
