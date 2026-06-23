import Anthropic from "@anthropic-ai/sdk"
import type { MessageParam, ToolUseBlock, ToolResultBlockParam, Tool } from "@anthropic-ai/sdk/resources/messages"
import type { DesignAgentOptions, DesignAgentResult } from "./types"
import { AgentToolLimitError } from "./types"
import { toolGenerateImage, toolRenderHtml, toolGetBrandKitContext } from "./tools"

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
            "Complete self-contained HTML/CSS — no external CDN dependencies. " +
            "Embed fonts via base64 data URIs or system fonts only.",
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
      return toolGenerateImage(input.prompt as string, input.brandKitId as string)
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
  } = options

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const messages: MessageParam[] = [{ role: "user", content: userMessage }]

  let toolCallCount = 0
  let lastHtml = ""
  let lastExportUrl = ""

  while (true) {
    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system: systemPrompt,
      tools: TOOL_DEFINITIONS,
      messages,
    })

    const toolUseBlocks = response.content.filter(
      (b): b is ToolUseBlock => b.type === "tool_use"
    )

    if (toolUseBlocks.length === 0) {
      // No more tool calls — agent is done
      const textBlock = response.content.find((b) => b.type === "text")
      if (textBlock && "text" in textBlock && lastHtml === "") {
        lastHtml = textBlock.text
      }
      break
    }

    if (toolCallCount + toolUseBlocks.length > maxToolCalls) {
      throw new AgentToolLimitError(maxToolCalls)
    }

    messages.push({ role: "assistant", content: response.content })

    const toolResults: ToolResultBlockParam[] = []

    for (const block of toolUseBlocks) {
      toolCallCount++
      try {
        const result = await executeTool(block.name, block.input as ToolInput, briefId)

        if (block.name === "renderHtml") {
          lastHtml = (block.input as { html: string }).html
          lastExportUrl = (result as { url: string }).url
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
        throw err
      }
    }

    messages.push({ role: "user", content: toolResults })
  }

  return { htmlContent: lastHtml, exportUrl: lastExportUrl, toolCallCount }
}
