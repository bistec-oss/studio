import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, parseBody } from '@/lib/api/handler'
import { BUCKET_DOCS, headObject, isAllowedAssetUrl } from '@/lib/storage/minio'
import { Prisma, DesignMode, type AspectRatio, type Channel } from '@prisma/client'
import { isPublishableChannel, PUBLISHABLE_CHANNELS } from '@/lib/channels'
import { isAspectRatio } from '@/lib/aspectRatio'
import { validateImageStyle } from '@/lib/brief/imageStyle'
import {
  compositePairingError,
  compositeSourceSchema,
  isOwnScreenshotKey,
  type CompositeSource,
} from '@/lib/brief/compositeSource'
import { isCliMode } from '@/lib/agent/config'
import { resolveBriefCopyKey } from '@/lib/brief/copyProvider'
import { IMAGE_PROVIDERS } from '@/providers/imageCapabilities'
import { resolveModel } from '@/lib/models/policy'
import {
  captionProviderNotClaudeError,
  modelError,
  parseModelField,
  type ModelErrorField,
} from '@/lib/models/requests'
import { copyProviderIsClaude } from '@/providers/registry'
import { loadCaptionRoute } from '@/providers/captionRoute'
import type { ModelKey, UserSurface } from '@/lib/models/catalogue'
import { isStyleKey, resolvePostStyle } from '@/lib/postStyles'
import { track } from '@/lib/analytics/track'
import type { EventPayloadInput } from '@/lib/analytics/catalogue'

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
    captionModel?: unknown
    designModel?: unknown
    imageStyle?: unknown
    postStyle?: unknown
    compositeSource?: unknown
    resumed?: unknown
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
  // 027 FR-06: goal and tone are optional. A body goal is only a legacy hint to
  // the resolver (it picks a style when no postStyle is sent) and is never stored.
  if (body.postStyle != null && typeof body.postStyle !== 'string') {
    return NextResponse.json({ error: 'postStyle must be a string' }, { status: 400 })
  }
  if (goal != null && typeof goal !== 'string') {
    return NextResponse.json({ error: 'goal must be a string' }, { status: 400 })
  }
  if (tone != null && typeof tone !== 'string') {
    return NextResponse.json({ error: 'tone must be a string' }, { status: 400 })
  }
  if (!Array.isArray(channels) || channels.length === 0) {
    return NextResponse.json({ error: 'channels must be a non-empty array' }, { status: 400 })
  }
  // Normalize casing (legacy clients sent lowercase) and accept only publishable channels.
  const normalizedChannels: Channel[] = []
  for (const ch of channels) {
    const upper = typeof ch === 'string' ? ch.toUpperCase() : null
    if (!isPublishableChannel(upper)) {
      return NextResponse.json(
        { error: `channels entries must be one of: ${PUBLISHABLE_CHANNELS.join(', ')}` },
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
  // 009 FR-03: the image style (absent = classic). Checked against the design
  // mode now; the size is resolved at call time (a look that does not declare the size
  // records unsupported-size).
  const style = validateImageStyle(body.imageStyle, designMode)
  if (!style.ok) {
    return NextResponse.json({ error: style.error }, { status: 400 })
  }
  // 008 FR-17: the Review step's optional model picks — the initial request
  // (FR-10). The design pick serves the surface of the chosen design path.
  // Every refusal names its field: the wizard shows it on that picker (T15).
  const captionPick = parseModelField(body.captionModel, 'captionModel')
  if (!captionPick.ok) {
    return NextResponse.json(modelError({ message: captionPick.body.error }, 'captionModel'), { status: 400 })
  }
  const designPick = parseModelField(body.designModel, 'designModel')
  if (!designPick.ok) {
    return NextResponse.json(modelError({ message: designPick.body.error }, 'designModel'), { status: 400 })
  }
  // CLI mode defaults copy to the local Claude CLI (OAuth chain) — no provider
  // key required; an explicit key overrides and is existence-checked below.
  // 024 FR-05: a team that chose a caption route ignores the provided key, and
  // a chosen route that cannot run is refused before any brief is created.
  const captionRoute = await loadCaptionRoute(user.teamId, undefined)
  if (!captionRoute.ok && captionRoute.chosen) {
    return NextResponse.json(
      { error: captionRoute.message, code: 'CAPTION_ROUTE_NOT_READY' },
      { status: 422 },
    )
  }
  const copyKeyDecision = resolveBriefCopyKey(copyProviderKey, isCliMode(), captionRoute.chosen)
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
          where: {
            providerKey: imageProviderKey,
            slot: 'IMAGE',
            teamId: user.teamId,
            isEnabled: true,
            // A legacy incompatible row is refused like a missing one.
            providerName: { in: [...IMAGE_PROVIDERS] },
          },
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

  // 025 FR-11: the product screenshot, when sent. The shape and the private key
  // prefix are checked here; the object and the pairing rule after the style is
  // resolved. A key under another team or user prefix is refused like any bad key.
  let compositeSource: CompositeSource | null = null
  if (body.compositeSource != null) {
    const parsedSource = compositeSourceSchema.safeParse(body.compositeSource)
    if (!parsedSource.success || !isOwnScreenshotKey(parsedSource.data.key, user.teamId, user.userId)) {
      return NextResponse.json(
        { error: 'compositeSource must be a screenshot you uploaded', code: 'INVALID_COMPOSITE_SOURCE' },
        { status: 400 },
      )
    }
    compositeSource = parsedSource.data
  }

  // 027 FR-06: the one resolution of the post style (explicit key, else the
  // legacy goal, else the campaign default, else General). An unknown key is a
  // 400 and never degrades to "no style".
  const resolved = resolvePostStyle({
    style: body.postStyle as string | null | undefined,
    legacyGoal: goal,
    campaign: campaign ? { defaultPostStyle: campaign.defaultPostStyle, defaultTone: campaign.defaultTone } : null,
    explicit: { tone, imageStyle: body.imageStyle == null ? null : style.value },
    path: designMode === 'TEMPLATE' ? 'A' : 'B',
    aspectRatio: aspectRatio ?? 'SQUARE',
    surface: 'briefs-api',
    // 025 FR-11: whether the brief carries a screenshot.
    hasCompositeSource: compositeSource !== null,
  })
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.message, code: resolved.code }, { status: 400 })
  }
  // An explicitly sent image style is stored as given (009 FR-03: the size is
  // not checked here); an absent one comes from the style's default.
  const imageStyle = body.imageStyle == null ? resolved.imageStyle : style.value
  // 025 FR-08: a look that needs a screenshot cannot be created without one.
  const pairing = compositePairingError(imageStyle, compositeSource)
  if (pairing) {
    return NextResponse.json(
      {
        error:
          pairing === 'IMAGE_STYLE_NEEDS_SCREENSHOT'
            ? 'This image style needs a product screenshot'
            : 'A product screenshot needs an image style that uses one',
        code: pairing,
      },
      { status: 400 },
    )
  }
  if (compositeSource && !(await headObject(BUCKET_DOCS, compositeSource.key))) {
    return NextResponse.json(
      { error: 'The product screenshot was not found; upload it again', code: 'INVALID_COMPOSITE_SOURCE' },
      { status: 400 },
    )
  }

  // Each pick is checked against the caller's effective set for its surface
  // now (tier 1: a refusal is FR-17's 400), so only an allowed model is
  // stored. Once stored it is history: a later policy change makes the
  // generation substitute it, never fail (FR-10).
  const designSurface: UserSurface = designMode === 'TEMPLATE' ? 'DESIGN_TEMPLATE' : 'DESIGN_FREEFORM'
  const picks: [UserSurface, ModelKey | undefined, ModelErrorField][] = [
    ['CAPTION', captionPick.value, 'captionModel'],
    [designSurface, designPick.value, 'designModel'],
  ]
  // Spec open question 1: a caption pick needs a Claude caption provider — the
  // one this brief's generation will use (its key, else the team default).
  if (captionPick.value && !(await copyProviderIsClaude(user.teamId, resolvedCopyKey))) {
    return NextResponse.json(captionProviderNotClaudeError('captionModel'), { status: 400 })
  }
  for (const [surface, requested, field] of picks) {
    if (!requested) continue
    const resolved = await resolveModel(surface, { requested, userId: user.userId, teamId: user.teamId })
    if (!resolved.ok) return NextResponse.json(modelError(resolved, field), { status: 400 })
  }

  const brief = await prisma.brief.create({
    data: {
      teamId: user.teamId,
      userId: user.userId,
      topic: topic.trim(),
      description: description?.trim() ?? null,
      postStyle: resolved.key,
      goal: resolved.goal,
      tone: resolved.tone,
      channels: normalizedChannels,
      aspectRatio: aspectRatio ?? 'SQUARE',
      designMode: designMode as DesignMode,
      imageStyle,
      campaignId: campaignId ?? null,
      brandKitId: brandKitId ?? null,
      copyProviderKey: resolvedCopyKey,
      imageProviderKey: imageProviderKey?.trim() ?? null,
      additionalImageUrl: additionalImageUrl ?? null,
      // Nullable Json column: use the Prisma sentinel rather than a bare null
      // (validated to a {url,intent}[] above when present).
      briefImages: briefImages == null ? Prisma.JsonNull : (briefImages as Prisma.InputJsonValue),
      referenceTemplateId: referenceTemplateId ?? null,
      compositeSource: compositeSource ?? Prisma.JsonNull,
      captionModel: captionPick.value ?? null,
      designModel: designPick.value ?? null,
    },
  })

  // 006 FR-08: the funnel's "submitted" step. Counts and enums only: no topic,
  // description or any other brief text.
  await track('brief.submitted', {
    source: 'web',
    teamId: user.teamId,
    userId: user.userId,
    payload: {
      path: designMode === 'TEMPLATE' ? 'A' : 'B',
      aspectRatio: brief.aspectRatio,
      imageStyle: imageStyle as EventPayloadInput<'brief.submitted'>['imageStyle'],
      resumed: body.resumed === true,
      postStyle: isStyleKey(brief.postStyle) ? brief.postStyle : null,
    },
  })

  return NextResponse.json(brief, { status: 201 })
})
