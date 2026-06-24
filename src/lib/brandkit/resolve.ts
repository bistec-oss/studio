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
//   explicit brief kit → campaign brand kit → project default → system default
// `brandKitId` is the brief's own selection (Brief.brandKitId) and wins when set
// and the kit still exists; otherwise we fall back through the campaign chain.
export async function resolveBrandKit(
  campaignId?: string | null,
  brandKitId?: string | null
): Promise<ResolvedBrandKit | null> {
  if (brandKitId) {
    const explicit = await prisma.brandKit.findFirst({
      where: { id: brandKitId, isDeleted: false },
      include: PROMPT_INCLUDE,
    })
    if (explicit) return normalise(explicit, 'explicit')
    // fall through if the selected kit was deleted / not found
  }

  if (campaignId) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, isDeleted: false },
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

  const systemKit = await prisma.brandKit.findFirst({
    where: { isDefault: true, isDeleted: false },
    include: PROMPT_INCLUDE,
  })

  return systemKit ? normalise(systemKit, 'system') : null
}
