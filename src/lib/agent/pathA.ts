import type { Brief, BrandKitTemplate } from '@prisma/client'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import type { DesignAgentResult, GenerationActor } from '@/lib/agent/types'
import { runDesignAgent } from '@/lib/agent/designAgent'
import { runDesignAgentCli } from '@/lib/agent/designAgentCli'
import { extractInlineAssets } from '@/lib/agent/inlineAssets'
import { dimensionsFor } from '@/lib/aspectRatio'
import { isCliMode, pipelineMode } from '@/lib/agent/config'
import type { ResolvedModel } from '@/lib/models/resolve'
import { buildPathASystemPrompt, buildPathAUserMessage } from '@/lib/agent/prompts/pathA'
import { imageRulesFor } from '@/lib/agent/briefInput'
import { applyPostFonts } from '@/lib/fonts/inject'
import { postFontPlan, postFontsUrl } from '@/lib/fonts/plan'

// Template/brief mismatch — thrown by the guards below so both HTTP routes
// (mapped to 400) and the headless scheduler (recorded as errorReason) get the
// same validation.
export class PathATemplateError extends Error {
  constructor(
    public code: 'KIT_MISMATCH' | 'ASPECT_MISMATCH',
    message: string,
  ) {
    super(message)
    this.name = 'PathATemplateError'
  }
}

// Validates that a template may be filled for this brief. Called by
// runPathADesign (so every entry point is guarded) and available separately
// for fail-fast checks before copy generation is paid for.
export function assertTemplateMatchesBrief(brief: Brief, template: BrandKitTemplate): void {
  // If the brief pinned a brand kit, the template must belong to it — the wizard
  // only offers templates from the selected kit, so a mismatch is a bad request.
  if (brief.brandKitId && template.brandKitId !== brief.brandKitId) {
    throw new PathATemplateError(
      'KIT_MISMATCH',
      "Template does not belong to the brief's selected brand kit"
    )
  }

  // The template must be designed for the brief's chosen size — the wizard filters
  // the picker to matching templates, so a mismatch would mean a stretched render.
  if (template.aspectRatio !== brief.aspectRatio) {
    throw new PathATemplateError(
      'ASPECT_MISMATCH',
      "Template aspect ratio does not match the brief's selected size"
    )
  }
}

// Runs the Path A (template fill) design pipeline for a given brief + template +
// on-image headline (012 FR-09: the design never reads a caption), dispatching
// CLI vs API. Single source of truth shared by the assemble-a route and the
// scheduled-generation runner, mirroring runPathBDesign's shape.
export async function runPathADesign(
  brief: Brief,
  kit: ResolvedBrandKit | null,
  template: BrandKitTemplate,
  headline: string,
  campaignBriefing: string | null | undefined,
  actor: GenerationActor,
  // 008 FR-07: the DESIGN_TEMPLATE model, resolved by the caller.
  model: ResolvedModel,
): Promise<DesignAgentResult> {
  assertTemplateMatchesBrief(brief, template)

  // Output canvas for this brief (1080×1080 square or 1080×1350 portrait).
  const { width, height } = dimensionsFor(brief.aspectRatio)

  // Externalize inline data: assets (e.g. base64 logos/backgrounds) before the
  // template enters the prompt. The model sees compact placeholder tokens; the
  // real assets are spliced back in just before rendering. Keeps oversized
  // templates (e.g. "Hearts Talk", 1.81 MB) within the prompt/context limits.
  const { html: slimTemplate, assets: inlineAssets } = extractInlineAssets(template.htmlTemplate)
  const hasInlineAssets = Object.keys(inlineAssets).length > 0

  const mode = pipelineMode()
  const systemPrompt = buildPathASystemPrompt({
    kit,
    mode,
    width,
    height,
    hasInlineAssets,
    additionalImageUrl: brief.additionalImageUrl,
    campaignBriefing,
  })
  const userMessage = buildPathAUserMessage({
    slimTemplate,
    headline,
    topic: brief.topic,
    description: brief.description,
    mode,
    width,
    height,
    additionalImageUrl: brief.additionalImageUrl,
    // 027 FR-09: Path A gets the image rules only (the template fixes the look).
    imageRules: imageRulesFor(brief),
  })

  // 031 FR-22: code adds the kit's fonts to the filled HTML before every render and upload, so
  // the stored document carries the marked link and the script font in its stacks.
  const fontPlan = postFontPlan(kit)
  const postProcess = (html: string) => applyPostFonts(html, fontPlan, postFontsUrl)

  return isCliMode()
    ? runDesignAgentCli({
        systemPrompt,
        userMessage,
        briefId: brief.id,
        inlineAssets,
        width,
        height,
        model,
        headline,
        postProcess,
      })
    : runDesignAgent({
        systemPrompt,
        userMessage,
        briefId: brief.id,
        model,
        maxToolCalls: 15,
        inlineAssets,
        width,
        height,
        actor,
        headline,
        postProcess,
      })
}
