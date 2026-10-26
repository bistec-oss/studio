// The post-style resolver (027 FR-04). Pure. The only place the style -> goal,
// tone, image style and checklist mapping lives. Never throws.
import type { AspectRatio } from '@prisma/client'
import { getArchetype, imageStyleOptions, type ArchetypeMap } from '@/lib/designData'
import { getStyle } from './styles'
import { stampFor, type PostStyleStamp } from './stamp'
import { matchToneOption, type PostStyle, type Rule } from './types'

export type Surface = 'wizard' | 'briefs-api' | 'queue' | 'mcp' | 'acp' | 'regenerate'
export type ResolveNote =
  | 'default-unavailable'
  | 'unattended-classic'
  | 'path-a-classic'
  | 'size-classic'
  | 'campaign-tone-ignored'
  | 'retired-classic'
  | 'missing-input-classic'

export interface ResolveInput {
  style: string | null | undefined // an explicit key, or absent
  legacyGoal?: string | null // a pre-027 client's goal; picks a style only when `style` is absent
  campaign?: { defaultPostStyle?: string | null; defaultTone?: string | null } | null
  explicit?: { tone?: string | null; imageStyle?: string | null }
  path: 'A' | 'B' // 'A' for designMode TEMPLATE
  aspectRatio: AspectRatio
  surface: Surface
  version?: number // a pinned version; default = current
  // 025: whether the post author supplied the input a look `requires`.
  hasCompositeSource?: boolean
}

export type ResolveResult =
  | {
      ok: true
      key: string
      goal: string
      tone: string
      imageStyle: string
      checklist: readonly Rule[]
      stamp: PostStyleStamp
      notes: readonly ResolveNote[]
    }
  | { ok: false; code: 'UNKNOWN_POST_STYLE'; message: string }

const UNATTENDED: ReadonlySet<Surface> = new Set<Surface>(['queue', 'mcp', 'acp'])

// The one place a pre-027 goal is read (decided 2026-10-24). Anything not listed
// maps to nothing, so resolution continues to the campaign default, then general.
const LEGACY_GOAL_STYLE: Readonly<Record<string, string>> = {
  hiring: 'hiring',
  announcement: 'announcement',
}
export function legacyGoalStyle(raw: string | null | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined
  const k = raw.trim().toLowerCase()
  return Object.hasOwn(LEGACY_GOAL_STYLE, k) ? LEGACY_GOAL_STYLE[k] : undefined
}

// `source` exists so a test can resolve against a fixture dataset (the real one
// has no retired style). Production callers never pass it.
export function resolvePostStyle(
  input: ResolveInput,
  source?: Readonly<Record<string, PostStyle>>,
  looks?: ArchetypeMap, // tests only: a fixture look dataset
): ResolveResult {
  // explicit key -> legacy goal mapping -> campaign default -> general. A blank
  // style is absent, like a blank tone or image style; a non-blank unknown key is not.
  const explicitStyle = input.style?.trim() || undefined
  const keyIn =
    explicitStyle ??
    legacyGoalStyle(input.legacyGoal) ??
    input.campaign?.defaultPostStyle ??
    'general'
  const style = getStyle(keyIn, source)
  if (!style)
    return { ok: false, code: 'UNKNOWN_POST_STYLE', message: `Unknown post style '${keyIn}'` }
  const version = input.version ?? style.current
  const v = Object.hasOwn(style.versions, version) ? style.versions[version] : undefined
  if (!v)
    return {
      ok: false,
      code: 'UNKNOWN_POST_STYLE',
      message: `Post style '${keyIn}' has no version ${version}`,
    }

  const notes: ResolveNote[] = []

  // tone: explicit -> campaign (only if it matches an option) -> style default
  const explicitTone = input.explicit?.tone?.trim()
  const campaignTone = matchToneOption(input.campaign?.defaultTone)
  if (input.campaign?.defaultTone && !campaignTone) notes.push('campaign-tone-ignored')
  const tone = explicitTone || campaignTone || v.defaultTone

  // image style: explicit -> style default -> classic; classic wherever it cannot run
  let imageStyle = input.explicit?.imageStyle || v.defaultImageStyle
  if (imageStyle !== 'classic') {
    const option = imageStyleOptions(input.aspectRatio, looks, {
      hasCompositeSource: input.hasCompositeSource,
    }).find((o) => o.key === imageStyle)
    if (UNATTENDED.has(input.surface)) {
      imageStyle = 'classic'
      notes.push('unattended-classic')
    } else if (input.path === 'A') {
      imageStyle = 'classic'
      notes.push('path-a-classic')
    } else if (getArchetype(imageStyle, looks)?.status === 'retired') {
      imageStyle = 'classic'
      notes.push('retired-classic')
    } else if (getArchetype(imageStyle, looks)?.requires && input.hasCompositeSource !== true) {
      imageStyle = 'classic'
      notes.push('missing-input-classic')
    } else if (!option) {
      imageStyle = 'classic'
      notes.push('default-unavailable')
    } else if (!option.supported) {
      imageStyle = 'classic'
      notes.push('size-classic')
    }
  }

  return {
    ok: true,
    key: style.key,
    goal: v.goal,
    tone,
    imageStyle,
    checklist: v.checklist,
    stamp: stampFor(style.key, version),
    notes,
  }
}
