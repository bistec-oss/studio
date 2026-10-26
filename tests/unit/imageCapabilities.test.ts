// 005 T1: the slot/provider compatibility table and the pure "which IMAGE row
// serves the team" rule (FR-01, FR-04). pickServingImageProvider must agree with
// resolveImageProvider's tiers 3 and 4; that agreement is asserted in
// imageProviderResolution.test.ts against the same fixture rows.

import { describe, it, expect } from 'vitest'
import {
  IMAGE_PROVIDERS,
  SLOT_PROVIDERS,
  canServeSlot,
  pickServingImageProvider,
  imageSizeFor,
  IMAGE_SIZES,
  type ImageProviderRow,
} from '@/providers/imageCapabilities'

function row(overrides: Partial<ImageProviderRow> & { id: string }): ImageProviderRow {
  return {
    providerName: 'openai',
    isEnabled: true,
    isDefault: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

describe('SLOT_PROVIDERS', () => {
  it('IMAGE accepts openai and gemini; COPY accepts anthropic, openai and cli', () => {
    expect([...IMAGE_PROVIDERS]).toEqual(['openai', 'gemini'])
    expect([...SLOT_PROVIDERS.IMAGE]).toEqual(['openai', 'gemini'])
    expect([...SLOT_PROVIDERS.COPY]).toEqual(['anthropic', 'openai', 'cli'])
  })
})

describe('canServeSlot', () => {
  it('IMAGE: only the image-capable providers', () => {
    expect(canServeSlot('IMAGE', 'openai')).toBe(true)
    expect(canServeSlot('IMAGE', 'gemini')).toBe(true)
    expect(canServeSlot('IMAGE', 'anthropic')).toBe(false)
    expect(canServeSlot('IMAGE', 'cli')).toBe(false)
  })

  it('IMAGE: an unknown provider name is refused', () => {
    expect(canServeSlot('IMAGE', 'groq')).toBe(false)
    expect(canServeSlot('IMAGE', '')).toBe(false)
  })

  it('COPY: the three copy providers are accepted', () => {
    expect(canServeSlot('COPY', 'anthropic')).toBe(true)
    expect(canServeSlot('COPY', 'openai')).toBe(true)
    expect(canServeSlot('COPY', 'cli')).toBe(true)
  })

  it('COPY: a known image-only provider is refused', () => {
    expect(canServeSlot('COPY', 'gemini')).toBe(false)
  })

  it('COPY: an unrecognized provider name keeps today\'s custom-provider flow (accepted)', () => {
    expect(canServeSlot('COPY', 'groq')).toBe(true)
  })
})

describe('pickServingImageProvider', () => {
  it('returns null for a team with no rows', () => {
    expect(pickServingImageProvider([])).toBeNull()
  })

  it('the enabled default wins even when an older enabled row exists (AC-03)', () => {
    const rows = [
      row({ id: 'old', createdAt: new Date('2026-01-01T00:00:00Z') }),
      row({ id: 'def', isDefault: true, createdAt: new Date('2026-02-01T00:00:00Z') }),
    ]
    expect(pickServingImageProvider(rows)?.id).toBe('def')
  })

  it('a single enabled non-default row serves (AC-01)', () => {
    expect(pickServingImageProvider([row({ id: 'only' })])?.id).toBe('only')
  })

  it('two enabled non-default rows: the older serves (AC-02)', () => {
    const rows = [
      row({ id: 'newer', createdAt: new Date('2026-03-01T00:00:00Z') }),
      row({ id: 'older', createdAt: new Date('2026-01-01T00:00:00Z') }),
    ]
    expect(pickServingImageProvider(rows)?.id).toBe('older')
  })

  it('same createdAt: the lower id breaks the tie', () => {
    const at = new Date('2026-01-01T00:00:00Z')
    const rows = [row({ id: 'b', createdAt: at }), row({ id: 'a', createdAt: at })]
    expect(pickServingImageProvider(rows)?.id).toBe('a')
  })

  it('a disabled default is ignored and the oldest enabled row serves', () => {
    const rows = [
      row({ id: 'def-off', isDefault: true, isEnabled: false, createdAt: new Date('2025-01-01T00:00:00Z') }),
      row({ id: 'on', createdAt: new Date('2026-01-01T00:00:00Z') }),
    ]
    expect(pickServingImageProvider(rows)?.id).toBe('on')
  })

  it('an incompatible row is skipped, even when it is the enabled default or the oldest', () => {
    const rows = [
      row({ id: 'ant-def', providerName: 'anthropic', isDefault: true, createdAt: new Date('2025-01-01T00:00:00Z') }),
      row({ id: 'groq-old', providerName: 'groq', createdAt: new Date('2025-06-01T00:00:00Z') }),
      row({ id: 'gem', providerName: 'gemini', createdAt: new Date('2026-01-01T00:00:00Z') }),
    ]
    expect(pickServingImageProvider(rows)?.id).toBe('gem')
  })

  it('returns null when every row is disabled or incompatible', () => {
    const rows = [
      row({ id: 'off', isEnabled: false }),
      row({ id: 'ant', providerName: 'anthropic' }),
    ]
    expect(pickServingImageProvider(rows)).toBeNull()
  })

  it('accepts createdAt as an ISO string (rows straight from the GET list JSON)', () => {
    const rows = [
      row({ id: 'newer', createdAt: '2026-03-01T00:00:00.000Z' }),
      row({ id: 'older', createdAt: '2026-01-01T00:00:00.000Z' }),
    ]
    expect(pickServingImageProvider(rows)?.id).toBe('older')
  })
})

describe('imageSizeFor (AC-18)', () => {
  it.each([
    ['openai', 'SQUARE', '1024x1024'],
    ['openai', 'PORTRAIT', '1024x1536'],
    ['openai', 'STORY', '1024x1536'],
    ['gemini', 'SQUARE', '1:1'],
    ['gemini', 'PORTRAIT', '4:5'],
    ['gemini', 'STORY', '9:16'],
  ])('%s %s -> %s', (p, a, size) => {
    expect(imageSizeFor(p, a)).toBe(size)
  })

  it('every provider has every aspect', () => {
    for (const p of IMAGE_PROVIDERS) {
      expect(Object.keys(IMAGE_SIZES[p]).sort()).toEqual(['PORTRAIT', 'SQUARE', 'STORY'])
    }
  })

  it('unknown provider or aspect falls back to a square size', () => {
    expect(imageSizeFor('midjourney', 'STORY')).toBe('1024x1024')
    expect(imageSizeFor(undefined, 'PORTRAIT')).toBe('1024x1024')
    expect(imageSizeFor('gemini', 'WIDE')).toBe('1:1')
    expect(imageSizeFor('openai', null)).toBe('1024x1024')
  })
})
