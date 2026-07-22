import { prisma } from "@/lib/prisma"
import { renderHtmlToPng } from "@/lib/renderer/puppeteer"
import { uploadObject, resolveExportUrl, persistDataUrlImage, exportKey, BUCKET_EXPORTS } from "@/lib/storage/minio"
import { resolveImageProvider } from "@/providers/registry"
import type { BrandKitContext, GenerationActor } from "./types"

export async function toolGenerateImage(
  prompt: string,
  brandKitId: string,
  briefId: string,
  actor?: GenerationActor
): Promise<{ url: string }> {
  // actor is the ACTING teammate (threaded from the route via
  // DesignAgentOptions/executeTool — see designAgent.ts) — prefer it always,
  // since it's who the personal-key tier must resolve against, not the
  // brief's owner. The brief lookup below is a fallback ONLY for a caller
  // that genuinely cannot supply an actor (there is currently none — every
  // pathA.ts/pathB.ts call site sets it — but this keeps the tool safe rather
  // than silently defaulting to no team scope at all).
  let ctx = actor
  if (!ctx) {
    const brief = await prisma.brief.findUnique({
      where: { id: briefId },
      select: { teamId: true, userId: true },
    })
    ctx = { teamId: brief?.teamId ?? '', userId: brief?.userId ?? null }
  }
  const provider = await resolveImageProvider({ teamId: ctx.teamId, userId: ctx.userId })
  if (!provider) {
    throw new Error('No image provider configured for this team')
  }
  const result = await provider.generateImage(prompt, brandKitId)

  if (result.url.startsWith("data:")) {
    // persistDataUrlImage enforces the raster allow-list (stored-XSS guard) and
    // returns a public, non-expiring URL — Claude embeds this in the HTML, which
    // is stored and re-rendered later (refine), so it must not expire.
    return { url: await persistDataUrlImage(result.url, "img") }
  }

  return { url: result.url }
}

export async function toolRenderHtml(
  html: string,
  width: number,
  height: number
): Promise<{ url: string; key: string }> {
  const buffer = await renderHtmlToPng(html, width, height)
  const key = exportKey("design", "agent")
  await uploadObject(buffer, BUCKET_EXPORTS, key, "image/png")
  // The export PNG stays private. Return a signed URL for the agent's reference
  // plus the object key, which the caller persists as Draft.exportUrl.
  return { url: (await resolveExportUrl(key))!, key }
}

export async function toolGetBrandKitContext(briefId: string): Promise<BrandKitContext> {
  const brief = await prisma.brief.findUniqueOrThrow({
    where: { id: briefId },
    include: {
      brandKit: {
        include: {
          prompts: { where: { isActive: true }, take: 1 },
          artifacts: { where: { feedToAI: true } },
        },
      },
      campaign: {
        include: {
          brandKit: {
            include: {
              prompts: { where: { isActive: true }, take: 1 },
              artifacts: { where: { feedToAI: true } },
            },
          },
          projects: {
            take: 1,
            include: {
              project: {
                include: {
                  defaultBrandKit: {
                    include: {
                      prompts: { where: { isActive: true }, take: 1 },
                      artifacts: { where: { feedToAI: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  // Resolve: explicit brief kit → campaign brand kit → project default → team default
  const explicitKit = brief.brandKit && !brief.brandKit.isDeleted ? brief.brandKit : null
  const campaignKit = brief.campaign?.brandKit ?? null
  const projectKit = brief.campaign?.projects[0]?.project?.defaultBrandKit ?? null

  let kit = explicitKit ?? campaignKit ?? projectKit

  if (!kit) {
    // Same C1 fix as lib/brandkit/resolve.ts: this tool re-implements the
    // precedence chain independently (it's the API-mode agent's
    // getBrandKitContext tool, not a caller of resolveBrandKit) and had the
    // identical unscoped last-resort lookup — a cross-tenant brand-kit leak
    // by default. Scope it to the brief's own team.
    kit = await prisma.brandKit.findFirst({
      where: { teamId: brief.teamId, isDefault: true, isDeleted: false },
      include: {
        prompts: { where: { isActive: true }, take: 1 },
        artifacts: { where: { feedToAI: true } },
      },
    })
  }

  if (!kit) {
    return { colors: [], fonts: [], logoUrl: null, voicePrompt: null, artifactUrls: [] }
  }

  const colors = Array.isArray(kit.colors) ? (kit.colors as string[]) : []
  const fonts = Array.isArray(kit.fonts)
    ? (kit.fonts as Array<{ name: string; url: string }>)
    : []

  return {
    colors,
    fonts,
    logoUrl: kit.logoUrl ?? null,
    voicePrompt: kit.prompts[0]?.content ?? null,
    artifactUrls: kit.artifacts.map((a) => a.url),
  }
}
