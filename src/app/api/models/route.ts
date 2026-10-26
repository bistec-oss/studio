import { NextResponse } from 'next/server'
import { withTeamAuth } from '@/lib/api/handler'
import { loadModelsView } from '@/lib/models/policy'

// What every model picker reads (008 FR-13): the catalogue without prices or
// API IDs, the active team's policy, and the caller's mode, credential tier and
// system default — exactly the inputs of the client-side decideModel. Any team
// member; the team comes from the session.

export const GET = withTeamAuth(async (_req, _ctx, user) => {
  return NextResponse.json(await loadModelsView({ userId: user.userId, teamId: user.teamId }))
})
