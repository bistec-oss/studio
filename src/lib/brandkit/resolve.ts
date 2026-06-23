import { prisma } from '@/lib/prisma'
import type { BrandKit, BrandKitPrompt } from '@prisma/client'

type KitWithPrompts = BrandKit & { prompts: BrandKitPrompt[] }

export type BrandKitSource = 'campaign' | 'project' | 'system'

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

// Resolves: campaign brand kit → project default → system default (BrandKit.isDefault)
export async function resolveBrandKit(
  campaignId?: string | null
): Promise<ResolvedBrandKit | null> {
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
