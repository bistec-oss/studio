// The design-data module's composition section: the archetype records.
//
// One idea (009 design.md section 1): the layout contract is data, and every
// reader (the image prompt, the design prompt, the pixel check, the layout
// observation, the refine prompt and the stamp) reads this one copy. Nothing a
// model returns can supply or move a region (NFR-02).
//
// THE LOOK KEY RULE (permanent):
//  - a look key is never renamed and never reused for a different meaning;
//  - a retired look (`status: 'retired'`) stays in this dataset and stays
//    resolvable for stamps, labels and refine; it is hidden from the picker;
//  - a variant is marked by `variantOf: { key, version }`, never parsed from
//    the hyphens in its key (validate.ts);
//  - a post-style version that names a retired look resolves to classic with
//    the note `retired-classic` (postStyles/resolve.ts).
// PERMANENT NAMES (025): the purpose `composite`, the archetype field
// `requires`, the input name `composite-source`, and the fallback reasons
// `composite-not-blank`, `composite-not-rendered` and `composite-source-missing`
// are stored in stamps and hashes; they are never renamed or reused.
// THE VERSION RULE: a released version is never edited. A change adds
// versions[n+1] and moves `current`. "Released" = the change that adds it is
// VERIFIED PASS. tests/unit/lookDataset.test.ts pins a hash per (key, version).
//
// Pure and client-safe: no prisma, minio, env, fs or puppeteer import (a guard
// test enforces it). `AspectRatio` is a type-only import, as in aspectRatio.ts.
import type { AspectRatio } from '@prisma/client'

export type TextTone = 'light' | 'dark'
// 'composite' (025): a region code fills with the author's own screenshot.
export type Purpose = 'text' | 'clear' | 'composite'
export type ArchetypeKey =
  | 'product-showcase'
  | 'editorial-split'
  | 'full-bleed-scene'
  | 'spotlight'
  | 'device-screen'
// An input a look needs before it can be used (025). Only one exists.
export type LookInput = 'composite-source'

// Canvas percent, 0 to 100.
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
export interface Region {
  rect: Rect
  purpose: Purpose
  minAreaPct: number
  // What goes in this region, for the design and refine prompts (Spotlight only).
  use?: string
}
export interface SizeContract {
  // What the image model is asked to draw at this size (the image prompt).
  // Per size, because a stacked PORTRAIT layout puts the subject elsewhere.
  subject: string
  regions: readonly Region[]
}
export interface Contract {
  role: 'hero'
  textTone: TextTone
  // An archetype declares only the sizes it supports.
  sizes: Partial<Record<AspectRatio, SizeContract>>
  // A variant pins its base version; validation only (validate.ts).
  variantOf?: { key: string; version: number }
}
export interface Archetype {
  key: ArchetypeKey
  label: string
  summary: string
  status: 'active' | 'retired'
  current: number
  // An input the look cannot be used without (025); absent for the first four.
  requires?: LookInput
  // Immutable: deep-frozen at module load. A change adds versions[n+1] and
  // moves `current`; an existing version is never edited.
  versions: Readonly<Record<number, Contract>>
}
export type ArchetypeMap = Readonly<Record<string, Archetype>>

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v)
  }
  return value
}

const textRegion = (x: number, y: number, w: number, h: number): Region => ({
  rect: { x, y, w, h },
  purpose: 'text',
  minAreaPct: 20,
})

const band = (x: number, y: number, w: number, h: number, use: string): Region => ({
  ...textRegion(x, y, w, h),
  use,
})

// A composite region: the area code fills with a screenshot (025).
const screen = (x: number, y: number, w: number, h: number): Region => ({
  rect: { x, y, w, h },
  purpose: 'composite',
  minAreaPct: 20,
})

const DEVICE_SCREEN_SUBJECT =
  'a modern laptop seen straight on, centred, its screen exactly filling the screen area, on a plain dark surface with soft light'

