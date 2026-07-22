import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin } from '@/lib/api/handler'
import { uploadObject, publicUrl, BUCKET_BRANDKITS, validateUpload } from '@/lib/storage/minio'

// Accepts a multipart file upload and returns a stable public MinIO URL.
// Used by the admin UI to upload logos and fonts before PATCHing the kit.
export const POST = withTeamAdmin<{ id: string }>(async (req, { params }, user) => {
  const kit = await prisma.brandKit.findUnique({ where: { id: params.id }, select: { id: true, teamId: true, isDeleted: true } })
  if (!kit || kit.isDeleted || kit.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Brand kit not found' }, { status: 404 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })

  const invalid = validateUpload(file)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const key = `${params.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  await uploadObject(buffer, BUCKET_BRANDKITS, key, file.type || `application/octet-stream`)

  return NextResponse.json({ url: publicUrl(BUCKET_BRANDKITS, key), key, name: file.name })
})
