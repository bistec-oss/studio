import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { isAllowedAssetUrl } from '@/lib/storage/minio'
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
    brandKitId,
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

  // SSRF guard: image URLs are embedded into agent-generated HTML and fetched by
  // headless Chromium at render time, so they must point at our own MinIO storage
  // (these values only ever come from /api/briefs/images). Reject off-host or
  // non-http(s) URLs before they are stored.
  if (additionalImageUrl != null && !isAllowedAssetUrl(additionalImageUrl)) {
    return NextResponse.json({ error: 'additionalImageUrl must be an uploaded image URL' }, { status: 400 })
  }
  if (briefImages != null) {
    if (!Array.isArray(briefImages)) {
      return NextResponse.json({ error: 'briefImages must be an array' }, { status: 400 })
    }
    for (const img of briefImages) {
      if (!img || typeof img.url !== 'string' || !isAllowedAssetUrl(img.url)) {
        return NextResponse.json({ error: 'each briefImages entry must have an uploaded image URL' }, { status: 400 })
      }
      if (img.intent !== 'embed' && img.intent !== 'reference') {
        return NextResponse.json({ error: 'each briefImages entry must have intent "embed" or "reference"' }, { status: 400 })
      }
    }
  }

  // Verify referenced records in parallel (independent lookups).
  const [copyProvider, imageProvider, campaign, template, brandKit] = await Promise.all([
    prisma.availableProvider.findFirst({
      where: { providerKey: copyProviderKey, slot: 'COPY', isEnabled: true },
    }),
    imageProviderKey
      ? prisma.availableProvider.findFirst({
          where: { providerKey: imageProviderKey, slot: 'IMAGE', isEnabled: true },
        })
      : Promise.resolve(null),
    campaignId
      ? prisma.campaign.findFirst({ where: { id: campaignId, isDeleted: false } })
      : Promise.resolve(null),
    referenceTemplateId
      ? prisma.brandKitTemplate.findUnique({ where: { id: referenceTemplateId } })
      : Promise.resolve(null),
    brandKitId
      ? prisma.brandKit.findFirst({ where: { id: brandKitId, isDeleted: false } })
      : Promise.resolve(null),
  ])

  if (!copyProvider) {
    return NextResponse.json({ error: 'Invalid or disabled copyProviderKey' }, { status: 400 })
  }
  if (imageProviderKey && !imageProvider) {
    return NextResponse.json({ error: 'Invalid or disabled imageProviderKey' }, { status: 400 })
  }
  if (campaignId && !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 400 })
  }
  if (referenceTemplateId && !template) {
    return NextResponse.json({ error: 'Reference template not found' }, { status: 400 })
  }
  if (brandKitId && !brandKit) {
    return NextResponse.json({ error: 'Brand kit not found' }, { status: 400 })
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
      brandKitId: brandKitId ?? null,
      copyProviderKey: copyProviderKey.trim(),
      imageProviderKey: imageProviderKey?.trim() ?? null,
      additionalImageUrl: additionalImageUrl ?? null,
      briefImages: briefImages ?? null,
      referenceTemplateId: referenceTemplateId ?? null,
    },
  })

  return NextResponse.json(brief, { status: 201 })
}
