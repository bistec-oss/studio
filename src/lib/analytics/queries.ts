// Every insights read (006 FR-10, NFR-08): the read seam. The insights API calls
// `insights()` and nothing else reads AnalyticsEvent. Adopting an external
// analytics backend later means replacing or dual-feeding THIS module; the write
// wrapper (`track`) alone is not enough.
//
// Tagged-template $queryRaw only: every value is a bound parameter, no SQL string
// is ever built. SQL aggregates (counts, percentiles); the pure helpers below
// shape the rows into rates and the response, and are unit-tested without a DB.
//
// Definitions (spec FR-05, FR-10, AC-12):
//   applied rate   = ok / (ok + not-applied) over settled REFINE actions; a
//                    conflict or a crash is counted beside it, not in it.
//   per class      = a refine counts once for each instruction class it carries
//                    (the union of `classes` over its attempts).
//   failure rate   = failed / total over generation.finished and
//                    draft_action.settled (not-applied and conflict are not failures).
//   funnel         = wizard.step events per step (each visit reports a step once),
//                    brief.submitted (fresh and resumed apart: a resumed visit has
//                    no step 0), and brief.abandoned by reason. "Of start" is a
//                    step's count over step 0's.
//   durations      = successful (`ok`) events only, p50 and p90 by surface.
import { prisma } from '@/lib/prisma'
import { OFFLINE_THRESHOLD_MS } from '@/lib/scheduler/heartbeatStatus'
import { getStyle, POST_STYLE_KEYS } from '@/lib/postStyles'

export const RANGES = ['7d', '30d', '90d'] as const
export type InsightsRange = (typeof RANGES)[number]
export const DEFAULT_RANGE: InsightsRange = '30d'
const DAY_MS = 86_400_000

export interface DateRange {
  from: Date
  to: Date
}

export function rangeFor(range: InsightsRange, now: Date = new Date()): DateRange {
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30
  return { from: new Date(now.getTime() - days * DAY_MS), to: now }
}

// ── Pure shaping helpers ───────────────────────────────────────────────────

/** part / whole as a 0..1 ratio, or null when there is nothing to divide by. */
export function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null
}

export interface RefineWeekRow {
  week: string
  verifierModelId: string | null
  verifierPromptVersion: string | null
  ok: number
  notApplied: number
  conflict: number
  failed: number
}
export interface RefineClassRow {
  class: string
  ok: number
  notApplied: number
}

export function appliedRate(r: { ok: number; notApplied: number }): number | null {
  return ratio(r.ok, r.ok + r.notApplied)
}

export function shapeRefine(
  weeks: RefineWeekRow[],
  classes: RefineClassRow[],
  revisionCounts: { name: string; n: number }[],
) {
  const total = weeks.reduce(
    (a, w) => ({
      ok: a.ok + w.ok,
      notApplied: a.notApplied + w.notApplied,
      conflict: a.conflict + w.conflict,
      failed: a.failed + w.failed,
    }),
    { ok: 0, notApplied: 0, conflict: 0, failed: 0 },
  )
  const count = (name: string) => revisionCounts.find((c) => c.name === name)?.n ?? 0
  return {
    overall: { ...total, appliedRate: appliedRate(total) },
    byWeek: weeks.map((w) => ({ ...w, appliedRate: appliedRate(w) })),
    byClass: classes.map((c) => ({ ...c, appliedRate: appliedRate(c) })),
    revisions: {
      override: count('revision.override'),
      adopted: count('revision.adopted'),
      restored: count('revision.restored'),
      edited: count('revision.edited'),
    },
  }
}

export interface TotalFailedRow {
  total: number
  failed: number
}

export function withFailureRate<T extends TotalFailedRow>(rows: T[]): (T & { failureRate: number | null })[] {
  return rows.map((r) => ({ ...r, failureRate: ratio(r.failed, r.total) }))
}

export interface StyleRow {
  style: string
  generations: number
  okGenerations: number
  applied: number
  failed: number
  meanRefines: number | null
}
export interface FallbackRow {
  style: string
  reason: string
  n: number
}

export function shapeStyles(rows: StyleRow[], fallbacks: FallbackRow[]) {
  return rows.map((r) => ({
    ...r,
    appliedRate: ratio(r.applied, r.okGenerations),
    fallbacks: fallbacks.filter((f) => f.style === r.style).map((f) => ({ reason: f.reason, n: f.n })),
  }))
}

