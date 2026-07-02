import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, forbiddenIfNotOwner } from '@/lib/auth'
import { resolveCopyProvider } from '@/providers/registry'
import type { BriefInput } from '@/providers/interfaces/CopyProvider'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { briefId } = await req.json()

  const brief = await prisma.brief.findUnique({ where: { id: briefId } })
  if (!brief) return NextResponse.json({ error: 'Brief not found' }, { status: 404 })
  const forbidden = forbiddenIfNotOwner(user, brief.userId)
  if (forbidden) return forbidden

  try {
    const provider = await resolveCopyProvider(brief.copyProviderKey ?? undefined)

    const briefImages = Array.isArray(brief.briefImages)
      ? (brief.briefImages as Array<{ url: string; intent: 'embed' | 'reference' }>)
      : undefined

    const briefInput: BriefInput = {
      topic: brief.topic,
      description: brief.description ?? '',
      goal: brief.goal,
      tone: brief.tone,
      channels: brief.channels,
      designMode: brief.designMode,
      copyProviderKey: brief.copyProviderKey ?? undefined,
      imageProviderKey: brief.imageProviderKey ?? undefined,
      additionalImageUrl: brief.additionalImageUrl ?? undefined,
      briefImages: briefImages ?? undefined,
      referenceTemplateId: brief.referenceTemplateId ?? undefined,
    }

    const copyText = await provider.generateCopy(briefInput)
    return NextResponse.json({ copyText })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
