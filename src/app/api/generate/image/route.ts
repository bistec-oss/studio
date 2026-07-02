import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { forbiddenIfNotOwner } from '@/lib/auth'
import { withAuth, parseBody } from '@/lib/api/handler'
import { resolveImageProvider } from '@/providers/registry'
import { persistDataUrlImage } from '@/lib/storage/minio'

const bodySchema = z.object({ briefId: z.string(), prompt: z.string() })

export const POST = withAuth(async (req: NextRequest, _ctx, user) => {
  const body = await parseBody(req, bodySchema)
  if (body.response) return body.response
  const { briefId, prompt } = body.data

  const brief = await prisma.brief.findUnique({ where: { id: briefId } })
  if (!brief) return NextResponse.json({ error: 'Brief not found' }, { status: 404 })
  const forbidden = forbiddenIfNotOwner(user, brief.userId)
  if (forbidden) return forbidden

  try {
    const provider = await resolveImageProvider(brief.imageProviderKey ?? undefined)

    const result = await provider.generateImage(prompt)
    const rawUrl: string = result.url

    if (rawUrl.startsWith('data:')) {
      // Shared helper enforces the raster allow-list and stores with the real
      // content type (previously this route accepted any data: image and
      // mislabeled it image/png).
      return NextResponse.json({ imageUrl: await persistDataUrlImage(rawUrl, `images/${briefId}`) })
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
})
