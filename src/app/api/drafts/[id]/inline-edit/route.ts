import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, parseBody } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { dimensionsFor } from '@/lib/aspectRatio'
import { resolveExportUrl } from '@/lib/storage/minio'
import { commitDraftRevision } from '@/lib/drafts/revisions'
import {
  sanitizeInlineHtml,
  inlineEditBlockReason,
  applyElementEdit,
  type ElementEditRequest,
} from '@/lib/drafts/inlineEdit'

// Permissive schema + manual check so the error message stays stable.
const bodySchema = z.object({}).passthrough()

// Manual inline edit: the client sends the edited HTML (chrome already stripped).
// We sanitize defense-in-depth, render HTML→PNG, and commit a normal
// DraftRevision — synchronous (no AI, single render). Same visibility + guards
// as refine.
//
// SECOND MODE — element-scoped edit (FR-17/18/19). When the body carries an
// `element` object the route edits ONE node of the draft's own stored HTML
// instead of accepting a whole replacement document. It is strictly NARROWER
// than the mode above, never wider: the base document is the server's, not the
// client's, and the only client bytes that reach it are an escaped text run or a
// value re-serialized from a closed grammar. The whole-document path below is
// untouched — same validation, same order, same sanitizer, same instruction.
//
// The node is resolved SERVER-SIDE by re-scanning the current HTML for the
// content the user clicked, and the resolution must be unique (AC-26 / AC-25 —
// the rules and their honest limits live next to the resolver in
// `src/lib/drafts/inlineEdit.ts`). Nothing in the payload names a position, and
// no address is stored anywhere. Both modes then converge on the SAME single
// `commitDraftRevision` call below — there is no second writer of
// `Draft.htmlContent` here (FR-19 / AC-24).
export const POST = withTeamAuth<{ id: string }>(async (req, { params }, user) => {
  const body = await parseBody(req, bodySchema)
  if (body.response) return body.response
  const { html, element } = body.data as { html?: unknown; element?: unknown }
  // Only the shape is checked here; `applyElementEdit` owns every field rule, so
  // an unknown extra key (a `selector`, say) is never even read.
  const elementEdit =
    element !== null && typeof element === 'object' ? (element as ElementEditRequest) : null
  // Narrowed once, here, so the commit below can never be reached with an
  // unvalidated document. `element` wins if a client sends both — the narrower
  // mode is the safe one to prefer.
  const wholeDocument: string | null = typeof html === 'string' && html.trim() ? html : null
  if (!elementEdit && wholeDocument === null) {
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

  // Deliberately does NOT claim Draft.pendingAction (unlike regenerate/refine):
  // this is a sub-second synchronous render with no AI call, so the tiny
  // concurrent-commit window is already covered by withNextRevisionNumber's
  // P2002 retry rather than needing the async claim/poll machinery.
  const blocked = inlineEditBlockReason(draft.status, draft.pendingAction)
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 })

  const { width, height } = dimensionsFor(draft.brief.aspectRatio)

  let nextHtml: string
  let instruction: string
  if (elementEdit) {
    // The base document is the stored one, never the request's — that is what
    // confines the write to the resolved node (FR-17).
    if (!draft.htmlContent) {
      return NextResponse.json({ error: 'This draft has no design to edit yet' }, { status: 409 })
    }
    const outcome = applyElementEdit(draft.htmlContent, elementEdit)
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.reason }, { status: outcome.status })
    }
    nextHtml = outcome.html
    instruction = outcome.instruction
  } else if (wholeDocument !== null) {
    nextHtml = sanitizeInlineHtml(wholeDocument)
    instruction = 'Manual inline edit'
  } else {
    // Unreachable — the guard at the top returns 400 for exactly this
    // combination. Written out rather than cast away so that if the guard ever
    // changes, this falls closed instead of committing an unvalidated document.
    return NextResponse.json({ error: 'html is required' }, { status: 400 })
  }

  const { revisionId, exportKey } = await commitDraftRevision({
    draftId: draft.id,
    instruction,
    html: nextHtml,
    width,
    height,
  })

  return NextResponse.json({
    reply: 'Design updated',
    revisionId,
    exportUrl: await resolveExportUrl(exportKey),
  })
})
