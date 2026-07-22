import { prisma } from '@/lib/prisma'

export async function createBrandKit(args: {
  name: string
  colors?: string[]
  fonts?: Array<{ name: string; url: string }>
  logoUrl?: string
  // Caller's team (the ApiKey's teamId — same pattern as generatePost/getDraft/
  // publishPost in server.ts). BrandKit.teamId is NOT NULL as of Task 15 — a
  // brand kit created via MCP is attributed to the calling key's team, and
  // (final review C2 fix) every read/write tool below is now team-scoped too:
  // brand kits are a fully per-team resource, not a cross-team/system-default
  // concept, matching the web routes under /api/admin/brandkits.
  teamId: string
}) {
  // data: URIs in logoUrl blow up AI prompt sizes (136k-char incident 2026-07-17);
  // only http(s) URLs (or no logo) are storable.
  if (args.logoUrl !== undefined && !/^https?:\/\//.test(args.logoUrl)) {
    throw new Error('logoUrl must be an http(s) URL')
  }
  const kit = await prisma.brandKit.create({
    data: {
      teamId: args.teamId,
      name: args.name,
      colors: args.colors ?? [],
      fonts: args.fonts ?? [],
      logoUrl: args.logoUrl ?? null,
    },
  })
  return { brandKitId: kit.id }
}

// C2 (final review): `brandKitId` used to be trusted with no team check at
// all — a holder of Team X's ApiKey could overwrite Team Y's active brand
// voice prompt (a cross-tenant write that also functions as prompt injection
// into every future generation Team Y runs). A mismatched team reads as
// "not found", matching the web routes' 404-on-foreign-id convention.
export async function setBrandKitPrompt(args: { brandKitId: string; content: string; teamId: string }) {
  const kit = await prisma.brandKit.findFirst({
    where: { id: args.brandKitId, teamId: args.teamId, isDeleted: false },
    select: { id: true },
  })
  if (!kit) throw new Error(`Brand kit ${args.brandKitId} not found`)

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

// C2: same team check as setBrandKitPrompt — attaching a template to another
// team's kit is a cross-tenant write.
export async function uploadBrandTemplate(args: {
  brandKitId: string
  name: string
  htmlTemplate: string
  teamId: string
}) {
  const kit = await prisma.brandKit.findFirst({
    where: { id: args.brandKitId, teamId: args.teamId, isDeleted: false },
    select: { id: true },
  })
  if (!kit) throw new Error(`Brand kit ${args.brandKitId} not found`)

  const template = await prisma.brandKitTemplate.create({
    data: {
      brandKitId: args.brandKitId,
      name: args.name,
      htmlTemplate: args.htmlTemplate,
    },
  })
  return { templateId: template.id }
}

// C2: was unfiltered (`where: { isDeleted: false }`) — listed every team's
// kits to any valid ApiKey holder.
export async function listBrandKits(args: { teamId: string }) {
  const kits = await prisma.brandKit.findMany({
    where: { isDeleted: false, teamId: args.teamId },
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

// C2: was a bare findUnique with no team check — returned any team's full
// kit including its active voice prompt (a cross-tenant read/exfiltration
// path). A foreign-team id now reads as "not found", same as the web routes.
export async function getBrandKit(args: { id: string; teamId: string }) {
  const kit = await prisma.brandKit.findFirst({
    where: { id: args.id, teamId: args.teamId },
    include: {
      templates: { select: { id: true, name: true } },
      prompts: { where: { isActive: true }, take: 1, select: { content: true, version: true } },
    },
  })
  if (!kit) throw new Error(`Brand kit ${args.id} not found`)
  const { prompts, ...kitData } = kit
  return { kit: kitData, templates: kit.templates, activePrompt: prompts[0] ?? null }
}