// Every look is light text over an intended dark backdrop. Version 1 of the two
// original looks has no STORY; version 2 adds it. The PORTRAIT rows are stacked
// layouts written on their own, not scaled copies.
export const archetypes: ArchetypeMap = deepFreeze({
  'product-showcase': {
    key: 'product-showcase',
    label: 'Product showcase',
    summary: 'A device or object as the hero, text on a calm dark area beside it.',
    status: 'active',
    current: 2,
    versions: {
      1: {
        role: 'hero',
        textTone: 'light',
        sizes: {
          SQUARE: {
            subject: 'a device or object as the hero subject in the right 55%, lit with depth',
            regions: [textRegion(0, 0, 45, 100)],
          },
          PORTRAIT: {
            subject: 'the same subject in the lower 62%',
            regions: [textRegion(0, 0, 100, 38)],
          },
        },
      },
      2: {
        role: 'hero',
        textTone: 'light',
        sizes: {
          SQUARE: {
            subject: 'a device or object as the hero subject in the right 55%, lit with depth',
            regions: [textRegion(0, 0, 45, 100)],
          },
          PORTRAIT: {
            subject: 'the same subject in the lower 62%',
            regions: [textRegion(0, 0, 100, 38)],
          },
          STORY: {
            subject: 'a device or object as the hero subject in the lower 64%, lit with depth',
            regions: [textRegion(0, 0, 100, 36)],
          },
        },
      },
    },
  },
  'editorial-split': {
    key: 'editorial-split',
    label: 'Editorial split',
    summary: 'A photographic scene on one side, fading softly into a flat area for the text.',
    status: 'active',
    current: 2,
    versions: {
      1: {
        role: 'hero',
        textTone: 'light',
        sizes: {
          SQUARE: {
            subject:
              'a photographic scene confined to the right 40%, fading softly into the flat area across the 50 to 60% strip',
            regions: [textRegion(0, 0, 50, 100)],
          },
          PORTRAIT: {
            subject:
              'a photographic scene confined to the bottom 40%, fading across the 50 to 60% strip',
            regions: [textRegion(0, 0, 100, 50)],
          },
        },
      },
      2: {
        role: 'hero',
        textTone: 'light',
        sizes: {
          SQUARE: {
            subject:
              'a photographic scene confined to the right 40%, fading softly into the flat area across the 50 to 60% strip',
            regions: [textRegion(0, 0, 50, 100)],
          },
          PORTRAIT: {
            subject:
              'a photographic scene confined to the bottom 40%, fading across the 50 to 60% strip',
            regions: [textRegion(0, 0, 100, 50)],
          },
          STORY: {
            subject:
              'a photographic scene confined to the bottom 42%, fading softly into the flat area across the 48 to 58% strip',
            regions: [textRegion(0, 0, 100, 48)],
          },
        },
      },
    },
  },
  'full-bleed-scene': {
    key: 'full-bleed-scene',
    label: 'Full-bleed scene',
    summary:
      'A photographic scene across the whole post, with the text on a calm, dark band along the bottom.',
    status: 'active',
    current: 1,
    versions: {
      1: {
        role: 'hero',
        textTone: 'light',
        sizes: {
          SQUARE: {
            subject:
              'a wide photographic scene filling the top 62% of the frame, its lower part falling into a plain, dark foreground (shadow, still water, a dark floor or a night sky) across the bottom 38%',
            regions: [textRegion(0, 62, 100, 38)],
          },
          PORTRAIT: {
            subject:
              'a wide photographic scene filling the top 62% of the frame, its lower part falling into a plain, dark foreground (shadow, still water, a dark floor or a night sky) across the bottom 38%',
            regions: [textRegion(0, 62, 100, 38)],
          },
          STORY: {
            subject:
              'a wide photographic scene filling the top 65% of the frame, its lower part falling into a plain, dark foreground (shadow, still water, a dark floor or a night sky) across the bottom 35%',
            regions: [textRegion(0, 65, 100, 35)],
          },
        },
      },
    },
  },
  spotlight: {
    key: 'spotlight',
    label: 'Spotlight',
    summary:
      'One subject lit in the centre, the headline above it and the call to action below, on a plain dark background.',
    status: 'active',
    current: 2,
    versions: {
      1: {
        role: 'hero',
        textTone: 'light',
        sizes: {
          SQUARE: {
            subject:
              'a single subject (an object, a product or an emblem) centred in the middle 52% of the frame, lit by one spotlight against a plain, dark background that stays dark at the top and bottom',
            regions: [
              band(0, 0, 100, 24, 'the headline'),
              band(0, 76, 100, 24, 'the call to action and the logo'),
            ],
          },
          PORTRAIT: {
            subject:
              'a single subject (an object, a product or an emblem) centred in the middle 42% of the frame, lit by one spotlight against a plain, dark background that stays dark at the top and bottom',
            regions: [
              band(0, 0, 100, 24, 'the headline'),
              band(0, 76, 100, 24, 'the call to action and the logo'),
            ],
          },
          STORY: {
            subject:
              'a single subject (an object, a product or an emblem) centred in the middle 56% of the frame, lit by one spotlight against a plain, dark background that stays dark at the top and bottom',
            regions: [
              band(0, 0, 100, 22, 'the headline'),
              band(0, 78, 100, 22, 'the call to action and the logo'),
            ],
          },
        },
      },
      // 031 (T16), served since T18: OP-031 passed (2 of 2 accepted, 2026-10-26). SQUARE only
      // differs from v1: both bands are pulled back from the subject, and the prompt says the
      // top and bottom 22% are a flat, plain backdrop. PORTRAIT and STORY are v1 unchanged.
      // Evidence: .specclaw/changes/031-v2-final-polish/look-check/evidence.md.
      2: {
        role: 'hero',
        textTone: 'light',
        sizes: {
          SQUARE: {
            subject:
              'a single subject (an object, a product or an emblem) centred in the middle 50% of the frame, lit by one spotlight against a plain, dark background; the top 22% and bottom 22% are a flat, plain, dark backdrop with no texture or detail',
            regions: [
              band(0, 0, 100, 20, 'the headline'),
              band(0, 80, 100, 20, 'the call to action and the logo'),
            ],
          },
          PORTRAIT: {
            subject:
              'a single subject (an object, a product or an emblem) centred in the middle 42% of the frame, lit by one spotlight against a plain, dark background that stays dark at the top and bottom',
            regions: [
              band(0, 0, 100, 24, 'the headline'),
              band(0, 76, 100, 24, 'the call to action and the logo'),
            ],
          },
          STORY: {
            subject:
              'a single subject (an object, a product or an emblem) centred in the middle 56% of the frame, lit by one spotlight against a plain, dark background that stays dark at the top and bottom',
            regions: [
              band(0, 0, 100, 22, 'the headline'),
              band(0, 78, 100, 22, 'the call to action and the logo'),
            ],
          },
        },
      },
    },
  },
  'device-screen': {
    key: 'device-screen',
    label: 'Product screen',
    summary: 'A laptop showing your own product screenshot, with the text above it.',
    status: 'active',
    current: 1,
    requires: 'composite-source',
    versions: {
      1: {
        role: 'hero',
        textTone: 'light',
        sizes: {
          SQUARE: {
            subject: DEVICE_SCREEN_SUBJECT,
            regions: [textRegion(0, 0, 100, 34), screen(14, 42, 72, 45)],
          },
          PORTRAIT: {
            subject: DEVICE_SCREEN_SUBJECT,
            regions: [textRegion(0, 0, 100, 36), screen(10, 45, 80, 40)],
          },
          STORY: {
            subject: DEVICE_SCREEN_SUBJECT,
            regions: [textRegion(0, 0, 100, 34), screen(8, 44, 84, 29.5)],
          },
        },
      },
    },
  },
} satisfies Record<ArchetypeKey, Archetype>)

