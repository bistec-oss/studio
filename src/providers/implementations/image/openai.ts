import OpenAI from "openai"
import type { ImageProvider } from "../../interfaces/ImageProvider"

export class OpenAIImageProvider implements ImageProvider {
  private client: OpenAI

  constructor(apiKey: string, private model = "gpt-image-2") {
    this.client = new OpenAI({ apiKey })
  }

  async generateImage(prompt: string, _brandKitId?: string): Promise<{ url: string }> {
    const response = await this.client.images.generate({
      model: this.model,
      prompt,
      n: 1,
      size: "1024x1024",
    })

    const b64 = response.data[0]?.b64_json
    if (!b64) {
      throw new Error(
        `OpenAI image generation returned no b64_json for model "${this.model}"`
      )
    }

    return { url: `data:image/png;base64,${b64}` }
  }
}
