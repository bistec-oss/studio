import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { forbiddenIfNotOwner } from '@/lib/auth'
import { withAuth, parseBody } from '@/lib/api/handler'
import { renderHtmlToPng } from '@/lib/renderer/puppeteer'
import { uploadObject, resolveExportUrl, exportKey, BUCKET_EXPORTS } from '@/lib/storage/minio'
import { dimensionsFor } from '@/lib/aspectRatio'

const bodySchema = z.object({ draftId: z.string() })

export const POST = withAuth(async (req: NextRequest, _ctx, user) => {
  const body = await parseBody(req, bodySchema)
  if (body.response) return body.response
  const { draftId } = body.data

  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    include: { brief: { select: { userId: true, aspectRatio: true } } },
  })
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  const forbidden = forbiddenIfNotOwner(user, draft.brief.userId)
  if (forbidden) return forbidden

  if (draft.exportUrl) {
    // Stored value is an object key — sign it for read.
    return NextResponse.json({ exportUrl: await resolveExportUrl(draft.exportUrl) })
  }

  if (!draft.htmlContent) {
    return NextResponse.json({ error: 'Draft has no HTML content to export' }, { status: 422 })
  }

  const { width, height } = dimensionsFor(draft.brief.aspectRatio)
  const buffer = await renderHtmlToPng(draft.htmlContent, width, height)
  const key = exportKey('export', draftId)
  await uploadObject(buffer, BUCKET_EXPORTS, key, 'image/png')

  await prisma.draft.update({
    where: { id: draftId },
    data: { exportUrl: key, status: 'EXPORTED' },
  })

  return NextResponse.json({ exportUrl: await resolveExportUrl(key) })
})
