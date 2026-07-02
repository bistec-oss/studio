import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAdmin } from '@/lib/api/handler'
import { uploadObject, publicUrl, BUCKET_BRANDKITS, validateUpload } from '@/lib/storage/minio'
import type { ArtifactType } from '@prisma/client'

const VALID_TYPES: ArtifactType[] = ['LOGO', 'FONT', 'COLOR', 'REFERENCE_IMAGE', 'EXAMPLE_POST', 'OTHER']

type Params = { id: string }

export const GET = withAdmin<Params>(async (_req, { params }) => {
  const artifacts = await prisma.brandKitArtifact.findMany({
    where: { brandKitId: params.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(artifacts)
})

export const POST = withAdmin<Params>(async (req, { params }) => {
  const kit = await prisma.brandKit.findUnique({ where: { id: params.id } })
  if (!kit || kit.isDeleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const type = (formData.get('type') as string | null) ?? 'OTHER'
  const name = (formData.get('name') as string | null) ?? file?.name ?? 'asset'
  const feedToAI = formData.get('feedToAI') === 'true'

  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })
  if (!VALID_TYPES.includes(type as ArtifactType)) {
    return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 })
  }
  const invalid = validateUpload(file)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const key = `${params.id}/artifacts/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  await uploadObject(buffer, BUCKET_BRANDKITS, key, file.type || 'application/octet-stream')
  const url = publicUrl(BUCKET_BRANDKITS, key)

  // Create + denormalized-field sync are atomic; fonts is re-read inside the
  // transaction so concurrent uploads can't clobber each other's entries.
  const artifact = await prisma.$transaction(async (tx) => {
    const created = await tx.brandKitArtifact.create({
      data: {
        brandKitId: params.id,
        type: type as ArtifactType,
        name,
        url,
        feedToAI,
      },
    })

    if (type === 'LOGO') {
      await tx.brandKit.update({ where: { id: params.id }, data: { logoUrl: url } })
    }
    if (type === 'FONT') {
      const fresh = await tx.brandKit.findUnique({ where: { id: params.id }, select: { fonts: true } })
      const existing = Array.isArray(fresh?.fonts)
        ? (fresh.fonts as Array<{ name: string; url: string }>)
        : []
      await tx.brandKit.update({
        where: { id: params.id },
        data: { fonts: [...existing, { name, url }] },
      })
    }

    return created
  })

  return NextResponse.json(artifact, { status: 201 })
})
