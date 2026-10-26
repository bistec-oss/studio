// Background-image decision prompt builders — one source for the API and CLI
// dispatch in src/lib/agent/background.ts. Pure functions: context in, prompt
// strings out. The model answers a small constrained question ("does this post
// want an AI-generated background, and if so what should the image prompt be?")
// as strict JSON; the caller parses and then drives the image provider itself.

import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import { buildBrandKitSystemContext } from '@/lib/brandkit/systemContext'
import { imageContractText, PRECEDENCE_LINE, type Contract, type SizeContract } from '@/lib/designData'
import { onImageHeadline } from './shared'

// A hero image style's contract for one size (009): what the image prompt must
// describe and which regions it must keep calm. Generated from the dataset.
export interface HeroPromptContext {
  label: string
  contract: Contract
  size: SizeContract
}

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

// The hero form of the rules (009 FR-05): the subject and each region's
// measurement come from the dataset, and the palette, the no-text rule and the
// length cap stay. The art-director never picks an archetype or a region.
function heroImageRules(hero: HeroPromptContext): string {
  return `Rules for the "prompt" you write (it is sent to an image-generation model):
${imageContractText(hero.contract, hero.size)}
- Reflect the brand palette and mood in the description (name the colours descriptively, e.g. "deep navy blue with grass-green accents").
- The image must contain NO text, NO logos, NO letters or numbers of any kind — typography is layered on top in HTML.
- Keep it under 600 characters.`
}

const OUTPUT_PROTOCOL = `Output protocol (STRICT):
Respond with ONLY a single JSON object, no markdown fences, no commentary, exactly:
{ "needed": <true|false>, "prompt": "<the image-generation prompt, or empty string when needed is false>" }`

export interface GenerationDecisionOptions {
  kit: ResolvedBrandKit
  topic: string
  description?: string | null
  goal: string
  tone: string
  // The on-image headline (012 FR-09) — never a caption.
  headline: string
  // Active campaign briefing — campaign-level context that should inform the
  // background mood/subject alongside the per-post brief.
  campaignBriefing?: string | null
  // Present only for a hero plan (009): replaces the classic image rules and the
  // default-to-yes paragraph. Absent: the output is byte-identical to before.
  hero?: HeroPromptContext
  // 027 FR-09: the image-scope rules of the brief's post style, already
  // rendered; they go after Tone in the user message. Absent: unchanged.
  imageRules?: string
}

// Initial generation (Path B): biased toward generating — most posts benefit
// from a real background; skip only when a flat/gradient design is clearly better.
export function buildBackgroundDecisionPrompt(opts: GenerationDecisionOptions): BackgroundDecisionPrompt {
  const { kit, topic, description, goal, tone, headline, campaignBriefing, hero, imageRules } = opts

  const briefingSection = campaignBriefing
    ? `Campaign briefing (applies to every post in this campaign):
${campaignBriefing}

`
    : ''

  const system = hero
    ? `You are the art director for a social media post pipeline. Write the image-generation prompt for this post's background image.

${buildBrandKitSystemContext(kit)}

${PRECEDENCE_LINE}

The user chose the ${hero.label} style, so an image is required: answer "needed": true.

${heroImageRules(hero)}

${OUTPUT_PROTOCOL}`
    : `You are the art director for a social media post pipeline. Decide whether this post should have an AI-generated background image, and if so, write the image-generation prompt.

${buildBrandKitSystemContext(kit)}

Most posts look better with a generated background — default to "needed": true. Answer false only when the brief clearly suits a flat, typographic, or pure-gradient design (e.g. a text-only quote card or minimal announcement).

${IMAGE_PROMPT_RULES}

${OUTPUT_PROTOCOL}`

  const user = `${briefingSection}Brief:
Topic: ${topic}
Description: ${description || 'none'}
Goal: ${goal}
Tone: ${tone}${imageRules ? `

${imageRules}` : ''}

${onImageHeadline(headline)}`

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
