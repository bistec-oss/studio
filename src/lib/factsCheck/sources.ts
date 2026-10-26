// The facts check's source loader (027 FR-11, assumptions A3). The only part of
// the check that reads the database, with refresh.ts.
//
// The sources are the strings a value may legitimately come from: the brief's
// topic and description, the campaign's active briefing, the resolved brand
// kit's voice prompt, and the parsed text of the campaign's documents (the
// user's own words; they never enter generation prompts, but a stated fact can
// live only there). Brand-kit documents and artifacts are not sources.
import { prisma } from '@/lib/prisma'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { getActiveCampaignBriefing } from '@/lib/campaign/briefing'
import { MAX_SOURCES_CHARS } from './types'

export interface FactsBrief {
  teamId: string
  topic: string
  description?: string | null
  campaignId?: string | null
  brandKitId?: string | null
}

export interface SourceLoaders {
  briefing(campaignId: string): Promise<string | null>
  voicePrompt(brief: FactsBrief): Promise<string | null>
  documents(brief: FactsBrief & { campaignId: string }): Promise<string[]>
}

export const defaultSourceLoaders: SourceLoaders = {
  briefing: (campaignId) => getActiveCampaignBriefing(campaignId),
  async voicePrompt(brief) {
    const kit = await resolveBrandKit(
      brief.teamId,
      brief.campaignId ?? undefined,
      brief.brandKitId ?? undefined,
    )
    return kit?.voicePrompt ?? null
  },
  async documents(brief) {
    const docs = await prisma.campaignDocument.findMany({
      where: { campaignId: brief.campaignId, teamId: brief.teamId },
      orderBy: { createdAt: 'asc' },
      select: { parsedText: true },
    })
    return docs.map((d) => d.parsedText)
  },
}

export interface PreloadedSources {
  /** Already resolved by the caller (the sync generation path); `null` = none. */
  campaignBriefing?: string | null
  voicePrompt?: string | null
}

/**
 * The source strings for a brief, nulls dropped, cut at 200 000 characters in
 * total. A caller that has already resolved the kit voice or the briefing
 * passes them in (`preloaded`) so they are not read twice.
 */
export async function loadFactsSources(
  brief: FactsBrief,
  preloaded: PreloadedSources = {},
  loaders: SourceLoaders = defaultSourceLoaders,
): Promise<string[]> {
  const campaignId = brief.campaignId ?? null
  const briefing =
    preloaded.campaignBriefing !== undefined
      ? preloaded.campaignBriefing
      : campaignId
        ? await loaders.briefing(campaignId)
        : null
  const voice =
    preloaded.voicePrompt !== undefined ? preloaded.voicePrompt : await loaders.voicePrompt(brief)
  const docs = campaignId ? await loaders.documents({ ...brief, campaignId }) : []

  const all = [brief.topic, brief.description, briefing, voice, ...docs]
  const out: string[] = []
  let budget = MAX_SOURCES_CHARS
  for (const s of all) {
    if (typeof s !== 'string' || s.length === 0) continue
    if (budget <= 0) break
    const part = s.slice(0, budget)
    out.push(part)
    budget -= part.length
  }
  return out
}
