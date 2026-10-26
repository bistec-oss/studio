// Where a draft's image came from (031 FR-13, FR-14), as data and fixed text.
// Pure: no I/O, safe to import anywhere (client components included).
//
// Stored as Draft.imageSource (JSON): the tier and provider of the image that
// ran, and `personalFailed` when the user's own key was tried and failed.

export type ImageSourceProvider = 'openai' | 'gemini'

export interface ImageSource {
  tier: 'personal' | 'team'
  provider: ImageSourceProvider
  personalFailed?: true
  // Deviation from design 4.3: the provider of the personal key that failed,
  // stored beside `personalFailed` because the notice names it ("Your image
  // generation key (Gemini) failed") and `provider` is the team's when the
  // team made the image.
  personalProvider?: ImageSourceProvider
}

// GET /api/drafts/[id] -> imageSourceNotice.
export interface ImageSourceNotice {
  message: string
}

const PROVIDER_WORD: Record<ImageSourceProvider, string> = { openai: 'OpenAI', gemini: 'Gemini' }

export function imageProviderWord(provider: ImageSourceProvider): string {
  return PROVIDER_WORD[provider]
}

// Tolerant read of the stored JSON: anything unreadable is null (no notice).
export function parseImageSource(value: unknown): ImageSource | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (v.tier !== 'personal' && v.tier !== 'team') return null
  if (v.provider !== 'openai' && v.provider !== 'gemini') return null
  return {
    tier: v.tier,
    provider: v.provider,
    ...(v.personalFailed === true ? { personalFailed: true as const } : {}),
    ...(v.personalProvider === 'openai' || v.personalProvider === 'gemini'
      ? { personalProvider: v.personalProvider }
      : {}),
  }
}

// The personal key failed and the team's provider made the image (FR-14). When
// no team provider was available the existing skip notice speaks instead
// (see noPersonalFallbackMessage), so this returns null for a personal tier.
export function imageSourceNoticeFor(source: ImageSource | null): ImageSourceNotice | null {
  if (!source || !source.personalFailed || source.tier !== 'team') return null
  const failed = source.personalProvider ? ` (${PROVIDER_WORD[source.personalProvider]})` : ''
  return { message: `Your image generation key${failed} failed, so the team's image provider made this image.` }
}

// The text of the skip notice when the personal key failed and the team has no
// image provider (FR-14).
export function noPersonalFallbackMessage(provider: ImageSourceProvider): string {
  return `Your image generation key (${PROVIDER_WORD[provider]}) failed and the team has no image provider, so this post has no AI image.`
}
