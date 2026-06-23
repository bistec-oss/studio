export interface ImageProvider {
  generateImage(prompt: string, brandKitId?: string): Promise<{ url: string }>
}
