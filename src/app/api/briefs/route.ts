import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withAuth, parseBody } from '@/lib/api/handler'
import { isAllowedAssetUrl } from '@/lib/storage/minio'
import { Channel, DesignMode } from '@prisma/client'
import { isAspectRatio } from '@/lib/aspectRatio'

// Permissive schema: only guards the JSON parse. The thorough hand-rolled
// validation below (exact error messages + channel normalization) is kept as-is.
const createSchema = z.object({}).passthrough()

export const POST = withAuth(async (req: NextRequest, _ctx, user) => {
  const parsed = await parseBody(req, createSchema)
  if (parsed.response) return parsed.response
  const body = parsed.data as Record<string, any>

  const {
    topic,
    description,
    goal,
    tone,
    channels,
    aspectRatio,
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
  // Normalize casing (legacy clients sent lowercase) and validate against the enum.
  const normalizedChannels: Channel[] = []
  for (const ch of channels) {
    const upper = typeof ch === 'string' ? (ch.toUpperCase() as Channel) : null
    if (!upper || !Object.values(Channel).includes(upper)) {
      return NextResponse.json(
        { error: `channels entries must be one of: ${Object.values(Channel).join(', ')}` },
        { status: 400 }
      )
    }
    normalizedChannels.push(upper)
  }
  if (!designMode || !['TEMPLATE', 'GENERATE'].includes(designMode)) {
    return NextResponse.json({ error: 'designMode must be TEMPLATE or GENERATE' }, { status: 400 })
  }
  // aspectRatio is optional; defaults to SQUARE for backward compatibility.
  if (aspectRatio != null && !isAspectRatio(aspectRatio)) {
    return NextResponse.json({ error: 'aspectRatio must be SQUARE or PORTRAIT' }, { status: 400 })
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
      channels: normalizedChannels,
      aspectRatio: aspectRatio ?? 'SQUARE',
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
})
