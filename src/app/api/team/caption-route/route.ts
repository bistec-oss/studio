import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withTeamAdmin, withTeamAuth, parseBody } from '@/lib/api/handler'
import { prisma } from '@/lib/prisma'
import { pipelineMode } from '@/lib/agent/config'
import { loadCaptionRoute } from '@/providers/captionRoute'
import type { CaptionRouteState } from '@/lib/api-types'

// The team's caption credential route (024 FR-08): which credential captions
// run on, and whether that route can run now. Any member may read it (the
// brief wizard gates on it); only a team admin may change it. teamId comes only
// from the session, never from the body or the URL. No key, prefix or
// ciphertext is in the response: the loader's row select never carries one.

const NO_STORE = { 'Cache-Control': 'no-store' }

// The setting comes from the same loader read as the decision, so a concurrent
// PUT can never make `state` disagree with the evaluated route. A chosen
// decision's route is always the setting (CLI or API_KEY).
async function stateFor(teamId: string): Promise<CaptionRouteState> {
  const decision = await loadCaptionRoute(teamId)
  const ok = decision.ok
  const setting = decision.chosen ? (decision.route as CaptionRouteState['setting']) : null
  return {
    setting,
    state: setting === null ? 'unset' : ok ? 'ready' : 'not-ready',
    effective: ok ? decision.route : null,
    servingProviderId: ok ? (decision.row?.id ?? null) : null,
    message: ok ? null : decision.message,
    mode: pipelineMode(),
  }
}

export const GET = withTeamAuth(async (_req, _ctx, user) => {
  return NextResponse.json(await stateFor(user.teamId), { headers: NO_STORE })
})

// Closed vocabulary; null clears the choice back to "never chosen".
const putSchema = z.object({ route: z.enum(['CLI', 'API_KEY']).nullable() }).strict()

// API_KEY with no key registered and CLI in an API-mode server are both
// accepted: an admin may register the key next, and the state line says what
// is missing.
export const PUT = withTeamAdmin(async (req: NextRequest, _ctx, user) => {
  const body = await parseBody(req, putSchema)
  if (body.response) return body.response

  await prisma.team.update({
    where: { id: user.teamId },
    data: { captionRoute: body.data.route },
    select: { captionRoute: true },
  })
  return NextResponse.json(await stateFor(user.teamId), { headers: NO_STORE })
})
