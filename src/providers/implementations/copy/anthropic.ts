import Anthropic from "@anthropic-ai/sdk"
import type { BriefInput, CopyProvider } from "../../interfaces/CopyProvider"
import { buildCopyPrompt } from "@/lib/agent/prompts/copy"

export class AnthropicCopyProvider implements CopyProvider {
  private client: Anthropic

  constructor(apiKey: string, private model = "claude-haiku-4-5-20251001") {
    this.client = new Anthropic({ apiKey })
  }

  async generateCopy(brief: BriefInput): Promise<string> {
    const prompt = buildCopyPrompt(brief)

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 500,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    })

    const block = response.content[0]
    if (!block || block.type !== "text") {
      throw new Error("Anthropic returned an empty response")
    }
    return block.text
  }
}
