// 006 T3: the insights read module (FR-10, NFR-08), the retention sweep (FR-11)
// and the worker wiring. The shaping helpers are pure; the queries are driven
// through a fake prisma that records each tagged template, so the test proves
// they are bound-parameter queries (never $queryRawUnsafe) over the right window.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const h = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  dropFindMany: vi.fn(),
  heartbeat: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: h.queryRaw,
    $executeRaw: h.executeRaw,
    analyticsDrop: { findMany: h.dropFindMany },
    workerHeartbeat: { findUnique: h.heartbeat },
  },
}))

import {
  ageDays,
  appliedRate,
  insights,
  ratio,
  rangeFor,
  retentionLoopState,
  shapeFunnel,
  shapeRefine,
  shapeStyles,
  withFailureRate,
} from '@/lib/analytics/queries'
import { sweepAnalytics } from '@/lib/analytics/retention'

const root = join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

describe('pure shaping helpers', () => {
  it('ratio is null, not NaN or Infinity, when there is nothing to divide', () => {
    expect(ratio(0, 0)).toBeNull()
    expect(ratio(1, 4)).toBe(0.25)
  })

  it('applied rate is ok / (ok + not-applied); conflict and failed stay outside it (AC-12)', () => {
    expect(appliedRate({ ok: 3, notApplied: 1 })).toBe(0.75)
    expect(appliedRate({ ok: 0, notApplied: 0 })).toBeNull()
    const shaped = shapeRefine(
      [
        { week: '2026-10-19', verifierModelId: 'haiku-a', verifierPromptVersion: 'v1', ok: 2, notApplied: 1, conflict: 1, failed: 0 },
        { week: '2026-10-19', verifierModelId: 'haiku-b', verifierPromptVersion: 'v1', ok: 1, notApplied: 1, conflict: 0, failed: 2 },
      ],
      [{ class: 'colour', ok: 2, notApplied: 0 }],
      [{ name: 'revision.override', n: 2 }, { name: 'revision.restored', n: 5 }],
    )
    expect(shaped.overall).toEqual({ ok: 3, notApplied: 2, conflict: 1, failed: 2, appliedRate: 0.6 })
    expect(shaped.byWeek.map((w) => w.appliedRate)).toEqual([2 / 3, 0.5])
    expect(shaped.byClass[0].appliedRate).toBe(1)
    expect(shaped.revisions).toEqual({ override: 2, adopted: 0, restored: 5, edited: 0 })
  })

  it('failure rate is failed / total per row', () => {
    expect(withFailureRate([{ total: 4, failed: 1 }, { total: 0, failed: 0 }]).map((r) => r.failureRate)).toEqual([0.25, null])
  })

  it('style rows carry their own fallback reasons and an applied rate over succeeded runs', () => {
    const rows = shapeStyles(
      [
        { style: 'editorial-split', generations: 4, okGenerations: 3, applied: 2, failed: 1, meanRefines: 1.5 },
        { style: 'classic', generations: 0, okGenerations: 0, applied: 0, failed: 0, meanRefines: null },
      ],
      [{ style: 'editorial-split', reason: 'layout-violation', n: 1 }],
    )
    expect(rows[0].appliedRate).toBeCloseTo(2 / 3)
    expect(rows[0].fallbacks).toEqual([{ reason: 'layout-violation', n: 1 }])
    expect(rows[1].appliedRate).toBeNull()
    expect(rows[1].fallbacks).toEqual([])
  })

  it('ranges end now and start 7, 30 or 90 days before', () => {
    const now = new Date('2026-10-24T12:00:00Z')
    expect(rangeFor('7d', now).from.toISOString()).toBe('2026-10-17T12:00:00.000Z')
    expect(rangeFor('30d', now).from.toISOString()).toBe('2026-09-24T12:00:00.000Z')
    expect(rangeFor('90d', now).from.toISOString()).toBe('2026-07-26T12:00:00.000Z')
    expect(rangeFor('90d', now).to).toBe(now)
  })

  it('retention loop state follows the three-missed-polls rule', () => {
    const now = new Date('2026-10-24T12:00:00Z')
    const at = (msAgo: number) => new Date(now.getTime() - msAgo)
    expect(retentionLoopState(now, null)).toEqual({ state: 'never', lastTickAt: null })
    expect(retentionLoopState(now, { lastTickStartedAt: at(61_000), lastTickEndedAt: at(60_000) }).state).toBe('online')
    expect(retentionLoopState(now, { lastTickStartedAt: at(600_000), lastTickEndedAt: at(599_000) }).state).toBe('stale')
    // the newest of start and end counts as the last tick
    expect(retentionLoopState(now, { lastTickStartedAt: at(10_000), lastTickEndedAt: null }).lastTickAt).toEqual(at(10_000))
  })

  it('oldest-event age is whole days, or null with no events', () => {
    const now = new Date('2026-10-24T12:00:00Z')
    expect(ageDays(now, null)).toBeNull()
    expect(ageDays(now, new Date('2026-04-27T11:00:00Z'))).toBe(180)
  })
})

