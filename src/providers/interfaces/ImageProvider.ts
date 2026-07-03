export interface ImageProvider {
  // size is a provider-native dimension string (e.g. "1024x1024", "1024x1536");
  // implementations fall back to square when omitted.
  generateImage(prompt: string, brandKitId?: string, size?: string): Promise<{ url: string }>
}
