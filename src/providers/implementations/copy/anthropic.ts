import Anthropic from "@anthropic-ai/sdk"
import type { BriefInput, CopyProvider } from "../../interfaces/CopyProvider"

export class AnthropicCopyProvider implements CopyProvider {
  private client: Anthropic

  constructor(apiKey: string, private model = "claude-haiku-4-5-20251001") {
    this.client = new Anthropic({ apiKey })
  }

  async generateCopy(brief: BriefInput): Promise<string> {
    const channelList = brief.channels.join(", ")

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 500,
      system: `You are an expert social media copywriter for Bistec, a tech company. Write compelling, on-brand copy for ${channelList} posts.`,
      messages: [
        {
          role: "user",
          content: `Topic: ${brief.topic}
Description: ${brief.description}
Goal: ${brief.goal}
Tone: ${brief.tone}
Channels: ${channelList}

Write engaging copy for the above brief.`,
        },
      ],
    })

    const block = response.content[0]
    if (!block || block.type !== "text") {
      throw new Error("Anthropic returned an empty response")
    }
    return block.text
  }
}
