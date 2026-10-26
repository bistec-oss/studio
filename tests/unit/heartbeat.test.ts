// 023 FR-03 / NFR-01: the worker's heartbeat writers are best-effort, and
// runTick brackets the job with them.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ upsert: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { workerHeartbeat: { upsert: h.upsert } } }))

const { recordTickStart, recordTickEnd, runTick } = await import('@/lib/scheduler/heartbeat')

beforeEach(() => {
  h.upsert.mockReset()
  h.upsert.mockResolvedValue({})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

function trackWrites(order: string[]) {
  h.upsert.mockImplementation(async (args: { update: Record<string, unknown> }) => {
    order.push('lastTickStartedAt' in args.update ? 'start' : 'end')
  })
}

describe('runTick', () => {
  it('writes the start, runs the job, then writes the end', async () => {
    const order: string[] = []
    trackWrites(order)
    await runTick('generation', async () => { order.push('job') })
    expect(order).toEqual(['start', 'job', 'end'])
  })

  it('writes the end when the job throws, and rethrows', async () => {
    const order: string[] = []
    trackWrites(order)
    await expect(runTick('scheduler', async () => { throw new Error('boom') })).rejects.toThrow('boom')
    expect(order).toEqual(['start', 'end'])
  })

  it('still runs the job and resolves when both writes reject', async () => {
    h.upsert.mockRejectedValue(new Error('db down'))
    const job = vi.fn().mockResolvedValue(undefined)
    await expect(runTick('generation', job)).resolves.toBeUndefined()
    expect(job).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledTimes(2)
  })
})

describe('the writers', () => {
  it('neither throws when the write rejects', async () => {
    h.upsert.mockRejectedValue(new Error('db down'))
    await expect(recordTickStart('scheduler')).resolves.toBeUndefined()
    await expect(recordTickEnd('scheduler')).resolves.toBeUndefined()
  })

  it('the start upsert leaves the end alone', async () => {
    await recordTickStart('generation')
    const args = h.upsert.mock.calls[0][0]
    expect(args.where).toEqual({ loop: 'generation' })
    expect(Object.keys(args.update)).toEqual(['lastTickStartedAt'])
    expect(args.create.lastTickEndedAt).toBeUndefined()
  })

  it('the end upsert leaves the start alone on update, and sets both on create', async () => {
    await recordTickEnd('generation')
    const args = h.upsert.mock.calls[0][0]
    expect(Object.keys(args.update)).toEqual(['lastTickEndedAt'])
    expect(args.create.lastTickStartedAt).toBeInstanceOf(Date)
    expect(args.create.lastTickEndedAt).toBeInstanceOf(Date)
  })
})
