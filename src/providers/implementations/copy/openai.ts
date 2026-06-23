import OpenAI from "openai"
import type { BriefInput, CopyProvider } from "../../interfaces/CopyProvider"

export class OpenAICopyProvider implements CopyProvider {
  private client: OpenAI

  constructor(apiKey: string, private model = "gpt-4o") {
    this.client = new OpenAI({ apiKey })
  }

  async generateCopy(brief: BriefInput): Promise<string> {
    const channelList = brief.channels.join(", ")

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 500,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: `You are an expert social media copywriter for Bistec, a tech company. Write compelling, on-brand copy for ${channelList} posts.`,
        },
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

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error("OpenAI returned an empty response")
    }
    return content
  }
}
