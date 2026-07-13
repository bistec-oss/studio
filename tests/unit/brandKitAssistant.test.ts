// Brand-kit assistant pure parts (F5): the ```brandkit block extraction the
// panel depends on, and the deterministic MOCK_AI seam the E2E asserts on.

import { describe, it, expect } from 'vitest'
import { extractBrandKitBlock } from '@/lib/brandkit/assistant'
import { buildMockBrandKitReply } from '@/lib/testHooks'

describe('extractBrandKitBlock', () => {
  it('parses voice/tone/style/fonts from a ```brandkit block', () => {
    const text = [
      'Here is what I found:',
      '```brandkit',
      JSON.stringify({ voice: 'Warm and expert.', tone: 'friendly', style: 'airy', fonts: ['Inter'] }),
      '```',
    ].join('\n')
    const block = extractBrandKitBlock(text)
    expect(block).toMatchObject({ voice: 'Warm and expert.', tone: 'friendly', style: 'airy' })
    expect(block!.fonts).toEqual(['Inter'])
  })

  it('applies defaults for omitted optional fields', () => {
    const block = extractBrandKitBlock('```brandkit\n{"voice":"Just a voice."}\n```')
    expect(block).toMatchObject({ voice: 'Just a voice.', tone: '', style: '', fonts: [] })
  })

  it('returns null when missing, malformed, or missing the required voice', () => {
    expect(extractBrandKitBlock('no block')).toBeNull()
    expect(extractBrandKitBlock('```brandkit\nnot json\n```')).toBeNull()
    expect(extractBrandKitBlock('```brandkit\n{"tone":"x"}\n```')).toBeNull() // voice required
  })

  it('takes the LAST block when restated', () => {
    const text = [
      '```brandkit\n{"voice":"old"}\n```',
      '```brandkit\n{"voice":"new"}\n```',
    ].join('\n')
    expect(extractBrandKitBlock(text)!.voice).toBe('new')
  })
})

describe('MOCK_AI brand-kit seam', () => {
  it('buildMockBrandKitReply carries an extractable brandkit block', () => {
    const reply = buildMockBrandKitReply('extract style')
    const block = extractBrandKitBlock(reply)
    expect(block).not.toBeNull()
    expect(block!.voice).toContain('extract style')
    expect(block!.fonts.length).toBeGreaterThan(0)
  })
})