export interface PostStyleRow {
  style: string
  chosen: number
  generations: number
  flagged: number
  held: number
}

/**
 * One row per dataset style (retired included), zeros for a style no event
 * names. flagRate = flagged / generations (027 FR-14).
 */
export function shapePostStyles(rows: PostStyleRow[]) {
  return POST_STYLE_KEYS.map((key) => {
    const r = rows.find((x) => x.style === key)
    const generations = r?.generations ?? 0
    const flagged = r?.flagged ?? 0
    return {
      style: key as string,
      label: getStyle(key)?.label ?? key,
      chosen: r?.chosen ?? 0,
      generations,
      flagged,
      flagRate: ratio(flagged, generations),
      held: r?.held ?? 0,
    }
  })
}

export const WIZARD_STEPS = [0, 1, 2, 3, 4] as const

export function shapeFunnel(
  stepRows: { step: number; n: number }[],
  submittedRows: { resumed: boolean; n: number }[],
  abandonedRows: { reason: string; n: number }[],
) {
  const at = (step: number) => stepRows.find((r) => r.step === step)?.n ?? 0
  const start = at(0)
  const reasonCount = (reason: string) => abandonedRows.find((r) => r.reason === reason)?.n ?? 0
  const submitted = (resumed: boolean) => submittedRows.find((r) => r.resumed === resumed)?.n ?? 0
  return {
    reached: WIZARD_STEPS.map((step) => ({ step, n: at(step), ofStart: ratio(at(step), start) })),
    // A resumed visit sends no step 0, so only fresh submissions are rated against it.
    submitted: { n: submitted(false), ofStart: ratio(submitted(false), start) },
    submittedResumed: { n: submitted(true) },
    abandoned: { expired: reasonCount('expired'), discarded: reasonCount('discarded') },
  }
}

export type RetentionLoopState = 'online' | 'stale' | 'never'

/** The retention loop's state from its heartbeat row (same three-missed-polls rule as 023). */
export function retentionLoopState(
  now: Date,
  row: { lastTickStartedAt: Date; lastTickEndedAt: Date | null } | null,
): { state: RetentionLoopState; lastTickAt: Date | null } {
  if (!row) return { state: 'never', lastTickAt: null }
  const last = new Date(Math.max(row.lastTickStartedAt.getTime(), row.lastTickEndedAt?.getTime() ?? 0))
  return { state: now.getTime() - last.getTime() <= OFFLINE_THRESHOLD_MS ? 'online' : 'stale', lastTickAt: last }
}

export function ageDays(now: Date, oldest: Date | null): number | null {
  return oldest ? Math.floor((now.getTime() - oldest.getTime()) / DAY_MS) : null
}

// ── Section queries ────────────────────────────────────────────────────────

async function refine({ from, to }: DateRange) {
  const [weeks, classes, revisionCounts] = await Promise.all([
    prisma.$queryRaw<RefineWeekRow[]>`
      SELECT to_char(date_trunc('week', "at" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS week,
             payload->>'verifierModelId' AS "verifierModelId",
             payload->>'verifierPromptVersion' AS "verifierPromptVersion",
             (count(*) FILTER (WHERE outcome = 'ok'))::int AS ok,
             (count(*) FILTER (WHERE outcome = 'not-applied'))::int AS "notApplied",
             (count(*) FILTER (WHERE outcome = 'conflict'))::int AS conflict,
             (count(*) FILTER (WHERE outcome = 'failed'))::int AS failed
      FROM "AnalyticsEvent"
      WHERE name = 'draft_action.settled' AND payload->>'action' = 'REFINE'
        AND "at" >= ${from} AND "at" < ${to}
      GROUP BY 1, 2, 3
      ORDER BY 1, 2, 3`,
    prisma.$queryRaw<RefineClassRow[]>`
      SELECT c.class AS class,
             (count(*) FILTER (WHERE c.outcome = 'ok'))::int AS ok,
             (count(*) FILTER (WHERE c.outcome = 'not-applied'))::int AS "notApplied"
      FROM (
        SELECT DISTINCT e.id, e.outcome, cls.class
        FROM "AnalyticsEvent" e
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e.payload->'attempts', '[]'::jsonb)) AS a(attempt)
        CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(a.attempt->'classes', '[]'::jsonb)) AS cls(class)
        WHERE e.name = 'draft_action.settled' AND e.payload->>'action' = 'REFINE'
          AND e.outcome IN ('ok', 'not-applied')
          AND e."at" >= ${from} AND e."at" < ${to}
      ) c
      GROUP BY c.class
      ORDER BY c.class`,
    prisma.$queryRaw<{ name: string; n: number }[]>`
      SELECT name, count(*)::int AS n
      FROM "AnalyticsEvent"
      WHERE name IN ('revision.override', 'revision.adopted', 'revision.restored', 'revision.edited')
        AND "at" >= ${from} AND "at" < ${to}
      GROUP BY name`,
  ])
  return shapeRefine(weeks, classes, revisionCounts)
}

