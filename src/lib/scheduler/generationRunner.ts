import type { Channel, Draft, ScheduledGeneration } from "@prisma/client"
import { prisma } from "../prisma"
import { generateDraftForBrief } from "../agent/generateDraft"
import { findLivePost } from "../publish/publishDraft"

// Generation is expensive (a design run is minutes of model time), so fewer
// retries than the publish scheduler's 5.
const MAX_RETRIES = 3
// Heavy jobs, processed sequentially — bound a tick to a couple of them.
const CLAIM_BATCH = 2
// Lease for a claimed (RUNNING) entry. A full generation is copy (≤120s) +
// background (≤90s) + design (≤300s); 15 min is ~2× that worst case.
const GENERATION_LEASE_MS = 15 * 60_000

// Backoff: 20, 40 min, capped at 60. Exported for unit tests.
export function generationBackoffMs(retryCount: number): number {
  return Math.min(60, 10 * 2 ** retryCount) * 60_000
}

// Atomically claim due generation entries — the same FOR UPDATE SKIP LOCKED +
// lease-in-nextRetryAt pattern as claimDuePosts (jobRunner.ts): PENDING due
// entries are claimed as RUNNING; a RUNNING entry whose lease lapsed is
// reclaimable (the previous worker is assumed dead).
async function claimDueGenerations(leaseUntil: Date): Promise<{ id: string }[]> {
  return prisma.$queryRaw<{ id: string }[]>`
    UPDATE "ScheduledGeneration"
    SET status = 'RUNNING', "nextRetryAt" = ${leaseUntil}
    WHERE id IN (
      SELECT id FROM "ScheduledGeneration"
      WHERE (
        (status = 'PENDING'
          AND "generateAt" <= now()
          AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= now()))
        OR (status = 'RUNNING' AND "nextRetryAt" <= now())
      )
      ORDER BY "generateAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${CLAIM_BATCH}
    )
    RETURNING id
  `
}

// Ensure the entry has its Brief. Created once on the first attempt and reused
// across retries (persisted immediately), so a retried entry never spawns
// duplicate briefs and the eventual draft always hangs off one record.
async function ensureBrief(entry: ScheduledGeneration) {
  if (entry.briefId) {
    const existing = await prisma.brief.findUnique({ where: { id: entry.briefId } })
    if (existing) return existing
  }
  const brief = await prisma.brief.create({
    data: {
      teamId: entry.teamId,
      userId: entry.createdById,
      campaignId: entry.campaignId,
      topic: entry.topic,
      description: entry.description,
      goal: entry.goal,
      tone: entry.tone,
      channels: entry.channels,
      aspectRatio: entry.aspectRatio,
      designMode: entry.designMode,
      // Resolution falls through to the default enabled COPY provider, then the
      // env key — the same convention as the MCP surface (generate.ts).
      copyProviderKey: "env-default",
    },
  })
  await prisma.scheduledGeneration.update({
    where: { id: entry.id },
    data: { briefId: brief.id },
  })
  return brief
}

// Post-generation action. SCHEDULE_PUBLISH and PUBLISH_NOW both create
// SCHEDULED Post rows (PUBLISH_NOW due immediately) rather than publishing
// inline: the publish scheduler picks them up within one poll and they get its
// H12 retry/backoff machinery, and a publish failure surfaces on the Post row
// instead of failing (and re-running) a generation that already succeeded.
// Exported for unit tests.
export async function executePostAction(
  entry: Pick<ScheduledGeneration, "postAction" | "publishAt" | "channels" | "createdById" | "teamId">,
  draft: Pick<Draft, "id">,
): Promise<void> {
  if (entry.postAction === "HOLD") return

  const scheduledAt = entry.postAction === "SCHEDULE_PUBLISH" ? entry.publishAt! : new Date()

  for (const channel of entry.channels as Channel[]) {
    // Same dedup rule as POST /api/posts — skip instead of failing the entry.
    const live = await findLivePost(draft.id, channel)
    if (live) {
      console.log(
        `[generation] draft ${draft.id} already has a live ${channel} post (${live.id}) — skipping`
      )
      continue
    }
    await prisma.post.create({
      data: {
        teamId: entry.teamId,
        draftId: draft.id,
        userId: entry.createdById,
        channel,
        status: "SCHEDULED",
        scheduledAt,
      },
    })
  }
}

export async function runGenerationJobs(): Promise<void> {
  const leaseUntil = new Date(Date.now() + GENERATION_LEASE_MS)
  const claimed = await claimDueGenerations(leaseUntil)

  if (claimed.length === 0) {
    return
  }

  console.log(
    `[generation] ${new Date().toISOString()} — claimed ${claimed.length} entr(y/ies)`
  )

  const entries = await prisma.scheduledGeneration.findMany({
    where: { id: { in: claimed.map((c) => c.id) } },
  })

  for (const entry of entries) {
    try {
      const brief = await ensureBrief(entry)

      // Deliberately NOT wrapped in withClaudeAuth: scheduled generations run
      // unattended, so a member's expired/revoked personal token must never
      // fail a run. (Product decision, 2026-07-07.)
      // TODO(Task 14): the shared env credential this comment used to
      // describe is gone (Task 10) — a CLI-mode run now has no ALS auth
      // context and will hard-fail with "No Claude credential available"
      // until this loop wraps each job in withClaudeAuth(null, entry.teamId, ...).
      // userId: null — an unattended scheduled run has no acting teammate, so
      // the IMAGE-provider resolution must skip the personal tier entirely and
      // fall through to the team's default (see resolveImageProvider).
      const { draft } = await generateDraftForBrief(
        brief,
        { userId: null, teamId: entry.teamId ?? '' },
        { templateId: entry.templateId }
      )

      await executePostAction(entry, draft)

      await prisma.scheduledGeneration.update({
        where: { id: entry.id },
        data: {
          status: "COMPLETED",
          draftId: draft.id,
          errorReason: null,
          nextRetryAt: null,
        },
      })
      console.log(`[generation] entry ${entry.id} → COMPLETED (draft ${draft.id})`)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      const nextRetry = entry.retryCount + 1

      if (nextRetry <= MAX_RETRIES) {
        const when = new Date(Date.now() + generationBackoffMs(nextRetry))
        await prisma.scheduledGeneration.update({
          where: { id: entry.id },
          data: {
            status: "PENDING",
            retryCount: nextRetry,
            nextRetryAt: when,
            errorReason: reason,
          },
        })
        console.log(
          `[generation] entry ${entry.id} → retry ${nextRetry}/${MAX_RETRIES} at ${when.toISOString()}: ${reason}`
        )
      } else {
        await prisma.scheduledGeneration.update({
          where: { id: entry.id },
          data: {
            status: "FAILED",
            errorReason: reason,
            nextRetryAt: null,
          },
        })
        console.log(
          `[generation] entry ${entry.id} → FAILED after ${MAX_RETRIES} retries: ${reason}`
        )
      }
    }
  }
}
