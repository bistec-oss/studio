import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin } from '@/lib/api/handler'

// Revocation is a soft delete (revokedAt set) — resolveApiKey requires
// revokedAt: null, so a revoked row simply stops authenticating; the row
// itself is kept for audit purposes. Idempotent: revoking an already-revoked
// key is a no-op 204, not an error.
export const DELETE = withTeamAdmin<{ id: string }>(async (_req, { params }, user) => {
  const existing = await prisma.apiKey.findUnique({
    where: { id: params.id },
    select: { teamId: true, revokedAt: true },
  })
  if (!existing || existing.teamId !== user.teamId) {
    return NextResponse.json({ error: 'API key not found' }, { status: 404 })
  }

  if (!existing.revokedAt) {
    await prisma.apiKey.update({ where: { id: params.id }, data: { revokedAt: new Date() } })
  }

  return new NextResponse(null, { status: 204 })
})