async function failures({ from, to }: DateRange) {
  const [daily, byPromptVersion, byDesignModel, topReasons, swept] = await Promise.all([
    prisma.$queryRaw<(TotalFailedRow & { day: string; name: string })[]>`
      SELECT to_char(date_trunc('day', "at" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, name,
             count(*)::int AS total,
             (count(*) FILTER (WHERE outcome = 'failed'))::int AS failed
      FROM "AnalyticsEvent"
      WHERE name IN ('generation.finished', 'draft_action.settled')
        AND "at" >= ${from} AND "at" < ${to}
      GROUP BY 1, 2
      ORDER BY 1, 2`,
    prisma.$queryRaw<(TotalFailedRow & { promptVersion: string | null })[]>`
      SELECT payload->>'promptVersion' AS "promptVersion",
             count(*)::int AS total,
             (count(*) FILTER (WHERE outcome = 'failed'))::int AS failed
      FROM "AnalyticsEvent"
      WHERE name = 'generation.finished' AND "at" >= ${from} AND "at" < ${to}
      GROUP BY 1
      ORDER BY 1`,
    prisma.$queryRaw<(TotalFailedRow & { model: string | null })[]>`
      SELECT payload->'designModel'->>'model' AS model,
             count(*)::int AS total,
             (count(*) FILTER (WHERE outcome = 'failed'))::int AS failed
      FROM "AnalyticsEvent"
      WHERE name = 'generation.finished' AND "at" >= ${from} AND "at" < ${to}
      GROUP BY 1
      ORDER BY 1`,
    prisma.$queryRaw<{ reason: string; n: number }[]>`
      SELECT left(payload->>'failureReason', 200) AS reason, count(*)::int AS n
      FROM "AnalyticsEvent"
      WHERE name IN ('generation.finished', 'draft_action.settled') AND outcome = 'failed'
        AND payload->>'failureReason' IS NOT NULL
        AND "at" >= ${from} AND "at" < ${to}
      GROUP BY 1
      ORDER BY n DESC, reason
      LIMIT 10`,
    prisma.$queryRaw<{ name: string; n: number }[]>`
      SELECT name, count(*)::int AS n
      FROM "AnalyticsEvent"
      WHERE name IN ('generation.swept', 'draft_action.swept')
        AND "at" >= ${from} AND "at" < ${to}
      GROUP BY name`,
  ])
  const sweptCount = (name: string) => swept.find((s) => s.name === name)?.n ?? 0
  return {
    daily: withFailureRate(daily).map((d) => ({
      day: d.day,
      kind: d.name === 'generation.finished' ? ('generation' as const) : ('action' as const),
      total: d.total,
      failed: d.failed,
      failureRate: d.failureRate,
    })),
    byPromptVersion: withFailureRate(byPromptVersion),
    byDesignModel: withFailureRate(byDesignModel),
    topReasons,
    swept: { generation: sweptCount('generation.swept'), action: sweptCount('draft_action.swept') },
  }
}

