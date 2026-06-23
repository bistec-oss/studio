import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { DesignMode } from '@prisma/client'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const {
    topic,
    description,
    goal,
    tone,
    channels,
    designMode,
    campaignId,
    copyProviderKey,
    imageProviderKey,
    additionalImageUrl,
    briefImages,
    referenceTemplateId,
  } = body

  // Validate required fields
  if (!topic?.trim()) {
    return NextResponse.json({ error: 'topic is required' }, { status: 400 })
  }
  if (!goal?.trim()) {
    return NextResponse.json({ error: 'goal is required' }, { status: 400 })
  }
  if (!tone?.trim()) {
    return NextResponse.json({ error: 'tone is required' }, { status: 400 })
  }
  if (!Array.isArray(channels) || channels.length === 0) {
    return NextResponse.json({ error: 'channels must be a non-empty array' }, { status: 400 })
  }
  if (!designMode || !['TEMPLATE', 'GENERATE'].includes(designMode)) {
    return NextResponse.json({ error: 'designMode must be TEMPLATE or GENERATE' }, { status: 400 })
  }
  if (!copyProviderKey?.trim()) {
    return NextResponse.json({ error: 'copyProviderKey is required' }, { status: 400 })
  }

  // Verify copyProviderKey exists as an enabled provider
  const copyProvider = await prisma.availableProvider.findFirst({
    where: { providerKey: copyProviderKey, slot: 'COPY', isEnabled: true },
  })
  if (!copyProvider) {
    return NextResponse.json({ error: 'Invalid or disabled copyProviderKey' }, { status: 400 })
  }

  // Verify imageProviderKey if provided
  if (imageProviderKey) {
    const imageProvider = await prisma.availableProvider.findFirst({
      where: { providerKey: imageProviderKey, slot: 'IMAGE', isEnabled: true },
    })
    if (!imageProvider) {
      return NextResponse.json({ error: 'Invalid or disabled imageProviderKey' }, { status: 400 })
    }
  }

  // Verify campaign if provided
  if (campaignId) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, isDeleted: false },
    })
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 400 })
    }
  }

  // Verify referenceTemplate if provided
  if (referenceTemplateId) {
    const template = await prisma.brandKitTemplate.findUnique({
      where: { id: referenceTemplateId },
    })
    if (!template) {
      return NextResponse.json({ error: 'Reference template not found' }, { status: 400 })
    }
  }

  const brief = await prisma.brief.create({
    data: {
      userId: user.userId,
      topic: topic.trim(),
      description: description?.trim() ?? null,
      goal: goal.trim(),
      tone: tone.trim(),
      channels,
      designMode: designMode as DesignMode,
      campaignId: campaignId ?? null,
      copyProviderKey: copyProviderKey.trim(),
      imageProviderKey: imageProviderKey?.trim() ?? null,
      additionalImageUrl: additionalImageUrl ?? null,
      briefImages: briefImages ?? null,
      referenceTemplateId: referenceTemplateId ?? null,
    },
  })

  return NextResponse.json(brief, { status: 201 })
}
