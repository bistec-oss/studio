import type { AspectRatio } from '@prisma/client'
import { runVisionModel } from '@/lib/agent/vision'
import { getImageDimensions } from '@/lib/renderer/puppeteer'
import { dimensionsFor, nearestAspectRatio } from '@/lib/aspectRatio'
import { stripCodeFences } from '@/lib/agent/claudeCli'
import { MOCK_AI, buildMockTemplateHtml } from '@/lib/testHooks'

// F6 — turn an uploaded image into a reusable Path A HTML template. The vision
// model studies the image's layout + aesthetic and produces a self-contained
// HTML/CSS document sized for the target canvas, with SAMPLE content in each
// slot (headline / body / logo / primary photo). Path A templates use sample
// text the fill agent replaces at generation time — NOT mustache tokens (see
// prompts/pathA.ts) — so the output drops straight into the template editor.

export interface TemplateFromImageResult {
  html: string
  aspectRatio: AspectRatio
}

// Infer the aspect ratio from the image unless the admin overrode it, then
// generate the template at that canvas size.
export async function generateTemplateFromImage(input: {
  imageDataUrl: string
  imageUrl: string
  aspectRatioOverride?: AspectRatio
  teamId: string
}): Promise<TemplateFromImageResult> {
  let aspectRatio = input.aspectRatioOverride
  if (!aspectRatio) {
    const { width, height } = await getImageDimensions(input.imageDataUrl)
    aspectRatio = nearestAspectRatio(width, height)
  }
  const { width, height } = dimensionsFor(aspectRatio)

  if (MOCK_AI) return { html: buildMockTemplateHtml(width, height), aspectRatio }

  const system = [
    'You convert a reference image into a REUSABLE HTML/CSS template for bistec-studio (a "Path A" brand template).',
    `Produce ONE self-contained HTML document sized exactly ${width}×${height}px (set the body/root to those pixel dimensions).`,
    'Recreate the reference image\'s LAYOUT and AESTHETIC — its composition, color feel, type scale, and mood — as editable HTML/CSS. Inline all CSS in a <style> tag. Do not use external images; use CSS shapes/gradients for decoration and a neutral placeholder box for any photo area.',
    'Design it as a TEMPLATE with clear content SLOTS: a headline, supporting body text, a logo area, and a primary photo/subject slot. Fill each slot with realistic SAMPLE content (e.g. a sample headline, sample body sentence, a placeholder photo box) — the downstream fill agent replaces this sample content with real copy and imagery. Do NOT use mustache/handlebars tokens like {{headline}}; use plain sample text.',
    'Reply with ONLY the HTML document — no commentary, no code fences.',
  ].join('\n')

  const reply = await runVisionModel({
    system,
    userMessage: 'Generate the reusable template HTML from this reference image.',
    imageUrls: [input.imageUrl],
    maxTokens: 4096,
    label: 'image-template',
    teamId: input.teamId,
  })
  return { html: stripCodeFences(reply).trim(), aspectRatio }
}
