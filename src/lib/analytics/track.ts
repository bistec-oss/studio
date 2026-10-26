// The one writer of AnalyticsEvent (006 FR-02). `track` validates the payload
// against the catalogue, inserts one row under a 2 s bound, and NEVER throws
// into its caller in production: every event it cannot store is counted in
// AnalyticsDrop, which the insights page shows, so a loss never reads as a
// healthy zero. Under the test seams (MOCK_AI or NODE_ENV=test) an invalid
// payload throws AnalyticsSchemaError instead, so a drifting change fails its
// own tests.
//
// MOCK_AI / NODE_ENV are read from process.env directly, not through
// testHooks: the same cycle-avoidance as models/modelCalls.ts.
import type { AnalyticsSource, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { CATALOGUE, type EventName, type EventPayloadInput } from './catalogue'

export const INSERT_TIMEOUT_MS = 2000
// The counter write is best-effort and bounded too, so a dead database cannot
// stall an action twice over.
const COUNTER_TIMEOUT_MS = 500
const REASON_MAX = 200

export class AnalyticsSchemaError extends Error {
  constructor(
    readonly eventName: string,
    readonly issues: string,
  ) {
    super(`analytics event "${eventName}" failed its schema: ${issues}`)
    this.name = 'AnalyticsSchemaError'
  }
}

export interface TrackFields<N extends EventName> {
  source: AnalyticsSource
  teamId: string
  userId?: string | null
  draftId?: string | null
  durationMs?: number | null
  outcome?: string | null
  payload: EventPayloadInput<N>
}

function isTestSeam(): boolean {
  return process.env.MOCK_AI === 'true' || process.env.NODE_ENV === 'test'
}

// The seam behind AC-08: the next n inserts reject. Only honoured under
// MOCK_AI, and kept on globalThis because `next dev` compiles route modules
// separately (the modelCalls.ts pattern).
const g = globalThis as { __analyticsFailNext?: number }
export function setFailNext(n: number): void {
  if (process.env.MOCK_AI === 'true') g.__analyticsFailNext = Math.max(0, Math.floor(n))
}

const logged = new Set<string>()
function logOnce(kind: string, name: string, reason: string): void {
  const key = `${kind}|${name}|${reason}`
  if (logged.has(key)) return
  logged.add(key)
  console.warn(`[analytics] ${kind} ${name}: ${reason}`)
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms)
  })
  // The loser of the race must never surface as an unhandled rejection.
  p.catch(() => {})
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
}

export async function count(kind: 'dropped' | 'rejected', name: string, reason: string): Promise<void> {
  const lastReason = reason.slice(0, REASON_MAX)
  logOnce(kind, name, lastReason)
  try {
    await withTimeout(
      Promise.resolve().then(() =>
        prisma.analyticsDrop.upsert({
          where: { name },
          create: {
            name,
            dropped: kind === 'dropped' ? 1 : 0,
            rejected: kind === 'rejected' ? 1 : 0,
            lastAt: new Date(),
            lastReason,
          },
          update: { [kind]: { increment: 1 }, lastAt: new Date(), lastReason },
        }),
      ),
      COUNTER_TIMEOUT_MS,
      'counter timeout',
    )
  } catch {
    // Best-effort: the log line above is all that is left.
  }
}

function summarise(issues: { path: (string | number)[]; message: string }[]): string {
  return issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ')
}

export async function track<N extends EventName>(name: N, f: TrackFields<N>): Promise<void> {
  const entry = (CATALOGUE as Record<string, (typeof CATALOGUE)[EventName] | undefined>)[name]
  let problem: string | null = null
  let payload: unknown
  if (!entry) {
    problem = 'unknown event name'
  } else if (!(entry.source as readonly string[]).includes(f.source)) {
    problem = `source ${f.source} is not allowed`
  } else if (entry.outcomes.length > 0 ? !(entry.outcomes as readonly string[]).includes(f.outcome ?? '') : f.outcome != null) {
    problem = `outcome ${String(f.outcome)} is not allowed`
  } else {
    const parsed = entry.schema.safeParse(f.payload)
    if (parsed.success) payload = parsed.data
    else problem = summarise(parsed.error.issues)
  }

  if (problem !== null || !entry) {
    const issues = problem ?? 'invalid'
    if (isTestSeam()) throw new AnalyticsSchemaError(name, issues)
    await count('rejected', name, issues)
    return
  }

  const data: Prisma.AnalyticsEventUncheckedCreateInput = {
    name,
    schemaVersion: entry.schemaVersion,
    source: f.source,
    teamId: f.teamId,
    userId: f.userId ?? null,
    draftId: f.draftId ?? null,
    durationMs: f.durationMs == null ? null : Math.max(0, Math.round(f.durationMs)),
    outcome: f.outcome ?? null,
    payload: payload as Prisma.InputJsonValue,
  }

  try {
    await withTimeout(
      Promise.resolve().then(() => {
        if (process.env.MOCK_AI === 'true' && (g.__analyticsFailNext ?? 0) > 0) {
          g.__analyticsFailNext = (g.__analyticsFailNext ?? 0) - 1
          throw new Error('analytics insert failed (test seam)')
        }
        return prisma.analyticsEvent.create({ data })
      }),
      INSERT_TIMEOUT_MS,
      'insert timeout',
    )
  } catch (e) {
    // Not awaited: the counter has its own bound, and the caller's bound (AC-02) is the insert's.
    void count('dropped', name, e instanceof Error ? e.message : 'insert failed')
  }
}
