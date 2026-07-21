import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  CHANNEL_VALUES,
  channelLabel,
  channelCopyLimit,
  isChannel,
} from '@/lib/channels'

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

describe('channelCopyLimit', () => {
  it('INSTAGRAM is 2200, LINKEDIN is 3000 (any casing)', () => {
    expect(channelCopyLimit('INSTAGRAM')).toBe(2200)
    expect(channelCopyLimit('instagram')).toBe(2200)
    expect(channelCopyLimit('LINKEDIN')).toBe(3000)
    expect(channelCopyLimit('linkedin')).toBe(3000)
  })

  it('returns undefined for unknown channels', () => {
    expect(channelCopyLimit('tiktok')).toBeUndefined()
  })
})

describe('isChannel', () => {
  it('accepts both enum values in any casing', () => {
    expect(CHANNEL_VALUES.every(isChannel)).toBe(true)
    expect(isChannel('instagram')).toBe(true)
    expect(isChannel('LinkedIn')).toBe(true)
  })

  it('rejects non-channels and non-strings', () => {
    expect(isChannel('facebook')).toBe(false)
    expect(isChannel(null)).toBe(false)
    expect(isChannel(42)).toBe(false)
  })
})