// The one composite region of a size contract, or null (025). Code outside the
// dataset gets the screenshot rect only through this.
export function compositeRegionOf(size: SizeContract): Region | null {
  return size.regions.find((r) => r.purpose === 'composite') ?? null
}

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k)

// A key that is in the dataset, retired or not. Null for anything else
// (including 'classic', which has no entry, and prototype names).
export function getArchetype(key: string, source: ArchetypeMap = archetypes): Archetype | null {
  return has(source, key) ? source[key] : null
}

export function isActiveKey(key: string, source: ArchetypeMap = archetypes): boolean {
  return getArchetype(key, source)?.status === 'active'
}

// The exact immutable contract for a stamped (key, version, size), for any key
// including a retired one. Null when any part does not resolve.
export function contractAt(
  key: string,
  version: number,
  size: AspectRatio,
  source: ArchetypeMap = archetypes,
): SizeContract | null {
  const archetype = getArchetype(key, source)
  if (!archetype || !has(archetype.versions, String(version))) return null
  const sizes = archetype.versions[version].sizes
  return has(sizes, size) ? (sizes[size] ?? null) : null
}

// The whole versioned contract (the tone lives on it), or null.
export function contractVersionOf(
  key: string,
  version: number,
  source: ArchetypeMap = archetypes,
): Contract | null {
  const archetype = getArchetype(key, source)
  return archetype && has(archetype.versions, String(version)) ? archetype.versions[version] : null
}

