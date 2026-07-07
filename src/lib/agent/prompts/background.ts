// Background-image decision prompt builders — one source for the API and CLI
// dispatch in src/lib/agent/background.ts. Pure functions: context in, prompt
// strings out. The model answers a small constrained question ("does this post
// want an AI-generated background, and if so what should the image prompt be?")
// as strict JSON; the caller parses and then drives the image provider itself.

import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import { buildBrandKitSystemContext } from '@/lib/brandkit/systemContext'

export interface BackgroundDecisionPrompt {
  system: string
  user: string
}

// Shared instructions for what a good gpt-image background prompt looks like.
// Text is banned from the image itself — the HTML design layer supplies all
// typography, and raster models render text poorly.
const IMAGE_PROMPT_RULES = `Rules for the "prompt" you write (it is sent to an image-generation model):
- Describe a full-bleed BACKGROUND image: photographic, illustrated, or abstract — whatever suits the brief and brand.
- Reflect the brand palette and mood in the description (name the colours descriptively, e.g. "deep navy blue with grass-green accents").
- The image must contain NO text, NO logos, NO letters or numbers of any kind — typography is layered on top in HTML.
- Favour compositions with calm/negative space so overlaid copy stays legible.
- Keep it under 600 characters.`

const OUTPUT_PROTOCOL = `Output protocol (STRICT):
Respond with ONLY a single JSON object, no markdown fences, no commentary, exactly:
{ "needed": <true|false>, "prompt": "<the image-generation prompt, or empty string when needed is false>" }`

export interface GenerationDecisionOptions {
  kit: ResolvedBrandKit
  topic: string
  description?: string | null
  goal: string
  tone: string
  copyText: string
  // Active campaign briefing — campaign-level context that should inform the
  // background mood/subject alongside the per-post brief.
  campaignBriefing?: string | null
}

// Initial generation (Path B): biased toward generating — most posts benefit
// from a real background; skip only when a flat/gradient design is clearly better.
export function buildBackgroundDecisionPrompt(opts: GenerationDecisionOptions): BackgroundDecisionPrompt {
  const { kit, topic, description, goal, tone, copyText, campaignBriefing } = opts

  const briefingSection = campaignBriefing
    ? `Campaign briefing (applies to every post in this campaign):
${campaignBriefing}

`
    : ''

  const system = `You are the art director for a social media post pipeline. Decide whether this post should have an AI-generated background image, and if so, write the image-generation prompt.

${buildBrandKitSystemContext(kit)}

Most posts look better with a generated background — default to "needed": true. Answer false only when the brief clearly suits a flat, typographic, or pure-gradient design (e.g. a text-only quote card or minimal announcement).

${IMAGE_PROMPT_RULES}

${OUTPUT_PROTOCOL}`

  const user = `${briefingSection}Brief:
Topic: ${topic}
Description: ${description || 'none'}
Goal: ${goal}
Tone: ${tone}

Post copy: ${copyText}`

  return { system, user }
}

export interface RefineDecisionOptions {
  kit: ResolvedBrandKit
  topic: string
  instruction: string
}

// AGUI refine: neutral bias — generate ONLY when the instruction actually asks
// for a new/different background image (not for layout/text/colour tweaks).
export function buildRefineBackgroundDecisionPrompt(opts: RefineDecisionOptions): BackgroundDecisionPrompt {
  const { kit, topic, instruction } = opts

  const system = `You are the art director for a social media post pipeline. A user is refining an existing design with a natural-language instruction. Decide whether the instruction requests a NEW or DIFFERENT background image; if it does, write the image-generation prompt for it.

${buildBrandKitSystemContext(kit)}

Answer "needed": true ONLY when the instruction explicitly or clearly asks to change, replace, add, or regenerate the background imagery (e.g. "change the background to a city skyline", "give it a photographic background"). Layout, text, colour, font, or element tweaks are NOT background requests — answer false for those.

${IMAGE_PROMPT_RULES}

${OUTPUT_PROTOCOL}`

  const user = `Post topic: ${topic}

Refine instruction: ${instruction}`

  return { system, user }
}
