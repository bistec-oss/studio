import type { BriefInput } from "./CopyProvider"

export interface DesignOrchestrator {
  orchestrate(
    brief: BriefInput,
    brandKitId: string
  ): Promise<{ htmlContent: string; exportUrl: string }>
}
