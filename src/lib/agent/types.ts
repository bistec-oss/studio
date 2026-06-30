export interface BrandKitContext {
  colors: string[]
  fonts: Array<{ name: string; url: string }>
  logoUrl: string | null
  voicePrompt: string | null
  artifactUrls: string[]
}

export interface DesignAgentOptions {
  systemPrompt: string
  userMessage: string
  briefId: string
  model?: string
  maxToolCalls?: number
  // Output canvas size. The real (API) path relies on the prompt to instruct the
  // model to call renderHtml with these dimensions; the mock path renders at them
  // directly. Default 1080×1080 keeps existing square behaviour.
  width?: number
  height?: number
  // Placeholder token → original `data:` URI. When present, the runner restores
  // these into the model's HTML before rendering (see lib/agent/inlineAssets.ts).
  // Lets oversized templates be sent to the model with their inline assets
  // stripped, then re-inlined for the final render.
  inlineAssets?: Record<string, string>
}

export interface DesignAgentResult {
  htmlContent: string
  exportUrl: string
  toolCallCount: number
}

export class AgentToolLimitError extends Error {
  constructor(limit: number) {
    super(`Design agent exceeded the ${limit}-tool-call limit`)
    this.name = "AgentToolLimitError"
  }
}
