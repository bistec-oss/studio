import { prisma } from '@/lib/prisma'

const SYSTEM_EMAIL = 'mcp-agent@system.local'
let cachedId: string | null = null

// Resolves a real User id for MCP/ACP-originated rows. The tools previously used
// the literal string 'mcp-agent', which violates the Brief.userId / Post.userId
// foreign keys. Upserts a dedicated system user and caches its id.
//
// Task 13: an MCP/ACP call now acts on behalf of a specific team (the calling
// ApiKey's team), and team-scoped visibility (canAccessContent /
// briefVisibilityWhere etc.) reads TeamMembership, not just Brief/Draft.teamId
// — so the system user also needs a membership row in every team it has ever
// been called for, or its own rows would be invisible to that team's members.
// The membership upsert is idempotent (@@unique([teamId, userId])), so this is
// safe to call on every generate/publish invocation.
export async function getSystemUserId(teamId: string): Promise<string> {
  if (!cachedId) {
    const user = await prisma.user.upsert({
      where: { email: SYSTEM_EMAIL },
      update: {},
      create: { name: 'MCP Agent', email: SYSTEM_EMAIL, role: 'EDITOR' },
    })
    cachedId = user.id
  }

  await prisma.teamMembership.upsert({
    where: { teamId_userId: { teamId, userId: cachedId } },
    update: {},
    create: { teamId, userId: cachedId, role: 'EDITOR' },
  })

  return cachedId
}
