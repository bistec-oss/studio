import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, parseBody } from '@/lib/api/handler'
import { isAllowedAssetUrl } from '@/lib/storage/minio'
import { Prisma, Channel, DesignMode, type AspectRatio } from '@prisma/client'
import { isAspectRatio } from '@/lib/aspectRatio'
import { isCliMode } from '@/lib/agent/config'
import { resolveBriefCopyKey } from '@/lib/brief/copyProvider'

// Permissive schema: only guards the JSON parse. The thorough hand-rolled
// validation below (exact error messages + channel normalization) is kept as-is.
const createSchema = z.object({}).passthrough()

export const POST = withTeamAuth(async (req: NextRequest, _ctx, user) => {
  const parsed = await parseBody(req, createSchema)
  if (parsed.response) return parsed.response
  // Untrusted request body — every field is validated at runtime below; the cast
  // just describes the shape those checks assume (no `any`).
  const body = parsed.data as {
    topic?: string
    description?: string
    goal?: string
    tone?: string
    channels?: unknown
    aspectRatio?: AspectRatio
    designMode?: string
    campaignId?: string
    brandKitId?: string
    copyProviderKey?: string
    imageProviderKey?: string
    additionalImageUrl?: string
    briefImages?: unknown
    referenceTemplateId?: string
  }

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
    return NextResponse.json({ error: 'aspectRatio must be SQUARE, PORTRAIT, or STORY' }, { status: 400 })
  }
  // CLI mode defaults copy to the local Claude CLI (OAuth chain) — no provider
  // key required; an explicit key overrides and is existence-checked below.
  const copyKeyDecision = resolveBriefCopyKey(copyProviderKey, isCliMode())
  if ('error' in copyKeyDecision) {
    return NextResponse.json({ error: copyKeyDecision.error }, { status: 400 })
  }
  const { key: resolvedCopyKey, validateExists: mustValidateCopyKey } = copyKeyDecision

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

  // Verify referenced records in parallel (independent lookups). Provider
  // lookups are team-scoped (team-tenancy fix — these used to validate
  // against ANY team's provider row, which would let a brief reference, and
  // then at generation time resolve to, a different team's registered
  // provider/API key; see the matching fix in resolveCopyProvider).
  const [copyProvider, imageProvider, campaign, template, brandKit] = await Promise.all([
    mustValidateCopyKey
      ? prisma.availableProvider.findFirst({
          where: { providerKey: resolvedCopyKey, slot: 'COPY', teamId: user.teamId, isEnabled: true },
        })
      : Promise.resolve(null),
    imageProviderKey
      ? prisma.availableProvider.findFirst({
          where: { providerKey: imageProviderKey, slot: 'IMAGE', teamId: user.teamId, isEnabled: true },
        })
      : Promise.resolve(null),
    campaignId
      ? prisma.campaign.findFirst({ where: { id: campaignId, isDeleted: false } })
      : Promise.resolve(null),
    // I2 (final review): include the template's brand kit so its team can be
    // checked below — an unscoped findUnique let a foreign team's template
    // HTML enter the design prompt as "style inspiration" (see pathB.ts).
    referenceTemplateId
      ? prisma.brandKitTemplate.findUnique({
          where: { id: referenceTemplateId },
          include: { brandKit: { select: { teamId: true } } },
        })
      : Promise.resolve(null),
    brandKitId
      ? prisma.brandKit.findFirst({ where: { id: brandKitId, isDeleted: false } })
      : Promise.resolve(null),
  ])

  if (mustValidateCopyKey && !copyProvider) {
    return NextResponse.json({ error: 'Invalid or disabled copyProviderKey' }, { status: 400 })
  }
  if (imageProviderKey && !imageProvider) {
    return NextResponse.json({ error: 'Invalid or disabled imageProviderKey' }, { status: 400 })
  }
  // M1 (final review): "doesn't exist" and "exists in another team" now share
  // ONE status/message (404, the pre-existing not-found text) for every
  // referenced record. The old 400-vs-404 split let a caller distinguish "bad
  // id" from "id exists in some other tenant" — a cross-tenant existence
  // oracle — by watching the status code alone.
  if (campaignId && (!campaign || campaign.teamId !== user.teamId)) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }
  if (referenceTemplateId && (!template || template.brandKit.teamId !== user.teamId)) {
    return NextResponse.json({ error: 'Reference template not found' }, { status: 404 })
  }
  if (brandKitId && (!brandKit || brandKit.teamId !== user.teamId)) {
    return NextResponse.json({ error: 'Brand kit not found' }, { status: 404 })
  }

  const brief = await prisma.brief.create({
    data: {
      teamId: user.teamId,
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
      copyProviderKey: resolvedCopyKey,
      imageProviderKey: imageProviderKey?.trim() ?? null,
      additionalImageUrl: additionalImageUrl ?? null,
      // Nullable Json column: use the Prisma sentinel rather than a bare null
      // (validated to a {url,intent}[] above when present).
      briefImages: briefImages == null ? Prisma.JsonNull : (briefImages as Prisma.InputJsonValue),
      referenceTemplateId: referenceTemplateId ?? null,
    },
  })

  return NextResponse.json(brief, { status: 201 })
})
