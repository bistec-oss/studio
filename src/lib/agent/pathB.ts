import { prisma } from '@/lib/prisma'
import type { Brief } from '@prisma/client'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import type { DesignAgentResult } from '@/lib/agent/types'
import { runDesignAgent } from '@/lib/agent/designAgent'
import { runDesignAgentCli } from '@/lib/agent/designAgentCli'
import { extractInlineAssets } from '@/lib/agent/inlineAssets'
import { dimensionsFor } from '@/lib/aspectRatio'
import { isCliMode, modelFor, pipelineMode } from '@/lib/agent/config'
import { buildPathBSystemPrompt, buildPathBUserMessage } from '@/lib/agent/prompts/pathB'
import { parseBriefImages } from '@/lib/agent/briefInput'

// Re-export for existing importers; canonical home is agent/briefInput.ts.
export { buildBriefInput } from '@/lib/agent/briefInput'

// Runs the Path B (freeform) design pipeline for a given brief + already-generated
// copy, dispatching CLI vs API. Single source of truth for initial generation
// (assemble-b), regeneration (regenerate-design), and the ACP surface, so the
// entry points never drift.
export async function runPathBDesign(
  brief: Brief,
  kit: ResolvedBrandKit,
  copyText: string,
): Promise<DesignAgentResult> {
  // Feed-to-AI artifact URLs (brand reference imagery).
  const artifacts = await prisma.brandKitArtifact.findMany({
    where: { brandKitId: kit.id, feedToAI: true },
    select: { url: true },
  })
  const artifactUrls = artifacts.map((a) => a.url)

  // Output canvas for this brief (1080×1080 square or 1080×1350 portrait).
  const { width, height } = dimensionsFor(brief.aspectRatio)

  // Optional reference template for style inspiration.
  let referenceTemplate: { htmlTemplate: string } | null = null
  if (brief.referenceTemplateId) {
    referenceTemplate = await prisma.brandKitTemplate.findUnique({
      where: { id: brief.referenceTemplateId },
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

  const systemPrompt = buildPathBSystemPrompt({
    kit,
    mode,
    width,
    height,
    artifactUrls,
    referenceTemplateHtml,
  })
  const userMessage = buildPathBUserMessage({
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

  return isCliMode()
    ? runDesignAgentCli({ systemPrompt, userMessage, briefId: brief.id, width, height, model: modelFor('B', 'cli') })
    : runDesignAgent({
        systemPrompt,
        userMessage,
        briefId: brief.id,
        model: modelFor('B', 'api'),
        maxToolCalls: 15,
        width,
        height,
      })
}
