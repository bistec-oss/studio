import { prisma } from "@/lib/prisma"
import { renderHtmlToPng } from "@/lib/renderer/puppeteer"
import { uploadObject, BUCKET_IMAGES, BUCKET_EXPORTS } from "@/lib/storage/minio"
import { resolveImageProvider } from "@/providers/registry"
import type { BrandKitContext } from "./types"

export async function toolGenerateImage(
  prompt: string,
  brandKitId: string
): Promise<{ url: string }> {
  const provider = await resolveImageProvider()
  const result = await provider.generateImage(prompt, brandKitId)

  if (result.url.startsWith("data:")) {
    const matches = result.url.match(/^data:([^;]+);base64,(.+)$/)
    if (!matches) throw new Error("Invalid base64 data URL from image provider")
    const [, contentType, b64] = matches
    const buffer = Buffer.from(b64, "base64")
    const key = `img-${Date.now()}-${Math.random().toString(36).slice(2)}.png`
    const url = await uploadObject(buffer, BUCKET_IMAGES, key, contentType)
    return { url }
  }

  return { url: result.url }
}

export async function toolRenderHtml(
  html: string,
  width: number,
  height: number
): Promise<{ url: string }> {
  const buffer = await renderHtmlToPng(html, width, height)
  const key = `design-${Date.now()}-${Math.random().toString(36).slice(2)}.png`
  const url = await uploadObject(buffer, BUCKET_EXPORTS, key, "image/png")
  return { url }
}

export async function toolGetBrandKitContext(briefId: string): Promise<BrandKitContext> {
  const brief = await prisma.brief.findUniqueOrThrow({
    where: { id: briefId },
    include: {
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

  // Resolve: campaign brand kit → project default → system default
  const campaignKit = brief.campaign?.brandKit ?? null
  const projectKit = brief.campaign?.projects[0]?.project?.defaultBrandKit ?? null

  let kit = campaignKit ?? projectKit

  if (!kit) {
    kit = await prisma.brandKit.findFirst({
      where: { isDefault: true, isDeleted: false },
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
