import type { Brief, Draft } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { getActiveCampaignBriefing } from '@/lib/campaign/briefing'
import { resolveCopyProvider } from '@/providers/registry'
import { briefPostStyleStamp, buildBriefInput } from '@/lib/agent/briefInput'
import { runPathADesign, assertTemplateMatchesBrief } from '@/lib/agent/pathA'
import { runPathBDesign } from '@/lib/agent/pathB'
import { stampFromCheck } from '@/lib/renderedText/stamp'
import { renderNotesFrom } from '@/lib/fonts/renderNotes'
import { currentRenderStamp, draftStampFields, revisionStampFields, type RenderStamp } from '@/lib/drafts/revisions'
import { classicStamp } from '@/lib/designData'
import { humanizeGenerationError } from '@/lib/agent/generationErrors'
import { generationSkipFields, type BackgroundSkipFields } from '@/lib/drafts/backgroundNotice'
import { generationImageSource, type ImageSourceWrite } from '@/lib/drafts/imageSourceFields'
import type { GenerationActor, GenerationRunActor } from '@/lib/agent/types'
import { track } from '@/lib/analytics/track'
import { newUsage, usageFields, withUsage, type UsageStore } from '@/lib/analytics/trace'
import { CAPTION_CHANNELS } from '@/lib/channels'
import { GENERATION_TARGETS, requireHeadline, writeCaptions } from '@/lib/captions/generate'
import { captionRowsFromFields, headlineStampFields, saveGenerationCaptions, type CaptionStamp } from '@/lib/captions/store'
import { resolveModel } from '@/lib/models/policy'
import type { ResolvedModel } from '@/lib/models/resolve'
import { touchGeneration } from '@/lib/drafts/draftActions'
import { computeFactsCheck } from '@/lib/factsCheck/refresh'
import { parseFactsCheck, type CheckText, type FactWhere, type FactsCheck } from '@/lib/factsCheck'
import { isStyleKey } from '@/lib/postStyles'
import type { Prisma } from '@prisma/client'

// Path B needs a resolvable brand kit; thrown before any model call is paid for.
export class NoBrandKitError extends Error {
  constructor() {
    super('No brand kit found — configure a brand kit for this campaign, project, or ask a team admin to set a team default.')
    this.name = 'NoBrandKitError'
  }
}

// TEMPLATE mode needs a template that still exists at generation time.
export class TemplateNotFoundError extends Error {
  constructor() {
    super('Template not found')
    this.name = 'TemplateNotFoundError'
  }
}

// The team allows no model for a surface the generation needs (008 FR-03:
// only a hand-edited policy row gets here — /team can't save one). The
// generation fails closed with the resolver's message, before any model call.
export class NoAllowedModelError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NoAllowedModelError'
  }
}

export interface GenerationModels {
  caption: ResolvedModel
  design: ResolvedModel
}

// 008 FR-10/FR-11, design §3: a generation's two models, resolved once at its
// start, on the brief's team, as the acting user (null for the scheduler, MCP
// and ACP, which always resolve on the team credential).
//
// Brief.captionModel / designModel are the initial request as it was STORED,
// so they go in as storedRequest: one that has since become disallowed falls
// through to the team default, then the system default, and is recorded as a
// substitution on the stamp — never a 400, never a throw. designModel serves
// DESIGN_TEMPLATE or DESIGN_FREEFORM by the brief's design mode. Retry
// re-enters here, so it re-runs the same initial request.
export async function resolveGenerationModels(
  brief: Pick<Brief, 'teamId' | 'designMode' | 'captionModel' | 'designModel'>,
  actor: GenerationActor,
): Promise<GenerationModels> {
  const designSurface = brief.designMode === 'TEMPLATE' ? 'DESIGN_TEMPLATE' : 'DESIGN_FREEFORM'
  const [caption, design] = await Promise.all([
    resolveModel('CAPTION', { storedRequest: brief.captionModel, userId: actor.userId, teamId: brief.teamId }),
    resolveModel(designSurface, { storedRequest: brief.designModel, userId: actor.userId, teamId: brief.teamId }),
  ])
  if (!caption.ok) throw new NoAllowedModelError(caption.message)
  if (!design.ok) throw new NoAllowedModelError(design.message)
  return { caption: caption.resolved, design: design.resolved }
}

