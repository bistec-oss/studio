import type { DesignAgentOptions, DesignAgentResult } from "./types"
import { runClaudeCli, stripCodeFences } from "./claudeCli"
import { restoreInlineAssets, missingTokens } from "./inlineAssets"
import { renderHtmlToPng } from "@/lib/renderer/puppeteer"
import { uploadObject, exportKey, BUCKET_EXPORTS } from "@/lib/storage/minio"

type CliAgentOptions = Pick<DesignAgentOptions, "systemPrompt" | "userMessage" | "briefId" | "inlineAssets" | "width" | "height"> & {
  // Design model for this run: Path A (template fill) passes "haiku", Path B
  // (freeform) passes "sonnet" (see agent/config.ts modelFor). Overridden by
  // CLAUDE_CLI_MODEL when set.
  model?: string
}

// CLI-mode replacement for runDesignAgent. Drives a single-shot HTML generation
// through the local Claude Code CLI (no Anthropic API), then renders the result
// to a PNG via Puppeteer and uploads it to MinIO — producing a real exportUrl so
// the draft preview works end-to-end without API keys.
//
// The system prompt must be built for CLI mode (prompts/* builders with
// mode: 'cli') — it already carries the single-shot raw-HTML output protocol,
// so nothing is appended here.
export async function runDesignAgentCli(options: CliAgentOptions): Promise<DesignAgentResult> {
  const {
    systemPrompt,
    userMessage,
    briefId,
    inlineAssets,
    width = 1080,
    height = 1080,
    model,
  } = options

  const prompt = `${systemPrompt}\n\n${userMessage}`

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
  const key = exportKey("cli", briefId)
  await uploadObject(png, BUCKET_EXPORTS, key, "image/png")

  // Persist the object key; it is signed per read.
  return { htmlContent: html, exportUrl: key, toolCallCount: 0 }
}
