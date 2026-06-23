export interface BriefInput {
  topic: string
  description: string
  goal: string
  tone: string
  channels: string[]
  designMode: string
  copyProviderKey?: string
  imageProviderKey?: string
  additionalImageUrl?: string
  briefImages?: Array<{ url: string; intent: "embed" | "reference" }>
  referenceTemplateId?: string
}

export interface CopyProvider {
  generateCopy(brief: BriefInput): Promise<string>
}
