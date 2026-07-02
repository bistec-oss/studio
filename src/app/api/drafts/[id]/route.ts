import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { forbiddenIfNotOwner } from '@/lib/auth'
import { withAuth, parseBody } from '@/lib/api/handler'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { resolveExportUrl } from '@/lib/storage/minio'

type Params = { id: string }

async function loadDraft(id: string) {
  const draft = await prisma.draft.findUnique({
    where: { id },
    include: {
      brief: true,
      posts: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          channel: true,
          status: true,
          scheduledAt: true,
          publishedAt: true,
        },
      },
      _count: { select: { revisions: true } },
    },
  })
  if (!draft) return null

  const kit = await resolveBrandKit(draft.brief.campaignId ?? undefined, draft.brief.brandKitId ?? undefined)

  return {
    ownerId: draft.brief.userId,
    data: {
    id: draft.id,
    briefId: draft.briefId,
    copyText: draft.copyText,
    imageUrl: draft.imageUrl,
    htmlContent: draft.htmlContent,
    // exportUrl is stored as an EXPORTS object key — sign it for the browser.
    exportUrl: await resolveExportUrl(draft.exportUrl),
    status: draft.status,
    createdAt: draft.createdAt,
    revisionCount: draft._count.revisions,
    brandKitName: kit?.name ?? null,
    brief: {
      id: draft.brief.id,
      topic: draft.brief.topic,
      goal: draft.brief.goal,
      tone: draft.brief.tone,
      channels: draft.brief.channels,
      aspectRatio: draft.brief.aspectRatio,
      designMode: draft.brief.designMode,
    },
    posts: draft.posts,
    },
  }
}

export const GET = withAuth<Params>(async (_req, { params }, user) => {
  const result = await loadDraft(params.id)
  if (!result) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  const forbidden = forbiddenIfNotOwner(user, result.ownerId)
  if (forbidden) return forbidden

  return NextResponse.json(result.data)
})

// Permissive schema + manual type check so the error message stays exactly
// 'copyText is required' (asserted by tests).
const patchSchema = z.object({}).passthrough()

export const PATCH = withAuth<Params>(async (req, { params }, user) => {
  const body = await parseBody(req, patchSchema)
  if (body.response) return body.response
  const { copyText } = body.data as { copyText?: unknown }
  if (typeof copyText !== 'string') {
    return NextResponse.json({ error: 'copyText is required' }, { status: 400 })
  }

  const existing = await prisma.draft.findUnique({
    where: { id: params.id },
    select: { status: true, brief: { select: { userId: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  const forbidden = forbiddenIfNotOwner(user, existing.brief.userId)
  if (forbidden) return forbidden

  // The published caption lives only on the draft — editing it after publish
  // would silently desynchronize the record from what was actually posted.
  if (existing.status === 'PUBLISHED') {
    return NextResponse.json(
      { error: 'This draft has been published — its copy can no longer be edited' },
      { status: 409 }
    )
  }

  await prisma.draft.update({
    where: { id: params.id },
    data: {
      copyText,
      // A copy edit invalidates a prior export.
      ...(existing.status === 'EXPORTED' ? { status: 'IN_PROGRESS' } : {}),
    },
  })

  const result = await loadDraft(params.id)
  return NextResponse.json(result?.data)
})
