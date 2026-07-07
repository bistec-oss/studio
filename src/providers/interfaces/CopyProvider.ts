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
}

export interface CopyProvider {
  generateCopy(brief: BriefInput): Promise<string>
}