export interface GenerateDraftResult {
  draft: Draft
  backgroundImageUrl: string | null
}

interface ResolvedInputs {
  kit: Awaited<ReturnType<typeof resolveBrandKit>>
  campaignBriefing: Awaited<ReturnType<typeof getActiveCampaignBriefing>>
  template: Awaited<ReturnType<typeof prisma.brandKitTemplate.findUnique>>
}

// Resolve + VALIDATE the inputs a generation needs, throwing the typed errors
// (NoBrandKitError / TemplateNotFoundError / PathATemplateError) callers map to
// 4xx. Shared by every generation lifecycle so validation can't drift.
// `templateId` comes from the route (sync path) or the pending draft (async path).
async function resolveGenerationInputs(
  brief: Brief,
  templateId: string | null | undefined,
): Promise<ResolvedInputs> {
  // Brand kit precedence: explicit brief kit → campaign → project → team default.
  const kit = await resolveBrandKit(brief.teamId, brief.campaignId ?? undefined, brief.brandKitId ?? undefined)
  // Campaign-level briefing (when the brief's campaign has an active one) —
  // injected into copy and design prompts alongside the brand voice.
  const campaignBriefing = await getActiveCampaignBriefing(brief.campaignId)

  let template = null
  if (brief.designMode === 'TEMPLATE') {
    if (!templateId) throw new TemplateNotFoundError()
    // I1 (final review): scope the template lookup to the brief's own team via
    // its parent brand kit — an unscoped findUnique let any signed-in user
    // render another team's full template HTML (a cross-tenant read where the
    // rendered PNG is the exfiltration channel) by passing a foreign templateId.
    template = await prisma.brandKitTemplate.findFirst({
      where: { id: templateId, brandKit: { teamId: brief.teamId, isDeleted: false } },
    })
    if (!template) throw new TemplateNotFoundError()
    assertTemplateMatchesBrief(brief, template)
  } else if (!kit) {
    throw new NoBrandKitError()
  }
  return { kit, campaignBriefing, template }
}

interface ProducedDesign {
  htmlContent: string
  exportUrl: string
  backgroundImageUrl: string | null
  // 005 FR-07: why this render has no AI background, when that was not the
  // model's choice — cleared for a produced/not-needed background and Path A.
  backgroundSkip: BackgroundSkipFields
  // 031 FR-13: where the image came from (DbNull when none ran).
  imageSource: ImageSourceWrite
  // F3 (AC-04): the prompt version + font set of THIS render, resolved once
  // and written to both the draft and its v1 revision.
  stamp: RenderStamp
}

// Path A/B design dispatch → rendered PNG. The heavy model + Puppeteer work,
// shared by the sync and async lifecycles. The design reads the on-image
// headline only, never a caption (012 FR-09).
async function produceDesign(
  brief: Brief,
  { kit, campaignBriefing, template }: ResolvedInputs,
  headline: string,
  actor: GenerationActor,
  // 008: the design surface's model (resolveGenerationModels); it is also the
  // render's stamp.
  model: ResolvedModel,
  // 008 FR-12: the caller's liveness write, run immediately before the design
  // call (Path B runs its background step first; Path A has none).
  onBeforeDesign?: () => Promise<void>,
): Promise<ProducedDesign> {
  if (template) {
    await onBeforeDesign?.()
    const result = await runPathADesign(brief, kit, template, headline, campaignBriefing, actor, model)
    return {
      htmlContent: result.htmlContent,
      exportUrl: result.exportUrl,
      backgroundImageUrl: null,
      // Path A has no background step: nothing was skipped.
      backgroundSkip: generationSkipFields(null),
      imageSource: generationImageSource(null),
      // 009: a Path A draft is classic (and gives the evidence its denominator).
      stamp: currentRenderStamp(
        model,
        classicStamp(),
        briefPostStyleStamp(brief),
        // 030 FR-04: the render's own check (null = no render ran: not-checked).
        stampFromCheck(headline, result.headlineCheck ?? 'not-checked'),
        // 031 FR-24: what the same render found about its fonts.
        renderNotesFrom(result.fontsMissing),
      ),
    }
  }
  const result = await runPathBDesign(brief, kit!, headline, campaignBriefing, actor, model, { onBeforeDesign })
  return {
    htmlContent: result.htmlContent,
    exportUrl: result.exportUrl,
    backgroundImageUrl: result.backgroundImageUrl,
    backgroundSkip: generationSkipFields(result.background),
    imageSource: generationImageSource(result.background),
    // 009 FR-12: the run's composition stamp (the image style asked for, the
    // one applied, why not), resolved by runPathBDesign.
    stamp: currentRenderStamp(
      model,
      result.composition,
      briefPostStyleStamp(brief),
      stampFromCheck(headline, result.headlineCheck ?? 'not-checked'),
      renderNotesFrom(result.fontsMissing),
    ),
  }
}

