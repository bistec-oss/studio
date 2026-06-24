import type { DesignAgentOptions, DesignAgentResult } from "./types"
import { runClaudeCli, stripCodeFences } from "./claudeCli"
import { restoreInlineAssets, missingTokens } from "./inlineAssets"
import { renderHtmlToPng } from "@/lib/renderer/puppeteer"
import { uploadObject, BUCKET_EXPORTS } from "@/lib/storage/minio"

// Default instruction — freeform design (Path B): Claude invents the whole layout.
const CLI_FREEFORM_INSTRUCTION = `
---
IMPORTANT — CLI MODE: You have NO tools available in this mode. Ignore any earlier
instruction to call generateImage or renderHtml. Instead:
- Output ONLY a single, complete, self-contained HTML document.
- Start directly with <!DOCTYPE html> and end with </html>.
- Inline ALL CSS in a <style> tag. Do NOT use markdown code fences or any commentary.
- Use CSS gradients/shapes and inline SVG for all visuals. Do NOT reference external
  raster images or external CDNs (brand font @import URLs from the brief are allowed).
- Design for a 1080×1080 px square canvas (set the root element to 1080×1080).`

// Template-fill instruction (Path A): Claude fills a provided template and MUST
// preserve its structure — including image placeholder tokens, which are spliced
// back to real assets after the model returns.
const CLI_TEMPLATE_FILL_INSTRUCTION = `
---
IMPORTANT — CLI MODE, TEMPLATE FILL: You have NO tools available in this mode.
Ignore any earlier instruction to call generateImage or renderHtml. Instead:
- Take the provided HTML template and replace its placeholder TEXT with the copy.
- Keep the template's structure, layout, and CSS intact — only swap in the content.
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
const CLI_REFINE_INSTRUCTION = `
---
IMPORTANT — CLI MODE, REFINE: You have NO tools available in this mode.
Ignore any earlier instruction to call generateImage or renderHtml. Instead:
- Apply the user's instruction as a targeted edit to the HTML above. Change ONLY what the
  instruction requires; preserve all other structure, layout, and CSS.
- Keep any __INLINE_ASSET_0__-style tokens in src="" or url() EXACTLY as written.
- Do NOT add external image/CDN references other than any URL explicitly named in the
  instruction. Brand font @import URLs are allowed.
- Output ONLY the complete updated HTML document, starting with <!DOCTYPE html> and ending
  with </html>. No markdown code fences, no commentary.`

export const CLI_INSTRUCTION = {
  freeform: CLI_FREEFORM_INSTRUCTION,
  templateFill: CLI_TEMPLATE_FILL_INSTRUCTION,
  refine: CLI_REFINE_INSTRUCTION,
}

type CliAgentOptions = Pick<DesignAgentOptions, "systemPrompt" | "userMessage" | "briefId" | "inlineAssets"> & {
  // Which trailing instruction block to append. Defaults to freeform (Path B).
  cliInstruction?: string
}

// CLI-mode replacement for runDesignAgent. Drives a single-shot HTML generation
// through the local Claude Code CLI (no Anthropic API), then renders the result
// to a PNG via Puppeteer and uploads it to MinIO — producing a real exportUrl so
// the draft preview works end-to-end without API keys.
export async function runDesignAgentCli(options: CliAgentOptions): Promise<DesignAgentResult> {
  const { systemPrompt, userMessage, briefId, inlineAssets, cliInstruction = CLI_FREEFORM_INSTRUCTION } = options

  const prompt = `${systemPrompt}\n\n${userMessage}\n${cliInstruction}`

  // Freeform Path B design is a heavier single-shot than copy/template-fill and
  // can run past 3 min on the local CLI; allow more headroom before timing out.
  const raw = await runClaudeCli(prompt, { timeoutMs: 300_000 })
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
  const png = await renderHtmlToPng(html, 1080, 1080)
  const key = `exports/cli-${briefId}-${Date.now()}.png`
  await uploadObject(png, BUCKET_EXPORTS, key, "image/png")

  // Persist the object key; it is signed per read.
  return { htmlContent: html, exportUrl: key, toolCallCount: 0 }
}
