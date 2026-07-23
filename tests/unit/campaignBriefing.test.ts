// Campaign-briefing prompt injection — the briefing must appear in every
// generation surface (copy, Path A, Path B, background decision) when present,
// and leave the prompts byte-identical when absent.

import { describe, it, expect } from 'vitest'
import type { Brief } from '@prisma/client'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import { buildCopyPrompt } from '@/lib/agent/prompts/copy'
import { buildPathASystemPrompt } from '@/lib/agent/prompts/pathA'
import { buildPathBUserMessage } from '@/lib/agent/prompts/pathB'
import { buildBackgroundDecisionPrompt } from '@/lib/agent/prompts/background'
import { buildBriefInput } from '@/lib/agent/briefInput'

const kit: ResolvedBrandKit = {
  id: 'kit-1',
  name: 'Bistec',
  colors: ['#0f2d4e'],
  fonts: [],
  logoUrl: null,
  logos: [],
  voicePrompt: 'Warm, confident, human.',
  source: 'system',
}

const BRIEFING = 'Q3 launch campaign: highlight the IRP programme, always mention the July webinar.'

describe('buildCopyPrompt — campaign briefing', () => {
  const brief = {
    topic: 'Webinar reminder',
    description: 'One week to go',
    goal: 'Signups',
    tone: 'Friendly',
    channels: ['INSTAGRAM'],
  }

  it('injects the briefing into the system prompt after the voice section', () => {
    const { system } = buildCopyPrompt({ ...brief, brandVoice: 'Bold.', campaignBriefing: BRIEFING })
    expect(system).toContain('Campaign briefing (applies to every post in this campaign):')
    expect(system).toContain(BRIEFING)
    expect(system.indexOf('Bold.')).toBeLessThan(system.indexOf(BRIEFING))
  })

  it('omits the section entirely when absent', () => {
    const { system } = buildCopyPrompt(brief)
    expect(system).not.toContain('Campaign briefing')
  })
})

describe('buildPathASystemPrompt — campaign briefing', () => {
  const base = { kit, mode: 'cli' as const, width: 1080, height: 1080, hasInlineAssets: false }

  it('includes the campaign context section only when provided', () => {
    const withBriefing = buildPathASystemPrompt({ ...base, campaignBriefing: BRIEFING })
    expect(withBriefing).toContain('Campaign context (applies to every post in this campaign):')
    expect(withBriefing).toContain(BRIEFING)

    const without = buildPathASystemPrompt(base)
    expect(without).not.toContain('Campaign context')
  })
})

describe('buildPathBUserMessage — campaign briefing', () => {
  const base = {
    topic: 'Webinar reminder',
    description: 'One week to go',
    goal: 'Signups',
    tone: 'Friendly',
    channels: ['INSTAGRAM'],
    copyText: 'Join us!',
    mode: 'cli' as const,
    width: 1080,
    height: 1080,
  }

  it('renders the briefing block above the per-post brief', () => {
    const msg = buildPathBUserMessage({ ...base, campaignBriefing: BRIEFING })
    expect(msg).toContain(BRIEFING)
    expect(msg.indexOf(BRIEFING)).toBeLessThan(msg.indexOf('Topic: Webinar reminder'))
  })

  it('is unchanged when the briefing is absent', () => {
    const msg = buildPathBUserMessage(base)
    expect(msg).not.toContain('Campaign briefing')
    expect(msg.startsWith('Create a social media post')).toBe(true)
  })
})

describe('buildBackgroundDecisionPrompt — campaign briefing', () => {
  const base = {
    kit,
    topic: 'Webinar reminder',
    description: null,
    goal: 'Signups',
    tone: 'Friendly',
    copyText: 'Join us!',
  }

  it('includes the briefing in the user message only when provided', () => {
    const withBriefing = buildBackgroundDecisionPrompt({ ...base, campaignBriefing: BRIEFING })
    expect(withBriefing.user).toContain(BRIEFING)
    expect(withBriefing.user.indexOf(BRIEFING)).toBeLessThan(withBriefing.user.indexOf('Brief:'))

    const without = buildBackgroundDecisionPrompt(base)
    expect(without.user).not.toContain('Campaign briefing')
    expect(without.user.startsWith('Brief:')).toBe(true)
  })
})

describe('buildBriefInput — campaign briefing param', () => {
  const brief = {
    topic: 'Webinar reminder',
    description: 'One week to go',
    goal: 'Signups',
    tone: 'Friendly',
    channels: ['INSTAGRAM'],
  } as unknown as Brief

  it('threads the briefing through and normalizes null to undefined', () => {
    expect(buildBriefInput(brief, kit, BRIEFING).campaignBriefing).toBe(BRIEFING)
    expect(buildBriefInput(brief, kit, null).campaignBriefing).toBeUndefined()
    expect(buildBriefInput(brief, kit).campaignBriefing).toBeUndefined()
  })
})
