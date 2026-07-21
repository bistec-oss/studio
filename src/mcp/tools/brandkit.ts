import { prisma } from '@/lib/prisma'

export async function createBrandKit(args: {
  name: string
  colors?: string[]
  fonts?: Array<{ name: string; url: string }>
  logoUrl?: string
}) {
  // data: URIs in logoUrl blow up AI prompt sizes (136k-char incident 2026-07-17);
  // only http(s) URLs (or no logo) are storable.
  if (args.logoUrl !== undefined && !/^https?:\/\//.test(args.logoUrl)) {
    throw new Error('logoUrl must be an http(s) URL')
  }
  const kit = await prisma.brandKit.create({
    data: {
      // Deliberately team-less: Task 13 (DB-backed MCP/ACP auth) scoped
      // generate/publish to the caller's team but left brand-kit MCP tools
      // (this file) untouched — brand kits are a cross-team/system-default
      // concept today, and every tool here still runs with no team scoping
      // at all (server.ts gates on "any valid key", not the key's team).
      // Revisit if/when brand kits become per-team resources.
      teamId: null,
      name: args.name,
      colors: args.colors ?? [],
      fonts: args.fonts ?? [],
      logoUrl: args.logoUrl ?? null,
    },
  })
  return { brandKitId: kit.id }
}

export async function setBrandKitPrompt(args: { brandKitId: string; content: string }) {
  const lastPrompt = await prisma.brandKitPrompt.findFirst({
    where: { brandKitId: args.brandKitId },
    orderBy: { version: 'desc' },
  })
  const version = (lastPrompt?.version ?? 0) + 1

  await prisma.brandKitPrompt.updateMany({
    where: { brandKitId: args.brandKitId, isActive: true },
    data: { isActive: false },
  })

  const prompt = await prisma.brandKitPrompt.create({
    data: {
      brandKitId: args.brandKitId,
      content: args.content,
      version,
      isActive: true,
      createdBy: 'mcp-agent',
    },
  })
  return { promptId: prompt.id }
}

export async function uploadBrandTemplate(args: {
  brandKitId: string
  name: string
  htmlTemplate: string
}) {
  const template = await prisma.brandKitTemplate.create({
    data: {
      brandKitId: args.brandKitId,
      name: args.name,
      htmlTemplate: args.htmlTemplate,
    },
  })
  return { templateId: template.id }
}

export async function listBrandKits() {
  const kits = await prisma.brandKit.findMany({
    where: { isDeleted: false },
    select: {
      id: true,
      name: true,
      isDefault: true,
      _count: { select: { templates: true, artifacts: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return { kits }
}

export async function getBrandKit(args: { id: string }) {
  const kit = await prisma.brandKit.findUnique({
    where: { id: args.id },
    include: {
      templates: { select: { id: true, name: true } },
      prompts: { where: { isActive: true }, take: 1, select: { content: true, version: true } },
    },
  })
  if (!kit) throw new Error(`Brand kit ${args.id} not found`)
  const { prompts, ...kitData } = kit
  return { kit: kitData, templates: kit.templates, activePrompt: prompts[0] ?? null }
}
