import type { AnalyticsSource } from '@prisma/client'
import type { HeadlineCheck } from "@/lib/renderedText/vocab"
import type { CompositeRender } from '@/lib/composite/render'

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

// A GenerationActor that also says WHERE the generation was started (006
// FR-04). Required by the two generation lifecycles (generateDraftForBrief,
// runGenerationForDraft), so every caller states its source and an analytics
// event can never default it; the design pipeline below them only needs the
// identity, so it keeps taking GenerationActor.
export interface GenerationRunActor extends GenerationActor {
  source: AnalyticsSource
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
  // The model and the loop's wall-clock budget are not options here (008
  // FR-07, FR-12): each runner takes a required ResolvedModel, and the budget
  // is that model's surface timeout.
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
  // Who to resolve the IMAGE provider as, when the model calls the
  // generateImage tool (see tools.ts's toolGenerateImage). Optional only for
  // callers that predate this threading; pathA.ts/pathB.ts always supply it.
  actor?: GenerationActor
  // 025 FR-15: for a kept composite look, code puts the screenshot into the
  // model's HTML after extract and restore, before every render.
  // `postProcess` is that insertion (a pure HTML to HTML function) and
  // `composites` the render argument that resolves the token and checks the
  // element. Absent: today's behaviour, byte for byte.
  postProcess?: (html: string) => string
  composites?: CompositeRender | null
  // 030 FR-05: the on-image headline the real render is checked against. Required,
  // so a design writer must choose what it checks.
  headline: string
}

export interface DesignAgentResult {
  htmlContent: string
  exportUrl: string
  toolCallCount: number
  // 030: the check of the final render (null when the run rendered nothing).
  headlineCheck: HeadlineCheck | null
  // 031 FR-24: the post-font families the final render could not load ([] = none, or no render).
  fontsMissing: string[]
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
