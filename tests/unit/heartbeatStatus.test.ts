// 023 FR-02: the pure health rule. The boundaries are the spec table (AC-02).

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

const { loopHealth, schedulerOffline, OFFLINE_THRESHOLD_MS, TICK_CEILING_MS } = await import('@/lib/scheduler/heartbeatStatus')
const { GENERATION_LEASE_MS } = await import('@/lib/scheduler/generationRunner')

const NOW = new Date('2026-10-21T12:00:00Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms)
const S = 1000
const MIN = 60_000

// An idle loop: the tick ended at or after it started.
const idle = (endedAgoMs: number) => ({ lastTickStartedAt: ago(endedAgoMs + 5 * S), lastTickEndedAt: ago(endedAgoMs) })
// A loop inside a tick: no end yet.
const inTick = (startedAgoMs: number) => ({ lastTickStartedAt: ago(startedAgoMs), lastTickEndedAt: null })

describe('loopHealth', () => {
  it('no row is never, with no last-seen time', () => {
    expect(loopHealth(NOW, null, 'generation')).toEqual({ state: 'never', lastSeenAt: null })
    expect(loopHealth(NOW, null, 'scheduler')).toEqual({ state: 'never', lastSeenAt: null })
  })

  it.each([
    [0, 'online'],
    [179 * S, 'online'],
    [180 * S, 'online'],
    [181 * S, 'offline'],
  ])('idle for %i ms is %s', (ms, state) => {
    expect(loopHealth(NOW, idle(ms), 'generation').state).toBe(state)
    expect(loopHealth(NOW, idle(ms), 'scheduler').state).toBe(state)
  })

  it('a generation loop inside a tick is online at 10 min and at exactly 30 min, offline at 31 min', () => {
    expect(loopHealth(NOW, inTick(10 * MIN), 'generation').state).toBe('online')
    expect(loopHealth(NOW, inTick(30 * MIN), 'generation').state).toBe('online')
    expect(loopHealth(NOW, inTick(31 * MIN), 'generation').state).toBe('offline')
  })

  it('a publishing loop inside a tick is online at 4 min and offline at 6 min', () => {
    expect(loopHealth(NOW, inTick(4 * MIN), 'scheduler').state).toBe('online')
    expect(loopHealth(NOW, inTick(5 * MIN), 'scheduler').state).toBe('online')
    expect(loopHealth(NOW, inTick(6 * MIN), 'scheduler').state).toBe('offline')
  })

  it('the long-tick case: a 10-minute generation tick is online where the idle rule would say offline', () => {
    expect(loopHealth(NOW, inTick(10 * MIN), 'generation').state).toBe('online')
    // The same age with the tick ended is idle, and past the threshold.
    expect(loopHealth(NOW, idle(10 * MIN), 'generation').state).toBe('offline')
  })

  it('an end before the start also means inside a tick', () => {
    const row = { lastTickStartedAt: ago(10 * MIN), lastTickEndedAt: ago(20 * MIN) }
    expect(loopHealth(NOW, row, 'generation').state).toBe('online')
    expect(loopHealth(NOW, row, 'scheduler').state).toBe('offline')
  })

  it('lastSeenAt is the later of the two timestamps', () => {
    expect(loopHealth(NOW, idle(30 * S), 'generation').lastSeenAt).toEqual(ago(30 * S))
    expect(loopHealth(NOW, inTick(2 * MIN), 'generation').lastSeenAt).toEqual(ago(2 * MIN))
  })

  it('a future last-seen time (clock skew) is online', () => {
    const row = { lastTickStartedAt: ago(-10 * S), lastTickEndedAt: ago(-5 * S) }
    expect(loopHealth(NOW, row, 'generation').state).toBe('online')
    expect(loopHealth(NOW, { lastTickStartedAt: ago(-10 * S), lastTickEndedAt: null }, 'scheduler').state).toBe('online')
  })
})

describe('constants', () => {
  it('the idle threshold is 3 minutes', () => {
    expect(OFFLINE_THRESHOLD_MS).toBe(180_000)
  })
  it('the generation ceiling covers two generation leases', () => {
    expect(TICK_CEILING_MS.generation).toBeGreaterThanOrEqual(2 * GENERATION_LEASE_MS)
  })
})

describe('schedulerOffline', () => {
  it('is false only when every loop is online', () => {
    expect(schedulerOffline([{ state: 'online' }, { state: 'online' }])).toBe(false)
    expect(schedulerOffline([{ state: 'online' }, { state: 'offline' }])).toBe(true)
    expect(schedulerOffline([{ state: 'never' }, { state: 'online' }])).toBe(true)
    expect(schedulerOffline([{ state: 'never' }, { state: 'never' }])).toBe(true)
  })
})
