// The brief wizard's post-style state (027 FR-07). Pure and client-safe. The
// wizard keeps the user's own choices (the style, a tone they picked, an image
// style they picked) and asks `resolvePostStyle` for everything else, so the
// style -> tone / image style mapping lives in one place and a touched field is
// never overwritten.
import type { AspectRatio } from '@prisma/client'
import { resolvePostStyle, getStyle } from '@/lib/postStyles'
import {
  imageStyleOptions,
  getArchetype,
  contractAt,
  compositeRegionOf,
  type ArchetypeMap,
} from '@/lib/designData'
import { dimensionsFor } from '@/lib/aspectRatio'

export const DEFAULT_POST_STYLE = 'general'

export interface WizardStyleInput {
  /** The chosen style key (may be a stale or unknown key; it falls to General). */
  postStyle: string
  campaign: { defaultPostStyle?: string | null; defaultTone?: string | null } | null
  designMode: 'TEMPLATE' | 'GENERATE'
  aspectRatio: AspectRatio
  /** The user's own tone and whether they changed it. */
  tone: string
  toneTouched: boolean
  /** The user's own image style and whether they changed it. */
  imageStyle: string
  imageStyleTouched: boolean
  /** 025: the brief carries an uploaded product screenshot (a look that `requires` one needs it). */
  hasCompositeSource?: boolean
}

export interface WizardStyleView {
  postStyle: string
  goal: string
  tone: string
  imageStyle: string
  /** True when the image style shown is the style's own default, not the user's pick. */
  imageStyleFromStyle: boolean
  /** True when the tone shown is not the user's pick. */
  toneFromStyle: boolean
}

/** A stored or campaign key that is not in the dataset opens as General. */
export function knownStyleKey(key: string | null | undefined): string {
  return typeof key === 'string' && key.trim() && getStyle(key.trim()) ? key.trim() : DEFAULT_POST_STYLE
}

/** The style a campaign selects: its default if it resolves, else General. */
export function campaignStyleKey(campaign: { defaultPostStyle?: string | null } | null | undefined): string {
  return knownStyleKey(campaign?.defaultPostStyle)
}

export function resolveWizardStyle(i: WizardStyleInput): WizardStyleView {
  const key = knownStyleKey(i.postStyle)
  const r = resolvePostStyle({
    style: key,
    campaign: i.campaign,
    explicit: {
      tone: i.toneTouched ? i.tone : undefined,
      imageStyle: i.imageStyleTouched ? i.imageStyle : undefined,
    },
    path: i.designMode === 'TEMPLATE' ? 'A' : 'B',
    aspectRatio: i.aspectRatio,
    surface: 'wizard',
    // 025: a look that needs a screenshot is classic until the wizard holds one.
    hasCompositeSource: !!i.hasCompositeSource,
  })
  if (!r.ok) {
    // knownStyleKey makes this unreachable; fail soft rather than throw in render.
    return {
      postStyle: DEFAULT_POST_STYLE,
      goal: 'awareness',
      tone: i.tone,
      imageStyle: 'classic',
      imageStyleFromStyle: false,
      toneFromStyle: false,
    }
  }
  return {
    postStyle: r.key,
    goal: r.goal,
    tone: r.tone,
    imageStyle: r.imageStyle,
    imageStyleFromStyle: !i.imageStyleTouched && r.imageStyle !== 'classic',
    toneFromStyle: !i.toneTouched,
  }
}

/** What POST /api/briefs gets: the style always, tone and image style only when touched. */
export function styleRequestFields(i: WizardStyleInput): {
  postStyle: string
  tone?: string
  imageStyle?: string
} {
  const out: { postStyle: string; tone?: string; imageStyle?: string } = {
    postStyle: knownStyleKey(i.postStyle),
  }
  if (i.toneTouched) out.tone = i.tone
  // A touched look is sent even when it is classic (the user chose it over the
  // style's default). Template briefs never carry one.
  if (i.imageStyleTouched && i.designMode === 'GENERATE') out.imageStyle = i.imageStyle
  return out
}

export interface StoredWizardStyle {
  postStyle?: string
  tone: string
  imageStyle?: string
}

/**
 * A resumed payload back to the wizard's own state. A stored tone or image style
 * counts as touched only if it differs from what the resolver would give, so a
 * resumed brief with untouched fields keeps following the style.
 */
export function resumeWizardStyle(
  stored: StoredWizardStyle,
  ctx: Pick<WizardStyleInput, 'campaign' | 'designMode' | 'aspectRatio'>,
): { postStyle: string; toneTouched: boolean; imageStyleTouched: boolean; imageStyle: string } {
  const postStyle = knownStyleKey(stored.postStyle)
  const base = resolveWizardStyle({
    ...ctx,
    postStyle,
    tone: stored.tone,
    toneTouched: false,
    imageStyle: 'classic',
    imageStyleTouched: false,
  })
  // An absent stored image style is classic (the autosave leaves classic out).
  const storedImage = stored.imageStyle ?? 'classic'
  return {
    postStyle,
    toneTouched: stored.tone !== base.tone,
    imageStyleTouched: storedImage !== base.imageStyle,
    imageStyle: storedImage,
  }
}

/**
 * The image style to keep after an input changes (the size, or the product
 * screenshot being added or removed): the current pick if it is still usable,
 * else classic (and the pick is dropped, untouched). A look that `requires` a
 * screenshot is usable only while one is held (025 FR-17).
 */
export function styleAfterInputChange(
  imageStyle: string,
  size: AspectRatio,
  looks?: ArchetypeMap,
  opts: { hasCompositeSource?: boolean } = {},
): { imageStyle: string; reset: boolean } {
  const supported = imageStyleOptions(size, looks, opts).find((o) => o.key === imageStyle)?.supported
  return supported ? { imageStyle, reset: false } : { imageStyle: 'classic', reset: true }
}

/** The size-change form of `styleAfterInputChange`, with no screenshot held. */
export function styleAfterSizeChange(
  imageStyle: string,
  size: AspectRatio,
  looks?: ArchetypeMap,
): { imageStyle: string; reset: boolean } {
  return styleAfterInputChange(imageStyle, size, looks, { hasCompositeSource: false })
}

/** The most the screenshot's aspect may differ from the screen's before the wizard says so. */
export const LETTERBOX_ADVISORY_RATIO = 0.1

/**
 * 025 FR-17: true when a screenshot's aspect differs from the picked look's screen
 * at this size by more than 10% (so it will be letterboxed). The screen is the
 * look's `composite` region in canvas px. Advisory only; never a refusal. Looks at
 * the screen of the first look that `requires` a screenshot (device-screen).
 */
export function screenshotWillLetterbox(
  size: AspectRatio,
  shot: { width: number; height: number },
  looks?: ArchetypeMap,
): boolean {
  if (!(shot.width > 0) || !(shot.height > 0)) return false
  const key = imageStyleOptions(size, looks, { hasCompositeSource: true }).find(
    (o) => getArchetype(o.key, looks)?.requires,
  )?.key
  const archetype = key ? getArchetype(key, looks) : null
  const contract = archetype ? contractAt(archetype.key, archetype.current, size, looks) : null
  const region = contract ? compositeRegionOf(contract) : null
  if (!region) return false
  const canvas = dimensionsFor(size)
  const screenW = (region.rect.w * canvas.width) / 100
  const screenH = (region.rect.h * canvas.height) / 100
  if (!(screenW > 0) || !(screenH > 0)) return false
  return Math.abs(shot.width / shot.height / (screenW / screenH) - 1) > LETTERBOX_ADVISORY_RATIO
}
