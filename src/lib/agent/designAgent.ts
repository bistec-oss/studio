import Anthropic from "@anthropic-ai/sdk"
import type { MessageParam, ToolUseBlock, ToolResultBlockParam, Tool } from "@anthropic-ai/sdk/resources/messages"
import type { DesignAgentOptions, DesignAgentResult } from "./types"
import { AgentToolLimitError, AgentTimeoutError, AgentTruncatedError } from "./types"
import { toolGenerateImage, toolRenderHtml, toolGetBrandKitContext } from "./tools"
import { restoreInlineAssets, missingTokens } from "./inlineAssets"
import { MOCK_AI, buildMockHtml, buildMockConflict, shouldMockGenerateFail } from "@/lib/testHooks"
import { env } from "@/lib/env"

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
  briefId: string
): Promise<unknown> {
  switch (name) {
    case "generateImage":
      return toolGenerateImage(input.prompt as string, input.brandKitId as string, briefId)
    case "renderHtml":
      return toolRenderHtml(
        input.html as string,
        input.width as number,
        input.height as number
      )
    case "getBrandKitContext":
      return toolGetBrandKitContext((input.briefId as string | undefined) ?? briefId)
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

export async function runDesignAgent(options: DesignAgentOptions): Promise<DesignAgentResult> {
  const {
    systemPrompt,
    userMessage,
    briefId,
    model = "claude-sonnet-4-6",
    maxToolCalls = 15,
    // Wall-clock budget mirroring the CLI runner's 300s tree-killed timeout —
    // maxToolCalls alone doesn't bound slow image generations + renders.
    deadlineMs = 300_000,
    inlineAssets,
    width = 1080,
    height = 1080,
  } = options

  // Test seam: skip the Anthropic tool-use loop entirely. Emits deterministic
  // HTML and a real EXPORTS object key (rendered via the mocked Puppeteer path),
  // or a conflict marker when a refine instruction contains "conflict_test".
  if (MOCK_AI) {
    if (shouldMockGenerateFail(userMessage)) {
      throw new Error("Mock generation failure (__FAIL_GEN_ALWAYS__ sentinel)")
    }
    if (userMessage.includes("conflict_test")) {
      return { htmlContent: buildMockConflict(), exportUrl: "", toolCallCount: 0 }
    }
    const html = buildMockHtml(`${systemPrompt}\n${userMessage}`, width, height)
    const { key } = await toolRenderHtml(html, width, height)
    return { htmlContent: html, exportUrl: key, toolCallCount: 1 }
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

  const messages: MessageParam[] = [{ role: "user", content: userMessage }]

  const MAX_TOKENS = 8192
  const startedAt = Date.now()
  let toolCallCount = 0
  let iteration = 0
  let lastHtml = ""
  let lastExportUrl = ""

  while (true) {
    if (Date.now() - startedAt > deadlineMs) {
      throw new AgentTimeoutError(deadlineMs)
    }

    iteration++
    const turnStartedAt = Date.now()
    const response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      tools: TOOL_DEFINITIONS,
      messages,
    })
    console.log(
      `[designAgent] turn ${iteration} (${model}): ${Date.now() - turnStartedAt}ms, ` +
        `in=${response.usage.input_tokens} out=${response.usage.output_tokens} tokens, ` +
        `stop=${response.stop_reason}, elapsed=${Math.round((Date.now() - startedAt) / 1000)}s`
    )

    // A truncated turn means a mangled tool call or half-emitted HTML — fail
    // with the real cause instead of storing broken output.
    if (response.stop_reason === "max_tokens") {
      throw new AgentTruncatedError(MAX_TOKENS)
    }

    const toolUseBlocks = response.content.filter(
      (b): b is ToolUseBlock => b.type === "tool_use"
    )

    if (toolUseBlocks.length === 0) {
      // No more tool calls — agent is done
      const textBlock = response.content.find((b) => b.type === "text")
      if (textBlock && "text" in textBlock && lastHtml === "") {
        lastHtml = restoreInlineAssets(textBlock.text, inlineAssets)
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

        const result = await executeTool(block.name, toolInput, briefId)

        if (block.name === "renderHtml") {
          lastHtml = (toolInput as { html: string }).html
          // Persist the object KEY (signed per read), not the transient URL.
          lastExportUrl = (result as { key: string }).key
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
    if (toolError) throw toolError
  }

  return { htmlContent: lastHtml, exportUrl: lastExportUrl, toolCallCount }
}
