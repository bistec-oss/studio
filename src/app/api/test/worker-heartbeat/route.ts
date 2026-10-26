import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { MOCK_AI } from '@/lib/testHooks'

/**
 * Test-only seam: seed or clear the scheduler worker's heartbeat rows (023).
 * No worker runs in E2E, and the tick seams call the runners directly, so they
 * write no heartbeat. Dormant in production: hard 404 in prod builds, 404 unless
 * MOCK_AI is set, and admin-gated on top.
 */
const bodySchema = z.union([
  z.object({ clear: z.literal(true) }),
  z.object({
    loop: z.enum(['scheduler', 'generation']),
    startedAgoMs: z.number().finite(),
    endedAgoMs: z.number().finite().nullable(),
  }),
])

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!MOCK_AI) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const body = parsed.data
  if ('clear' in body) {
    await prisma.workerHeartbeat.deleteMany({})
    return NextResponse.json({ ok: true })
  }
  const now = Date.now()
  const lastTickStartedAt = new Date(now - body.startedAgoMs)
  const lastTickEndedAt = body.endedAgoMs === null ? null : new Date(now - body.endedAgoMs)
  await prisma.workerHeartbeat.upsert({
    where: { loop: body.loop },
    create: { loop: body.loop, lastTickStartedAt, lastTickEndedAt },
    update: { lastTickStartedAt, lastTickEndedAt },
  })
  return NextResponse.json({ ok: true })
}
