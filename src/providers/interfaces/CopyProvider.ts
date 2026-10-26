import type { CaptionTarget } from '@/lib/channels'
import type { ResolvedModel } from '@/lib/models/resolve'
import type { CaptionRoute } from '@/lib/models/route'

// Input to copy generation — only what copy providers actually consume.
// Design-path concerns (designMode, image URLs, template references) live on
// the Brief row and are consumed by the design pipeline, not copy providers.
export interface BriefInput {
  topic: string
  description: string
  goal: string
  tone: string
  channels: string[]
  // Resolved brand identity (kit name + active voice prompt), when available —
  // lets copy match the selected kit's voice instead of a hardcoded brand.
  brandName?: string
  brandVoice?: string
  // Active campaign briefing (campaign-level context shared by every post in
  // the campaign), when the brief belongs to a campaign that has one.
  campaignBriefing?: string
  // 027 FR-09: the caption-scope rules of the brief's post style, already
  // rendered by checklistPromptText. Absent for a brief with no style.
  captionRules?: string
}

// The COPY slot keeps its name (it also drives brand-voice drafting). One call
// writes every requested caption target (012 FR-07) and returns the RAW reply:
// parsing never happens in a provider — extractCaptionReply does it.
//
// 008 FR-07/FR-08: the call runs the CAPTION model the caller resolved, and
// reports the model ID that actually wrote the reply, for the caption stamps.
// A Claude provider reports model.arg (the string that crossed the boundary); a
// non-Claude provider (OpenAI) ignores `model` and reports its own ID (spec
// open question 1), which matches no catalogue entry, so a later regenerate
// falls through to the team default.
//
// 024 FR-04: it also reports the credential route that ran it, for the stamp
// beside the model. null = unknown (a mock with no decision).
export interface CaptionReply {
  raw: string
  modelId: string
  route: CaptionRoute | null
}

export interface CopyProvider {
  generateCaptions(brief: BriefInput, targets: readonly CaptionTarget[], model: ResolvedModel): Promise<CaptionReply>
}
