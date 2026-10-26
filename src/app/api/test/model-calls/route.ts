import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { clearModelCalls, readModelCalls } from '@/lib/models/modelCalls'
import { MOCK_AI } from '@/lib/testHooks'

/**
 * Test-only seam (008 FR-16): the model-call recorder's ring buffer, so the E2E
 * can assert which model each action ran. GET returns `{ calls }`, oldest first
 * (newest last); DELETE clears it.
 *
 * Dormant in production, gated like /api/test/scheduler-tick: a hard 404 when
 * NODE_ENV is production, a 404 unless MOCK_AI (never set in prod — and the
 * recorder keeps nothing without it), and admin-only.
 */
async function gate(): Promise<NextResponse | null> {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!MOCK_AI) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const auth = await requireRole('admin')
  return auth instanceof NextResponse ? auth : null
}

export async function GET() {
  const denied = await gate()
  if (denied) return denied
  return NextResponse.json({ calls: readModelCalls() })
}

export async function DELETE() {
  const denied = await gate()
  if (denied) return denied
  clearModelCalls()
  return new NextResponse(null, { status: 204 })
}
