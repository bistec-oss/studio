import type { DesignAgentOptions, DesignAgentResult } from "./types"
import { runClaudeCli, stripCodeFences } from "./claudeCli"
import { renderHtmlToPng } from "@/lib/renderer/puppeteer"
import { uploadObject, BUCKET_EXPORTS } from "@/lib/storage/minio"

const CLI_DESIGN_INSTRUCTION = `
---
IMPORTANT — CLI MODE: You have NO tools available in this mode. Ignore any earlier
instruction to call generateImage or renderHtml. Instead:
- Output ONLY a single, complete, self-contained HTML document.
- Start directly with <!DOCTYPE html> and end with </html>.
- Inline ALL CSS in a <style> tag. Do NOT use markdown code fences or any commentary.
- Use CSS gradients/shapes and inline SVG for all visuals. Do NOT reference external
  raster images or external CDNs (brand font @import URLs from the brief are allowed).
- Design for a 1080×1080 px square canvas (set the root element to 1080×1080).`

// CLI-mode replacement for runDesignAgent. Drives a single-shot HTML generation
// through the local Claude Code CLI (no Anthropic API), then renders the result
// to a PNG via Puppeteer and uploads it to MinIO — producing a real exportUrl so
// the draft preview works end-to-end without API keys.
export async function runDesignAgentCli(
  options: Pick<DesignAgentOptions, "systemPrompt" | "userMessage" | "briefId">,
): Promise<DesignAgentResult> {
  const { systemPrompt, userMessage, briefId } = options

  const prompt = `${systemPrompt}\n\n${userMessage}\n${CLI_DESIGN_INSTRUCTION}`

  const raw = await runClaudeCli(prompt, { timeoutMs: 180_000 })
  const html = stripCodeFences(raw)

  const lower = html.toLowerCase()
  if (!lower.includes("<html") && !lower.includes("<!doctype")) {
    throw new Error(
      `Claude CLI did not return an HTML document (got ${html.length} chars starting: "${html.slice(0, 80)}")`,
    )
  }

  // Render HTML → PNG → MinIO (same pipeline as the export route).
  const png = await renderHtmlToPng(html, 1080, 1080)
  const key = `exports/cli-${briefId}-${Date.now()}.png`
  const exportUrl = await uploadObject(png, BUCKET_EXPORTS, key, "image/png")

  return { htmlContent: html, exportUrl, toolCallCount: 0 }
}
