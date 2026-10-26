import OpenAI from "openai"
import type { BriefInput, CaptionReply, CopyProvider } from "../../interfaces/CopyProvider"
import type { CaptionTarget } from "@/lib/channels"
import { buildCaptionPrompt, CAPTION_MAX_TOKENS } from "@/lib/agent/prompts/caption"

export class OpenAICopyProvider implements CopyProvider {
  private client: OpenAI

  constructor(apiKey: string, private model = "gpt-4o") {
    this.client = new OpenAI({ apiKey })
  }

  // 008 open question 1: not a Claude provider, so the resolved CAPTION model
  // does not apply here. The stamp records this provider's own model ID.
  async generateCaptions(brief: BriefInput, targets: readonly CaptionTarget[]): Promise<CaptionReply> {
    const prompt = buildCaptionPrompt(brief, targets)

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: CAPTION_MAX_TOKENS,
      temperature: 0.7,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error("OpenAI returned an empty response")
    }
    return { raw: content, modelId: this.model, route: 'OTHER' }
  }
}
