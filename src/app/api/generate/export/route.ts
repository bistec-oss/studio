import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, forbiddenIfNotOwner } from '@/lib/auth'
import { renderHtmlToPng } from '@/lib/renderer/puppeteer'
import { uploadObject, resolveExportUrl, BUCKET_EXPORTS } from '@/lib/storage/minio'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { draftId } = body

  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    include: { brief: { select: { userId: true } } },
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

  const buffer = await renderHtmlToPng(draft.htmlContent, 1080, 1080)
  const key = `exports/${draftId}.png`
  await uploadObject(buffer, BUCKET_EXPORTS, key, 'image/png')

  await prisma.draft.update({
    where: { id: draftId },
    data: { exportUrl: key, status: 'EXPORTED' },
  })

  return NextResponse.json({ exportUrl: await resolveExportUrl(key) })
}