// Persist a freshly generated design onto a draft AND record it as revision v1
// (the append-only history's origin — see F2). One transaction. The literal 1
// is safe: a draft only gains other rows (refines, including rejected renders)
// after it has a finished design, and rejected rows carry no number anyway.
async function finalizeDraftV1(
  draftId: string,
  design: ProducedDesign,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.draft.update({
      where: { id: draftId },
      data: {
        htmlContent: design.htmlContent,
        // exportUrl is an EXPORTS object key; stored as-is, signed per read.
        exportUrl: design.exportUrl,
        // Public URL of the AI-generated background (null when the pre-step
        // skipped, and always null for Path A).
        imageUrl: design.backgroundImageUrl,
        ...design.backgroundSkip,
        imageSource: design.imageSource,
        status: 'EXPORTED',
        ...draftStampFields(design.stamp),
        currentRevisionNumber: 1,
        failureReason: null,
      },
    })
    await tx.draftRevision.create({
      data: {
        draftId,
        revisionNumber: 1,
        instruction: 'Original design',
        htmlSnapshot: design.htmlContent,
        exportUrl: design.exportUrl,
        ...revisionStampFields(design.stamp),
      },
    })
  })
}

// ── Analytics (006 FR-04): the one emitter of `generation.finished` ──────────
// Both lifecycles collect what they know as they go (the fields are absent when
// a throw comes first) and emit once, after their outcome is written.
interface GenerationTrace {
  t0: number
  usage: UsageStore
  models?: GenerationModels
  captionStamp?: CaptionStamp
  design?: ProducedDesign
  // 027 FR-14: the facts check as it stood when the generation settled.
  factsCheck?: FactsCheck | null
}

const ROUTE_STAMPS = ['CLI', 'API_KEY', 'SERVER_KEY', 'OTHER'] as const
type RouteStamp = (typeof ROUTE_STAMPS)[number]

