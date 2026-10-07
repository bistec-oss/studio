// Shared prompt fragments used by both design paths and the refine flow.
// Pure string builders — no I/O — so prompt content is unit-testable and
// changes apply to every surface (API tool-use loop and CLI single-shot) at once.

import type { PipelineMode } from '@/lib/agent/config'

// Bump when prompt content changes materially; persisted on Draft.promptVersion
// so output quality can be correlated with prompt revisions.
// 2026-10-01.1: the CLI refine prompt carries SCRIPT_SUPPORT_NOTE (the no-emoji
// rule), and the replace semantics state the image-multiplicity rule.
// 2026-10-01.2: the refine verifier's system prompt no longer paraphrases the
// remove/constrain criteria; they come only from the table's verifierScope.
export const PROMPT_VERSION = '2026-10-01.2'

// Multilingual/script fidelity, applied to every design surface (Path A/B +
// refine). The copy generator can emit non-Latin scripts (Sinhala especially,
// for the Bistec/Hearts Academy audience); this keeps the design agent from
// romanizing or dropping those glyphs, and reassures it the renderer has the
// fonts. The runtime backs this up: "Noto Sans Sinhala" is installed OS-wide in
// the render container, so Chromium's fontconfig fallback covers Sinhala
// codepoints automatically — the model need not @import anything for it to work.
export const SCRIPT_SUPPORT_NOTE = `
Text & language fidelity:
- The copy may contain non-Latin scripts, including Sinhala (සිංහල). Reproduce every character of the copy EXACTLY as given — never transliterate, romanize, drop, or substitute glyphs. The only exception is emoji, covered below; every non-emoji character (Sinhala included) still follows this rule with no exception.
- Sinhala (and other Unicode) text renders correctly in the output. You may name "Noto Sans Sinhala" explicitly in a font-family for Sinhala text, but the renderer also falls back to it automatically, so unstyled Sinhala still renders.
- In the rendered design, use monochrome symbols from the covered set (e.g. ★ ✓ → • ✦) — never emoji; colour emoji glyphs are not installed and render as boxes. If the copy itself contains emoji, this does NOT contradict the exact-reproduction rule above: leave those emoji out of the rendered design, or replace each with a covered monochrome symbol from the listed set — never render the emoji glyph itself. This applies to the design only; captions are unaffected — the caption text keeps the copy's original emoji unchanged.`

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
