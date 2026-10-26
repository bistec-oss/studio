import type { ImageProviderName, ImageTier } from "../imageCapabilities"

export interface ImageProvider {
  // Which IMAGE provider this is, so callers can pick its native size
  // (imageSizeFor in imageCapabilities.ts).
  readonly providerName: ImageProviderName

  // size is a provider-native dimension string (e.g. "1024x1024", "1024x1536");
  // implementations fall back to square when omitted.
  //
  // options.quality (009 FR-16) is a neutral tier a provider maps to its own
  // word, or ignores. The returned quality says what was applied, so the stamp
  // can record it; a provider that ignores the option omits it.
  generateImage(
    prompt: string,
    brandKitId?: string,
    size?: string,
    options?: { quality?: ImageTier }
  ): Promise<{ url: string; quality?: ImageTier }>
}
