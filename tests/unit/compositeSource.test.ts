import { describe, it, expect } from 'vitest'
import {
  compositePairingError,
  compositeSourceSchema,
  isOwnScreenshotKey,
  parseCompositeSource,
  screenshotKeyPrefix,
} from '@/lib/brief/compositeSource'

const SOURCE = { kind: 'upload', key: 'k' }

describe('compositePairingError (025 FR-08)', () => {
  it('a look that requires a screenshot with none is IMAGE_STYLE_NEEDS_SCREENSHOT', () => {
    expect(compositePairingError('device-screen', undefined)).toBe('IMAGE_STYLE_NEEDS_SCREENSHOT')
    expect(compositePairingError('device-screen', null)).toBe('IMAGE_STYLE_NEEDS_SCREENSHOT')
  })

  it('a screenshot on a look without requires, or on classic, is SCREENSHOT_NEEDS_IMAGE_STYLE', () => {
    for (const style of ['classic', 'spotlight', 'product-showcase', undefined, null, '']) {
      expect(compositePairingError(style, SOURCE)).toBe('SCREENSHOT_NEEDS_IMAGE_STYLE')
    }
  })

  it('a consistent pair is null', () => {
    expect(compositePairingError('device-screen', SOURCE)).toBeNull()
    expect(compositePairingError('classic', undefined)).toBeNull()
    expect(compositePairingError('spotlight', null)).toBeNull()
  })
})

describe('compositeSourceSchema (025 FR-11)', () => {
  const ok = { kind: 'brief-upload', key: 'screenshots/t1/u1/1-abc.png', width: 1280, height: 800 }

  it('accepts the stored shape and parses it back', () => {
    expect(compositeSourceSchema.safeParse(ok).success).toBe(true)
    expect(parseCompositeSource(ok)).toEqual(ok)
  })

  it('refuses another kind, an extra field, a missing key and a non-integer size', () => {
    for (const bad of [
      { ...ok, kind: 'upload' },
      { ...ok, url: 'https://x' },
      { ...ok, key: undefined },
      { ...ok, width: 12.5 },
      { ...ok, height: -1 },
      null,
      'screenshots/t1/u1/x.png',
    ]) {
      expect(compositeSourceSchema.safeParse(bad).success).toBe(false)
      expect(parseCompositeSource(bad)).toBeNull()
    }
  })
})

describe('isOwnScreenshotKey (025 FR-11, NFR-06)', () => {
  it('accepts only a file directly under this team and user', () => {
    expect(isOwnScreenshotKey('screenshots/t1/u1/1-abc.png', 't1', 'u1')).toBe(true)
    expect(screenshotKeyPrefix('t1', 'u1')).toBe('screenshots/t1/u1/')
  })

  it('refuses another team, another user, a prefix lookalike and traversal', () => {
    for (const key of [
      'screenshots/t2/u1/x.png',
      'screenshots/t1/u2/x.png',
      'screenshots/t1/u10/x.png',
      'screenshots/t1/u1/',
      'screenshots/t1/u1/a/b.png',
      'screenshots/t1/u1/../u2/x.png',
      'screenshots/t1/u1/..%2Fu2%2Fx.png',
      'screenshots/t1/u1/..\\x.png',
      '/screenshots/t1/u1/x.png',
      'briefs/u1/x.png',
      '',
    ]) {
      expect(isOwnScreenshotKey(key, 't1', 'u1'), key).toBe(false)
    }
    expect(isOwnScreenshotKey(undefined, 't1', 'u1')).toBe(false)
    expect(isOwnScreenshotKey(42, 't1', 'u1')).toBe(false)
  })
})
