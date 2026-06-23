import { prisma } from '@/lib/prisma'
import * as instagram from '@/lib/social/instagram'
import * as linkedin from '@/lib/social/linkedin'
import { getSystemUserId } from '@/mcp/systemUser'

export async function publishPost(args: { draftId: string; channel: 'INSTAGRAM' | 'LINKEDIN' }) {
  const draft = await prisma.draft.findUnique({
    where: { id: args.draftId },
    select: { exportUrl: true, copyText: true, status: true },
  })
  if (!draft) throw new Error(`Draft ${args.draftId} not found`)
  if (!draft.exportUrl) throw new Error('Draft has no exportUrl — run export first')

  let platformId: string
  if (args.channel === 'INSTAGRAM') {
    const result = await instagram.publish(draft.exportUrl, draft.copyText)
    platformId = result.platformId
  } else {
    const result = await linkedin.publish(draft.exportUrl, draft.copyText)
    platformId = result.platformId
  }

  await prisma.post.create({
    data: {
      draftId: args.draftId,
      userId: await getSystemUserId(),
      channel: args.channel,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      platformId,
    },
  })

  return { platformId }
}
