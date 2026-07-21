import { prisma } from '@/lib/prisma'
import type { BrandKit, BrandKitPrompt } from '@prisma/client'

type KitWithPrompts = BrandKit & { prompts: BrandKitPrompt[] }

export type BrandKitSource = 'explicit' | 'campaign' | 'project' | 'system'

export interface ResolvedBrandKit {
  id: string
  name: string
  colors: string[]
  fonts: Array<{ name: string; url: string }>
  logoUrl: string | null
  voicePrompt: string | null
  source: BrandKitSource
}

function normalise(kit: KitWithPrompts, source: BrandKitSource): ResolvedBrandKit {
  return {
    id: kit.id,
    name: kit.name,
    colors: Array.isArray(kit.colors) ? (kit.colors as string[]) : [],
    fonts: Array.isArray(kit.fonts) ? (kit.fonts as Array<{ name: string; url: string }>) : [],
    logoUrl: kit.logoUrl ?? null,
    voicePrompt: kit.prompts[0]?.content ?? null,
    source,
  }
}

const PROMPT_INCLUDE = { prompts: { where: { isActive: true }, take: 1 } } as const

// Resolves brand kit precedence:
//   explicit brief kit → campaign brand kit → project default → team default
// `brandKitId` is the brief's own selection (Brief.brandKitId) and wins when set
// and the kit still exists; otherwise we fall back through the campaign chain.
//
// `teamId` is REQUIRED (team-tenancy fix, final review C1) and scopes every
// tier — including the last-resort "team default" tier, which used to run
// with no teamId filter at all (`findFirst({ isDefault: true, isDeleted: false })`).
// That meant any team whose brief had no explicit kit and whose campaign chain
// yielded nothing would silently fall through to whichever OTHER team's default
// kit `findFirst` happened to return first — a cross-tenant brand-kit leak by
// default, not by guessing an id. The explicit/campaign/project tiers are also
// teamId-scoped as defense-in-depth even though their ids are already supposed
// to belong to the caller's team (callers validate that at the route/brief
// level) — this function itself must never trust an id alone.
export async function resolveBrandKit(
  teamId: string,
  campaignId?: string | null,
  brandKitId?: string | null
): Promise<ResolvedBrandKit | null> {
  if (brandKitId) {
    const explicit = await prisma.brandKit.findFirst({
      where: { id: brandKitId, teamId, isDeleted: false },
      include: PROMPT_INCLUDE,
    })
    if (explicit) return normalise(explicit, 'explicit')
    // fall through if the selected kit was deleted / not found / foreign-team
  }

  if (campaignId) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, teamId, isDeleted: false },
      include: {
        brandKit: { include: PROMPT_INCLUDE },
        projects: {
          take: 1,
          include: {
            project: { include: { defaultBrandKit: { include: PROMPT_INCLUDE } } },
          },
        },
      },
    })

    // Skip soft-deleted brand kits at each tier.
    if (campaign?.brandKit && !campaign.brandKit.isDeleted) {
      return normalise(campaign.brandKit, 'campaign')
    }

    const projectKit = campaign?.projects[0]?.project?.defaultBrandKit
    if (projectKit && !projectKit.isDeleted) return normalise(projectKit, 'project')
  }

  const teamKit = await prisma.brandKit.findFirst({
    where: { teamId, isDefault: true, isDeleted: false },
    include: PROMPT_INCLUDE,
  })

  return teamKit ? normalise(teamKit, 'system') : null
}
