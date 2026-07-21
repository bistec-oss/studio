import { prisma } from '@/lib/prisma'
import type { Brief } from '@prisma/client'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import type { DesignAgentResult, GenerationActor } from '@/lib/agent/types'
import { runDesignAgent } from '@/lib/agent/designAgent'
import { runDesignAgentCli } from '@/lib/agent/designAgentCli'
import { extractInlineAssets } from '@/lib/agent/inlineAssets'
import { dimensionsFor } from '@/lib/aspectRatio'
import { isCliMode, modelFor, pipelineMode } from '@/lib/agent/config'
import { buildPathBSystemPrompt, buildPathBUserMessage } from '@/lib/agent/prompts/pathB'
import { parseBriefImages } from '@/lib/agent/briefInput'
import { generateBackgroundForBrief } from '@/lib/agent/background'

// Re-export for existing importers; canonical home is agent/briefInput.ts.
export { buildBriefInput } from '@/lib/agent/briefInput'

export type PathBDesignResult = DesignAgentResult & {
  // Public URL of the AI-generated background used in this design (stored on
  // Draft.imageUrl by the callers), or null when the pre-step skipped.
  backgroundImageUrl: string | null
}

// Runs the Path B (freeform) design pipeline for a given brief + already-generated
// copy, dispatching CLI vs API. Single source of truth for initial generation
// (assemble-b), regeneration (regenerate-design), and the ACP surface, so the
// entry points never drift.
export async function runPathBDesign(
  brief: Brief,
  kit: ResolvedBrandKit,
  copyText: string,
  campaignBriefing: string | null | undefined,
  actor: GenerationActor,
): Promise<PathBDesignResult> {
  // Feed-to-AI artifact URLs (brand reference imagery).
  const artifacts = await prisma.brandKitArtifact.findMany({
    where: { brandKitId: kit.id, feedToAI: true },
    select: { url: true },
  })
  const artifactUrls = artifacts.map((a) => a.url)

  // Output canvas for this brief (1080×1080 square or 1080×1350 portrait).
  const { width, height } = dimensionsFor(brief.aspectRatio)

  // Optional reference template for style inspiration. Scoped to the brief's
  // own team via its parent brand kit (I2, final review — defense-in-depth;
  // briefs/route.ts already rejects a foreign referenceTemplateId at create
  // time, but a pre-fix row or a direct DB write must not leak another team's
  // template HTML into the design prompt as "style inspiration").
  let referenceTemplate: { htmlTemplate: string } | null = null
  if (brief.referenceTemplateId) {
    referenceTemplate = await prisma.brandKitTemplate.findFirst({
      where: { id: brief.referenceTemplateId, brandKit: { teamId: brief.teamId } },
      select: { htmlTemplate: true },
    })
  }

  // The reference template is style inspiration only — never filled, never
  // rendered. Strip its inline `data:` assets (the same externalization Path A
  // uses) before it enters the prompt: a heavy template (e.g. "Hearts Talk",
  // 1.89 MB) would otherwise blow the CLI 600k guard / API ~200k context. Unlike
  // Path A there is no restore step — the model only needs the structural
  // HTML/CSS to grasp the visual style, not the base64 payloads it can't read.
  const referenceTemplateHtml = referenceTemplate
    ? extractInlineAssets(referenceTemplate.htmlTemplate).html
    : null

  const mode = pipelineMode()
  const briefImages = parseBriefImages(brief.briefImages)

  // Background pre-step: Claude (Haiku) decides + gpt-image generates a
  // full-bleed background before the design call. Null on skip/failure — the
  // design proceeds with CSS/SVG visuals as before. See agent/background.ts.
  const backgroundImageUrl = await generateBackgroundForBrief(brief, kit, copyText, campaignBriefing, actor)

  const systemPrompt = buildPathBSystemPrompt({
    kit,
    mode,
    width,
    height,
    artifactUrls,
    referenceTemplateHtml,
    backgroundImageUrl,
  })
  const userMessage = buildPathBUserMessage({
    campaignBriefing,
    topic: brief.topic,
    description: brief.description,
    goal: brief.goal,
    tone: brief.tone,
    channels: brief.channels,
    copyText,
    mode,
    width,
    height,
    briefImages,
  })

  const result = isCliMode()
    ? await runDesignAgentCli({ systemPrompt, userMessage, briefId: brief.id, width, height, model: modelFor('B', 'cli') })
    : await runDesignAgent({
        systemPrompt,
        userMessage,
        briefId: brief.id,
        model: modelFor('B', 'api'),
        maxToolCalls: 15,
        width,
        height,
        actor,
      })

  return { ...result, backgroundImageUrl }
}
