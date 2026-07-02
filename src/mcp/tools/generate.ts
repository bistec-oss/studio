import { prisma } from '@/lib/prisma'
import type { Channel } from '@prisma/client'
import { resolveCopyProvider } from '@/providers/registry'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { runPathBDesign } from '@/lib/agent/pathB'
import { buildBriefInput } from '@/lib/agent/briefInput'
import { resolveExportUrl } from '@/lib/storage/minio'
import { getSystemUserId } from '@/mcp/systemUser'
import { PROMPT_VERSION } from '@/lib/agent/prompts/shared'

interface GeneratePostArgs {
  topic: string
  goal: string
  tone: string
  channels: string[]
  designMode: 'TEMPLATE' | 'GENERATE'
  copyProviderKey?: string
  campaignId?: string
  description?: string
}

// ACP entry point for post generation — a thin adapter over the same Path B
// pipeline the web routes use (runPathBDesign), so aspect ratio, brand-kit
// precedence, per-path models, and CLI/API dispatch can never drift from the
// app. TEMPLATE mode needs a template selection this surface doesn't have.
export async function generatePost(args: GeneratePostArgs) {
  if (args.designMode === 'TEMPLATE') {
    throw new Error(
      'TEMPLATE mode is not supported via ACP — it requires selecting a brand template. Use GENERATE, or create the post in the web app.'
    )
  }

  // Create the Brief row first so copy + design run off the same record the
  // web pipeline would use.
  const brief = await prisma.brief.create({
    data: {
      userId: await getSystemUserId(),
      topic: args.topic,
      description: args.description,
      goal: args.goal,
      tone: args.tone,
      // Channel enum values are uppercase; tolerate lowercase from older callers.
      channels: args.channels.map((c: string) => c.toUpperCase() as Channel),
      designMode: args.designMode,
      copyProviderKey: args.copyProviderKey ?? 'env-default',
      campaignId: args.campaignId ?? null,
    },
  })

  // Kit precedence: campaign → project → system default (no explicit kit on
  // this surface). Path B requires a kit, matching assemble-b.
  const kit = await resolveBrandKit(args.campaignId ?? undefined)
  if (!kit) {
    throw new Error(
      'No brand kit found — configure a brand kit for this campaign, or set a system default.'
    )
  }

  const copyProvider = await resolveCopyProvider(args.copyProviderKey)
  const copyText = await copyProvider.generateCopy(buildBriefInput(brief, kit))

  const result = await runPathBDesign(brief, kit, copyText)

  const draft = await prisma.draft.create({
    data: {
      briefId: brief.id,
      copyText,
      htmlContent: result.htmlContent,
      // result.exportUrl is an EXPORTS object key; stored as-is, signed per read.
      exportUrl: result.exportUrl,
      status: 'EXPORTED',
      promptVersion: PROMPT_VERSION,
    },
  })

  return { draftId: draft.id, exportUrl: await resolveExportUrl(result.exportUrl), htmlContent: result.htmlContent }
}

export async function getDraft(args: { id: string }) {
  const draft = await prisma.draft.findUnique({
    where: { id: args.id },
    select: { copyText: true, imageUrl: true, exportUrl: true, status: true },
  })
  if (!draft) throw new Error(`Draft ${args.id} not found`)
  // exportUrl is stored as an EXPORTS object key — sign it for the caller.
  return { ...draft, exportUrl: await resolveExportUrl(draft.exportUrl) }
}
