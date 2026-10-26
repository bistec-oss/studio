// 031 FR-13, FR-14: where an image came from, and the fixed notice text.
import { describe, it, expect } from 'vitest'
import {
  imageSourceNoticeFor,
  noPersonalFallbackMessage,
  parseImageSource,
} from '@/lib/drafts/imageSourceNotice'
import { backgroundSkippedFor } from '@/lib/drafts/backgroundNotice'

describe('imageSourceNoticeFor', () => {
  it('is null when nothing failed', () => {
    expect(imageSourceNoticeFor(null)).toBeNull()
    expect(imageSourceNoticeFor({ tier: 'personal', provider: 'gemini' })).toBeNull()
    expect(imageSourceNoticeFor({ tier: 'team', provider: 'openai' })).toBeNull()
  })

  it('names the failed key provider when the team made the image', () => {
    expect(
      imageSourceNoticeFor({ tier: 'team', provider: 'openai', personalFailed: true, personalProvider: 'gemini' }),
    ).toEqual({ message: "Your image generation key (Gemini) failed, so the team's image provider made this image." })
    expect(
      imageSourceNoticeFor({ tier: 'team', provider: 'gemini', personalFailed: true, personalProvider: 'openai' })?.message,
    ).toBe("Your image generation key (OpenAI) failed, so the team's image provider made this image.")
  })

  it('stays null for a personal tier (the skip notice speaks instead)', () => {
    expect(imageSourceNoticeFor({ tier: 'personal', provider: 'openai', personalFailed: true })).toBeNull()
  })
})

describe('the no-team-provider case', () => {
  it('has its own sentence', () => {
    expect(noPersonalFallbackMessage('openai')).toBe(
      'Your image generation key (OpenAI) failed and the team has no image provider, so this post has no AI image.',
    )
  })

  it('replaces the PROVIDER_ERROR skip message only when the personal key failed', () => {
    const src = { tier: 'personal', provider: 'gemini', personalFailed: true } as const
    expect(backgroundSkippedFor('PROVIDER_ERROR', 'boom', src)).toEqual({
      reason: 'PROVIDER_ERROR',
      message: noPersonalFallbackMessage('gemini'),
    })
    expect(backgroundSkippedFor('PROVIDER_ERROR', 'boom', null)?.message).toContain('The image provider returned an error (boom)')
    expect(backgroundSkippedFor('PROVIDER_ERROR', 'boom', { tier: 'team', provider: 'openai' })?.message).toContain('boom')
  })
})

describe('NO_PROVIDER text (FR-15)', () => {
  it('points at an image generation key', () => {
    expect(backgroundSkippedFor('NO_PROVIDER', null)?.message).toBe(
      'No image provider is set up. Add an image generation key in Settings, or ask a team admin to add an image provider in Team settings.',
    )
  })
})

describe('parseImageSource', () => {
  it('reads a stored value tolerantly', () => {
    expect(
      parseImageSource({ tier: 'team', provider: 'gemini', personalFailed: true, personalProvider: 'openai', extra: 1 }),
    ).toEqual({
      tier: 'team',
      provider: 'gemini',
      personalFailed: true,
      personalProvider: 'openai',
    })
    expect(parseImageSource(null)).toBeNull()
    expect(parseImageSource({ tier: 'x', provider: 'openai' })).toBeNull()
    expect(parseImageSource({ tier: 'team', provider: 'dalle' })).toBeNull()
    expect(parseImageSource('team')).toBeNull()
  })
})
