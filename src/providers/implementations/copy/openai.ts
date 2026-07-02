import OpenAI from "openai"
import type { BriefInput, CopyProvider } from "../../interfaces/CopyProvider"
import { buildCopyPrompt } from "@/lib/agent/prompts/copy"

export class OpenAICopyProvider implements CopyProvider {
  private client: OpenAI

  constructor(apiKey: string, private model = "gpt-4o") {
    this.client = new OpenAI({ apiKey })
  }

  async generateCopy(brief: BriefInput): Promise<string> {
    const prompt = buildCopyPrompt(brief)

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 500,
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
    return content
  }
}
