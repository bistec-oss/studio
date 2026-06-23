import { prisma } from '@/lib/prisma'
import { resolveCopyProvider, resolveDesignOrchestrator } from '@/providers/registry'
import type { BriefInput } from '@/providers/interfaces/CopyProvider'
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
      channels: args.channels,
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
      exportUrl,
      status: 'EXPORTED',
    },
  })

  return { draftId: draft.id, exportUrl, htmlContent }
}

export async function getDraft(args: { id: string }) {
  const draft = await prisma.draft.findUnique({
    where: { id: args.id },
    select: { copyText: true, imageUrl: true, exportUrl: true, status: true },
  })
  if (!draft) throw new Error(`Draft ${args.id} not found`)
  return draft
}
