import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getDraftAccessInfo } from '@/lib/auth'
import { withTeamAuth } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { resolveExportUrl } from '@/lib/storage/minio'

type Params = { id: string }

export const GET = withTeamAuth<Params>(async (_req, { params }, user) => {
  const info = await getDraftAccessInfo(params.id)
  if (!info || !canAccessContent(user, info)) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  const revisions = await prisma.draftRevision.findMany({
    where: { draftId: params.id },
    orderBy: { revisionNumber: 'desc' },
    select: {
      id: true,
      revisionNumber: true,
      instruction: true,
      exportUrl: true,
      createdAt: true,
    },
  })

  // exportUrl is stored as an EXPORTS object key — sign each for the browser.
  const signed = await Promise.all(
    revisions.map(async (r) => ({ ...r, exportUrl: await resolveExportUrl(r.exportUrl) }))
  )

  return NextResponse.json(signed)
})