async function imageStyles({ from, to }: DateRange) {
  const [rows, fallbacks] = await Promise.all([
    prisma.$queryRaw<StyleRow[]>`
      SELECT COALESCE(g.payload->>'requestedArchetype', 'classic') AS style,
             count(*)::int AS generations,
             (count(*) FILTER (WHERE g.outcome = 'ok'))::int AS "okGenerations",
             (count(*) FILTER (WHERE g.outcome = 'ok' AND (
                COALESCE(g.payload->>'requestedArchetype', 'classic') = 'classic'
                OR g.payload->>'appliedArchetype' = g.payload->>'requestedArchetype')))::int AS applied,
             (count(*) FILTER (WHERE g.outcome = 'failed'))::int AS failed,
             (avg(r.n) FILTER (WHERE g.outcome = 'ok' AND g."draftId" IS NOT NULL))::float8 AS "meanRefines"
      FROM "AnalyticsEvent" g
      LEFT JOIN LATERAL (
        SELECT count(*) AS n FROM "AnalyticsEvent" x
        WHERE x.name = 'draft_action.settled' AND x.payload->>'action' = 'REFINE'
          AND g."draftId" IS NOT NULL AND x."draftId" = g."draftId"
      ) r ON true
      WHERE g.name = 'generation.finished' AND g."at" >= ${from} AND g."at" < ${to}
      GROUP BY 1
      ORDER BY 1`,
    prisma.$queryRaw<FallbackRow[]>`
      SELECT COALESCE(payload->>'requestedArchetype', 'classic') AS style,
             payload->>'fallbackReason' AS reason, count(*)::int AS n
      FROM "AnalyticsEvent"
      WHERE name = 'generation.finished' AND payload->>'fallbackReason' IS NOT NULL
        AND "at" >= ${from} AND "at" < ${to}
      GROUP BY 1, 2
      ORDER BY 1, n DESC, 2`,
  ])
  return shapeStyles(rows, fallbacks)
}

async function postStyles({ from, to }: DateRange) {
  const rows = await prisma.$queryRaw<PostStyleRow[]>`
    SELECT payload->>'postStyle' AS style,
           (count(*) FILTER (WHERE name = 'brief.submitted'))::int AS chosen,
           (count(*) FILTER (WHERE name = 'generation.finished'))::int AS generations,
           (count(*) FILTER (WHERE name = 'generation.finished' AND payload->>'factsStatus' = 'flagged'))::int AS flagged,
           (count(*) FILTER (WHERE name = 'scheduled_generation.settled' AND payload->>'held' = 'true'))::int AS held
    FROM "AnalyticsEvent"
    WHERE name IN ('brief.submitted', 'generation.finished', 'scheduled_generation.settled')
      AND payload->>'postStyle' IS NOT NULL
      AND "at" >= ${from} AND "at" < ${to}
    GROUP BY 1`
  return shapePostStyles(rows)
}

export interface DurationRow {
  surface: string
  model: string | null
  route: string | null
  n: number
  p50: number
  p90: number
  /** Totals over events that reported tokens only (006 FR-09). */
  inputTokens: number
  outputTokens: number
  /** Events of this row with no usage reported (CLI runs). */
  notReported: number
}

async function durations({ from, to }: DateRange) {
  return prisma.$queryRaw<DurationRow[]>`
    SELECT 'generation' AS surface,
           payload->'designModel'->>'model' AS model,
           payload->>'captionRoute' AS route,
           count(*)::int AS n,
           (percentile_cont(0.5) WITHIN GROUP (ORDER BY "durationMs"))::float8 AS p50,
           (percentile_cont(0.9) WITHIN GROUP (ORDER BY "durationMs"))::float8 AS p90,
           COALESCE(sum((payload->>'inputTokens')::bigint), 0)::float8 AS "inputTokens",
           COALESCE(sum((payload->>'outputTokens')::bigint), 0)::float8 AS "outputTokens",
           (count(*) FILTER (WHERE payload->>'inputTokens' IS NULL))::int AS "notReported"
    FROM "AnalyticsEvent"
    WHERE name = 'generation.finished' AND outcome = 'ok' AND "durationMs" IS NOT NULL
      AND "at" >= ${from} AND "at" < ${to}
    GROUP BY 2, 3
    UNION ALL
    SELECT payload->>'action' AS surface,
           payload->'model'->>'model' AS model,
           NULL::text AS route,
           count(*)::int AS n,
           (percentile_cont(0.5) WITHIN GROUP (ORDER BY "durationMs"))::float8 AS p50,
           (percentile_cont(0.9) WITHIN GROUP (ORDER BY "durationMs"))::float8 AS p90,
           COALESCE(sum((payload->>'inputTokens')::bigint), 0)::float8 AS "inputTokens",
           COALESCE(sum((payload->>'outputTokens')::bigint), 0)::float8 AS "outputTokens",
           (count(*) FILTER (WHERE payload->>'inputTokens' IS NULL))::int AS "notReported"
    FROM "AnalyticsEvent"
    WHERE name = 'draft_action.settled' AND outcome = 'ok' AND "durationMs" IS NOT NULL
      AND "at" >= ${from} AND "at" < ${to}
    GROUP BY 1, 2
    ORDER BY 1, 2, 3`
}

