import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth, withAdmin } from '@/lib/api/handler'
import { BUCKET_DOCS, uploadObject, validateUpload } from '@/lib/storage/minio'
import {
  MAX_DOCS_PER_CAMPAIGN,
  isAllowedDocument,
  isAllowedDocImage,
  parseDocumentText,
} from '@/lib/campaign/documents'

type Params = { id: string }

const DOC_SELECT = {
  id: true,
  name: true,
  contentType: true,
  sizeBytes: true,
  truncated: true,
  createdAt: true,
} as const

export const GET = withAuth<Params>(async (_req, { params }) => {
  const docs = await prisma.campaignDocument.findMany({
    where: { campaignId: params.id },
    orderBy: { createdAt: 'asc' },
    select: DOC_SELECT,
  })
  return NextResponse.json(docs)
})

export const POST = withAdmin<Params>(async (req, { params }, user) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: params.id, isDeleted: false },
    select: { id: true, teamId: true },
  })
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

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

  const count = await prisma.campaignDocument.count({ where: { campaignId: params.id } })
  if (count >= MAX_DOCS_PER_CAMPAIGN) {
    return NextResponse.json(
      { error: `A campaign can hold at most ${MAX_DOCS_PER_CAMPAIGN} documents — delete one first` },
      { status: 400 }
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  // Images skip text extraction — they are fed to the vision model instead
  // (collectCampaignDocImageUrls) and store empty parsedText.
  let parsed = { text: '', truncated: false }
  if (!isImage) {
    try {
      parsed = await parseDocumentText(buffer, file.type, file.name)
    } catch (err) {
      console.error(`[documents] failed to parse ${file.name}:`, err)
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
  const objectKey = `${params.id}/${Date.now()}-${safeName}`
  // Normalize image contentType from the extension when the browser omits it —
  // collectCampaignDocImageUrls selects image docs by this stored value.
  const contentType =
    isImage && !file.type ? (/\.png$/i.test(file.name) ? 'image/png' : 'image/jpeg') : file.type || 'application/octet-stream'
  await uploadObject(buffer, BUCKET_DOCS, objectKey, contentType)

  const doc = await prisma.campaignDocument.create({
    data: {
      teamId: campaign.teamId,
      campaignId: params.id,
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
