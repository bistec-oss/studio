// Refine (AGUI) prompt builders — one source for the API tool-use loop and the
// CLI single-shot runner. The brand-conflict compliance protocol only exists in
// API mode (CLI mode applies the edit directly — a documented behavioral fork).

import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import { buildBrandKitSystemContext } from '@/lib/brandkit/systemContext'
import type { PipelineMode } from '@/lib/agent/config'
import { placeholderNote } from './shared'

export interface RefinePromptOptions {
  kit: ResolvedBrandKit
  mode: PipelineMode
  width: number
  height: number
  hasInlineAssets: boolean
}

export function buildRefineSystemPrompt(opts: RefinePromptOptions): string {
  const { kit, mode, width, height, hasInlineAssets } = opts

  if (mode === 'cli') {
    return `You are a design refinement agent. Apply the user's instruction as a targeted edit to the HTML, staying on-brand. Preserve everything the instruction does not touch.

${buildBrandKitSystemContext(kit)}${placeholderNote(hasInlineAssets)}

Output protocol (single-shot — you have NO tools):
- Apply the user's instruction as a targeted edit to the HTML above. Change ONLY what the instruction requires; preserve all other structure, layout, and CSS.
- Keep the ${width}×${height} px canvas size unless the instruction explicitly asks to resize it.
- Do NOT add external image/CDN references other than any URL explicitly named in the instruction. Brand font @import URLs are allowed.
- Output ONLY the complete updated HTML document, starting with <!DOCTYPE html> and ending with </html>. No markdown code fences, no commentary.`
  }

  return `You are a design refinement agent. Here is the current HTML design. Apply the user's instruction as a targeted edit — change only what the instruction requires and preserve everything else.

${buildBrandKitSystemContext(kit)}

Compliance instructions:
Before applying any change, check if it conflicts with the brand kit (e.g. introducing off-brand colors, removing the logo, replacing brand fonts). If it does NOT conflict, apply the change and call renderHtml(html, ${width}, ${height}) as your final step to produce the finished PNG.

If the change WOULD conflict with the brand kit, do NOT apply it and do NOT call renderHtml. Instead, your final text response must be ONLY a single JSON object, with no other text, in exactly this form:
{ "conflict": true, "explanation": "<why this conflicts with the brand kit>", "pendingHtml": "<the full modified HTML as you would have applied it>" }${placeholderNote(hasInlineAssets)}`
}

export interface RefineUserMessageOptions {
  slimHtml: string
  hasHtml: boolean
  instruction: string
  width: number
  height: number
}

export function buildRefineUserMessage(opts: RefineUserMessageOptions): string {
  const { slimHtml, hasHtml, instruction, width, height } = opts
  return `Current HTML design:

${hasHtml ? slimHtml : `(no current HTML — start from a blank ${width}×${height} canvas)`}

Instruction: ${instruction}`
}
