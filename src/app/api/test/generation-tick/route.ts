import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { runGenerationJobs } from '@/lib/scheduler/generationRunner'
import { MOCK_AI } from '@/lib/testHooks'

/**
 * Test-only seam: run a single generation-scheduler tick on demand so the
 * scheduled-generation E2E tests can drive the queue over HTTP (mirrors
 * /api/test/scheduler-tick, gated on MOCK_AI because the tick generates).
 *
 * Dormant in production: hard 404 in prod builds, 404 unless MOCK_AI is set,
 * and admin-gated on top.
 */
export async function POST() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!MOCK_AI) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth
  await runGenerationJobs()
  return NextResponse.json({ ok: true })
}
