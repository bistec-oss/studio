import type { Brief } from '@prisma/client'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import { parseCompositeSource } from '@/lib/brief/compositeSource'
import type { BriefInput } from '@/providers/interfaces/CopyProvider'
import {
  checklistPromptText,
  parsePostStyleStamp,
  resolvePostStyle,
  rulesAtStamp,
  type PostStyleStamp,
} from '@/lib/postStyles'

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

// ── Post styles (027 FR-09) ──────────────────────────────────────────────────
// A brief with no stored style (every pre-027 row) has no rules and no stamp:
// every builder then emits exactly the text it emitted before 027.

export interface BriefPostStyle {
  // The stamp of this run: the key at the dataset's current version.
  stamp: PostStyleStamp
  // The rendered checklist blocks; undefined when the style has no rule in
  // that scope.
  captionRules: string | undefined
  imageRules: string | undefined
}

// Fail closed (NFR-04): a stored key that does not resolve is never "no style".
// It throws here, before any model call: the generation fails, or the action
// records the error, with this message.
export function resolveBriefStyle(
  brief: Pick<Brief, 'designMode' | 'aspectRatio'> & { postStyle?: string | null; compositeSource?: unknown },
): BriefPostStyle | null {
  const key = brief.postStyle?.trim()
  if (!key) return null
  const resolved = resolvePostStyle({
    style: key,
    path: brief.designMode === 'TEMPLATE' ? 'A' : 'B',
    aspectRatio: brief.aspectRatio,
    surface: 'regenerate',
    // 025: a look that needs a screenshot is available only when the brief has one.
    hasCompositeSource: parseCompositeSource(brief.compositeSource) !== null,
  })
  if (!resolved.ok) throw new Error(`Post style "${brief.postStyle}" is not available`)
  return {
    stamp: resolved.stamp,
    captionRules: checklistPromptText(resolved.key, resolved.stamp.version, 'caption') || undefined,
    imageRules: checklistPromptText(resolved.key, resolved.stamp.version, 'image') || undefined,
  }
}

// The image-scope rules Path A, Path B, the background decision and regenerate
// design share, so first generation, scheduled generation and regenerate use
// one path. undefined for a brief with no style.
export function imageRulesFor(
  brief: Pick<Brief, 'designMode' | 'aspectRatio'> & { postStyle?: string | null; compositeSource?: unknown },
): string | undefined {
  return resolveBriefStyle(brief)?.imageRules
}

// The stamp a run under this brief's style records; null for a brief with no
// style.
export function briefPostStyleStamp(
  brief: Pick<Brief, 'designMode' | 'aspectRatio'> & { postStyle?: string | null; compositeSource?: unknown },
): PostStyleStamp | null {
  return resolveBriefStyle(brief)?.stamp ?? null
}

// Refine reads no resolver: it applies the image rules of the draft's STAMPED
// (key, version), which are immutable. A stamp that does not resolve passes no
// rules and warns once; it never fails a refine (NFR-04).
export function imageRulesAtStamp(stamp: unknown, draftId: string): string | undefined {
  const parsed = parsePostStyleStamp(stamp)
  if (!parsed) return undefined
  if (rulesAtStamp(parsed) === null) {
    console.warn(
      `[refine] draft ${draftId}: post style stamp ${parsed.key}@${parsed.version} does not resolve; image rules omitted`,
    )
    return undefined
  }
  return checklistPromptText(parsed.key, parsed.version, 'image') || undefined
}

// Builds the provider-facing BriefInput from a Brief row (+ optional resolved
// brand kit for voice context, + optional active campaign briefing). Shared by
// every copy-generation call site (assemble-a, assemble-b, the copy route,
// regenerate-copy, ACP) so the shape stays identical everywhere.
export function buildBriefInput(
  brief: Brief,
  kit?: ResolvedBrandKit | null,
  campaignBriefing?: string | null,
): BriefInput {
  // 027: throws for a stored key that does not resolve (fail closed).
  const captionRules = resolveBriefStyle(brief)?.captionRules
  return {
    topic: brief.topic,
    description: brief.description ?? '',
    goal: brief.goal,
    tone: brief.tone,
    channels: brief.channels,
    brandName: kit?.name,
    brandVoice: kit?.voicePrompt ?? undefined,
    campaignBriefing: campaignBriefing ?? undefined,
    ...(captionRules ? { captionRules } : {}),
  }
}
