import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { forbiddenIfNotOwner, getDraftOwnerId } from '@/lib/auth'
import { withAuth } from '@/lib/api/handler'
import { renderHtmlToPng } from '@/lib/renderer/puppeteer'
import { uploadObject, resolveExportUrl, exportKey, BUCKET_EXPORTS } from '@/lib/storage/minio'
import { dimensionsFor } from '@/lib/aspectRatio'

export const maxDuration = 120

type Params = { id: string; rev: string }

export const POST = withAuth<Params>(async (_req, { params }, user) => {
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

  // Switching versions just moves the pointer and reuses the revision's ALREADY
  // rendered PNG — no Puppeteer, so switching is instant. Every revision stores
  // its exportUrl (EXPORTS object key) at creation; only legacy rows that lack
  // one fall back to a re-render.
  let key = revision.exportUrl
  if (!key) {
    const draft = await prisma.draft.findUnique({
      where: { id: params.id },
      select: { brief: { select: { aspectRatio: true } } },
    })
    const { width, height } = dimensionsFor(draft?.brief.aspectRatio)
    const buffer = await renderHtmlToPng(revision.htmlSnapshot, width, height)
    key = exportKey('restore', params.id)
    await uploadObject(buffer, BUCKET_EXPORTS, key, 'image/png')
  }

  await prisma.draft.update({
    where: { id: params.id },
    data: {
      htmlContent: revision.htmlSnapshot,
      exportUrl: key,
      // Move the "current version" pointer — this is what makes reverting
      // reversible: you can jump forward again to any other revision.
      currentRevisionNumber: revisionNumber,
      pendingConflict: Prisma.JsonNull,
    },
  })

  return NextResponse.json({ exportUrl: await resolveExportUrl(key) })
})
