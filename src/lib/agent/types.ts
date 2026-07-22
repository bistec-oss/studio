// The identity ON WHOSE BEHALF a generation/refine call runs — NOT necessarily
// the brief's owner. Teammate B refining/regenerating teammate A's shared
// brief must resolve B's personal OpenAI key (or the team default), never
// A's — see resolveImageProvider (src/providers/registry.ts), which only
// consults the personal tier when userId is given. userId is null when there
// is genuinely no signed-in actor (MCP/ACP machine calls, the scheduler's
// unattended runs).
export interface GenerationActor {
  userId: string | null
  teamId: string
}

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
  // Wall-clock budget for the whole tool-use loop (default 300s, matching the
  // CLI runner's timeout). Checked before each model turn.
  deadlineMs?: number
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
  // Who to resolve the IMAGE provider as, when the model calls the
  // generateImage tool (see tools.ts's toolGenerateImage). Optional only for
  // callers that predate this threading; pathA.ts/pathB.ts always supply it.
  actor?: GenerationActor
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

export class AgentTimeoutError extends Error {
  constructor(deadlineMs: number) {
    super(`Design agent exceeded the ${Math.round(deadlineMs / 1000)}s deadline`)
    this.name = "AgentTimeoutError"
  }
}

// The model hit max_tokens mid-response — without this check a truncated design
// surfaces as "the model produced broken HTML" with no cause attached.
export class AgentTruncatedError extends Error {
  constructor(maxTokens: number) {
    super(`Design agent response was truncated at the ${maxTokens}-token output cap`)
    this.name = "AgentTruncatedError"
  }
}
