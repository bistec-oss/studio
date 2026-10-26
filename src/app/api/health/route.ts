import { NextResponse } from 'next/server'
import { env } from '@/lib/env'

// Public, unauthenticated version endpoint (FR-P0-4). Reports the commit the
// image was built from: whoever builds it passes --build-arg GIT_SHA=<sha>
// (e.g. a future deploy workflow); without it, commit is "unknown".
// Deliberately exposes nothing else: no env, no DB
// detail — a commit SHA of a public repo isn't sensitive, those would be.
// Do NOT wrap this route in withAuth/withTeamAuth, and keep the response
// body to exactly these two keys.
//
// force-dynamic: with no request/cookie/header read, Next would otherwise be
// free to statically render this route at build time — baking in whatever
// GIT_SHA is (or isn't) set during `next build`, not the value the running
// container's ENV carries. This route must read env.GIT_SHA per request.
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ ok: true, commit: env.GIT_SHA || 'unknown' })
}
