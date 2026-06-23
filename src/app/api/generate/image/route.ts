import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { resolveImageProvider } from '@/providers/registry'
import { uploadObject, BUCKET_IMAGES } from '@/lib/storage/minio'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { briefId, prompt } = await req.json()

  const brief = await prisma.brief.findUnique({ where: { id: briefId } })
  if (!brief) return NextResponse.json({ error: 'Brief not found' }, { status: 404 })

  try {
    const provider = await resolveImageProvider(brief.imageProviderKey ?? undefined)

    const result = await provider.generateImage(prompt)
    const rawUrl: string = result.url

    if (rawUrl.startsWith('data:image/')) {
      const commaIdx = rawUrl.indexOf(',')
      const base64data = rawUrl.slice(commaIdx + 1)
      const buffer = Buffer.from(base64data, 'base64')
      const key = `images/${briefId}-${Date.now()}.png`
      const imageUrl = await uploadObject(buffer, BUCKET_IMAGES, key, 'image/png')
      return NextResponse.json({ imageUrl })
    }

    // Already a real URL — return as-is
    return NextResponse.json({ imageUrl: rawUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.toLowerCase().includes('moderation') || message.toLowerCase().includes('content_policy')) {
      return NextResponse.json({ code: 'MODERATION', message }, { status: 422 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
