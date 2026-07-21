import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin } from '@/lib/api/handler'
import { BUCKET_DOCS, deleteObject } from '@/lib/storage/minio'

type Params = { id: string; docId: string }

export const DELETE = withTeamAdmin<Params>(async (_req, { params }, user) => {
  const kit = await prisma.brandKit.findFirst({
    where: { id: params.id, isDeleted: false },
    select: { id: true, teamId: true },
  })
  if (!kit || kit.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const doc = await prisma.brandKitDocument.findFirst({
    where: { id: params.docId, brandKitId: params.id },
  })
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.brandKitDocument.delete({ where: { id: doc.id } })

  // Best-effort: the DB row is the source of truth; a dangling object is harmless.
  try {
    await deleteObject(BUCKET_DOCS, doc.objectKey)
  } catch (err) {
    console.warn(`[brandkit-documents] failed to delete object ${doc.objectKey}:`, err)
  }

  return NextResponse.json({ deleted: doc.id })
})