async function emitGenerationFinished(
  brief: Pick<Brief, 'designMode' | 'aspectRatio' | 'imageStyle' | 'postStyle'>,
  actor: GenerationRunActor,
  draftId: string | null,
  trace: GenerationTrace,
  outcome: 'ok' | 'failed',
  failure?: unknown,
): Promise<void> {
  const composition = trace.design?.stamp.composition ?? null
  const route = trace.captionStamp?.route
  // 030 FR-17: the final render's headline check; absent with no design or no stamp.
  const headlineStamp = trace.design?.stamp.renderedText?.headline
  const headlineCheck = headlineStamp ? (headlineStamp.verified ? 'painted' : headlineStamp.reason) : undefined
  await track('generation.finished', {
    source: actor.source,
    teamId: actor.teamId,
    userId: actor.userId,
    draftId,
    durationMs: Date.now() - trace.t0,
    outcome,
    payload: {
      path: brief.designMode === 'TEMPLATE' ? 'A' : 'B',
      aspectRatio: brief.aspectRatio,
      ...(trace.models
        ? {
            captionModel: {
              model: trace.models.caption.key,
              modelId: trace.captionStamp?.model ?? null,
              substitutedFrom: trace.captionStamp?.substitutedFrom ?? trace.models.caption.substitutedFrom,
            },
            designModel: {
              model: trace.models.design.key,
              modelId: trace.design?.stamp.model ?? null,
              substitutedFrom: trace.design?.stamp.modelSubstitutedFrom ?? trace.models.design.substitutedFrom,
            },
          }
        : {}),
      ...usageFields(trace.usage),
      captionRoute: route && (ROUTE_STAMPS as readonly string[]).includes(route) ? (route as RouteStamp) : null,
      ...(trace.design?.stamp.promptVersion ? { promptVersion: trace.design.stamp.promptVersion } : {}),
      requestedArchetype: brief.imageStyle,
      // 027 FR-14: the key, a status and a count; never a flagged value (NFR-05).
      postStyle: isStyleKey(brief.postStyle) ? brief.postStyle : null,
      ...(trace.factsCheck
        ? { factsStatus: trace.factsCheck.status, factsFlagCount: trace.factsCheck.flagged.length }
        : {}),
      ...(composition
        ? {
            appliedArchetype: composition.appliedArchetype as 'classic',
            ...(composition.fallbackReason ? { fallbackReason: composition.fallbackReason } : {}),
          }
        : {}),
      ...(trace.design ? { backgroundSkipped: trace.design.backgroundSkip.backgroundSkipReason !== null } : {}),
      ...(headlineCheck ? { headlineCheck } : {}),
      ...(failure !== undefined ? { failureReason: humanizeGenerationError(failure) } : {}),
    },
  })
}

// The texts the facts check reads from a caption reply: the validated headline
// and each registry caption that validated (027 FR-10). Anything else in the
// reply is not stored, so it is not checked.
function checkTexts(headline: string, fields: Awaited<ReturnType<typeof writeCaptions>>['fields']): CheckText[] {
  const texts: CheckText[] = [{ where: 'headline', text: headline }]
  for (const { channel } of CAPTION_CHANNELS) {
    const field = fields[channel]
    if (field?.ok && field.text) texts.push({ where: channel as FactWhere, text: field.text })
  }
  return texts
}

// SYNCHRONOUS brief→draft orchestrator: captions → design → render, then create
// the draft (EXPORTED, with its caption rows and v1) at the END on success. Used
// by the NON-interactive callers — MCP/ACP surface and the scheduled-generation
// runner — which want the finished draft back and rely on the thrown typed
// errors (a failure creates NO draft, so scheduler retries don't accumulate
// orphan FAILED drafts). A reply with no valid headline throws
// HeadlineMissingError BEFORE any design is paid for (012 FR-09/FR-10), so the
// scheduler retries and MCP reports it. The interactive brief wizard uses
// createPendingDraft + runGenerationForDraft instead.
export async function generateDraftForBrief(
  brief: Brief,
  // The MCP/ACP surface and the scheduler have no signed-in actor (Task 13/14
  // territory) — callers there must pass an explicit { userId: null, teamId }
  // rather than let this default to the brief's owner, which would incorrectly
  // consult the OWNER's personal OpenAI key for a machine-triggered run.
  actor: GenerationRunActor,
  // onBeforeDesign: the scheduler renews its lease here (008 FR-12).
  opts?: { templateId?: string | null; onBeforeDesign?: () => Promise<void> },
): Promise<GenerateDraftResult> {
  const trace: GenerationTrace = { t0: Date.now(), usage: newUsage() }
  let result: GenerateDraftResult
  try {
    result = await withUsage(trace.usage, () => generateDraftForBriefInner(brief, actor, opts, trace))
  } catch (err) {
    await emitGenerationFinished(brief, actor, null, trace, 'failed', err)
    throw err
  }
  await emitGenerationFinished(brief, actor, result.draft.id, trace, 'ok')
  return result
}

