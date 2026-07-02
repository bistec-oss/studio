import { prisma } from "../prisma"
import { PublishError } from "../social/types"
import { publishToChannel } from "../publish/publishDraft"

// A transient failure is retried up to MAX_RETRIES times with exponential
// backoff before the post is marked terminally FAILED.
const MAX_RETRIES = 5
// Max rows a single tick will claim — bounds work per tick under a backlog.
const CLAIM_BATCH = 25
// How long a claimed (PUBLISHING) row stays leased to a worker. If the worker
// dies mid-publish, another worker may reclaim the row once the lease lapses.
// Must comfortably exceed a real publish (image upload + API call).
const CLAIM_LEASE_MS = 5 * 60_000

// Exponential backoff: 2, 4, 8, 16, 32 min, capped at 60 min.
function backoffMs(retryCount: number): number {
  return Math.min(60, 2 ** retryCount) * 60_000
}

// Atomically claim due posts. `FOR UPDATE SKIP LOCKED` ensures concurrent
// scheduler instances never claim the same row, so a post is published exactly
// once. Claiming flips SCHEDULED -> PUBLISHING and stamps a lease into
// nextRetryAt; a PUBLISHING row whose lease has lapsed is reclaimable (the
// previous worker is assumed dead), so a crash can't strand a post forever.
async function claimDuePosts(leaseUntil: Date): Promise<{ id: string }[]> {
  return prisma.$queryRaw<{ id: string }[]>`
    UPDATE "Post"
    SET status = 'PUBLISHING', "nextRetryAt" = ${leaseUntil}
    WHERE id IN (
      SELECT id FROM "Post"
      WHERE (
        (status = 'SCHEDULED'
          AND "scheduledAt" <= now()
          AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= now()))
        OR (status = 'PUBLISHING' AND "nextRetryAt" <= now())
      )
      ORDER BY "scheduledAt" ASC NULLS FIRST
      FOR UPDATE SKIP LOCKED
      LIMIT ${CLAIM_BATCH}
    )
    RETURNING id
  `
}

export async function runScheduledJobs(): Promise<void> {
  const leaseUntil = new Date(Date.now() + CLAIM_LEASE_MS)
  const claimed = await claimDuePosts(leaseUntil)

  if (claimed.length === 0) {
    return
  }

  console.log(
    `[scheduler] ${new Date().toISOString()} — claimed ${claimed.length} post(s)`
  )

  const posts = await prisma.post.findMany({
    where: { id: { in: claimed.map((c) => c.id) } },
    include: {
      draft: {
        select: {
          exportUrl: true,
          copyText: true,
        },
      },
    },
  })

  for (const post of posts) {
    try {
      // Shared sign+publish (throws PublishError 'draft export missing' when the
      // draft lost its export between scheduling and this tick).
      const { platformId } = await publishToChannel(
        post.channel,
        post.draft.exportUrl,
        post.draft.copyText
      )

      await prisma.post.update({
        where: { id: post.id },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          platformId,
          errorReason: null,
          nextRetryAt: null,
        },
      })

      console.log(
        `[scheduler] post ${post.id} → PUBLISHED (${post.channel}, platformId: ${platformId})`
      )
    } catch (err) {
      const reason = err instanceof PublishError ? err.reason : String(err)
      const nextRetry = post.retryCount + 1

      if (nextRetry <= MAX_RETRIES) {
        const when = new Date(Date.now() + backoffMs(nextRetry))
        await prisma.post.update({
          where: { id: post.id },
          data: {
            status: "SCHEDULED",
            retryCount: nextRetry,
            nextRetryAt: when,
            errorReason: reason,
          },
        })
        console.log(
          `[scheduler] post ${post.id} → retry ${nextRetry}/${MAX_RETRIES} at ${when.toISOString()} (${post.channel}): ${reason}`
        )
      } else {
        await prisma.post.update({
          where: { id: post.id },
          data: {
            status: "FAILED",
            errorReason: reason,
            nextRetryAt: null,
          },
        })
        console.log(
          `[scheduler] post ${post.id} → FAILED after ${MAX_RETRIES} retries (${post.channel}): ${reason}`
        )
      }
    }
  }
}
