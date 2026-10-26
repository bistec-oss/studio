import type { Channel, Draft, ScheduledGeneration } from "@prisma/client"
import { prisma } from "../prisma"
import { generateDraftForBrief } from "../agent/generateDraft"
import { findLivePost } from "../publish/publishDraft"
import { withClaudeAuth } from "../agent/userToken"
import { isClaudeUsageLimit } from "../agent/claudeCli"
import { track } from "../analytics/track"
import { isStyleKey, resolvePostStyle } from "../postStyles"
import { parseFactsCheck } from "../factsCheck/types"
import { checkHoldsPublish, heldReasonFor } from "./heldReason"

// Generation is expensive (a design run is minutes of model time), so fewer
// retries than the publish scheduler's 5.
const MAX_RETRIES = 3
// Heavy jobs, processed sequentially — bound a tick to a couple of them.
const CLAIM_BATCH = 2
// Lease for a claimed (RUNNING) entry. It is renewed at each entry's start and
// again before its design (renewGenerationLease), so it bounds each of those
// two segments, not the whole run; src/lib/models/budget.ts models them with
// every eligible model's timeout, and tests/unit/actionBudget.test.ts fails if
// either can outlive the lease (008 FR-12).
export const GENERATION_LEASE_MS = 15 * 60_000

// The prefix on errorReason when a scheduled run hit the team credential's
// usage limit (008 FR-11), so the queue table says why rather than only what.
const USAGE_LIMIT_REASON_PREFIX = "Claude usage limit reached on the team's credential — "

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

// Push a RUNNING entry's lease out to now + GENERATION_LEASE_MS (008 FR-12).
// The claim computes one lease per tick for every entry it claims, and the
// entries run one after another, so without this the second entry would start
// on a lease the first had already spent. Guarded on RUNNING: it never revives
// an entry that has since settled or been reclaimed as lapsed.
async function renewGenerationLease(id: string): Promise<void> {
  await prisma.scheduledGeneration.updateMany({
    where: { id, status: "RUNNING" },
    data: { nextRetryAt: new Date(Date.now() + GENERATION_LEASE_MS) },
  })
}

// Ensure the entry has its Brief. Created once on the first attempt and reused
// across retries (persisted immediately), so a retried entry never spawns
// duplicate briefs and the eventual draft always hangs off one record.
async function ensureBrief(entry: ScheduledGeneration) {
  if (entry.briefId) {
    const existing = await prisma.brief.findUnique({ where: { id: entry.briefId } })
    if (existing) return existing
  }
  // 027 FR-12: a stored key is resolved again now, at the latest version, and a
  // key that no longer resolves fails the entry with a named reason (never "no
  // style", never a post action). A null key is a pre-027 entry: its own goal
  // and tone stand and it gets no checklist (FR-16).
  let style: { postStyle: string | null; goal: string; tone: string; imageStyle: string } = {
    postStyle: null,
    goal: entry.goal,
    tone: entry.tone,
    imageStyle: "classic",
  }
  if (entry.postStyle != null) {
    // The campaign's tone default matters only when the entry stored no tone.
    const campaign =
      entry.campaignId && !entry.tone?.trim()
        ? await prisma.campaign.findUnique({
            where: { id: entry.campaignId },
            select: { defaultPostStyle: true, defaultTone: true },
          })
        : null
    const resolved = resolvePostStyle({
      style: entry.postStyle,
      campaign,
      explicit: { tone: entry.tone },
      path: entry.designMode === "TEMPLATE" ? "A" : "B",
      aspectRatio: entry.aspectRatio,
      surface: "queue",
    })
    if (!resolved.ok) throw new Error(`Post style "${entry.postStyle}" is not available`)
    style = { postStyle: resolved.key, goal: resolved.goal, tone: resolved.tone, imageStyle: resolved.imageStyle }
  }
  const brief = await prisma.brief.create({
    data: {
      teamId: entry.teamId,
      userId: entry.createdById,
      campaignId: entry.campaignId,
      topic: entry.topic,
      description: entry.description,
      postStyle: style.postStyle,
      goal: style.goal,
      tone: style.tone,
      imageStyle: style.imageStyle,
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
    const startedAt = Date.now()
    // The settled outcome, emitted once after the try/catch (006 FR-04), so an
    // analytics problem can never re-enter the retry branch below.
    let settled: {
      outcome: "completed" | "retry" | "failed"
      draftId: string | null
      retryCount?: number
      errorReason?: string
      held?: boolean
    } | null = null
    try {
      await renewGenerationLease(entry.id)
      const brief = await ensureBrief(entry)

      // entry.teamId is NOT NULL as of Task 15 (Migration B).
      const teamId = entry.teamId

      // userId: null — an unattended scheduled run has no acting teammate, so
      // both the Claude-CLI credential and the IMAGE-provider resolution skip
      // the personal tier entirely and fall through to the team's own
      // credential/default (see resolveImageProvider and userToken.ts). The
      // whole model-calling span (copy → background image → design) runs
      // inside withClaudeAuth so every `claude -p` this job spawns shares the
      // one resolved team credential; a team with none throws a no-credential
      // ClaudeCliError here, caught below and handled by the existing
      // retry/failure path like any other generation error.
      const { draft } = await withClaudeAuth(null, teamId, () =>
        generateDraftForBrief(
          brief,
          { userId: null, teamId, source: "scheduler" },
          { templateId: entry.templateId, onBeforeDesign: () => renewGenerationLease(entry.id) }
        )
      )

      // 027 FR-12: an unattended post action runs only on a clear facts check.
      // A flagged or errored check (or a missing one: fail closed) holds the
      // post for a person; the entry still completes, since the generation worked.
      let heldReason: string | null = null
      if (entry.postAction !== "HOLD") {
        const check = parseFactsCheck((draft as { factsCheck?: unknown }).factsCheck)
        if (checkHoldsPublish(check)) heldReason = heldReasonFor(check)
      }
      if (heldReason === null) await executePostAction(entry, draft)

      await prisma.scheduledGeneration.update({
        where: { id: entry.id },
        data: {
          status: "COMPLETED",
          draftId: draft.id,
          errorReason: null,
          nextRetryAt: null,
          heldReason,
        },
      })
      console.log(`[generation] entry ${entry.id} → COMPLETED (draft ${draft.id})`)
      settled = { outcome: "completed", draftId: draft.id, retryCount: entry.retryCount, held: heldReason !== null }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Retry and backoff are the same either way; only the reason says more.
      const reason = isClaudeUsageLimit(err) ? USAGE_LIMIT_REASON_PREFIX + message : message
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
        settled = { outcome: "retry", draftId: null, retryCount: nextRetry, errorReason: reason }
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
        settled = { outcome: "failed", draftId: null, retryCount: entry.retryCount, errorReason: reason }
      }
    }
    if (settled) {
      const s = settled as NonNullable<typeof settled>
      await track("scheduled_generation.settled", {
        source: "scheduler",
        teamId: entry.teamId,
        userId: null,
        draftId: s.draftId,
        durationMs: Date.now() - startedAt,
        outcome: s.outcome,
        payload: {
          ...(s.retryCount !== undefined ? { retryCount: s.retryCount } : {}),
          ...(s.errorReason !== undefined ? { errorReason: s.errorReason } : {}),
          // 027 FR-14: the style key and whether the post action was held.
          postStyle: isStyleKey(entry.postStyle) ? entry.postStyle : null,
          held: s.held === true,
        },
      })
    }
  }
}
