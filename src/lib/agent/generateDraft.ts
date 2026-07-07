import type { Brief, Draft } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { getActiveCampaignBriefing } from '@/lib/campaign/briefing'
import { resolveCopyProvider } from '@/providers/registry'
import { buildBriefInput } from '@/lib/agent/briefInput'
import { runPathADesign, assertTemplateMatchesBrief } from '@/lib/agent/pathA'
import { runPathBDesign } from '@/lib/agent/pathB'
import { PROMPT_VERSION } from '@/lib/agent/prompts/shared'

// Path B needs a resolvable brand kit; thrown before any model call is paid for.
export class NoBrandKitError extends Error {
  constructor() {
    super('No brand kit found — configure a brand kit for this campaign, project, or set a system default.')
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

// The one brief→draft generation orchestrator: brand-kit + campaign-briefing
// resolution → copy → Path A/B design dispatch → Draft persistence. Shared by
// the assemble-a/b routes, the MCP/ACP surface, and the scheduled-generation
// runner so they can never drift. Callers own auth/ownership and error→HTTP
// mapping; MOCK_AI seams live inside the providers/agents this calls.
export async function generateDraftForBrief(
  brief: Brief,
  opts?: { templateId?: string | null },
): Promise<GenerateDraftResult> {
  // Brand kit precedence: explicit brief kit → campaign → project → system default.
  const kit = await resolveBrandKit(brief.campaignId ?? undefined, brief.brandKitId ?? undefined)

  // Campaign-level briefing (when the brief's campaign has an active one) —
  // injected into copy and design prompts alongside the brand voice.
  const campaignBriefing = await getActiveCampaignBriefing(brief.campaignId)

  // Resolve + validate the design path's inputs BEFORE paying for copy.
  const isTemplate = brief.designMode === 'TEMPLATE'
  let template = null
  if (isTemplate) {
    if (!opts?.templateId) throw new TemplateNotFoundError()
    template = await prisma.brandKitTemplate.findUnique({ where: { id: opts.templateId } })
    if (!template) throw new TemplateNotFoundError()
    assertTemplateMatchesBrief(brief, template)
  } else if (!kit) {
    throw new NoBrandKitError()
  }

  const copyProvider = await resolveCopyProvider(brief.copyProviderKey ?? undefined)
  const copyText = await copyProvider.generateCopy(buildBriefInput(brief, kit, campaignBriefing))

  let htmlContent: string
  let exportUrl: string
  let backgroundImageUrl: string | null = null

  if (template) {
    const result = await runPathADesign(brief, kit, template, copyText, campaignBriefing)
    htmlContent = result.htmlContent
    exportUrl = result.exportUrl
  } else {
    const result = await runPathBDesign(brief, kit!, copyText, campaignBriefing)
    htmlContent = result.htmlContent
    exportUrl = result.exportUrl
    backgroundImageUrl = result.backgroundImageUrl
  }

  const draft = await prisma.draft.create({
    data: {
      briefId: brief.id,
      copyText,
      htmlContent,
      templateId: template?.id ?? null,
      // exportUrl is an EXPORTS object key; stored as-is, signed per read.
      exportUrl,
      // Public URL of the AI-generated background (null when the pre-step
      // skipped, and always null for Path A).
      imageUrl: backgroundImageUrl,
      status: 'EXPORTED',
      promptVersion: PROMPT_VERSION,
    },
  })

  return { draft, backgroundImageUrl }
}
