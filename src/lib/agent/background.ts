// Background-image pre-step for Path B generation and AGUI refine.
//
// Flow: Claude (Haiku — modelForBackground) answers a small strict-JSON question
// ("should this post get an AI-generated background, and with what prompt?"),
// then the server calls the resolved IMAGE provider (gpt-image-2 by default) and
// persists the result to the public IMAGES bucket. The returned URL is injected
// into the design/refine prompts as the background layer and stored on
// Draft.imageUrl.
//
// Failure policy: this step NEVER fails the pipeline. No image provider, a
// declined decision, a provider error, or malformed JSON all resolve to null and
// the design proceeds without a generated background (CSS/SVG as before).
// MOCK_AI skips the step entirely so the E2E suite stays deterministic.

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { Brief } from '@prisma/client'
import { env } from '@/lib/env'
import { MOCK_AI } from '@/lib/testHooks'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import { resolveImageProvider } from '@/providers/registry'
import { persistDataUrlImage } from '@/lib/storage/minio'
import { runClaudeCli, stripCodeFences } from '@/lib/agent/claudeCli'
import { isCliMode, modelForBackground } from '@/lib/agent/config'
import {
  buildBackgroundDecisionPrompt,
  buildRefineBackgroundDecisionPrompt,
  type BackgroundDecisionPrompt,
} from '@/lib/agent/prompts/background'

const decisionSchema = z.object({
  needed: z.boolean(),
  prompt: z.string().optional().default(''),
})
export type BackgroundDecision = z.infer<typeof decisionSchema>

function log(msg: string) {
  console.log(`[background] ${msg}`)
}

// Provider-native image size for the post's aspect ratio. gpt-image supports
// 1024x1024 / 1536x1024 / 1024x1536; the design layer cover-crops to the exact
// 1080×1080 / 1080×1350 canvas, so nearest-orientation is enough.
export function imageSizeFor(aspectRatio: string): string {
  return aspectRatio === 'PORTRAIT' ? '1024x1536' : '1024x1024'
}

// Tolerant strict-JSON extraction, mirroring the refine route's parseConflict:
// strip a wrapping fence, isolate the outermost {...}, JSON.parse, zod-validate.
export function parseBackgroundDecision(raw: string): BackgroundDecision | null {
  const unfenced = stripCodeFences(raw)
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return decisionSchema.parse(JSON.parse(unfenced.slice(start, end + 1)))
  } catch {
    return null
  }
}

// One decision call, CLI vs API. Small constrained task → Haiku both ways.
async function runDecision(prompt: BackgroundDecisionPrompt): Promise<BackgroundDecision | null> {
  if (isCliMode()) {
    const raw = await runClaudeCli(`${prompt.system}\n\n${prompt.user}`, {
      label: 'background',
      model: modelForBackground('cli'),
      timeoutMs: 90_000,
    })
    return parseBackgroundDecision(raw)
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const message = await client.messages.create({
    model: modelForBackground('api'),
    max_tokens: 1024,
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
  })
  const text = message.content.find((b) => b.type === 'text')
  return text && text.type === 'text' ? parseBackgroundDecision(text.text) : null
}

// Shared tail: run the decision, then (when needed) generate + persist the image.
// imageProviderKey is the brief's optional per-brief override.
async function decideAndGenerate(
  prompt: BackgroundDecisionPrompt,
  opts: { brandKitId: string; aspectRatio: string; imageProviderKey?: string | null },
): Promise<string | null> {
  // Resolve the image provider FIRST — if none is configured there is no point
  // spending a Claude call on the decision.
  let provider
  try {
    provider = await resolveImageProvider(opts.imageProviderKey ?? undefined)
  } catch (err) {
    log(`skipped — no image provider available (${err instanceof Error ? err.message : err})`)
    return null
  }

  const decision = await runDecision(prompt)
  if (!decision) {
    log('skipped — decision response was not valid JSON')
    return null
  }
  if (!decision.needed || !decision.prompt.trim()) {
    log('skipped — model decided no background image is needed')
    return null
  }

  log(`generating background · size=${imageSizeFor(opts.aspectRatio)} · prompt="${decision.prompt.slice(0, 120)}..."`)
  const startedAt = Date.now()
  const result = await provider.generateImage(decision.prompt, opts.brandKitId, imageSizeFor(opts.aspectRatio))
  // persistDataUrlImage enforces the raster allow-list and returns a stable
  // public URL; a provider that already returns an http(s) URL passes through.
  const url = result.url.startsWith('data:')
    ? await persistDataUrlImage(result.url, 'background')
    : result.url
  log(`background ready in ${((Date.now() - startedAt) / 1000).toFixed(1)}s · ${url}`)
  return url
}

/**
 * Path B initial generation / regeneration: decide (biased toward yes) and
 * generate a background for the brief. Returns the public image URL or null.
 * Never throws.
 */
export async function generateBackgroundForBrief(
  brief: Brief,
  kit: ResolvedBrandKit,
  copyText: string,
): Promise<string | null> {
  if (MOCK_AI) return null
  try {
    const prompt = buildBackgroundDecisionPrompt({
      kit,
      topic: brief.topic,
      description: brief.description,
      goal: brief.goal,
      tone: brief.tone,
      copyText,
    })
    return await decideAndGenerate(prompt, {
      brandKitId: kit.id,
      aspectRatio: brief.aspectRatio,
      imageProviderKey: brief.imageProviderKey,
    })
  } catch (err) {
    log(`skipped after error — proceeding without background: ${err instanceof Error ? err.message : err}`)
    return null
  }
}

/**
 * AGUI refine: generate a new background ONLY when the instruction asks for one
 * (neutral bias — see the refine decision prompt). Returns the URL or null.
 * Never throws.
 */
export async function generateBackgroundForRefine(
  brief: Brief,
  kit: ResolvedBrandKit,
  instruction: string,
): Promise<string | null> {
  if (MOCK_AI) return null
  try {
    const prompt = buildRefineBackgroundDecisionPrompt({ kit, topic: brief.topic, instruction })
    return await decideAndGenerate(prompt, {
      brandKitId: kit.id,
      aspectRatio: brief.aspectRatio,
      imageProviderKey: brief.imageProviderKey,
    })
  } catch (err) {
    log(`skipped after error — proceeding without background: ${err instanceof Error ? err.message : err}`)
    return null
  }
}
