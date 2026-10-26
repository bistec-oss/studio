import type { DesignAgentOptions, DesignAgentResult } from "./types"
import { runClaudeCli } from "./claudeCli"
import { extractHtmlDocument } from "./htmlDocument"
import { restoreInlineAssets, missingTokens } from "./inlineAssets"
import { renderPost } from "@/lib/renderer/puppeteer"
import { uploadObject, exportKey, BUCKET_EXPORTS } from "@/lib/storage/minio"
import type { ResolvedModel } from "@/lib/models/resolve"

type CliAgentOptions = Pick<DesignAgentOptions, "systemPrompt" | "userMessage" | "briefId" | "inlineAssets" | "width" | "height" | "postProcess" | "composites" | "headline"> & {
  // 008 FR-07: the DESIGN_TEMPLATE / DESIGN_FREEFORM model the caller resolved.
  // The CLI runs exactly its arg, and the spawn's timeout is its surface timeout.
  model: ResolvedModel
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
    postProcess,
    composites = null,
    headline,
  } = options

  const prompt = `${systemPrompt}\n\n${userMessage}`

  // The timeout is the model's (008 FR-12, design §5): freeform design on a
  // slower model gets more headroom than template fill on Haiku.
  const raw = await runClaudeCli(prompt, { label: "design", model })

  // Cut the document out of the reply rather than testing that one is in there
  // somewhere: any commentary the model wrapped around it would otherwise be
  // rendered onto the canvas as visible text. See htmlDocument.ts.
  const extracted = extractHtmlDocument(raw)
  if (!extracted) {
    const trimmed = raw.trim()
    throw new Error(
      `Claude CLI did not return an HTML document (got ${trimmed.length} chars starting: "${trimmed.slice(0, 80)}")`,
    )
  }
  if (extracted.discarded) {
    console.warn(
      `[designAgentCli] discarded ${extracted.discarded.length} chars of non-HTML text around the document: ` +
        JSON.stringify(extracted.discarded.slice(0, 300)),
    )
  }
  let html = extracted.html

  // Re-inline any externalized assets (stripped before the prompt) so the render
  // matches the original template. Warn if the model dropped a placeholder.
  if (inlineAssets) {
    const dropped = missingTokens(html, inlineAssets)
    if (dropped.length > 0) {
      console.warn(`[designAgentCli] model dropped ${dropped.length} asset placeholder(s): ${dropped.join(", ")}`)
    }
    html = restoreInlineAssets(html, inlineAssets)
  }

  // 025 FR-15: code inserts the screenshot after extract and restore, before
  // the render; the stored HTML is this inserted HTML with the token.
  if (postProcess) html = postProcess(html)

  // Render HTML → PNG → MinIO (same pipeline as the export route). A failed
  // composite check throws before anything is uploaded.
  const { png, headlineCheck, fontsMissing } = await renderPost(html, width, height, composites, { headline })
  const key = exportKey("cli", briefId)
  await uploadObject(png, BUCKET_EXPORTS, key, "image/png")

  // Persist the object key; it is signed per read.
  return { htmlContent: html, exportUrl: key, toolCallCount: 0, headlineCheck, fontsMissing }
}

// ── Refine mode (change 004 Phase 2, T17) ────────────────────────────────────
// Opt-in, used only by the refine route. Returns the model's RAW reply —
// envelope header, document with __INLINE_ASSET_n__ tokens intact, any
// narration — and does NOT cut, restore, render or upload anything: the route
// (drafts/refineAttempt.ts) parses the envelope, reconciles the tokens and
// verifies the edit, and renders only the document it finally keeps, so a
// missed attempt leaves no orphaned export. runDesignAgentCli above is
// untouched (AC-20: regenerate-design, generation and Path A use it).
export async function runDesignAgentCliRefine(
  options: Pick<CliAgentOptions, "systemPrompt" | "userMessage" | "model">,
): Promise<string> {
  const { systemPrompt, userMessage, model } = options
  // The REFINE model runs on its own surface timeout (008 FR-12).
  return runClaudeCli(`${systemPrompt}\n\n${userMessage}`, { label: "refine", model })
}
