import { prisma } from '@/lib/prisma'
import type { Channel } from '@prisma/client'
import { resolveCopyProvider, resolveDesignOrchestrator } from '@/providers/registry'
import type { BriefInput } from '@/providers/interfaces/CopyProvider'
import { resolveExportUrl } from '@/lib/storage/minio'
import { getSystemUserId } from '@/mcp/systemUser'

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

export async function generatePost(args: GeneratePostArgs) {
  const copyProvider = await resolveCopyProvider(args.copyProviderKey)

  const briefInput: BriefInput = {
    topic: args.topic,
    description: args.description ?? '',
    goal: args.goal,
    tone: args.tone,
    channels: args.channels,
    designMode: args.designMode,
    copyProviderKey: args.copyProviderKey,
  }

  const copyText = await copyProvider.generateCopy(briefInput)

  // Create a Brief row for tool-call tracking
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

  const orchestrator = resolveDesignOrchestrator()
  const briefForOrchestrator = { ...briefInput, id: brief.id, campaignId: args.campaignId ?? null }

  const { htmlContent, exportUrl } = await orchestrator.orchestrate(briefForOrchestrator as Parameters<typeof orchestrator.orchestrate>[0], '')

  const draft = await prisma.draft.create({
    data: {
      briefId: brief.id,
      copyText,
      htmlContent,
      // exportUrl from the orchestrator is an EXPORTS object key (or "" in CLI
      // mode); stored as-is and signed for the response.
      exportUrl,
      status: 'EXPORTED',
    },
  })

  return { draftId: draft.id, exportUrl: await resolveExportUrl(exportUrl), htmlContent }
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
