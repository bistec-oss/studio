import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { runVisionModel } from '@/lib/agent/vision'
import { runBriefingModel } from '@/lib/campaign/briefingAssistant'
import { buildDocsContext } from '@/lib/campaign/documents'
import { sampleImageColors } from '@/lib/renderer/puppeteer'
import { MOCK_AI, MOCK_PUPPETEER, buildMockBrandKitReply } from '@/lib/testHooks'

// F5 — conversational brand-kit creation from references. Mirrors the campaign
// briefing assistant (chat + grounding + a fenced "apply" convention), but the
// grounding is the kit's uploaded REFERENCE_IMAGE / EXAMPLE_POST artifacts fed
// to a vision model, plus REFERENCE_DOC artifacts (brand guidelines etc.) whose
// parsed text rides along in the prompt — unioned with the kit's assistant
// source documents (BrandKitDocument, doc images first; see
// collectBrandKitGrounding). Those documents never enter generation prompts. The model proposes voice/tone/style/
// fonts inside a ```brandkit block; the COLOR palette is sampled
// programmatically from the images — the model may additionally report colors
// ONLY when a document states them explicitly (hex codes in a brand guideline),
// never guessed from pixels. The admin reviews everything before it's applied.

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

const brandKitBlockSchema = z.object({
  voice: z.string().trim().min(1),
  tone: z.string().trim().default(''),
  style: z.string().trim().default(''),
  fonts: z.array(z.string().trim().min(1)).max(6).default([]),
  // Colors explicitly stated in reference DOCUMENTS only (validated hex).
  colors: z.array(z.string().trim().regex(HEX_COLOR)).max(6).default([]),
})

export interface BrandKitSuggestion {
  voice: string
  tone: string
  style: string
  fonts: string[]
  // Document-declared colors first (authoritative), then colors sampled from
  // the reference images — never colors guessed by vision from pixels. Font
  // guesses ARE from vision, so the UI presents them (and everything else) as
  // confirm-before-apply.
  colors: string[]
}

const BLOCK_FENCE = /```brandkit\s*\n([\s\S]*?)```/g

