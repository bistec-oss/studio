import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { uploadObject, BUCKET_BRANDKITS, validateUpload } from '@/lib/storage/minio'

// Accepts a multipart file upload and returns a MinIO pre-signed URL.
// Used by the admin UI to upload logos and fonts before PATCHing the kit.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })

  const invalid = validateUpload(file)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const key = `${params.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  const url = await uploadObject(buffer, BUCKET_BRANDKITS, key, file.type || `application/octet-stream`)

  return NextResponse.json({ url, key, name: file.name })
}
