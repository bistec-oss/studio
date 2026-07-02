// Shared types for the brief wizard (page + step components + hook).

export type DesignMode = 'TEMPLATE' | 'GENERATE'
export type ImageIntent = 'embed' | 'reference'

// Client-composed convenience shape — merges the /brandkit endpoint's
// { kit, source } response into one object for the resolved-kit banner.
export interface ResolvedKit {
  id: string
  name: string
  source: string // 'campaign' | 'project' | 'system'
}

export interface UploadedImage {
  id: string
  url: string
  filename: string
  intent: ImageIntent
}
