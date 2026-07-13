import Anthropic from '@anthropic-ai/sdk'
import { writeFile, unlink, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveAnthropicApiKey } from '@/providers/registry'
import { isCliMode, modelFor } from '@/lib/agent/config'
import { runClaudeCli } from '@/lib/agent/claudeCli'

// Vision plumbing (F5/F6): send one or more images to a vision-capable model and
// get its text back. This is the FIRST real image-input path in the app — every
// other Anthropic call is text-only and passes images only as URLs in prose.
//
// Two modes, matching the rest of the agent layer:
//   - API mode  → Anthropic SDK image content blocks (base64).
//   - CLI mode  → images written to temp files, referenced by path in the prompt;
//                 `claude -p --allowedTools Read` ingests them via its Read tool
//                 (verified 2026-07-13). Per-user OAuth billing flows through
//                 runClaudeCli's ALS auth exactly like text calls.
//
// Callers own the MOCK_AI seam (they return a deterministic result before calling
// this), so runVisionModel itself only runs on the live path.

const MAX_TOKENS = 2048
const CLI_TIMEOUT_MS = 180_000

// Anthropic accepts these image media types; others are coerced to png.
const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

interface FetchedImage {
  base64: string
  mediaType: string
  bytes: Buffer
}

async function fetchImage(url: string): Promise<FetchedImage> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch reference image (${res.status})`)
  const bytes = Buffer.from(await res.arrayBuffer())
  const headerType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  const mediaType = SUPPORTED.has(headerType) ? headerType : 'image/png'
  return { base64: bytes.toString('base64'), mediaType, bytes }
}

export interface VisionRequest {
  system: string
  userMessage: string
  imageUrls: string[]
  maxTokens?: number
  label?: string
}

export async function runVisionModel(req: VisionRequest): Promise<string> {
  const images = await Promise.all(req.imageUrls.map(fetchImage))

  if (isCliMode()) return runVisionCli(req, images)

  const apiKey = await resolveAnthropicApiKey()
  const client = new Anthropic({ apiKey: apiKey ?? undefined })
  const content: Anthropic.MessageParam['content'] = [
    ...images.map((img) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: img.mediaType as 'image/png', data: img.base64 },
    })),
    { type: 'text' as const, text: req.userMessage },
  ]
  const message = await client.messages.create({
    model: modelFor('B', 'api'),
    max_tokens: req.maxTokens ?? MAX_TOKENS,
    system: req.system,
    messages: [{ role: 'user', content }],
  })
  const textBlock = message.content.find((b) => b.type === 'text')
  return textBlock && 'text' in textBlock ? textBlock.text : ''
}

// CLI mode: the spawned `claude -p` has no image flag, so each image is written
// to a temp file and its path is named in the prompt; the Read tool (whitelisted
// via allowedTools) feeds the pixels to the model. Temp files are always cleaned up.
async function runVisionCli(req: VisionRequest, images: FetchedImage[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'bistec-vision-'))
  const paths: string[] = []
  try {
    for (let i = 0; i < images.length; i++) {
      const p = join(dir, `ref-${i}.${EXT[images[i].mediaType] ?? 'png'}`)
      await writeFile(p, images[i].bytes)
      paths.push(p)
    }
    const prompt = [
      req.system,
      '--- Reference images ---',
      'Use the Read tool to view each of these image files before answering:',
      ...paths.map((p) => `- ${p}`),
      '--- Task ---',
      req.userMessage,
    ].join('\n\n')

    return await runClaudeCli(prompt, {
      timeoutMs: CLI_TIMEOUT_MS,
      label: req.label ?? 'vision',
      model: modelFor('B', 'cli'),
      allowedTools: ['Read'],
    })
  } finally {
    await Promise.all(paths.map((p) => unlink(p).catch(() => {})))
  }
}
