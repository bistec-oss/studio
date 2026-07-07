import { prisma } from '@/lib/prisma'

// Loads the campaign's active briefing text — the campaign-level "80% of the
// brief" injected into copy/design prompts alongside the brand kit's voice
// prompt. Kept separate from resolveBrandKit on purpose: kit resolution
// short-circuits at the explicit-brief-kit tier without ever reading the
// campaign, so folding the briefing in there would silently drop it exactly
// when a brief pins its own kit.
export async function getActiveCampaignBriefing(
  campaignId?: string | null,
): Promise<string | null> {
  if (!campaignId) return null
  const briefing = await prisma.campaignBriefing.findFirst({
    where: { campaignId, isActive: true },
    select: { content: true },
  })
  return briefing?.content ?? null
}
