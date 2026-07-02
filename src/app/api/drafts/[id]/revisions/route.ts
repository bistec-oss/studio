import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { forbiddenIfNotOwner, getDraftOwnerId } from '@/lib/auth'
import { withAuth } from '@/lib/api/handler'
import { resolveExportUrl } from '@/lib/storage/minio'

type Params = { id: string }

export const GET = withAuth<Params>(async (_req, { params }, user) => {
  const ownerId = await getDraftOwnerId(params.id)
  if (ownerId === null) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  const forbidden = forbiddenIfNotOwner(user, ownerId)
  if (forbidden) return forbidden

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
