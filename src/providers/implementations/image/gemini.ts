import type { ImageProvider } from "../../interfaces/ImageProvider"

// Gemini native image generation over plain fetch (005 FR-13; no SDK, NFR-05).
//
// MOCK-VERIFIED ONLY (005 AC-21, user decision): no live key was available, so
// every shape below is taken from Google's docs, checked 2026-10-02:
//   - https://ai.google.dev/gemini-api/docs/image-generation (last updated
//     2026-09-23): the model list ("Nano Banana 2 (Gemini 3.1 Flash Image)
//     (gemini-3.1-flash-image)") and the "Aspect ratios and image size" table,
//     which lists 1:1, 4:5 and 9:16 for 3.1 Flash Image. That page's REST
//     examples use the newer Interactions API (POST /v1beta/interactions); this
//     provider uses generateContent instead, which the migration guide
//     (https://ai.google.dev/gemini-api/docs/migrate-to-interactions) says
//     "remains fully supported", because generateContent's reference documents
//     how a safety block appears (the fields below), and the Interactions
//     reference documents no equivalent for a blocked image.
//   - https://ai.google.dev/api/generate-content (last updated 2026-09-23):
//       request  POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
//                header x-goog-api-key (never ?key= in the URL)
//                { "contents": [{ "parts": [{ "text": prompt }] }],
//                  "generationConfig": { "responseModalities": ["TEXT","IMAGE"],
//                                        "imageConfig": { "aspectRatio": "4:5" } } }
//       response candidates[].content.parts[].inlineData { "mimeType", "data" (base64) }
//       blocks   promptFeedback.blockReason set ⇒ the prompt was blocked, no candidates;
//                candidates[].finishReason SAFETY / IMAGE_SAFETY / PROHIBITED_CONTENT /
//                IMAGE_PROHIBITED_CONTENT ⇒ blocked output; NO_IMAGE ⇒ no image made.
//   - non-2xx bodies use the Google API error envelope
//     { "error": { "code", "message", "status" } }
//     (https://ai.google.dev/gemini-api/docs/troubleshooting).
// A later live check should diff against these pages (design.md risk R5).

export const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image"

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"
const TIMEOUT_MS = 120_000

// The content types persistDataUrlImage stores (RASTER_IMAGE_TYPES in
// src/lib/storage/minio.ts). Kept local so this provider doesn't pull in the
// S3 client; Gemini documents more image types (heic, tiff, …) than we store.
const STORABLE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"])

// finishReason / blockReason values that mean "refused on safety grounds". The
// message says "safety", so the draft notice reads it as a refusal (MODERATION_RE
// in src/lib/drafts/backgroundNotice.ts), not as a key problem.
const SAFETY_FINISH = new Set(["SAFETY", "IMAGE_SAFETY", "PROHIBITED_CONTENT", "IMAGE_PROHIBITED_CONTENT"])

type GenerateContentResponse = {
  promptFeedback?: { blockReason?: string }
  candidates?: Array<{
    finishReason?: string
    content?: { parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }> }
  }>
}

export class GeminiImageProvider implements ImageProvider {
  readonly providerName = "gemini" as const

  constructor(private apiKey: string, private model = GEMINI_IMAGE_MODEL) {}

  // size is the provider-native value from imageSizeFor (imageCapabilities.ts):
  // an aspect-ratio string such as "1:1", "4:5" or "9:16".
  async generateImage(prompt: string, _brandKitId?: string, size?: string): Promise<{ url: string }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(`${ENDPOINT}/${this.model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: size ?? "1:1" } },
        }),
        signal: controller.signal,
      })
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`Gemini image generation timed out after ${TIMEOUT_MS / 1000}s`)
      }
      throw err
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) {
      throw new Error(`Gemini image generation failed (HTTP ${res.status}): ${this.redact(await apiMessage(res))}`)
    }

    const body = (await res.json()) as GenerateContentResponse
    const blockReason = body.promptFeedback?.blockReason
    if (blockReason) {
      throw new Error(`Gemini image request blocked by safety filters (prompt: ${blockReason})`)
    }

    const candidate = body.candidates?.[0]
    const image = candidate?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData
    if (!image?.data) {
      const reason = candidate?.finishReason
      if (reason && SAFETY_FINISH.has(reason)) {
        throw new Error(`Gemini image request blocked by safety filters (${reason})`)
      }
      throw new Error(reason ? `Gemini returned no image (finish reason: ${reason})` : "Gemini returned no image")
    }

    const mimeType = image.mimeType ?? "image/png"
    if (!STORABLE_TYPES.has(mimeType)) {
      throw new Error(`Gemini returned an unsupported image type: ${mimeType}`)
    }
    return { url: `data:${mimeType};base64,${image.data}` }
  }

  // An API message should never carry the key, but never trust it to.
  private redact(text: string): string {
    return text.split(this.apiKey).join("[redacted]")
  }
}

async function apiMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => "")
  try {
    const message = (JSON.parse(text) as { error?: { message?: string } }).error?.message
    if (message) return message
  } catch {
    // not JSON: fall through to the raw text
  }
  return text.trim().slice(0, 300) || res.statusText || "no error message"
}
