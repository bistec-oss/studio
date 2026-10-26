import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  create: vi.fn(),
  upsert: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { analyticsEvent: { create: h.create }, analyticsDrop: { upsert: h.upsert } },
}))

import { track, setFailNext, AnalyticsSchemaError, INSERT_TIMEOUT_MS } from '@/lib/analytics/track'

const base = { source: 'web' as const, teamId: 't1', userId: 'u1', draftId: 'd1' }
const adopted = { ...base, outcome: 'ok', payload: {} }

function productionMode() {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('MOCK_AI', 'false')
}

beforeEach(() => {
  h.create.mockReset().mockResolvedValue({})
  h.upsert.mockReset().mockResolvedValue({})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('track (006 FR-02, AC-02)', () => {
  it('writes one row for a valid event', async () => {
    await track('revision.restored', { ...base, outcome: 'ok', durationMs: 12.6, payload: { from: 1, to: 3 } })
    expect(h.create).toHaveBeenCalledTimes(1)
    expect(h.create.mock.calls[0][0].data).toEqual({
      name: 'revision.restored',
      schemaVersion: 1,
      source: 'web',
      teamId: 't1',
      userId: 'u1',
      draftId: 'd1',
      durationMs: 13,
      outcome: 'ok',
      payload: { from: 1, to: 3 },
    })
    expect(h.upsert).not.toHaveBeenCalled()
  })

  it('stores null for the optional columns it was not given', async () => {
    await track('generation.swept', { source: 'web', teamId: 't1', outcome: 'failed', payload: { ageMs: 5 } })
    const data = h.create.mock.calls[0][0].data
    expect(data.userId).toBeNull()
    expect(data.draftId).toBeNull()
    expect(data.durationMs).toBeNull()
  })

  it('stores the capped, redacted payload', async () => {
    await track('draft_action.settled', {
      ...base,
      outcome: 'failed',
      payload: { action: 'REFINE', instruction: 'x'.repeat(5000), failureReason: 'fetch https://a.b/c failed' },
    })
    const p = h.create.mock.calls[0][0].data.payload
    expect(p.instruction).toHaveLength(2000)
    expect(p.failureReason).toBe('fetch <url> failed')
  })

  it('in production an invalid payload writes no event, counts rejected and does not throw', async () => {
    productionMode()
    await expect(track('wizard.step', { ...base, payload: { step: 99 } })).resolves.toBeUndefined()
    expect(h.create).not.toHaveBeenCalled()
    const arg = h.upsert.mock.calls[0][0]
    expect(arg.where).toEqual({ name: 'wizard.step' })
    expect(arg.create).toMatchObject({ dropped: 0, rejected: 1 })
    expect(arg.update.rejected).toEqual({ increment: 1 })
    expect(typeof arg.update.lastReason).toBe('string')
  })

  it('under the test seam an invalid payload throws AnalyticsSchemaError', async () => {
    await expect(track('wizard.step', { ...base, payload: { step: 99 } })).rejects.toBeInstanceOf(
      AnalyticsSchemaError,
    )
    expect(h.create).not.toHaveBeenCalled()
  })

  it('also throws under the seam for a wrong source, a wrong outcome and an outcome on an outcome-less event', async () => {
    await expect(
      track('scheduled_generation.settled', { ...base, outcome: 'completed', payload: {} }),
    ).rejects.toBeInstanceOf(AnalyticsSchemaError)
    await expect(track('revision.adopted', { ...base, outcome: 'nope', payload: {} })).rejects.toBeInstanceOf(
      AnalyticsSchemaError,
    )
    await expect(track('wizard.step', { ...base, outcome: 'ok', payload: { step: 1 } })).rejects.toBeInstanceOf(
      AnalyticsSchemaError,
    )
    expect(h.create).not.toHaveBeenCalled()
  })

  it('counts dropped when the insert rejects, without throwing', async () => {
    h.create.mockRejectedValue(new Error('connection refused'))
    await expect(track('revision.adopted', adopted)).resolves.toBeUndefined()
    const arg = h.upsert.mock.calls[0][0]
    expect(arg.create).toMatchObject({ dropped: 1, rejected: 0 })
    expect(arg.update.lastReason).toBe('connection refused')
  })

  it('returns within the bound when the insert hangs, and counts dropped', async () => {
    vi.useFakeTimers()
    h.create.mockReturnValue(new Promise(() => {}))
    let done = false
    const p = track('revision.adopted', adopted).then(() => {
      done = true
    })
    await vi.advanceTimersByTimeAsync(INSERT_TIMEOUT_MS - 1)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(2)
    await p
    expect(done).toBe(true)
    expect(h.upsert.mock.calls[0][0].create).toMatchObject({ dropped: 1 })
    expect(h.upsert.mock.calls[0][0].update.lastReason).toBe('insert timeout')
  })

  it('returns within the bound when the insert and the counter both hang', async () => {
    vi.useFakeTimers()
    h.create.mockReturnValue(new Promise(() => {}))
    h.upsert.mockReturnValue(new Promise(() => {}))
    let done = false
    const p = track('revision.adopted', adopted).then(() => {
      done = true
    })
    await vi.advanceTimersByTimeAsync(INSERT_TIMEOUT_MS + 1)
    expect(done).toBe(true)
    await p
  })

  it('does not throw when the counter write also fails', async () => {
    h.create.mockRejectedValue(new Error('db down'))
    h.upsert.mockRejectedValue(new Error('db down'))
    await expect(track('revision.adopted', adopted)).resolves.toBeUndefined()
  })

  it('does not throw when the counter write hangs', async () => {
    vi.useFakeTimers()
    h.create.mockRejectedValue(new Error('db down'))
    h.upsert.mockReturnValue(new Promise(() => {}))
    const p = track('revision.adopted', adopted)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(p).resolves.toBeUndefined()
  })

  it('logs one [analytics] line per distinct failure, without payload text', async () => {
    h.create.mockRejectedValue(new Error('boom-unique-1'))
    await track('revision.adopted', adopted)
    await track('revision.adopted', adopted)
    const warn = console.warn as unknown as ReturnType<typeof vi.fn>
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toBe('[analytics] dropped revision.adopted: boom-unique-1')
  })

  it('failNext rejects the next n inserts under MOCK_AI only', async () => {
    vi.stubEnv('MOCK_AI', 'true')
    setFailNext(2)
    await track('revision.adopted', adopted)
    await track('revision.adopted', adopted)
    expect(h.create).not.toHaveBeenCalled()
    expect(h.upsert).toHaveBeenCalledTimes(2)
    await track('revision.adopted', adopted)
    expect(h.create).toHaveBeenCalledTimes(1)

    vi.stubEnv('MOCK_AI', 'false')
    setFailNext(5)
    await track('revision.adopted', adopted)
    expect(h.create).toHaveBeenCalledTimes(2)
  })
})
