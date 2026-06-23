import type { DesignOrchestrator } from '../../interfaces/DesignOrchestrator'
import type { BriefInput } from '../../interfaces/CopyProvider'
import { runDesignAgent } from '@/lib/agent/designAgent'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { buildBrandKitSystemContext } from '@/lib/brandkit/systemContext'

function buildSystemPrompt(kit: Awaited<ReturnType<typeof resolveBrandKit>>): string {
  if (!kit) throw new Error('No brand kit resolved — brand kit is required for Path B generation')

  return `You are a professional social media design agent. Your task is to create a complete, original HTML/CSS social media post design from scratch.

${buildBrandKitSystemContext(kit)}

Design requirements:
- Create a visually striking, on-brand social media post
- Use the brand colors as CSS custom properties
- Apply brand fonts via @font-face (use the provided URLs) or fall back to system fonts
- If the logo URL is provided, include it in the design
- Output dimensions: 1080×1080 pixels (square format)
- Use CSS/SVG for backgrounds, shapes, and geometric elements where possible
- Only call generateImage when authentic photographic imagery genuinely improves the design
- Always call renderHtml as the final step to produce the finished PNG

Image intent rules (IMPORTANT):
- Images tagged "embed": YOU MUST include these in the HTML layout via <img> tags
- Images tagged "reference": use for compositional inspiration only — do NOT embed as <img> tags`
}

function buildUserMessage(brief: BriefInput & { id: string }): string {
  const briefImages = Array.isArray(brief.briefImages) ? brief.briefImages : []
  const imageSection = briefImages.length > 0
    ? `\n\nProvided images (follow intent rules from system prompt):\n${briefImages.map((img) => `- ${img.url} (intent: ${img.intent})`).join('\n')}`
    : ''

  return `Create a social media post for the following brief:

Topic: ${brief.topic}
Description: ${brief.description ?? 'none'}
Goal: ${brief.goal}
Tone: ${brief.tone}
Channels: ${brief.channels.join(', ')}${imageSection}

Design a complete, original HTML/CSS post. Call renderHtml(html, 1080, 1080) as your final step.`
}

export class ClaudeHtmlOrchestrator implements DesignOrchestrator {
  async orchestrate(
    brief: BriefInput & { id: string; campaignId?: string | null },
    _brandKitId?: string
  ): Promise<{ htmlContent: string; exportUrl: string }> {
    const kit = await resolveBrandKit(brief.campaignId)
    const systemPrompt = buildSystemPrompt(kit)
    const userMessage = buildUserMessage(brief)
    const result = await runDesignAgent({
      systemPrompt,
      userMessage,
      briefId: brief.id,
      model: 'claude-sonnet-4-6',
      maxToolCalls: 15,
    })
    return { htmlContent: result.htmlContent, exportUrl: result.exportUrl }
  }
}
