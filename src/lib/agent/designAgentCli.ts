import type { DesignAgentOptions, DesignAgentResult } from "./types"
import { runClaudeCli, stripCodeFences } from "./claudeCli"
import { restoreInlineAssets, missingTokens } from "./inlineAssets"
import { renderHtmlToPng } from "@/lib/renderer/puppeteer"
import { uploadObject, BUCKET_EXPORTS } from "@/lib/storage/minio"

// CLI instructions are parameterised by the output canvas so the model designs at
// the brief's chosen size (1080×1080 square or 1080×1350 portrait), matching the
// dimensions Puppeteer renders at below.

// Default instruction — freeform design (Path B): Claude invents the whole layout.
const cliFreeform = (w: number, h: number) => `
---
IMPORTANT — CLI MODE: You have NO tools available in this mode. Ignore any earlier
instruction to call generateImage or renderHtml. Instead:
- Output ONLY a single, complete, self-contained HTML document.
- Start directly with <!DOCTYPE html> and end with </html>.
- Inline ALL CSS in a <style> tag. Do NOT use markdown code fences or any commentary.
- Use CSS gradients/shapes and inline SVG for all visuals. Do NOT reference external
  raster images or external CDNs (brand font @import URLs from the brief are allowed).
- Design for a ${w}×${h} px canvas (set the root element to ${w}×${h}).`

// Template-fill instruction (Path A): Claude fills a provided template and MUST
// preserve its structure — including image placeholder tokens, which are spliced
// back to real assets after the model returns.
const cliTemplateFill = (w: number, h: number) => `
---
IMPORTANT — CLI MODE, TEMPLATE FILL: You have NO tools available in this mode.
Ignore any earlier instruction to call generateImage or renderHtml. Instead:
- Take the provided HTML template and replace its placeholder TEXT with the copy.
- Keep the template's structure, layout, and CSS intact — only swap in the content.
  The template is already sized for a ${w}×${h} px canvas; do not change its dimensions.
- The template contains image placeholders that look like __INLINE_ASSET_0__ inside
  src="" attributes or CSS url(). Keep every such token EXACTLY as written — do not
  alter, remove, decode, wrap, or replace them. They are restored to real images later.
- If the brief provides a user image URL, you MUST embed it: place it into the
  template's primary photo/subject slot (e.g. an avatar/photo/headshot area), replacing
  whatever placeholder graphic — a decorative SVG, a coloured shape, or a sample photo —
  currently fills that slot. Use an <img> covering the slot (object-fit: cover) or set it
  as that element's background-image. Do NOT add any OTHER external image/CDN references.
- Brand font @import URLs are allowed.
- Output ONLY the complete HTML document, starting with <!DOCTYPE html> and ending
  with </html>. No markdown code fences, no commentary.`

// Refine instruction: apply a targeted edit to existing HTML and return the full doc.
const cliRefine = (w: number, h: number) => `
---
IMPORTANT — CLI MODE, REFINE: You have NO tools available in this mode.
Ignore any earlier instruction to call generateImage or renderHtml. Instead:
- Apply the user's instruction as a targeted edit to the HTML above. Change ONLY what the
  instruction requires; preserve all other structure, layout, and CSS.
- Keep the ${w}×${h} px canvas size unless the instruction explicitly asks to resize it.
- Keep any __INLINE_ASSET_0__-style tokens in src="" or url() EXACTLY as written.
- Do NOT add external image/CDN references other than any URL explicitly named in the
  instruction. Brand font @import URLs are allowed.
- Output ONLY the complete updated HTML document, starting with <!DOCTYPE html> and ending
  with </html>. No markdown code fences, no commentary.`

// Builders keyed by mode; each takes the output dimensions. The route picks one
// and passes the matching width/height (which also drive the Puppeteer render).
export const CLI_INSTRUCTION = {
  freeform: cliFreeform,
  templateFill: cliTemplateFill,
  refine: cliRefine,
}

export type CliInstructionBuilder = (width: number, height: number) => string

type CliAgentOptions = Pick<DesignAgentOptions, "systemPrompt" | "userMessage" | "briefId" | "inlineAssets" | "width" | "height"> & {
  // Which trailing instruction block to append. Defaults to freeform (Path B).
  cliInstruction?: CliInstructionBuilder
  // Design model for this run: Path A (template fill) passes "haiku", Path B
  // (freeform) passes "sonnet". Overridden by CLAUDE_CLI_MODEL when set.
  model?: string
}

// CLI-mode replacement for runDesignAgent. Drives a single-shot HTML generation
// through the local Claude Code CLI (no Anthropic API), then renders the result
// to a PNG via Puppeteer and uploads it to MinIO — producing a real exportUrl so
// the draft preview works end-to-end without API keys.
export async function runDesignAgentCli(options: CliAgentOptions): Promise<DesignAgentResult> {
  const {
    systemPrompt,
    userMessage,
    briefId,
    inlineAssets,
    cliInstruction = cliFreeform,
    width = 1080,
    height = 1080,
    model,
  } = options

  const prompt = `${systemPrompt}\n\n${userMessage}\n${cliInstruction(width, height)}`

  // Freeform Path B design is a heavier single-shot than copy/template-fill and
  // can run past 3 min on the local CLI; allow more headroom before timing out.
  const raw = await runClaudeCli(prompt, { timeoutMs: 300_000, label: "design", model })
  let html = stripCodeFences(raw)

  const lower = html.toLowerCase()
  if (!lower.includes("<html") && !lower.includes("<!doctype")) {
    throw new Error(
      `Claude CLI did not return an HTML document (got ${html.length} chars starting: "${html.slice(0, 80)}")`,
    )
  }

  // Re-inline any externalized assets (stripped before the prompt) so the render
  // matches the original template. Warn if the model dropped a placeholder.
  if (inlineAssets) {
    const dropped = missingTokens(html, inlineAssets)
    if (dropped.length > 0) {
      console.warn(`[designAgentCli] model dropped ${dropped.length} asset placeholder(s): ${dropped.join(", ")}`)
    }
    html = restoreInlineAssets(html, inlineAssets)
  }

  // Render HTML → PNG → MinIO (same pipeline as the export route).
  const png = await renderHtmlToPng(html, width, height)
  const key = `exports/cli-${briefId}-${Date.now()}.png`
  await uploadObject(png, BUCKET_EXPORTS, key, "image/png")

  // Persist the object key; it is signed per read.
  return { htmlContent: html, exportUrl: key, toolCallCount: 0 }
}
