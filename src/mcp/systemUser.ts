import { prisma } from '@/lib/prisma'

const SYSTEM_EMAIL = 'mcp-agent@system.local'
let cachedId: string | null = null

// Resolves a real User id for MCP/ACP-originated rows. The tools previously used
// the literal string 'mcp-agent', which violates the Brief.userId / Post.userId
// foreign keys. Upserts a dedicated system user and caches its id.
export async function getSystemUserId(): Promise<string> {
  if (cachedId) return cachedId
  const user = await prisma.user.upsert({
    where: { email: SYSTEM_EMAIL },
    update: {},
    create: { name: 'MCP Agent', email: SYSTEM_EMAIL, role: 'EDITOR' },
  })
  cachedId = user.id
  return cachedId
}
