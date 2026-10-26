// 006 T4: the per-user window behind POST /api/events (FR-08).
import { describe, it, expect, beforeEach } from 'vitest'
import { allow, resetRateLimit, EVENTS_PER_WINDOW, WINDOW_MS } from '@/lib/analytics/rateLimit'

beforeEach(() => resetRateLimit())

describe('rate limit', () => {
  it('allows 60 events in a minute and refuses the 61st', () => {
    expect(EVENTS_PER_WINDOW).toBe(60)
    for (let i = 0; i < 60; i++) expect(allow('u1', 1_000 + i)).toBe(true)
    expect(allow('u1', 2_000)).toBe(false)
  })

  it('counts each user on their own', () => {
    for (let i = 0; i < 60; i++) allow('u1', 1_000)
    expect(allow('u1', 1_001)).toBe(false)
    expect(allow('u2', 1_001)).toBe(true)
  })

  it('is a rolling window: room returns as the oldest events age out', () => {
    for (let i = 0; i < 60; i++) allow('u1', 10_000)
    expect(allow('u1', 10_000 + WINDOW_MS - 1)).toBe(false)
    expect(allow('u1', 10_000 + WINDOW_MS)).toBe(true)
  })

  it('a refused event is not recorded, so refusals never extend the lockout', () => {
    for (let i = 0; i < 60; i++) allow('u1', 0)
    for (let i = 0; i < 100; i++) expect(allow('u1', WINDOW_MS - 1)).toBe(false)
    expect(allow('u1', WINDOW_MS)).toBe(true)
  })

  it('sweeps stale users out of the map once it grows', () => {
    for (let i = 0; i < 1100; i++) allow(`user-${i}`, 0)
    expect(allow('late', WINDOW_MS + 5)).toBe(true)
  })
})
