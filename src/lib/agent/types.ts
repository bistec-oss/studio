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