// Parse the LAST ```brandkit block. Returns null when missing/malformed.
export function extractBrandKitBlock(text: string): Omit<BrandKitSuggestion, 'colors'> & { colors: string[] } | null {
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

// Parsed text rows of the kit's feedToAI reference DOCUMENT artifacts (brand
// guidelines, voice docs).
async function referenceDocRows(kitId: string): Promise<Array<{ name: string; parsedText: string; truncated: boolean }>> {
  const docs = await prisma.brandKitArtifact.findMany({
    where: { brandKitId: kitId, feedToAI: true, type: 'REFERENCE_DOC' },
    orderBy: { createdAt: 'asc' },
    select: { name: true, parsedText: true, truncated: true },
  })
  return docs.map((d) => ({ ...d, parsedText: d.parsedText ?? '' }))
}

export interface BrandKitGrounding {
  // Union of uploaded document images (presigned, FIRST) and feedToAI artifact
  // images — deduped, capped at 6. Vision input AND palette-sampling source.
  imageUrls: string[]
  // Uploaded document texts (first) + REFERENCE_DOC artifact texts, assembled
  // under the shared buildDocsContext caps.
  docs: { text: string; truncated: boolean }
}

// Everything the chat grounds on: the kit's assistant source DOCUMENTS
// (BrandKitDocument — never generation-visible) unioned with its feedToAI
// artifacts. Document images come first so they win the cap.
export async function collectBrandKitGrounding(kitId: string): Promise<BrandKitGrounding> {
  const { collectBrandKitDocTexts, collectBrandKitDocImageUrls } = await import('@/lib/brandkit/documents')
  const [artifactUrls, docImageUrls, artifactDocRows, kitDocRows] = await Promise.all([
    referenceImageUrls(kitId),
    collectBrandKitDocImageUrls(kitId),
    referenceDocRows(kitId),
    collectBrandKitDocTexts(kitId),
  ])
  const seen = new Set<string>()
  const imageUrls: string[] = []
  for (const url of [...docImageUrls, ...artifactUrls]) {
    if (seen.has(url)) continue
    seen.add(url)
    imageUrls.push(url)
    if (imageUrls.length >= 6) break
  }
  return { imageUrls, docs: buildDocsContext([...kitDocRows, ...artifactDocRows]) }
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

// Merge document-declared colors (authoritative — an explicit brand spec beats
// pixel sampling) with the sampled palette; dedup, cap at 6.
function mergeColors(docColors: string[], sampled: string[]): string[] {
  const seen = new Set<string>()
  const merged: string[] = []
  for (const c of [...docColors, ...sampled]) {
    const k = c.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    merged.push(c)
    if (merged.length >= 6) break
  }
  return merged
}

export async function runBrandKitChat(
  kitId: string,
  messages: ChatMessage[],
  teamId: string
): Promise<BrandKitChatResult> {
  const { imageUrls: urls, docs } = await collectBrandKitGrounding(kitId)

  if (MOCK_AI) {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    const reply = buildMockBrandKitReply(lastUser?.content ?? '')
    const block = extractBrandKitBlock(reply)
    const sampled = await samplePalette(urls)
    return { reply, suggestion: block ? { ...block, colors: mergeColors(block.colors, sampled) } : null }
  }

  if (urls.length === 0 && !docs.text) {
    return {
      reply:
        'Add at least one reference (an image of a past post, a mock-up, your logo, or a brand ' +
        'guideline document) — either upload it here in the assistant, or add it in the Artifacts ' +
        'section marked "feed to AI" — then ask me to extract the brand style.',
      suggestion: null,
    }
  }

  const system = [
    'You are a brand designer helping an admin of bistec-studio derive a brand kit from reference material (past posts, mock-ups, logos, brand guideline documents).',
    'Study the references and the conversation, then describe the brand: its VOICE (how copy should sound), TONE, visual STYLE (layout, imagery, mood), and the FONTS in use.',
    'In every reply once you have enough to work with, include your current best extraction inside a fenced code block that starts with ```brandkit and ends with ``` containing ONLY JSON of the shape {"voice":string,"tone":string,"style":string,"fonts":string[],"colors":string[]}. voice is a reusable brand-voice prompt (roughly 60-150 words) that will steer AI copy. colors: include ONLY hex color values the reference DOCUMENTS state explicitly (e.g. a brand guideline naming #1A2B3C) — NEVER estimate colors from images; leave the array empty otherwise (image colors are sampled separately). Font names from images are your best visual guess; the admin will confirm them.',
    'Summarise briefly in prose above the block; the app turns the block into an editable, applyable suggestion.',
    docs.text
      ? `\n# Reference documents\n\n${docs.text}` +
        (docs.truncated ? '\n\n(Note: the document text above was truncated to fit — treat it as an excerpt.)' : '')
      : '',
  ]
    .filter(Boolean)
    .join('\n')

  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const transcript = messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n')
  const userMessage = [
    'Conversation so far:',
    transcript,
    '',
    `Respond to the latest user message: ${lastUser?.content ?? 'Extract the brand style from these references.'}`,
  ].join('\n')

  // With images → vision call + palette sampling; documents only → the same
  // mode-agnostic text call the campaign briefing assistant uses.
  const [reply, sampled] = await Promise.all([
    urls.length > 0
      ? runVisionModel({ system, userMessage, imageUrls: urls, label: 'brandkit', teamId })
      : runBriefingModel(system, [{ role: 'user', content: userMessage }], teamId),
    samplePalette(urls),
  ])
  const block = extractBrandKitBlock(reply)
  return { reply, suggestion: block ? { ...block, colors: mergeColors(block.colors, sampled) } : null }
}
