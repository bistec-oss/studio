import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, parseBody } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { dimensionsFor } from '@/lib/aspectRatio'
import { resolveExportUrl } from '@/lib/storage/minio'
import { commitDraftRevision } from '@/lib/drafts/revisions'
import { sanitizeInlineHtml, inlineEditBlockReason } from '@/lib/drafts/inlineEdit'

// Permissive schema + manual check so the error message stays stable.
const bodySchema = z.object({}).passthrough()

// Manual inline edit: the client sends the edited HTML (chrome already stripped).
// We sanitize defense-in-depth, render HTML→PNG, and commit a normal
// DraftRevision — synchronous (no AI, single render). Same visibility + guards
// as refine.
export const POST = withTeamAuth<{ id: string }>(async (req, { params }, user) => {
  const body = await parseBody(req, bodySchema)
  if (body.response) return body.response
  const { html } = body.data as { html?: unknown }
  if (typeof html !== 'string' || !html.trim()) {
    return NextResponse.json({ error: 'html is required' }, { status: 400 })
  }

  const draft = await prisma.draft.findUnique({
    where: { id: params.id },
    include: { brief: true },
  })
  if (
    !draft ||
    !canAccessContent(user, {
      teamId: draft.teamId,
      ownerId: draft.brief.userId,
      campaignId: draft.brief.campaignId,
    })
  ) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  const blocked = inlineEditBlockReason(draft.status, draft.pendingAction)
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 })

  const { width, height } = dimensionsFor(draft.brief.aspectRatio)
  const clean = sanitizeInlineHtml(html)

  const { revisionId, exportKey } = await commitDraftRevision({
    draftId: draft.id,
    instruction: 'Manual inline edit',
    html: clean,
    width,
    height,
  })

  return NextResponse.json({
    reply: 'Design updated',
    revisionId,
    exportUrl: await resolveExportUrl(exportKey),
  })
})
