import type { Brief } from '@prisma/client'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import type { BriefInput } from '@/providers/interfaces/CopyProvider'

// The one shape for Brief.briefImages entries (a JSON column). Always go
// through parseBriefImages — bare casts let malformed rows flow into prompts.
export interface BriefImage {
  url: string
  intent: 'embed' | 'reference'
}

export function parseBriefImages(json: unknown): BriefImage[] {
  if (!Array.isArray(json)) return []
  return json.filter((entry): entry is BriefImage => {
    if (!entry || typeof entry !== 'object') return false
    const e = entry as Record<string, unknown>
    return typeof e.url === 'string' && (e.intent === 'embed' || e.intent === 'reference')
  })
}

// Builds the provider-facing BriefInput from a Brief row (+ optional resolved
// brand kit for voice context). Shared by every copy-generation call site
// (assemble-a, assemble-b, the copy route, regenerate-copy, ACP) so the shape
// stays identical everywhere.
export function buildBriefInput(brief: Brief, kit?: ResolvedBrandKit | null): BriefInput {
  return {
    topic: brief.topic,
    description: brief.description ?? '',
    goal: brief.goal,
    tone: brief.tone,
    channels: brief.channels,
    brandName: kit?.name,
    brandVoice: kit?.voicePrompt ?? undefined,
  }
}
