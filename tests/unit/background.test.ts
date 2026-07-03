import { describe, it, expect } from 'vitest'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import { parseBackgroundDecision, imageSizeFor } from '@/lib/agent/background'
import {
  buildBackgroundDecisionPrompt,
  buildRefineBackgroundDecisionPrompt,
} from '@/lib/agent/prompts/background'

const kit: ResolvedBrandKit = {
  id: 'kit-1',
  name: 'Bistec',
  colors: ['#14377D', '#2CB34A'],
  fonts: [{ name: 'Lato', url: 'https://fonts.example.com/lato.woff2' }],
  logoUrl: 'https://cdn.example.com/logo.svg',
  voicePrompt: 'Warm, confident, human.',
  source: 'system',
}

describe('parseBackgroundDecision', () => {
  it('parses a bare JSON decision', () => {
    expect(parseBackgroundDecision('{"needed": true, "prompt": "deep navy abstract waves"}')).toEqual({
      needed: true,
      prompt: 'deep navy abstract waves',
    })
  })

  it('parses a fenced JSON decision (models sometimes wrap despite instructions)', () => {
    const raw = '```json\n{"needed": false, "prompt": ""}\n```'
    expect(parseBackgroundDecision(raw)).toEqual({ needed: false, prompt: '' })
  })

  it('tolerates surrounding prose by isolating the outermost object', () => {
    const raw = 'Here is my decision: {"needed": true, "prompt": "sunrise gradient"} — done.'
    expect(parseBackgroundDecision(raw)).toEqual({ needed: true, prompt: 'sunrise gradient' })
  })

  it('defaults a missing prompt to empty string', () => {
    expect(parseBackgroundDecision('{"needed": false}')).toEqual({ needed: false, prompt: '' })
  })

  it('returns null for non-JSON output', () => {
    expect(parseBackgroundDecision('I think a background would be nice.')).toBeNull()
  })

  it('returns null when the shape is wrong (needed not boolean)', () => {
    expect(parseBackgroundDecision('{"needed": "yes", "prompt": "x"}')).toBeNull()
  })
})

describe('imageSizeFor', () => {
  it('maps SQUARE to 1024x1024 and PORTRAIT to 1024x1536', () => {
    expect(imageSizeFor('SQUARE')).toBe('1024x1024')
    expect(imageSizeFor('PORTRAIT')).toBe('1024x1536')
  })
})

describe('background decision prompts', () => {
  it('generation prompt is biased toward yes and bans text in the image', () => {
    const p = buildBackgroundDecisionPrompt({
      kit,
      topic: 'Q3 launch',
      description: 'Announce the launch',
      goal: 'awareness',
      tone: 'professional',
      copyText: 'Big news!',
    })
    expect(p.system).toContain('default to "needed": true')
    expect(p.system).toContain('NO text')
    expect(p.system).toContain('#14377D') // brand kit context flows through
    expect(p.user).toContain('Q3 launch')
  })

  it('refine prompt is neutral: only when the instruction asks for a background', () => {
    const p = buildRefineBackgroundDecisionPrompt({
      kit,
      topic: 'Q3 launch',
      instruction: 'make the headline bigger',
    })
    expect(p.system).toContain('ONLY when the instruction')
    expect(p.user).toContain('make the headline bigger')
  })

  it('builders are pure — same input, same output', () => {
    const opts = { kit, topic: 't', instruction: 'i' }
    expect(buildRefineBackgroundDecisionPrompt(opts)).toEqual(buildRefineBackgroundDecisionPrompt(opts))
  })
})