async function generateDraftForBriefInner(
  brief: Brief,
  actor: GenerationRunActor,
  opts: { templateId?: string | null; onBeforeDesign?: () => Promise<void> } | undefined,
  trace: GenerationTrace,
): Promise<GenerateDraftResult> {
  // 008: resolved first, so a team with no allowed model throws before any
  // model call is paid for (a sync failure creates no draft).
  const models = await resolveGenerationModels(brief, actor)
  trace.models = models
  const inputs = await resolveGenerationInputs(brief, opts?.templateId)

  const copyProvider = await resolveCopyProvider(brief.teamId, brief.copyProviderKey ?? undefined)
  const { fields, stamp: captionStamp } = await writeCaptions(
    copyProvider,
    buildBriefInput(brief, inputs.kit, inputs.campaignBriefing),
    GENERATION_TARGETS,
    models.caption,
  )
  trace.captionStamp = captionStamp
  const headline = requireHeadline(fields)

  // 027 FR-11: the facts check runs on every generation, styled or not, over
  // the headline and the captions in hand, and is written in the draft's own
  // create below. It never fails the generation: a check that cannot run is
  // stored as status 'error'.
  const factsCheck = await computeFactsCheck({
    brief,
    texts: checkTexts(headline, fields),
    preloaded: { campaignBriefing: inputs.campaignBriefing ?? null, voicePrompt: inputs.kit?.voicePrompt ?? null },
  })

  trace.factsCheck = factsCheck

  const design = await produceDesign(brief, inputs, headline, actor, models.design, opts?.onBeforeDesign)
  trace.design = design

  const draft = await prisma.$transaction(async (tx) => {
    const created = await tx.draft.create({
      data: {
        teamId: brief.teamId,
        briefId: brief.id,
        headline,
        // requireHeadline passed, so the headline validated: it carries the stamp.
        ...headlineStampFields(captionStamp),
        captions: { create: captionRowsFromFields(fields, captionStamp) },
        factsCheck: factsCheck as unknown as Prisma.InputJsonValue,
        htmlContent: design.htmlContent,
        templateId: inputs.template?.id ?? null,
        exportUrl: design.exportUrl,
        imageUrl: design.backgroundImageUrl,
        ...design.backgroundSkip,
        imageSource: design.imageSource,
        status: 'EXPORTED',
        ...draftStampFields(design.stamp),
        currentRevisionNumber: 1,
      },
    })
    await tx.draftRevision.create({
      data: {
        draftId: created.id,
        revisionNumber: 1,
        instruction: 'Original design',
        htmlSnapshot: design.htmlContent,
        exportUrl: design.exportUrl,
        ...revisionStampFields(design.stamp),
      },
    })
    return created
  })

  return { draft, backgroundImageUrl: design.backgroundImageUrl }
}

// ── Async (interactive) lifecycle ────────────────────────────────────────────
// The brief wizard wants to land on the preview page IMMEDIATELY and show
// skeletons, so generation is split: createPendingDraft (fast, validated,
// synchronous) then runGenerationForDraft (the heavy work, run in the background
// and never awaited by the request). The draft page polls while IN_PROGRESS.

// Validate inputs and create an IN_PROGRESS placeholder draft (no headline, no
// image yet) with one PENDING caption row per registry channel, in one
// transaction (the nested create). Throws the same typed errors as the sync
// path BEFORE any draft exists, so the route can return a 4xx for bad input.
// A PENDING row is the "caption not written yet" state the preview page
// renders as a skeleton.
export async function createPendingDraft(
  brief: Brief,
  opts?: { templateId?: string | null },
): Promise<Draft> {
  const inputs = await resolveGenerationInputs(brief, opts?.templateId)
  return prisma.draft.create({
    data: {
      teamId: brief.teamId,
      briefId: brief.id,
      templateId: inputs.template?.id ?? null,
      status: 'IN_PROGRESS',
      captions: { create: CAPTION_CHANNELS.map(({ channel }) => ({ channel, status: 'PENDING' as const })) },
    },
  })
}

