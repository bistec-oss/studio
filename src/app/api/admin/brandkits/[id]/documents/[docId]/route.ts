import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAdmin } from '@/lib/api/handler'
import { BUCKET_DOCS, deleteObject } from '@/lib/storage/minio'

type Params = { id: string; docId: string }

export const DELETE = withAdmin<Params>(async (_req, { params }) => {
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