describe('shapeFunnel (FR-10)', () => {
  it('fills every step, rates each against step 0 and splits abandoned by reason', () => {
    const out = shapeFunnel(
      [{ step: 0, n: 10 }, { step: 1, n: 8 }, { step: 3, n: 2 }],
      [{ resumed: false, n: 3 }, { resumed: true, n: 5 }],
      [{ reason: 'expired', n: 4 }, { reason: 'discarded', n: 1 }],
    )
    expect(out.reached.map((r) => r.n)).toEqual([10, 8, 0, 2, 0])
    expect(out.reached[1].ofStart).toBe(0.8)
    expect(out.reached[2].ofStart).toBe(0)
    expect(out.submitted).toEqual({ n: 3, ofStart: 0.3 })
    expect(out.submittedResumed).toEqual({ n: 5 })
    expect(out.abandoned).toEqual({ expired: 4, discarded: 1 })
  })

  it('an empty store has zeros and null rates, never NaN', () => {
    const out = shapeFunnel([], [], [])
    expect(out.reached.every((r) => r.n === 0 && r.ofStart === null)).toBe(true)
    expect(out.submitted).toEqual({ n: 0, ofStart: null })
    expect(out.submittedResumed).toEqual({ n: 0 })
    expect(out.abandoned).toEqual({ expired: 0, discarded: 0 })
  })
})

describe('insights()', () => {
  beforeEach(() => {
    h.queryRaw.mockReset().mockResolvedValue([])
    h.dropFindMany.mockReset().mockResolvedValue([
      { name: 'generation.finished', dropped: 2, rejected: 1, lastAt: new Date('2026-10-23T10:00:00Z'), lastReason: 'insert timed out' },
    ])
    h.heartbeat.mockReset().mockResolvedValue(null)
  })

  it('runs every section as a tagged template bound to the range, and shapes an empty store', async () => {
    const now = new Date('2026-10-24T12:00:00Z')
    const out = await insights('7d', now)
    const calls = h.queryRaw.mock.calls
    expect(calls.length).toBeGreaterThanOrEqual(10)
    for (const [strings, ...values] of calls) {
      // a tagged-template call: an array of literal parts with a `raw` property
      expect(Array.isArray(strings) && 'raw' in strings).toBe(true)
      for (const v of values) expect(v).toBeInstanceOf(Date)
    }
    expect(out.range).toBe('7d')
    expect(out.from).toBe('2026-10-17T12:00:00.000Z')
    expect(out.refine.overall.appliedRate).toBeNull()
    expect(out.lost).toEqual([
      { name: 'generation.finished', dropped: 2, rejected: 1, lastAt: '2026-10-23T10:00:00.000Z', lastReason: 'insert timed out' },
    ])
    expect(out.retention.loop.state).toBe('never')
    expect(out.retention.oldestAgeDays).toBeNull()
  })

  it('reports the oldest event age and the retention heartbeat from the store', async () => {
    const now = new Date('2026-10-24T12:00:00Z')
    h.queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = strings.join('?')
      if (sql.includes('min("at")')) return [{ oldest: new Date('2026-09-24T12:00:00Z'), total: 42 }]
      return []
    })
    h.heartbeat.mockResolvedValue({ lastTickStartedAt: new Date(now.getTime() - 30_000), lastTickEndedAt: new Date(now.getTime() - 29_000) })
    const out = await insights('30d', now)
    expect(out.retention).toMatchObject({ totalEvents: 42, oldestAgeDays: 30, loop: { state: 'online' } })
  })
})

describe('the read seam and the rules around it', () => {
  it('queries.ts never builds SQL: no $queryRawUnsafe, no $executeRawUnsafe', () => {
    const src = read('src/lib/analytics/queries.ts')
    expect(src).not.toMatch(/\$(query|execute)RawUnsafe/)
    expect(src).not.toMatch(/Prisma\.raw|Prisma\.sql\b/)
  })

  it('the insights route is the only reader of queries.ts and is super-admin only', () => {
    const route = read('src/app/api/admin/insights/route.ts')
    expect(route).toContain('withSuperAdmin')
    expect(route).not.toMatch(/\.delete(Many)?\(|\$executeRaw|\.create\(|export (const|async function) (POST|PUT|PATCH|DELETE)/)
  })

  it('the page calls the API, not the database', () => {
    const page = read('src/app/(app)/admin/insights/page.tsx')
    expect(page).toContain('/api/admin/insights')
    expect(page).not.toMatch(/@\/lib\/prisma|\$queryRaw/)
    expect(page).toContain('isSuperAdmin')
  })
})

describe('retention (FR-11)', () => {
  beforeEach(() => h.executeRaw.mockReset())

  it('runs one bounded delete with the cutoff in SQL, and returns the count', async () => {
    h.executeRaw.mockResolvedValue(5000)
    expect(await sweepAnalytics()).toBe(5000)
    expect(h.executeRaw).toHaveBeenCalledTimes(1)
    const [strings, ...values] = h.executeRaw.mock.calls[0]
    const sql = (strings as string[]).join('?')
    expect(sql).toContain('DELETE FROM "AnalyticsEvent"')
    expect(sql).toContain("interval '180 days'")
    expect(sql).toContain('LIMIT 5000')
    expect(values).toEqual([]) // takes no input: nothing a caller can widen
  })

  it('retention.ts uses relative imports only (the worker bundle has no "@/" alias)', () => {
    expect(read('src/lib/analytics/retention.ts')).not.toMatch(/from ['"]@\//)
  })

  it('the worker runs a retention loop through runTick, and 023 still monitors only its two loops', () => {
    const worker = read('src/scheduler/worker.ts')
    expect(worker).toContain('loop("retention"')
    expect(worker).toContain('sweepAnalytics')
    expect(worker).toMatch(/runTick\(name, run\)/)
    expect(read('src/lib/scheduler/heartbeatStatus.ts')).toContain("export type HeartbeatLoop = 'scheduler' | 'generation'")
    expect(read('src/app/api/scheduler/status/route.ts')).not.toContain('retention')
  })
})