export const FALLBACK_STYLE_LABEL = 'that image style'

// The archetype's label (a retired key still has one), else a neutral phrase.
export function styleLabel(key: string, source: ArchetypeMap = archetypes): string {
  return getArchetype(key, source)?.label ?? FALLBACK_STYLE_LABEL
}

export interface ImageStyleOption {
  key: string
  label: string
  summary: string
}

// The reason a look that needs a screenshot is unavailable without one (025).
export const NEEDS_SCREENSHOT_REASON = 'Needs a product screenshot'

// The picker source for a dataset: classic first, then its active looks only.
export function imageStylesOf(source: ArchetypeMap): ImageStyleOption[] {
  return [
    { key: 'classic', label: 'Classic', summary: 'The standard post design.' },
    ...Object.values(source)
      .filter((a) => a.status === 'active')
      .map((a) => ({ key: a.key, label: a.label, summary: a.summary })),
  ]
}

// The wizard's picker source: classic first, then the active archetypes only.
export const IMAGE_STYLES: readonly ImageStyleOption[] = deepFreeze(imageStylesOf(archetypes))

// True when the look's current contract declares the size (classic always).
// Independent of any input the look requires (025).
export function supportsSize(
  key: string,
  size: AspectRatio,
  source: ArchetypeMap = archetypes,
): boolean {
  if (key === 'classic') return true
  const archetype = getArchetype(key, source)
  // Only an active look is in the picker, so a retired or unknown one is false.
  if (!archetype || archetype.status !== 'active') return false
  return contractAt(key, archetype.current, size, source) !== null
}

// Each style with whether the chosen size supports it (classic always does). A
// look that `requires` an input is unsupported, with a reason, until the caller
// says the input exists (025).
export function imageStyleOptions(
  aspectRatio: AspectRatio,
  source: ArchetypeMap = archetypes,
  opts: { hasCompositeSource?: boolean } = {},
): Array<ImageStyleOption & { supported: boolean; reason?: string }> {
  return imageStylesOf(source).map((s) => {
    if (getArchetype(s.key, source)?.requires && !opts.hasCompositeSource) {
      return { ...s, supported: false, reason: NEEDS_SCREENSHOT_REASON }
    }
    return { ...s, supported: supportsSize(s.key, aspectRatio, source) }
  })
}
