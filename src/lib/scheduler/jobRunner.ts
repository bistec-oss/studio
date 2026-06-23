import { PrismaClient } from "@prisma/client"
import * as instagramPublisher from "../social/instagram"
import * as linkedinPublisher from "../social/linkedin"
import { PublishError } from "../social/types"

const prisma = new PrismaClient()

export async function runScheduledJobs(): Promise<void> {
  const now = new Date()

  const duePosts = await prisma.post.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: now },
    },
    include: {
      draft: {
        select: {
          exportUrl: true,
          copyText: true,
        },
      },
    },
  })

  if (duePosts.length === 0) {
    return
  }

  console.log(
    `[scheduler] ${new Date().toISOString()} — found ${duePosts.length} due post(s)`
  )

  for (const post of duePosts) {
    const publisher =
      post.channel === "INSTAGRAM" ? instagramPublisher : linkedinPublisher

    try {
      const { platformId } = await publisher.publish(
        post.draft.exportUrl!,
        post.draft.copyText
      )

      await prisma.post.update({
        where: { id: post.id },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          platformId,
        },
      })

      console.log(
        `[scheduler] post ${post.id} → PUBLISHED (${post.channel}, platformId: ${platformId})`
      )
    } catch (err) {
      const errorReason =
        err instanceof PublishError ? err.reason : String(err)

      await prisma.post.update({
        where: { id: post.id },
        data: {
          status: "FAILED",
          errorReason,
        },
      })

      console.log(
        `[scheduler] post ${post.id} → FAILED (${post.channel}): ${errorReason}`
      )
    }
  }
}
