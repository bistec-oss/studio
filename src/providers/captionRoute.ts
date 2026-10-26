// The I/O half of the caption route (024 FR-03): reads Team.captionRoute and the
// team's enabled COPY rows, then asks the pure selector. It is the only reader
// of Team.captionRoute for a decision. The row select never carries
// encryptedApiKey; resolveCopyProvider reads the one chosen row's key itself,
// after the decision. Callers that only ask a question (the draft poll asks
// copyProviderIsClaude on every GET, 018 FR-04) therefore never see a key.

import { prisma } from '@/lib/prisma'
import { env } from '@/lib/env'
import { pipelineMode } from '@/lib/agent/config'
import { selectRoute, type RouteDecision } from '@/lib/models/route'

export async function loadCaptionRoute(teamId: string, briefKey?: string): Promise<RouteDecision> {
  const [team, rows] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamId }, select: { captionRoute: true } }),
    prisma.availableProvider.findMany({
      where: { slot: 'COPY', teamId, isEnabled: true },
      select: { id: true, providerKey: true, providerName: true, isDefault: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
  ])
  return selectRoute('CAPTION', {
    setting: team?.captionRoute ?? null,
    mode: pipelineMode(),
    rows,
    briefKey,
    serverAnthropicKey: Boolean(env.ANTHROPIC_API_KEY),
  })
}

/**
 * 024 FR-06: the credential tier of a caption run when the team chose the API
 * key route: 'team' whoever calls, because the team's key bills and a personal
 * Claude token does not lift the Opus gate. null = no override; the caller uses
 * its own tier.
 */
export async function captionCredentialFor(teamId: string): Promise<'team' | null> {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { captionRoute: true } })
  return team?.captionRoute === 'API_KEY' ? 'team' : null
}
