import { describe, it, expect } from 'vitest'
import {
  CHANNEL_VALUES,
  channelLabel,
  channelCopyLimit,
  isChannel,
} from '@/lib/channels'

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
