import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin } from '@/lib/api/handler'
import { BUCKET_DOCS, uploadObject, validateUpload } from '@/lib/storage/minio'
import {
  isAllowedDocument,
  isAllowedDocImage,
  parseDocumentText,
} from '@/lib/campaign/documents'
import { MAX_DOCS_PER_BRAND_KIT } from '@/lib/brandkit/documents'

// Brand-kit assistant source documents — mirrors the campaign documents routes
// (src/app/api/campaigns/[id]/documents). Admin-only: the assistant surface is
// admin-only. These are NOT artifacts and never enter generation prompts.

type Params = { id: string }

const DOC_SELECT = {
  id: true,
  name: true,
  contentType: true,
  sizeBytes: true,
  truncated: true,
  createdAt: true,
} as const

export const GET = withTeamAdmin<Params>(async (_req, { params }, user) => {
  const kit = await prisma.brandKit.findFirst({
    where: { id: params.id, isDeleted: false },
    select: { id: true, teamId: true },
  })
  if (!kit || kit.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Brand kit not found' }, { status: 404 })
  }

  const docs = await prisma.brandKitDocument.findMany({
    where: { brandKitId: params.id },
    orderBy: { createdAt: 'asc' },
    select: DOC_SELECT,
  })
  return NextResponse.json(docs)
})

export const POST = withTeamAdmin<Params>(async (req, { params }, user) => {
  const kit = await prisma.brandKit.findFirst({
    where: { id: params.id, isDeleted: false },
    select: { id: true, teamId: true },
  })
  if (!kit || kit.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Brand kit not found' }, { status: 404 })
  }

  const fd = await req.formData()
  const file = fd.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  }

  const sizeError = validateUpload(file)
  if (sizeError) return NextResponse.json({ error: sizeError }, { status: 400 })
  const isImage = isAllowedDocImage(file.type, file.name)
  if (!isImage && !isAllowedDocument(file.type, file.name)) {
    return NextResponse.json(
      { error: 'Unsupported file type — use PDF, DOCX, TXT, Markdown, PNG, or JPG' },
      { status: 400 }
    )
  }

  const count = await prisma.brandKitDocument.count({ where: { brandKitId: params.id } })
  if (count >= MAX_DOCS_PER_BRAND_KIT) {
    return NextResponse.json(
      { error: `A brand kit can hold at most ${MAX_DOCS_PER_BRAND_KIT} documents — delete one first` },
      { status: 400 }
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  // Images skip text extraction — they are fed to the vision model instead
  // (collectBrandKitDocImageUrls) and store empty parsedText.
  let parsed = { text: '', truncated: false }
  if (!isImage) {
    try {
      parsed = await parseDocumentText(buffer, file.type, file.name)
    } catch (err) {
      console.error(`[brandkit-documents] failed to parse ${file.name}:`, err)
      return NextResponse.json(
        { error: 'Could not extract text from this file — is it a valid document?' },
        { status: 400 }
      )
    }
    if (!parsed.text) {
      return NextResponse.json(
        { error: 'No text could be extracted from this file' },
        { status: 400 }
      )
    }
  }

  const safeName = file.name.replace(/[^\w.\-]+/g, '_')
  const objectKey = `brandkits/${params.id}/${Date.now()}-${safeName}`
  // Normalize image contentType from the extension when the browser omits it —
  // collectBrandKitDocImageUrls selects image docs by this stored value.
  const contentType =
    isImage && !file.type ? (/\.png$/i.test(file.name) ? 'image/png' : 'image/jpeg') : file.type || 'application/octet-stream'
  await uploadObject(buffer, BUCKET_DOCS, objectKey, contentType)

  const doc = await prisma.brandKitDocument.create({
    data: {
      teamId: kit.teamId,
      brandKitId: params.id,
      name: file.name,
      contentType,
      sizeBytes: file.size,
      objectKey,
      parsedText: parsed.text,
      truncated: parsed.truncated,
      createdBy: user.userId,
    },
    select: DOC_SELECT,
  })

  return NextResponse.json(doc, { status: 201 })
})
