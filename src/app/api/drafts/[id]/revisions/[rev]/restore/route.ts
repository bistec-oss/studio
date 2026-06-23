import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, forbiddenIfNotOwner, getDraftOwnerId } from '@/lib/auth'
import { renderHtmlToPng } from '@/lib/renderer/puppeteer'
import { uploadObject, resolveExportUrl, BUCKET_EXPORTS } from '@/lib/storage/minio'

export const maxDuration = 120

export async function POST(_req: NextRequest, { params }: { params: { id: string; rev: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const revisionNumber = Number(params.rev)
  if (!Number.isInteger(revisionNumber)) {
    return NextResponse.json({ error: 'Invalid revision number' }, { status: 400 })
  }

  const ownerId = await getDraftOwnerId(params.id)
  if (ownerId === null) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  const forbidden = forbiddenIfNotOwner(user, ownerId)
  if (forbidden) return forbidden

  const revision = await prisma.draftRevision.findFirst({
    where: { draftId: params.id, revisionNumber },
  })
  if (!revision) return NextResponse.json({ error: 'Revision not found' }, { status: 404 })

  const buffer = await renderHtmlToPng(revision.htmlSnapshot, 1080, 1080)
  const key = `restore-${params.id}-${Date.now()}.png`
  await uploadObject(buffer, BUCKET_EXPORTS, key, 'image/png')

  await prisma.draft.update({
    where: { id: params.id },
    data: {
      htmlContent: revision.htmlSnapshot,
      exportUrl: key,
      pendingConflict: Prisma.JsonNull,
    },
  })

  return NextResponse.json({ exportUrl: await resolveExportUrl(key) })
}
