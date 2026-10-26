// 030 FR-15, AC-19 (unit half): trackHeadlineEdited is the one emitter of
// draft.headline_edited. No event when the headline did not change; otherwise
// via, the state after the write and whether a SCHEDULED post is pending; no
// text; it never throws.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ findUnique: vi.fn(), track: vi.fn() }))

vi.mock('@/lib/prisma', () => ({ prisma: { draft: { findUnique: h.findUnique } } }))
vi.mock('@/lib/analytics/track', () => ({ track: h.track }))

const { trackHeadlineEdited } = await import('@/lib/renderedText/track')

const stamp = (text: string) => ({ headline: { text, verified: true } })
const input = (over: Record<string, unknown> = {}) => ({
  draftId: 'd1',
  teamId: 'team1',
  userId: 'u1',
  via: 'edit' as const,
  before: 'Old line',
  ...over,
})
const draft = (over: Record<string, unknown> = {}) => ({
  headline: 'New line',
  renderedText: stamp('Old line'),
  _count: { posts: 0 },
  ...over,
})

beforeEach(() => {
  h.findUnique.mockReset()
  h.track.mockReset().mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('trackHeadlineEdited (030 FR-15)', () => {
  it('reads headline, stamp and the SCHEDULED post count in one query', async () => {
    h.findUnique.mockResolvedValue(draft())
    await trackHeadlineEdited(input())
    expect(h.findUnique).toHaveBeenCalledTimes(1)
    expect(h.findUnique).toHaveBeenCalledWith({
      where: { id: 'd1' },
      select: {
        headline: true,
        renderedText: true,
        _count: { select: { posts: { where: { status: 'SCHEDULED' } } } },
      },
    })
  })

  it('tracks via, the state after the write and scheduledPending, as a web event with no outcome', async () => {
    h.findUnique.mockResolvedValue(draft({ _count: { posts: 2 } }))
    await trackHeadlineEdited(input())
    expect(h.track).toHaveBeenCalledTimes(1)
    expect(h.track).toHaveBeenCalledWith('draft.headline_edited', {
      source: 'web',
      teamId: 'team1',
      userId: 'u1',
      draftId: 'd1',
      payload: { via: 'edit', state: 'stale', scheduledPending: true },
    })
  })

  it('the regenerate path carries via regenerate, and a fresh state when the stamp matches the new headline', async () => {
    h.findUnique.mockResolvedValue(draft({ renderedText: stamp('new line') }))
    await trackHeadlineEdited(input({ via: 'regenerate' }))
    expect(h.track.mock.calls[0][1].payload).toEqual({ via: 'regenerate', state: 'fresh', scheduledPending: false })
  })

  it('a draft from before 030 reports unknown', async () => {
    h.findUnique.mockResolvedValue(draft({ renderedText: null }))
    await trackHeadlineEdited(input())
    expect(h.track.mock.calls[0][1].payload.state).toBe('unknown')
  })

  it('a headline that did not change tracks nothing', async () => {
    h.findUnique.mockResolvedValue(draft({ headline: 'Old line' }))
    await trackHeadlineEdited(input())
    expect(h.track).not.toHaveBeenCalled()
  })

  it('a null before and a null headline is no change', async () => {
    h.findUnique.mockResolvedValue(draft({ headline: null }))
    await trackHeadlineEdited(input({ before: null }))
    expect(h.track).not.toHaveBeenCalled()
  })

  it('a case-only change is still a change (the raw strings differ)', async () => {
    h.findUnique.mockResolvedValue(draft({ headline: 'OLD LINE' }))
    await trackHeadlineEdited(input())
    expect(h.track).toHaveBeenCalledTimes(1)
    expect(h.track.mock.calls[0][1].payload.state).toBe('fresh')
  })

  it('holds no headline text anywhere in what it tracks', async () => {
    h.findUnique.mockResolvedValue(draft({ headline: 'Zebra new', renderedText: stamp('Zebra old') }))
    await trackHeadlineEdited(input({ before: 'Zebra before' }))
    expect(JSON.stringify(h.track.mock.calls)).not.toMatch(/zebra/i)
  })

  it('a missing draft tracks nothing', async () => {
    h.findUnique.mockResolvedValue(null)
    await trackHeadlineEdited(input())
    expect(h.track).not.toHaveBeenCalled()
  })

  it('never throws: a failing read or a throwing track resolves', async () => {
    h.findUnique.mockRejectedValue(new Error('db down'))
    await expect(trackHeadlineEdited(input())).resolves.toBeUndefined()
    h.findUnique.mockResolvedValue(draft())
    h.track.mockRejectedValue(new Error('boom'))
    await expect(trackHeadlineEdited(input())).resolves.toBeUndefined()
  })
})
