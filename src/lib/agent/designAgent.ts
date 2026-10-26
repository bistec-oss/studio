import Anthropic from "@anthropic-ai/sdk"
import type { MessageParam, ToolUseBlock, ToolResultBlockParam, Tool } from "@anthropic-ai/sdk/resources/messages"
import type { DesignAgentOptions, DesignAgentResult, GenerationActor } from "./types"
import type { HeadlineCheck } from "@/lib/renderedText/vocab"
import { AgentToolLimitError, AgentTimeoutError, AgentTruncatedError } from "./types"
import { toolGenerateImage, toolRenderHtml, toolGetBrandKitContext } from "./tools"
import { restoreInlineAssets, missingTokens } from "./inlineAssets"
import { MOCK_AI, buildMockHtml, buildMockConflict, buildMockRefineReply, shouldMockGenerateFail } from "@/lib/testHooks"
import { env } from "@/lib/env"
import { nearestAspectRatio } from "@/lib/aspectRatio"
import type { AspectRatio } from "@prisma/client"
import type { ResolvedModel } from "@/lib/models/resolve"
import { createMessage, textOf as replyText } from "@/lib/models/anthropicCall"
import { modelCallFor, recordModelCall } from "@/lib/models/modelCalls"
import { pipelineMode } from "./config"
import { CompositeRenderError, type CompositeRender } from "@/lib/composite/render"

const TOOL_DEFINITIONS: Tool[] = [
  {
    name: "generateImage",
    description:
      "Generate a raster image using the configured image provider. " +
      "Call this ONLY when CSS/SVG gradients and shapes cannot achieve the required visual result. " +
      "Returns a pre-signed MinIO URL.",
    input_schema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Detailed image generation prompt" },
        brandKitId: { type: "string", description: "Brand kit ID for style context" },
      },
      required: ["prompt", "brandKitId"],
    },
  },
  {
    name: "renderHtml",
    description:
      "Render a complete HTML/CSS string to a PNG image via headless Chromium. " +
      "Returns a pre-signed MinIO URL. ALWAYS call this as the final step to produce the finished design.",
    input_schema: {
      type: "object",
      properties: {
        html: {
          type: "string",
          description:
            "Complete self-contained HTML/CSS. " +
            "Load brand fonts via @import with the Google Fonts URLs provided in the brand kit context. " +
            "Do not use other external CDN dependencies.",
        },
        width: { type: "number", description: "Canvas width in logical pixels (e.g. 1080)" },
        height: { type: "number", description: "Canvas height in logical pixels (e.g. 1080)" },
      },
      required: ["html", "width", "height"],
    },
  },
  {
    name: "getBrandKitContext",
    description:
      "Retrieve the resolved brand kit (colors, fonts, logo URL, voice prompt, feed-to-AI artifact URLs) " +
      "for the current brief. Call this first to load brand guidelines before generating the design.",
    input_schema: {
      type: "object",
      properties: {
        briefId: { type: "string", description: "ID of the brief" },
      },
      required: ["briefId"],
    },
  },
]

type ToolInput = Record<string, unknown>