async function funnel({ from, to }: DateRange) {
  const [stepRows, submittedRows, abandonedRows] = await Promise.all([
    prisma.$queryRaw<{ step: number; n: number }[]>`
      SELECT (payload->>'step')::int AS step, count(*)::int AS n
      FROM "AnalyticsEvent"
      WHERE name = 'wizard.step' AND "at" >= ${from} AND "at" < ${to}
      GROUP BY 1
      ORDER BY 1`,
    prisma.$queryRaw<{ resumed: boolean; n: number }[]>`
      SELECT COALESCE((payload->>'resumed')::boolean, false) AS resumed, count(*)::int AS n
      FROM "AnalyticsEvent"
      WHERE name = 'brief.submitted' AND "at" >= ${from} AND "at" < ${to}
      GROUP BY 1`,
    prisma.$queryRaw<{ reason: string; n: number }[]>`
      SELECT payload->>'reason' AS reason, count(*)::int AS n
      FROM "AnalyticsEvent"
      WHERE name = 'brief.abandoned' AND "at" >= ${from} AND "at" < ${to}
      GROUP BY 1`,
  ])
  return shapeFunnel(stepRows, submittedRows, abandonedRows)
}

async function teamActivity({ from, to }: DateRange) {
  return prisma.$queryRaw<{ teamId: string; teamName: string | null; events: number; generations: number }[]>`
    SELECT e."teamId" AS "teamId", t.name AS "teamName",
           count(*)::int AS events,
           (count(*) FILTER (WHERE e.name = 'generation.finished'))::int AS generations
    FROM "AnalyticsEvent" e
    LEFT JOIN "Team" t ON t.id = e."teamId"
    WHERE e."at" >= ${from} AND e."at" < ${to}
    GROUP BY e."teamId", t.name
    ORDER BY events DESC, e."teamId"`
}

async function lostEvents() {
  const rows = await prisma.analyticsDrop.findMany({ orderBy: { name: 'asc' } })
  return rows.map((r) => ({
    name: r.name,
    dropped: r.dropped,
    rejected: r.rejected,
    lastAt: r.lastAt.toISOString(),
    lastReason: r.lastReason,
  }))
}

async function retentionHealth(now: Date) {
  const [[agg], beat] = await Promise.all([
    prisma.$queryRaw<{ oldest: Date | null; total: number }[]>`
      SELECT min("at") AS oldest, count(*)::int AS total FROM "AnalyticsEvent"`,
    prisma.workerHeartbeat.findUnique({ where: { loop: 'retention' } }),
  ])
  const loop = retentionLoopState(now, beat)
  return {
    totalEvents: agg?.total ?? 0,
    oldestAt: agg?.oldest ? agg.oldest.toISOString() : null,
    oldestAgeDays: ageDays(now, agg?.oldest ?? null),
    loop: { state: loop.state, lastTickAt: loop.lastTickAt ? loop.lastTickAt.toISOString() : null },
  }
}

// ── The one entry point ────────────────────────────────────────────────────

export async function insights(range: InsightsRange, now: Date = new Date()) {
  const window = rangeFor(range, now)
  const [refineSection, failureSection, styles, postStyleRows, durationRows, funnelSection, teams, lost, retention] = await Promise.all([
    refine(window),
    failures(window),
    imageStyles(window),
    postStyles(window),
    durations(window),
    funnel(window),
    teamActivity(window),
    lostEvents(),
    retentionHealth(now),
  ])
  return {
    range,
    from: window.from.toISOString(),
    to: window.to.toISOString(),
    refine: refineSection,
    failures: failureSection,
    styles,
    postStyles: postStyleRows,
    durations: durationRows,
    funnel: funnelSection,
    teams,
    lost,
    retention,
  }
}

export type Insights = Awaited<ReturnType<typeof insights>>