// Run the heavy generation for an existing IN_PROGRESS draft: one caption call
// for every channel and the headline, written the moment it's ready (rows +
// headline in one transaction, so the caption skeletons resolve independently
// of the image) → design + render from the headline → finalize as EXPORTED
// with a v1 revision. No valid headline fails the draft (A6) and keeps the
// captions that validated. On any failure the draft is marked FAILED with the
// reason for the inline error card. Designed to be fire-and-forget from the
// route; also reused by the retry route, which resets the rows to PENDING.
export async function runGenerationForDraft(draftId: string, actor: GenerationRunActor): Promise<void> {
  const usage = newUsage()
  return withUsage(usage, () => runGenerationForDraftInner(draftId, actor, usage))
}

async function runGenerationForDraftInner(draftId: string, actor: GenerationRunActor, usage: UsageStore): Promise<void> {
  const draft = await prisma.draft.findUnique({ where: { id: draftId }, include: { brief: true } })
  if (!draft) return
  const trace: GenerationTrace = { t0: Date.now(), usage }
  // Emitted after the try/catch, once the outcome is written, so an analytics
  // problem (which only throws under the test seams) can never flip a finished
  // draft to FAILED (006 NFR-01).
  let finished: { outcome: 'ok' } | { outcome: 'failed'; err: unknown } | null = null
  try {
    // 008 design §3: the one resolution that runs in the background — retry
    // re-enters here — so it reads stored values only (Brief → team → system),
    // never an explicit request. NO_ALLOWED_MODEL fails the draft with its message.
    const models = await resolveGenerationModels(draft.brief, actor)
    trace.models = models
    const inputs = await resolveGenerationInputs(draft.brief, draft.templateId)

    const copyProvider = await resolveCopyProvider(draft.brief.teamId, draft.brief.copyProviderKey ?? undefined)
    const { fields, stamp: captionStamp } = await writeCaptions(
      copyProvider,
      buildBriefInput(draft.brief, inputs.kit, inputs.campaignBriefing),
      GENERATION_TARGETS,
      models.caption,
    )
    trace.captionStamp = captionStamp
    await saveGenerationCaptions(draftId, fields, captionStamp)
    const headline = requireHeadline(fields)

    // Two heartbeats (008 FR-12): the caption save above bumps updatedAt, and
    // touchGeneration runs again right before the design, so the stale sweep
    // never measures captions + background + design as one segment.
    const design = await produceDesign(draft.brief, inputs, headline, actor, models.design, () =>
      touchGeneration(draftId),
    )
    trace.design = design
    await finalizeDraftV1(draftId, design)
    finished = { outcome: 'ok' }
  } catch (err) {
    const reason = humanizeGenerationError(err)
    await prisma.draft
      .update({
        where: { id: draftId },
        data: {
          status: 'FAILED',
          failureReason: reason,
          // A row still PENDING here was never written (the caption call
          // itself failed); PENDING must mean "work is running", so it fails
          // with the draft. Rows that were written are kept, and so is a row
          // for a channel outside the registry (a hidden WhatsApp row, 026).
          captions: {
            updateMany: {
              where: { status: 'PENDING', channel: { in: CAPTION_CHANNELS.map((s) => s.channel) } },
              data: { status: 'FAILED', text: '', failureReason: 'generation failed' },
            },
          },
        },
      })
      .then(() => {
        finished = { outcome: 'failed', err }
      })
      .catch(() => {
        /* draft deleted mid-flight — nothing to record */
      })
  }
  if (finished) {
    // The caption write refreshed the stored check; read what is there now.
    try {
      const row = await prisma.draft.findUnique({ where: { id: draftId }, select: { factsCheck: true } })
      trace.factsCheck = parseFactsCheck(row?.factsCheck)
    } catch {
      trace.factsCheck = null
    }
    const done = finished as { outcome: 'ok' } | { outcome: 'failed'; err: unknown }
    await emitGenerationFinished(
      draft.brief,
      actor,
      draftId,
      trace,
      done.outcome,
      done.outcome === 'failed' ? done.err : undefined,
    )
  }
}
