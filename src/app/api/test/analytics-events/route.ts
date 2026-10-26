import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { MOCK_AI } from '@/lib/testHooks'
import { setFailNext } from '@/lib/analytics/track'
import { sweepAnalytics } from '@/lib/analytics/retention'

/**
 * Test-only seam (006 design "Test seam"): the analytics event store, so the
 * E2E can assert what each action emitted and seed history for the insights
 * page.
 *
 *   GET     ?name=&teamId=&draftId=&outcome=&limit=   → { events, drops }, oldest first
 *   DELETE                                            → clears events and the drop counters
 *   POST { seed: [ { name, source, teamId, at, … } ] } → inserts rows verbatim (explicit `at`)
 *   POST { failNext: n }                              → the next n track() inserts reject (AC-08)
 *   POST { sweep: true }                              → runs the retention sweep once 
 *
 * Dormant in production, gated like /api/test/model-calls: a hard 404 when
 * NODE_ENV is production, a 404 unless MOCK_AI (never set in prod), and
 * admin-only.
 */
async function gate(): Promise<NextResponse | null> {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!MOCK_AI) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const auth = await requireRole('admin')
  return auth instanceof NextResponse ? auth : null
}

export async function GET(req: NextRequest) {
  const denied = await gate()
  if (denied) return denied
  const q = req.nextUrl.searchParams
  const where: Prisma.AnalyticsEventWhereInput = {}
  for (const key of ['name', 'teamId', 'draftId', 'outcome'] as const) {
    const v = q.get(key)
    if (v) where[key] = v
  }
  const limit = Math.min(1000, Math.max(1, Number(q.get('limit')) || 500))
  const [events, drops] = await Promise.all([
    prisma.analyticsEvent.findMany({ where, orderBy: [{ at: 'asc' }, { id: 'asc' }], take: limit }),
    prisma.analyticsDrop.findMany({ orderBy: { name: 'asc' } }),
  ])
  return NextResponse.json({ events, drops })
}

export async function DELETE() {
  const denied = await gate()
  if (denied) return denied
  await prisma.$transaction([prisma.analyticsEvent.deleteMany({}), prisma.analyticsDrop.deleteMany({})])
  setFailNext(0)
  return new NextResponse(null, { status: 204 })
}

const seedRow = z.object({
  name: z.string().min(1),
  schemaVersion: z.number().int().min(1).default(1),
  source: z.enum(['web', 'scheduler', 'mcp']),
  teamId: z.string().min(1),
  userId: z.string().nullish(),
  draftId: z.string().nullish(),
  durationMs: z.number().int().min(0).nullish(),
  outcome: z.string().nullish(),
  payload: z.record(z.unknown()).default({}),
  at: z.string().datetime(),
})

const body = z.union([
  z.object({ seed: z.array(seedRow).max(10_000) }),
  z.object({ failNext: z.number().int().min(0).max(100) }),
  z.object({ sweep: z.literal(true) }),
])

export async function POST(req: NextRequest) {
  const denied = await gate()
  if (denied) return denied
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = body.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  const data = parsed.data

  if ('seed' in data) {
    const { count } = await prisma.analyticsEvent.createMany({
      data: data.seed.map((r) => ({
        name: r.name,
        schemaVersion: r.schemaVersion,
        source: r.source,
        teamId: r.teamId,
        userId: r.userId ?? null,
        draftId: r.draftId ?? null,
        durationMs: r.durationMs ?? null,
        outcome: r.outcome ?? null,
        payload: r.payload as Prisma.InputJsonValue,
        at: new Date(r.at),
      })),
    })
    return NextResponse.json({ seeded: count })
  }
  if ('failNext' in data) {
    setFailNext(data.failNext)
    return NextResponse.json({ failNext: data.failNext })
  }
  // { sweep: true }: one retention tick, exactly what the worker loop runs.
  return NextResponse.json({ deleted: await sweepAnalytics() })
}
