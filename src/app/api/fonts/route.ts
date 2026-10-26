import { NextResponse } from 'next/server'
import { withTeamAuth } from '@/lib/api/handler'
import { CATALOGUE_DATE, familiesForScript, searchFamilies } from '@/lib/fonts/catalogue'
import { isOfferedScript } from '@/lib/fonts/types'

// What the font picker reads (031 FR-18): the post-font catalogue, searched on the server so the
// 480 KB snapshot never reaches the browser. Any team member. `q` is up to 60 characters;
// `script` must be an offered script (400 otherwise) and narrows the result to families that
// support it. At most 20 families.
const LIMIT = 20
const MAX_Q = 60

export const GET = withTeamAuth(async (req) => {
  const q = (req.nextUrl.searchParams.get('q') ?? '').slice(0, MAX_Q)
  const script = req.nextUrl.searchParams.get('script')

  if (script !== null && !isOfferedScript(script)) {
    return NextResponse.json({ error: `Unknown script: ${script}` }, { status: 400 })
  }

  let families = searchFamilies(q, script ? Number.MAX_SAFE_INTEGER : LIMIT)
  if (script) {
    const supported = new Set(familiesForScript(script).map((f) => f.family))
    families = families.filter((f) => supported.has(f.family)).slice(0, LIMIT)
  }
  return NextResponse.json({ snapshotDate: CATALOGUE_DATE, families })
})
