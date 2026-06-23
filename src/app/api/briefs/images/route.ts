import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { uploadObject, BUCKET_IMAGES, validateUpload, RASTER_IMAGE_TYPES } from '@/lib/storage/minio'

// Accepts a multipart image upload from the brief wizard (Images step) and
// returns a MinIO URL. Runs before the Brief exists, so it is not scoped to a
// briefId — files land under a briefs/ prefix and are referenced from
// Brief.briefImages once the brief is created. Available to any signed-in user.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })

  const invalid = validateUpload(file, RASTER_IMAGE_TYPES)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const key = `briefs/${user.userId}/${Date.now()}-${safeName}`

  const url = await uploadObject(buffer, BUCKET_IMAGES, key, file.type || 'application/octet-stream')

  return NextResponse.json({ url, filename: file.name })
}
