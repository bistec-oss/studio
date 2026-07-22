import type { Brief, Draft } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { getActiveCampaignBriefing } from '@/lib/campaign/briefing'
import { resolveCopyProvider } from '@/providers/registry'
import { buildBriefInput } from '@/lib/agent/briefInput'
import { runPathADesign, assertTemplateMatchesBrief } from '@/lib/agent/pathA'
import { runPathBDesign } from '@/lib/agent/pathB'
import { PROMPT_VERSION } from '@/lib/agent/prompts/shared'
import type { GenerationActor } from '@/lib/agent/types'

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
}

// Path A/B design dispatch → rendered PNG. The heavy model + Puppeteer work,
// shared by the sync and async lifecycles.
async function produceDesign(
  brief: Brief,
  { kit, campaignBriefing, template }: ResolvedInputs,
  copyText: string,
  actor: GenerationActor,
): Promise<ProducedDesign> {
  if (template) {
    const result = await runPathADesign(brief, kit, template, copyText, campaignBriefing, actor)
    return { htmlContent: result.htmlContent, exportUrl: result.exportUrl, backgroundImageUrl: null }
  }
  const result = await runPathBDesign(brief, kit!, copyText, campaignBriefing, actor)
  return {
    htmlContent: result.htmlContent,
    exportUrl: result.exportUrl,
    backgroundImageUrl: result.backgroundImageUrl,
  }
}

// Persist a freshly generated design onto a draft AND record it as revision v1
// (the append-only history's origin — see F2). One transaction.
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
        status: 'EXPORTED',
        promptVersion: PROMPT_VERSION,
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
      },
    })
  })
}

// SYNCHRONOUS brief→draft orchestrator: copy → design → render, then create the
// draft (EXPORTED, with v1) at the END on success. Used by the NON-interactive
// callers — MCP/ACP surface and the scheduled-generation runner — which want the
// finished draft back and rely on the thrown typed errors (a failure creates NO
// draft, so scheduler retries don't accumulate orphan FAILED drafts). The
// interactive brief wizard uses createPendingDraft + runGenerationForDraft instead.
export async function generateDraftForBrief(
  brief: Brief,
  // The MCP/ACP surface and the scheduler have no signed-in actor (Task 13/14
  // territory) — callers there must pass an explicit { userId: null, teamId }
  // rather than let this default to the brief's owner, which would incorrectly
  // consult the OWNER's personal OpenAI key for a machine-triggered run.
  actor: GenerationActor,
  opts?: { templateId?: string | null },
): Promise<GenerateDraftResult> {
  const inputs = await resolveGenerationInputs(brief, opts?.templateId)

  const copyProvider = await resolveCopyProvider(brief.teamId, brief.copyProviderKey ?? undefined)
  const copyText = await copyProvider.generateCopy(buildBriefInput(brief, inputs.kit, inputs.campaignBriefing))

  const design = await produceDesign(brief, inputs, copyText, actor)

  const draft = await prisma.$transaction(async (tx) => {
    const created = await tx.draft.create({
      data: {
        teamId: brief.teamId,
        briefId: brief.id,
        copyText,
        htmlContent: design.htmlContent,
        templateId: inputs.template?.id ?? null,
        exportUrl: design.exportUrl,
        imageUrl: design.backgroundImageUrl,
        status: 'EXPORTED',
        promptVersion: PROMPT_VERSION,
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

// Validate inputs and create an IN_PROGRESS placeholder draft (empty copy, no
// image yet). Throws the same typed errors as the sync path BEFORE any draft
// exists, so the route can return a 4xx for bad input. copyText='' is the
// "copy not written yet" sentinel the preview page renders as a skeleton.
export async function createPendingDraft(
  brief: Brief,
  opts?: { templateId?: string | null },
): Promise<Draft> {
  const inputs = await resolveGenerationInputs(brief, opts?.templateId)
  return prisma.draft.create({
    data: {
      teamId: brief.teamId,
      briefId: brief.id,
      copyText: '',
      templateId: inputs.template?.id ?? null,
      status: 'IN_PROGRESS',
    },
  })
}

// Run the heavy generation for an existing IN_PROGRESS draft: copy (persisted
// as soon as it's ready, so the copy skeleton resolves independently of the
// image) → design + render → finalize as EXPORTED with a v1 revision. On any
// failure the draft is marked FAILED with the reason for the inline error card.
// Designed to be fire-and-forget from the route; also reused by the retry route.
export async function runGenerationForDraft(draftId: string, actor: GenerationActor): Promise<void> {
  const draft = await prisma.draft.findUnique({ where: { id: draftId }, include: { brief: true } })
  if (!draft) return
  try {
    const inputs = await resolveGenerationInputs(draft.brief, draft.templateId)

    const copyProvider = await resolveCopyProvider(draft.brief.teamId, draft.brief.copyProviderKey ?? undefined)
    const copyText = await copyProvider.generateCopy(
      buildBriefInput(draft.brief, inputs.kit, inputs.campaignBriefing),
    )
    // Persist copy the moment it's ready — the preview page's copy skeleton
    // resolves now while the image skeleton keeps animating.
    await prisma.draft.update({ where: { id: draftId }, data: { copyText } })

    const design = await produceDesign(draft.brief, inputs, copyText, actor)
    await finalizeDraftV1(draftId, design)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await prisma.draft
      .update({ where: { id: draftId }, data: { status: 'FAILED', failureReason: reason } })
      .catch(() => {
        /* draft deleted mid-flight — nothing to record */
      })
  }
}
