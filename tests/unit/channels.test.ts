import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Channel } from '@prisma/client'
import {
  CAPTION_CHANNELS,
  CHANNEL_CAPTION_LIMITS,
  CHANNEL_LABELS,
  CHANNEL_VALUES,
  PUBLISHABLE_CHANNELS,
  captionLength,
  captionSpec,
  channelLabel,
  isPublishableChannel,
} from '@/lib/channels'
import { PublishError } from '@/lib/social/types'

// --- Team-scoped channel-token credential resolution (Task 12) ---
// linkedin.ts / instagram.ts each resolve their credentials via
// prisma.channelToken.findFirst({ where: { teamId, channel } }) and throw a
// fixed message when no row exists for that team — the env-var fallback
// (LINKEDIN_ACCESS_TOKEN/ORGANIZATION_ID, INSTAGRAM_ACCESS_TOKEN/BUSINESS_ACCOUNT_ID)
// is gone. Prisma is mocked; the throw happens before any network/crypto call,
// so no encryption key setup is needed for these cases.
const h = vi.hoisted(() => ({
  channelTokenFindFirst: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { channelToken: { findFirst: h.channelTokenFindFirst } },
}))

const linkedin = await import('@/lib/social/linkedin')
const instagram = await import('@/lib/social/instagram')

const TEAM_ID = 'team-1'
const EXPORT_URL = 'https://example.com/export.png'
const CAPTION = 'caption text'

beforeEach(() => {
  h.channelTokenFindFirst.mockReset()
})

describe('linkedin.publish — team-scoped credentials', () => {
  it('throws the exact missing-credentials message when no row exists for this team', async () => {
    h.channelTokenFindFirst.mockResolvedValue(null)
    await expect(linkedin.publish(EXPORT_URL, CAPTION, TEAM_ID)).rejects.toThrow(
      'No LinkedIn credentials configured for this team'
    )
  })

  it('looks up the token scoped by teamId + channel, not a global row', async () => {
    h.channelTokenFindFirst.mockResolvedValue(null)
    await expect(linkedin.publish(EXPORT_URL, CAPTION, TEAM_ID)).rejects.toThrow()
    expect(h.channelTokenFindFirst).toHaveBeenCalledWith({
      where: { teamId: TEAM_ID, channel: 'LINKEDIN' },
    })
  })
})

describe('instagram.publish — team-scoped credentials', () => {
  it('throws the exact missing-credentials message when no row exists for this team', async () => {
    h.channelTokenFindFirst.mockResolvedValue(null)
    await expect(instagram.publish(EXPORT_URL, CAPTION, TEAM_ID)).rejects.toThrow(
      'No Instagram credentials configured for this team'
    )
  })

  it('looks up the token scoped by teamId + channel, not a global row', async () => {
    h.channelTokenFindFirst.mockResolvedValue(null)
    await expect(instagram.publish(EXPORT_URL, CAPTION, TEAM_ID)).rejects.toThrow()
    expect(h.channelTokenFindFirst).toHaveBeenCalledWith({
      where: { teamId: TEAM_ID, channel: 'INSTAGRAM' },
    })
  })
})

describe('channelLabel', () => {
  it('maps enum values to human labels', () => {
    expect(channelLabel('INSTAGRAM')).toBe('Instagram')
    expect(channelLabel('LINKEDIN')).toBe('LinkedIn')
  })

  it('tolerates lowercase / mixed-case input (legacy rows)', () => {
    expect(channelLabel('instagram')).toBe('Instagram')
    expect(channelLabel('LinkedIn')).toBe('LinkedIn')
    expect(channelLabel('linkedin')).toBe('LinkedIn')
  })

  it('falls back to the raw string for unknown values', () => {
    expect(channelLabel('tiktok')).toBe('tiktok')
    expect(channelLabel('')).toBe('')
  })
})

