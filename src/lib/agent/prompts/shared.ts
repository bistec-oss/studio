// Shared prompt fragments used by both design paths and the refine flow.
// Pure string builders — no I/O — so prompt content is unit-testable and
// changes apply to every surface (API tool-use loop and CLI single-shot) at once.

import type { PipelineMode } from '@/lib/agent/config'

// Bump when prompt content changes materially; persisted on Draft.promptVersion
// so output quality can be correlated with prompt revisions.
export const PROMPT_VERSION = '2026-07-02.1'

// Instruction to preserve externalized inline-asset tokens (see inlineAssets.ts).
// Included whenever the model sees HTML whose data: URIs were tokenized.
export function placeholderNote(hasInlineAssets: boolean): string {
  return hasInlineAssets
    ? `\n- The HTML contains image placeholders like __INLINE_ASSET_0__ inside src="" attributes or CSS url(). Keep every such token EXACTLY as written — do not alter, remove, decode, wrap, or replace them. They are restored to real images after the model returns.`
    : ''
}

// Output-protocol section, selected by pipeline mode. The API mode instructs the
// tool-use loop; the CLI mode instructs a single-shot raw-HTML response. Builders
// emit exactly one protocol — never an instruction that a later block countermands.
export function outputProtocol(mode: PipelineMode, width: number, height: number): string {
  if (mode === 'api') {
    return `
Output protocol:
- If the design requires authentic photographic imagery that CSS/SVG cannot achieve, call the generateImage tool; otherwise use CSS gradients, shapes, and inline SVG.
- Always call renderHtml(html, ${width}, ${height}) as the final step to produce the finished PNG.`
  }
  return `
Output protocol (single-shot — you have NO tools):
- Output ONLY a single, complete, self-contained HTML document.
- Start directly with <!DOCTYPE html> and end with </html>.
- Inline ALL CSS in a <style> tag. Do NOT use markdown code fences or any commentary.
- Use CSS gradients/shapes and inline SVG for all visuals. Do NOT reference external raster images or external CDNs (brand font @import URLs and any image URL explicitly provided in the brief are allowed).
- Design for a ${width}×${height} px canvas (set the root element to ${width}×${height}).`
}
