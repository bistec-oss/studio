// 025 T8 (FR-13, NFR-07): the render argument for a stamped draft. The key is
// refused outside the team, the bytes are read once per call and become one
// data: URI, and a stamp with no composites needs none.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ getObjectBytes: vi.fn() }))
vi.mock('@/lib/storage/minio', () => ({ BUCKET_DOCS: 'docs', getObjectBytes: h.getObjectBytes }))

import { compositeRenderFor, compositeRenderForSource, isTeamScreenshotKey } from '@/lib/composite/assets'
import { COMPOSITE_TOKEN } from '@/lib/composite/render'
import { MOCK_PNG_BUFFER } from '@/lib/testHooks'
import { classicStamp, compositionStampSchema, type CompositionStamp } from '@/lib/designData'

const KEY = 'screenshots/team-1/user-1/shot.png'
const RECT = { x: 17, y: 44, w: 72, h: 45 }
const stamp = (key = KEY): CompositionStamp =>
  compositionStampSchema.parse({
    requestedArchetype: 'device-screen',
    appliedArchetype: 'device-screen',
    contractVersion: 1,
    imageQuality: 'default',
    composites: [{ region: 0, rect: RECT, source: { kind: 'brief-upload', key } }],
  })

beforeEach(() => {
  h.getObjectBytes.mockReset().mockResolvedValue(MOCK_PNG_BUFFER)
})

describe('isTeamScreenshotKey', () => {
  it('only keys under the team prefix, without traversal', () => {
    expect(isTeamScreenshotKey(KEY, 'team-1')).toBe(true)
    expect(isTeamScreenshotKey(KEY, 'team-2')).toBe(false)
    expect(isTeamScreenshotKey('screenshots/team-1/../team-2/u/a.png', 'team-1')).toBe(false)
    expect(isTeamScreenshotKey('exports/team-1/u/a.png', 'team-1')).toBe(false)
    expect(isTeamScreenshotKey(KEY, '')).toBe(false)
  })
})

describe('compositeRenderFor', () => {
  it('refuses a key outside the team with composite-source-missing, reading nothing', async () => {
    await expect(compositeRenderFor(stamp(), 'team-2', 'SQUARE')).rejects.toMatchObject({
      name: 'CompositeRenderError',
      reason: 'composite-source-missing',
    })
    expect(h.getObjectBytes).not.toHaveBeenCalled()
  })

  it('reads the object once and builds one data: URI at the stamped rect', async () => {
    const r = await compositeRenderFor(stamp(), 'team-1', 'SQUARE')
    expect(h.getObjectBytes).toHaveBeenCalledTimes(1)
    expect(h.getObjectBytes).toHaveBeenCalledWith('docs', KEY)
    expect(r).not.toBeNull()
    expect(r!.token).toBe(COMPOSITE_TOKEN)
    expect(r!.dataUri).toBe(`data:image/png;base64,${MOCK_PNG_BUFFER.toString('base64')}`)
    // The stamped rect, not the contract region (14, 42): 17% of 1080 = 183.6.
    expect(r!.rectPx).toEqual({ left: 183.6, top: 475.2, width: 777.6, height: 486 })
  })

  it('is null for a classic stamp, a null stamp and a stamp with no composites, reading nothing', async () => {
    expect(await compositeRenderFor(classicStamp(), 'team-1', 'SQUARE')).toBeNull()
    expect(await compositeRenderFor(null, 'team-1', 'SQUARE')).toBeNull()
    expect(h.getObjectBytes).not.toHaveBeenCalled()
  })
})

describe('compositeRenderForSource', () => {
  const canvas = { width: 1080, height: 1080 }
  it('an unreadable object is composite-source-missing', async () => {
    h.getObjectBytes.mockImplementation(() => {
      throw new Error('NoSuchKey')
    })
    let reason: string | undefined
    try {
      await compositeRenderForSource(KEY, RECT, 'team-1', canvas)
    } catch (e) {
      reason = (e as { reason?: string }).reason
    }
    expect(reason).toBe('composite-source-missing')
  })
  it('bytes that are not a PNG, JPEG or WebP are composite-source-missing', async () => {
    h.getObjectBytes.mockResolvedValue(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))
    await expect(compositeRenderForSource(KEY, RECT, 'team-1', canvas)).rejects.toMatchObject({
      reason: 'composite-source-missing',
    })
  })
})