// --- 012 FR-01 / AC-01: the per-channel registry ---
describe('CAPTION_CHANNELS registry', () => {
  it('covers every Channel enum value except WHATSAPP exactly once (026: the WhatsApp caption was dropped)', () => {
    const registered = CAPTION_CHANNELS.map((s) => s.channel)
    // Sorted equality fails on a missing value and on a duplicate alike.
    expect([...registered].sort()).toEqual([...Object.values(Channel)].filter((c) => c !== 'WHATSAPP').sort())
    expect(new Set(registered).size).toBe(registered.length)
  })

  it('is ordered Instagram, LinkedIn with unique JSON keys (026 AC-01)', () => {
    expect(CAPTION_CHANNELS.map((s) => s.channel)).toEqual(['INSTAGRAM', 'LINKEDIN'])
    expect(CAPTION_CHANNELS.map((s) => s.jsonKey)).toEqual(['instagram', 'linkedin'])
  })

  it('has no WhatsApp entry, so a lookup throws', () => {
    expect(() => captionSpec('WHATSAPP')).toThrow(/No caption registry entry/)
  })

  it('IG hard limit 2200, LI 3000', () => {
    expect(captionSpec('INSTAGRAM')).toMatchObject({ hardLimit: 2200 })
    expect(captionSpec('LINKEDIN')).toMatchObject({ hardLimit: 3000 })
    expect(CHANNEL_CAPTION_LIMITS).toEqual({ INSTAGRAM: 2200, LINKEDIN: 3000 })
  })

  it('derives the labels, and keeps WhatsApp for old Post rows (026 AC-01)', () => {
    expect(CHANNEL_LABELS).toEqual({ INSTAGRAM: 'Instagram', LINKEDIN: 'LinkedIn', WHATSAPP: 'WhatsApp' })
    expect(channelLabel('whatsapp')).toBe('WhatsApp')
  })

  it('only IG and LI are publishable, and CHANNEL_VALUES equals them', () => {
    expect(PUBLISHABLE_CHANNELS).toEqual(['INSTAGRAM', 'LINKEDIN'])
    expect(CHANNEL_VALUES).toEqual(['INSTAGRAM', 'LINKEDIN'])
  })

  it('normalises model output: IG/LI drop every **', () => {
    expect(captionSpec('INSTAGRAM').normalise('**Big** news ****x')).toBe('Big news x')
    expect(captionSpec('LINKEDIN').normalise('a ***b*** c')).toBe('a *b* c')
  })

  it('captionLength counts UTF-16 code units', () => {
    expect(captionLength('abc')).toBe(3)
    expect(captionLength('😀')).toBe(2)
  })
})

describe('isPublishableChannel', () => {
  it('accepts the publishable enum values', () => {
    expect(PUBLISHABLE_CHANNELS.every(isPublishableChannel)).toBe(true)
  })

  it('rejects WhatsApp, other casings, non-channels and non-strings', () => {
    expect(isPublishableChannel('WHATSAPP')).toBe(false)
    expect(isPublishableChannel('instagram')).toBe(false)
    expect(isPublishableChannel('facebook')).toBe(false)
    expect(isPublishableChannel(null)).toBe(false)
    expect(isPublishableChannel(42)).toBe(false)
  })
})

describe('PublishError', () => {
  it('is not terminal by default and carries terminal when set', () => {
    expect(new PublishError('INSTAGRAM', 'boom').terminal).toBe(false)
    const err = new PublishError('WHATSAPP', 'no publisher', { terminal: true })
    expect(err.terminal).toBe(true)
    expect(err.message).toBe('[WHATSAPP] no publisher')
  })
})

// --- 012 FR-21: the mock publishers' platformId carries the caption hash ---
describe('mockPlatformId', () => {
  it('keeps the mock-<channel>-<timestamp> prefix and ends in sha256(caption)[0:12]', async () => {
    const { createHash } = await import('node:crypto')
    const { mockPlatformId } = await import('@/lib/testHooks')
    const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 12)

    const li = mockPlatformId('LINKEDIN', 'LinkedIn caption')
    expect(li).toMatch(/^mock-linkedin-\d+-[0-9a-f]{12}$/)
    expect(li.endsWith(`-${sha('LinkedIn caption')}`)).toBe(true)

    const ig = mockPlatformId('INSTAGRAM', 'Instagram caption')
    expect(ig).toMatch(/^mock-instagram-\d+-/)
    expect(ig.split('-').at(-1)).not.toBe(li.split('-').at(-1))
  })
})
