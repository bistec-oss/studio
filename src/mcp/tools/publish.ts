import { prisma } from '@/lib/prisma'
import { getSystemUserId } from '@/mcp/systemUser'
import { createAndPublishPost, findLivePost } from '@/lib/publish/publishDraft'

// ACP publish — a thin adapter over the same publish state machine as the API
// path, so every attempt (success or failure) leaves a Post row (FR-20/NFR-9)
// and stale/incomplete drafts can't be pushed to a platform.
export async function publishPost(args: { draftId: string; channel: 'INSTAGRAM' | 'LINKEDIN'; teamId: string }) {
  const draft = await prisma.draft.findUnique({
    where: { id: args.draftId },
    select: { exportUrl: true, status: true, teamId: true },
  })
  // Task 13: a team-bound machine caller may only ever touch its own team's
  // drafts — a draft belonging to a different team (or the pre-tenancy null)
  // reads as "not found" rather than leaking its existence/state.
  if (!draft || draft.teamId !== args.teamId) throw new Error(`Draft ${args.draftId} not found`)
  // An IN_PROGRESS draft's exportUrl predates its latest edit — refuse to
  // publish a stale image (the web UI enforces the same state gate).
  if (draft.status !== 'EXPORTED' && draft.status !== 'PUBLISHED') {
    throw new Error(
      `Draft ${args.draftId} is ${draft.status} — export it first (only EXPORTED/PUBLISHED drafts can be published)`
    )
  }
  if (!draft.exportUrl) throw new Error('Draft has no exportUrl — run export first')

  // Same duplicate guard as the API path: a live post for this draft+channel
  // means this would double-post.
  const existing = await findLivePost(args.draftId, args.channel)
  if (existing) {
    throw new Error(
      `A ${existing.status} post already exists for draft ${args.draftId} on ${args.channel} (post ${existing.id})`
    )
  }

  const { post, error } = await createAndPublishPost({
    draftId: args.draftId,
    channel: args.channel,
    userId: await getSystemUserId(args.teamId),
  })

  // The FAILED row is recorded either way; surface the failure to the caller.
  if (error) {
    throw new Error(`Publish failed (${error.reason}) — recorded as post ${post.id} with status FAILED`)
  }

  return { platformId: post.platformId! }
}
