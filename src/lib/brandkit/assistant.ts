import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { runVisionModel } from '@/lib/agent/vision'
import { sampleImageColors } from '@/lib/renderer/puppeteer'
import { MOCK_AI, MOCK_PUPPETEER, buildMockBrandKitReply } from '@/lib/testHooks'

// F5 — conversational brand-kit creation from references. Mirrors the campaign
// briefing assistant (chat + grounding + a fenced "apply" convention), but the
// grounding is the kit's uploaded REFERENCE_IMAGE / EXAMPLE_POST artifacts, fed
// to a vision model. The model proposes voice/tone/style/fonts inside a
// ```brandkit block; the COLOR palette is sampled programmatically from the
// images (reliable) rather than guessed by vision. The admin reviews everything
// before it's applied to the kit.

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const brandKitBlockSchema = z.object({
  voice: z.string().trim().min(1),
  tone: z.string().trim().default(''),
  style: z.string().trim().default(''),
  fonts: z.array(z.string().trim().min(1)).max(6).default([]),
})

export interface BrandKitSuggestion {
  voice: string
  tone: string
  style: string
  fonts: string[]
  // Sampled from the reference images, not vision — approximate colors from a
  // model would silently corrupt the kit. Font guesses ARE from vision, so the
  // UI presents them (and everything else) as confirm-before-apply.
  colors: string[]
}

const BLOCK_FENCE = /```brandkit\s*\n([\s\S]*?)```/g

// Parse the LAST ```brandkit block (voice/tone/style/fonts only — colors come
// from sampling). Returns null when missing/malformed.
export function extractBrandKitBlock(text: string): Omit<BrandKitSuggestion, 'colors'> | null {
  let match: RegExpExecArray | null = null
  for (const m of text.matchAll(BLOCK_FENCE)) match = m
  const raw = match?.[1]?.trim()
  if (!raw) return null
  try {
    const parsed = brandKitBlockSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

// Reference images the vision model + color sampler work from (feedToAI only).
async function referenceImageUrls(kitId: string): Promise<string[]> {
  const artifacts = await prisma.brandKitArtifact.findMany({
    where: { brandKitId: kitId, feedToAI: true, type: { in: ['REFERENCE_IMAGE', 'EXAMPLE_POST', 'LOGO'] } },
    orderBy: { createdAt: 'asc' },
    take: 6,
    select: { url: true },
  })
  return artifacts.map((a) => a.url)
}

// Sample a merged palette across all reference images (dedup near-duplicates,
// keep the most-frequent first). Best-effort: sampling failures never fail the chat.
async function samplePalette(urls: string[]): Promise<string[]> {
  if (MOCK_PUPPETEER) return sampleImageColors('mock')
  const all: string[] = []
  for (const url of urls) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const buf = Buffer.from(await res.arrayBuffer())
      const mediaType = (res.headers.get('content-type') ?? 'image/png').split(';')[0]
      const dataUrl = `data:${mediaType};base64,${buf.toString('base64')}`
      all.push(...(await sampleImageColors(dataUrl, 4)))
    } catch {
      /* skip an unreadable reference */
    }
  }
  // Dedup case-insensitively, cap at 6.
  const seen = new Set<string>()
  const merged: string[] = []
  for (const c of all) {
    const k = c.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    merged.push(c)
    if (merged.length >= 6) break
  }
  return merged
}

export interface BrandKitChatResult {
  reply: string
  suggestion: BrandKitSuggestion | null
}

export async function runBrandKitChat(kitId: string, messages: ChatMessage[]): Promise<BrandKitChatResult> {
  const urls = await referenceImageUrls(kitId)

  if (MOCK_AI) {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    const reply = buildMockBrandKitReply(lastUser?.content ?? '')
    const block = extractBrandKitBlock(reply)
    const colors = await samplePalette(urls)
    return { reply, suggestion: block ? { ...block, colors } : null }
  }

  if (urls.length === 0) {
    return {
      reply:
        'Upload at least one reference image (a past post, a mock-up, or your logo) and mark it ' +
        '"feed to AI", then ask me to extract the brand style.',
      suggestion: null,
    }
  }

  const system = [
    'You are a brand designer helping an admin of bistec-studio derive a brand kit from reference images (past posts, mock-ups, logos).',
    'Study the reference images and the conversation, then describe the brand: its VOICE (how copy should sound), TONE, visual STYLE (layout, imagery, mood), and the FONTS the images appear to use.',
    'In every reply once you have enough to work with, include your current best extraction inside a fenced code block that starts with ```brandkit and ends with ``` containing ONLY JSON of the shape {"voice":string,"tone":string,"style":string,"fonts":string[]}. voice is a reusable brand-voice prompt (roughly 60-150 words) that will steer AI copy. Do NOT include colors — those are sampled separately. Font names are your best visual guess; the admin will confirm them.',
    'Summarise briefly in prose above the block; the app turns the block into an editable, applyable suggestion.',
  ].join('\n')

  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const transcript = messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n')
  const userMessage = [
    'Conversation so far:',
    transcript,
    '',
    `Respond to the latest user message: ${lastUser?.content ?? 'Extract the brand style from these references.'}`,
  ].join('\n')

  const [reply, colors] = await Promise.all([
    runVisionModel({ system, userMessage, imageUrls: urls, label: 'brandkit' }),
    samplePalette(urls),
  ])
  const block = extractBrandKitBlock(reply)
  return { reply, suggestion: block ? { ...block, colors } : null }
}
