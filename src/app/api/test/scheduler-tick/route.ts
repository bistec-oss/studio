import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { runScheduledJobs } from '@/lib/scheduler/jobRunner'
import { MOCK_SOCIAL } from '@/lib/testHooks'

/**
 * Test-only seam: run a single scheduler tick on demand so the §K H12 E2E tests
 * can drive the scheduler over HTTP (the suite can't import the app module graph
 * directly — Playwright's loader won't resolve the transitive `@/` aliases).
 *
 * Dormant in production: returns 404 unless MOCK_SOCIAL is set (never set in
 * prod, same gating philosophy as the rest of src/lib/testHooks.ts), and is
 * additionally admin-gated.
 */
export async function POST() {
  // Defence-in-depth: hard 404 in production, AND only active when a MOCK flag is
  // set (never set in prod). Either guard alone is sufficient; both together mean
  // an accidental MOCK_SOCIAL in a prod build still can't expose this route.
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!MOCK_SOCIAL) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth
  await runScheduledJobs()
  return NextResponse.json({ ok: true })
}
