import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { renderHtmlToPng } from '@/lib/renderer/puppeteer'
import { uploadObject, BUCKET_EXPORTS } from '@/lib/storage/minio'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { draftId } = body

  const draft = await prisma.draft.findUnique({ where: { id: draftId } })
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

  if (draft.exportUrl) {
    return NextResponse.json({ exportUrl: draft.exportUrl })
  }

  if (!draft.htmlContent) {
    return NextResponse.json({ error: 'Draft has no HTML content to export' }, { status: 422 })
  }

  const buffer = await renderHtmlToPng(draft.htmlContent, 1080, 1080)
  const exportUrl = await uploadObject(buffer, BUCKET_EXPORTS, `exports/${draftId}.png`, 'image/png')

  await prisma.draft.update({
    where: { id: draftId },
    data: { exportUrl, status: 'EXPORTED' },
  })

  return NextResponse.json({ exportUrl })
}
