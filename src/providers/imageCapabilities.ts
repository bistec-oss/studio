// Which provider can serve which slot, and which IMAGE row serves a team.
//
// One definition shared by the resolver (registry.ts), the provider routes
// (POST/PATCH /api/admin/providers) and the /team page, so "can this provider
// serve this slot" and "which row is serving" can't drift apart (005 FR-01,
// FR-04). Pure: no I/O, safe to import from client components.

export const IMAGE_PROVIDERS = ['openai', 'gemini'] as const
export type ImageProviderName = (typeof IMAGE_PROVIDERS)[number]

export const SLOT_PROVIDERS = {
  IMAGE: IMAGE_PROVIDERS,
  COPY: ['anthropic', 'openai', 'cli'],
} as const satisfies Record<string, readonly string[]>
export type CapabilitySlot = keyof typeof SLOT_PROVIDERS

const KNOWN_PROVIDERS = new Set<string>([...SLOT_PROVIDERS.IMAGE, ...SLOT_PROVIDERS.COPY])

// IMAGE is strict: only a provider instantiateImageProvider can build.
// COPY keeps the custom-provider registration flow it has always had (an
// unrecognized key format plus a free-text providerName), so it refuses only a
// KNOWN provider that is known not to serve copy, e.g. gemini.
export function canServeSlot(slot: CapabilitySlot, providerName: string): boolean {
  if ((SLOT_PROVIDERS[slot] as readonly string[]).includes(providerName)) return true
  return slot === 'COPY' && !KNOWN_PROVIDERS.has(providerName)
}

export function isImageProvider(providerName: string): providerName is ImageProviderName {
  return (IMAGE_PROVIDERS as readonly string[]).includes(providerName)
}

export type ImageProviderRow = {
  id: string
  providerName: string
  isEnabled: boolean
  isDefault: boolean
  createdAt: Date | string
}

function oldestFirst(a: ImageProviderRow, b: ImageProviderRow): number {
  const dt = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  if (dt !== 0) return dt
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

// The row resolveImageProvider's tiers 3 and 4 serve for a team, given that
// team's IMAGE rows: the enabled compatible default, else the oldest enabled
// compatible row (createdAt, then id), else null. Tiers 1 (personal key) and 2
// (explicit providerKey) are request-specific and not modelled here.
export function pickServingImageProvider<T extends ImageProviderRow>(rows: readonly T[]): T | null {
  const usable = rows.filter((r) => r.isEnabled && isImageProvider(r.providerName)).sort(oldestFirst)
  return usable.find((r) => r.isDefault) ?? usable[0] ?? null
}

// ── Per-provider image sizes ────────────────────────────────────────────────
// Each provider names its sizes differently: gpt-image takes pixel strings and
// only has square and portrait, Gemini takes aspect-ratio strings. A new
// provider adds its row here, in the same place it becomes image-capable.
export const IMAGE_SIZES: Record<ImageProviderName, Record<'SQUARE' | 'PORTRAIT' | 'STORY', string>> = {
  openai: { SQUARE: '1024x1024', PORTRAIT: '1024x1536', STORY: '1024x1536' },
  gemini: { SQUARE: '1:1', PORTRAIT: '4:5', STORY: '9:16' },
}

// The provider-native size for a post's aspect ratio. The design layer
// cover-crops the image to the exact 1080-wide canvas, so orientation is what
// matters, not an exact ratio match. An unknown provider or aspect (a legacy
// row, an unset ratio) therefore falls back to that provider's SQUARE, or
// '1024x1024' when the provider itself is unknown.
export function imageSizeFor(
  providerName: string | null | undefined,
  aspectRatio: string | null | undefined
): string {
  const sizes = isImageProvider(providerName ?? '') ? IMAGE_SIZES[providerName as ImageProviderName] : null
  if (!sizes) return '1024x1024'
  return (sizes as Record<string, string>)[aspectRatio ?? ''] ?? sizes.SQUARE
}