async function executeTool(
  name: string,
  input: ToolInput,
  briefId: string,
  actor?: GenerationActor,
  aspectRatio?: AspectRatio,
  composites: CompositeRender | null = null,
  headline = ""
): Promise<unknown> {
  switch (name) {
    case "generateImage":
      return toolGenerateImage(input.prompt as string, input.brandKitId as string, briefId, actor, aspectRatio)
    case "renderHtml":
      return toolRenderHtml(
        input.html as string,
        input.width as number,
        input.height as number,
        composites,
        headline
      )
    case "getBrandKitContext":
      return toolGetBrandKitContext((input.briefId as string | undefined) ?? briefId)
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

// 008 FR-07: the design loop runs exactly the DESIGN_* model its caller
// resolved (required — there is no default model), and its wall-clock budget
// is that model's surface timeout (FR-12).
export type RunDesignAgentOptions = DesignAgentOptions & {
  model: ResolvedModel
}

export async function runDesignAgent(options: RunDesignAgentOptions): Promise<DesignAgentResult> {
  const {
    systemPrompt,
    userMessage,
    briefId,
    model,
    maxToolCalls = 15,
    inlineAssets,
    width = 1080,
    height = 1080,
    actor,
    postProcess,
    composites = null,
    headline,
  } = options
  // The whole tool-use loop's budget — maxToolCalls alone doesn't bound slow
  // image generations + renders. Every turn's request is also bounded by it
  // (createMessage's deadlineAt), not just checked at the loop's start.
  const deadlineMs = model.timeoutMs

  // Test seam: skip the Anthropic tool-use loop entirely. Emits deterministic
  // HTML and a real EXPORTS object key (rendered via the mocked Puppeteer path),
  // or a conflict marker when a refine instruction contains "conflict_test".
  // It short-circuits before the boundary, so it records the model it was
  // handed first (008 FR-16, design §7).
  if (MOCK_AI) {
    recordModelCall(modelCallFor(model, pipelineMode(), "design"))
    if (shouldMockGenerateFail(userMessage)) {
      throw new Error("Mock generation failure (__FAIL_GEN_ALWAYS__ sentinel)")
    }
    if (userMessage.includes("conflict_test")) {
      return { htmlContent: buildMockConflict(), exportUrl: "", toolCallCount: 0, headlineCheck: null, fontsMissing: [] }
    }
    const mockHtml = buildMockHtml(`${systemPrompt}\n${userMessage}`, width, height, headline)
    const html = postProcess ? postProcess(mockHtml) : mockHtml
    const { key, headlineCheck, fontsMissing } = await toolRenderHtml(html, width, height, composites, headline)
    return { htmlContent: html, exportUrl: key, toolCallCount: 1, headlineCheck, fontsMissing }
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

  const messages: MessageParam[] = [{ role: "user", content: userMessage }]

  const MAX_TOKENS = 8192
  // What the request actually carries: createMessage raises max_tokens to the
  // entry's floor (thinking models spend from the same cap).
  const effectiveMaxTokens = Math.max(MAX_TOKENS, model.entry.apiMaxTokensFloor ?? 0)
  const startedAt = Date.now()
  const deadlineAt = startedAt + deadlineMs
  let toolCallCount = 0
  let iteration = 0
  let lastHtml = ""
  let lastExportUrl = ""
  // 030: the check of the last render (null until one happens).
  let lastHeadlineCheck: HeadlineCheck | null = null
  // 031 FR-24: the font check of the last render.
  let lastFontsMissing: string[] = []
  // Every export this run uploaded (025: the composite fallback deletes them all).
  const uploadedKeys: string[] = []

  while (true) {
    if (Date.now() - startedAt > deadlineMs) {
      throw new AgentTimeoutError(deadlineMs)
    }

    iteration++
    const turnStartedAt = Date.now()
    const response = await createMessage(
      client,
      {
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        tools: TOOL_DEFINITIONS,
        messages,
      },
      model,
      { deadlineAt, label: "design" },
    )
    console.log(
      `[designAgent] turn ${iteration} (${model.arg}, ${model.source}): ${Date.now() - turnStartedAt}ms, ` +
        `in=${response.usage.input_tokens} out=${response.usage.output_tokens} tokens, ` +
        `stop=${response.stop_reason}, elapsed=${Math.round((Date.now() - startedAt) / 1000)}s`
    )

    // A truncated turn means a mangled tool call or half-emitted HTML — fail
    // with the real cause instead of storing broken output.
    if (response.stop_reason === "max_tokens") {
      throw new AgentTruncatedError(effectiveMaxTokens)
    }

    const toolUseBlocks = response.content.filter(
      (b): b is ToolUseBlock => b.type === "tool_use"
    )

    if (toolUseBlocks.length === 0) {
      // No more tool calls — agent is done. Read by block type (008 §6): a
      // thinking model's reply does not start with its text block.
      const text = replyText(response)
      if (text && lastHtml === "") {
        lastHtml = restoreInlineAssets(text, inlineAssets)
        if (postProcess) lastHtml = postProcess(lastHtml)
      }
      // 025 NFR-08: HTML with the screenshot inserted that no render ever
      // checked must not come back; the caller takes the classic fallback.
      if (composites && !lastExportUrl) {
        const err = new CompositeRenderError("composite-not-rendered", "the design was never rendered with the screenshot")
        err.uploadedKeys = [...uploadedKeys]
        throw err
      }
      break
    }

    if (toolCallCount + toolUseBlocks.length > maxToolCalls) {
      throw new AgentToolLimitError(maxToolCalls)
    }

    messages.push({ role: "assistant", content: response.content })

    const toolResults: ToolResultBlockParam[] = []
    let toolError: unknown = null

    for (const block of toolUseBlocks) {
      toolCallCount++
      try {
        // Re-inline any externalized assets before rendering, so the model never
        // had to carry the (huge) inline data and the PNG still matches the template.
        // Keep the restored HTML in a local variable only — block.input stays the
        // compact tokenized version, since it gets pushed into `messages` below and
        // we don't want the multi-MB data: URIs re-sent to the model on the next turn.
        let toolInput = block.input as ToolInput
        if (block.name === "renderHtml" && inlineAssets) {
          const html = (block.input as { html: string }).html
          const dropped = missingTokens(html, inlineAssets)
          if (dropped.length > 0) {
            console.warn(`[designAgent] model dropped ${dropped.length} asset placeholder(s): ${dropped.join(", ")}`)
          }
          toolInput = { ...toolInput, html: restoreInlineAssets(html, inlineAssets) }
        }
        // 025 FR-15: code inserts the screenshot into the model's HTML before
        // every render. Like the restored assets, the result stays local, so
        // the message history keeps the model's own (token-free) version.
        if (block.name === "renderHtml" && postProcess) {
          toolInput = { ...toolInput, html: postProcess((toolInput as { html: string }).html) }
        }

        const result = await executeTool(
          block.name,
          toolInput,
          briefId,
          actor,
          nearestAspectRatio(width, height),
          composites,
          headline
        )

        if (block.name === "renderHtml") {
          lastHtml = (toolInput as { html: string }).html
          // Persist the object KEY (signed per read), not the transient URL.
          lastExportUrl = (result as { key: string }).key
          lastHeadlineCheck = (result as { headlineCheck: HeadlineCheck | null }).headlineCheck
          lastFontsMissing = (result as { fontsMissing?: string[] }).fontsMissing ?? []
          uploadedKeys.push(lastExportUrl)
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Error: ${message}`,
          is_error: true,
        })
        toolError = err
        break
      }
    }

    // Always close out the assistant turn with the tool results collected so far
    // (keeps the message history valid), then surface the error — the agent
    // halts on any tool failure by design.
    messages.push({ role: "user", content: toolResults })
    if (toolError) {
      // A composite failure after earlier passing renders: tell the caller
      // which exports they uploaded, so the fallback can delete them all.
      if (toolError instanceof CompositeRenderError) toolError.uploadedKeys = [...uploadedKeys]
      throw toolError
    }
  }

  return {
    htmlContent: lastHtml,
    exportUrl: lastExportUrl,
    toolCallCount,
    headlineCheck: lastHeadlineCheck,
    fontsMissing: lastFontsMissing,
  }
}

// ── Refine mode (change 004 Phase 2, T17) ────────────────────────────────────
// Opt-in, used only by the refine route; runDesignAgent above is untouched
// (AC-20: regenerate-design, generation and Path A use it). Kept as its own
// loop rather than a flag on the one above so the default path stays
// byte-for-byte what it was.
//
// Returns the model's RAW final text — the reply envelope (header + document
// with __INLINE_ASSET_n__ tokens intact) or an API-mode brand-conflict marker —
// and renders nothing. renderHtml is not offered: the route parses the
// envelope, reconciles the tokens, verifies the edit, and renders only the
// document it finally keeps, so a missed attempt leaves no orphaned export.
// generateImage / getBrandKitContext stay available. A turn cut off at
// max_tokens returns its partial text: a document with no closing </html> is
// "not applied" (retry path), not a crash.

export interface RefineModeOptions {
  // Which refine attempt this is (FR-11: at most 2).
  attempt: 1 | 2
  // The raw instruction and the model-facing current HTML — read ONLY by the
  // MOCK_AI reply seam (testHooks.buildMockRefineReply); the real model sees
  // them through userMessage.
  instruction: string
  slimHtml: string
}

const REFINE_TOOL_DEFINITIONS = TOOL_DEFINITIONS.filter((t) => t.name !== "renderHtml")

const textOf = (content: Anthropic.Messages.ContentBlock[]) =>
  content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n")

// 008 FR-07: `model` is the REFINE model the route resolved (required — there
// is no default model). Every turn goes through createMessage, bounded by its
// surface timeout (FR-12), and the mock seam records it.
export async function runDesignAgentRefine(
  options: Omit<DesignAgentOptions, "inlineAssets" | "headline"> & {
    model: ResolvedModel
    refine: RefineModeOptions
  },
): Promise<string> {
  const {
    systemPrompt,
    userMessage,
    briefId,
    model,
    maxToolCalls = 15,
    width = 1080,
    height = 1080,
    actor,
    refine,
  } = options
  const deadlineMs = model.timeoutMs

  // Test seam: the same failure and conflict sentinels as runDesignAgent's
  // mock branch, then the deterministic envelope reply (T20). With no refine
  // sentinel the reply is exactly the document runDesignAgent's mock returns.
  if (MOCK_AI) {
    // 008 FR-16: the model short-circuited here is recorded first.
    recordModelCall(modelCallFor(model, pipelineMode(), "refine"))
    if (shouldMockGenerateFail(userMessage)) {
      throw new Error("Mock generation failure (__FAIL_GEN_ALWAYS__ sentinel)")
    }
    if (userMessage.includes("conflict_test")) return buildMockConflict()
    return buildMockRefineReply({
      slimHtml: refine.slimHtml,
      instruction: refine.instruction,
      attempt: refine.attempt,
      width,
      height,
      promptContext: `${systemPrompt}\n${userMessage}`,
    })
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const messages: MessageParam[] = [{ role: "user", content: userMessage }]
  const MAX_TOKENS = 8192
  const startedAt = Date.now()
  const deadlineAt = startedAt + deadlineMs
  let toolCallCount = 0

  for (let iteration = 1; ; iteration++) {
    if (Date.now() - startedAt > deadlineMs) throw new AgentTimeoutError(deadlineMs)

    const params = {
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      tools: REFINE_TOOL_DEFINITIONS,
      messages,
    }
    const response = await createMessage(client, params, model, { deadlineAt, label: "refine" })
    console.log(
      `[designAgent:refine#${refine.attempt}] turn ${iteration} (${model.arg}, ${model.source}): ` +
        `in=${response.usage.input_tokens} out=${response.usage.output_tokens} tokens, ` +
        `stop=${response.stop_reason}, elapsed=${Math.round((Date.now() - startedAt) / 1000)}s`
    )

    const toolUseBlocks = response.content.filter((b): b is ToolUseBlock => b.type === "tool_use")
    if (response.stop_reason === "max_tokens" || toolUseBlocks.length === 0) return textOf(response.content)

    if (toolCallCount + toolUseBlocks.length > maxToolCalls) throw new AgentToolLimitError(maxToolCalls)
    messages.push({ role: "assistant", content: response.content })

    const toolResults: ToolResultBlockParam[] = []
    let toolError: unknown = null
    for (const block of toolUseBlocks) {
      toolCallCount++
      if (block.name === "renderHtml") {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: "renderHtml is not available in this step: give your final text response in the required reply format (JSON header, then the complete HTML document). The server renders it after checking.",
          is_error: true,
        })
        continue
      }
      try {
        const result = await executeTool(block.name, block.input as ToolInput, briefId, actor, nearestAspectRatio(width, height))
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) })
      } catch (err) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
          is_error: true,
        })
        toolError = err
        break
      }
    }
    messages.push({ role: "user", content: toolResults })
    if (toolError) throw toolError
  }
}
