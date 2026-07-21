import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, withAdmin, parseBody } from '@/lib/api/handler'
import { postVisibilityWhere } from '@/lib/authz/visibility'
import { resolveExportUrl } from '@/lib/storage/minio'
import { createAndPublishPost, findLivePost } from '@/lib/publish/publishDraft'
import { Channel } from '@prisma/client'

// Permissive schema: only guards the JSON parse. The manual checks below keep
// their exact error messages (asserted by tests).
const createSchema = z.object({}).passthrough()

export const POST = withAdmin(async (req: NextRequest, _ctx, auth) => {
  const parsed = await parseBody(req, createSchema)
  if (parsed.response) return parsed.response

  const { draftId, channel, scheduledAt } = parsed.data as {
    draftId?: string
    channel?: string
    scheduledAt?: string
  }

  if (!draftId?.trim()) {
    return NextResponse.json({ error: 'draftId is required' }, { status: 400 })
  }
  if (!channel || !['INSTAGRAM', 'LINKEDIN'].includes(channel)) {
    return NextResponse.json({ error: 'channel must be INSTAGRAM or LINKEDIN' }, { status: 400 })
  }

  const draft = await prisma.draft.findUnique({ where: { id: draftId } })
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

  if (!draft.exportUrl) {
    return NextResponse.json({ error: 'Draft has no export URL' }, { status: 422 })
  }

  const scheduledAtDate = scheduledAt ? new Date(scheduledAt) : null
  if (scheduledAtDate && Number.isNaN(scheduledAtDate.getTime())) {
    return NextResponse.json({ error: 'scheduledAt must be a valid date' }, { status: 400 })
  }
  const publishNow = !scheduledAtDate || scheduledAtDate <= new Date()

  // Idempotency: a live post (PENDING/SCHEDULED/PUBLISHING/PUBLISHED) for the
  // same draft+channel means a double-click or client retry — reject instead of
  // double-posting. Re-publishing after FAILED/CANCELLED stays allowed.
  const existing = await findLivePost(draftId, channel as Channel)
  if (existing) {
    return NextResponse.json(
      { error: 'A post for this draft and channel already exists', postId: existing.id, status: existing.status },
      { status: 409 }
    )
  }

  // Scheduled path: persist a SCHEDULED row directly — no transient PENDING that
  // could be orphaned if the request dies before the follow-up update.
  if (!publishNow) {
    const post = await prisma.post.create({
      data: {
        teamId: draft.teamId,
        draftId,
        userId: auth.userId,
        channel: channel as Channel,
        status: 'SCHEDULED',
        scheduledAt: scheduledAtDate,
      },
    })
    return NextResponse.json({ postId: post.id, status: post.status }, { status: 201 })
  }

  // Resolve up front so a missing export is a clear 422 before any row exists.
  const signedExportUrl = await resolveExportUrl(draft.exportUrl)
  if (!signedExportUrl) {
    return NextResponse.json({ error: 'Draft has no export' }, { status: 422 })
  }

  // Immediate path — shared PENDING → publish → PUBLISHED/FAILED state machine.
  const { post } = await createAndPublishPost({
    draftId,
    channel: channel as Channel,
    userId: auth.userId,
    scheduledAt: scheduledAtDate,
  })
  return NextResponse.json({ postId: post.id, status: post.status }, { status: 201 })
})

export const GET = withTeamAuth(async (req: NextRequest, _ctx, user) => {
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10)))

  const where = postVisibilityWhere(user)

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where,
      include: {
        draft: { select: { id: true, copyText: true, exportUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.post.count({ where }),
  ])

  // draft.exportUrl is stored as an EXPORTS object key — sign for the browser.
  const signedPosts = await Promise.all(
    posts.map(async (p) => ({
      ...p,
      draft: { ...p.draft, exportUrl: await resolveExportUrl(p.draft.exportUrl) },
    }))
  )

  return NextResponse.json({ posts: signedPosts, total, page, pageSize })
})
