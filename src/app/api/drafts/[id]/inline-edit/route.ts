import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, parseBody, type TeamAuthedUser } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { dimensionsFor } from '@/lib/aspectRatio'
import { resolveExportUrl } from '@/lib/storage/minio'
import { commitDraftRevision, RevisionConflictError } from '@/lib/drafts/revisions'
import {
  sanitizeInlineHtml,
  inlineEditBlockReason,
  elementEditRequestSchema,
  applyElementEdit,
  checkElementBaseRevision,
  elementCommitConflict,
} from '@/lib/drafts/inlineEdit'

// Permissive schema + manual check so the error message stays stable.
const bodySchema = z.object({}).passthrough()

// The draft if it exists AND the caller can see it; null otherwise (the route
// answers 404 either way — no existence leak).
async function findVisibleDraft(id: string, user: TeamAuthedUser) {
  const draft = await prisma.draft.findUnique({
    where: { id },
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
    return null
  }
  return draft
}

// Manual inline edit — two modes, one writer (commitDraftRevision):
//
// 1. Whole-document (the default; any body without `mode: 'element'`): the
//    client sends the edited HTML (chrome already stripped). We sanitize
//    defense-in-depth, render HTML→PNG, and commit a normal DraftRevision —
//    synchronous (no AI, single render). Same visibility + guards as refine.
//    Unchanged by change 004.
//
// 2. Element (`mode: 'element'`, change 004 Phase 3 T23 — FR-17/18/19,
//    AC-24/25/26): see handleElementEdit below.
export const POST = withTeamAuth<{ id: string }>(async (req, { params }, user) => {
  const body = await parseBody(req, bodySchema)
  if (body.response) return body.response
  if ((body.data as { mode?: unknown }).mode === 'element') {
    return handleElementEdit(body.data, params.id, user)
  }
  const { html } = body.data as { html?: unknown }
  if (typeof html !== 'string' || !html.trim()) {
    return NextResponse.json({ error: 'html is required' }, { status: 400 })
  }

  const draft = await findVisibleDraft(params.id, user)
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

  // Deliberately does NOT claim Draft.pendingAction (unlike regenerate/refine):
  // this is a sub-second synchronous render with no AI call, so the tiny
  // concurrent-commit window is already covered by withNextRevisionNumber's
  // P2002 retry rather than needing the async claim/poll machinery.
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

// Element mode. Body (Ruling W5-B, amended in fix round 1):
//   { mode: 'element',
//     locator: { path: number[], tag: string, text: string,
//                baseRevisionNumber: number | null },
//     edit: { kind: 'text' | 'color' | 'backgroundColor' | 'fontSize', value: string } }
//
// - baseRevisionNumber is the draft's currentRevisionNumber when the editor
//   loaded the HTML the path was computed against (null only for a legacy
//   draft with no pointer). The edit applies to THAT revision only: a moved
//   pointer is 409 element-stale here, before anything is resolved, and again
//   inside commitDraftRevision's transaction (expectedRevisionNumber, a
//   compare-and-swap) for a commit that lands while this one renders. This is
//   what makes a refine that removed or reordered elements unable to redirect
//   an old address — the fingerprint alone cannot tell identical siblings
//   apart (review wave5-O Critical 1 / Important 1).
// - The write target is resolved HERE, against the draft's CURRENT stored
//   htmlContent, from `locator.path`; it is written only when the resolved
//   element's tag and normalized text match the locator's fingerprint
//   (defence in depth). Nothing about the address is persisted (FR-18).
// - Any `selector` / `target` field in the body is stripped by the schema and
//   never consulted (AC-26).
// - The value goes through the closed grammar (inlineEdit.ts); a rejection is
//   a 400 and nothing is written (AC-22/23). Text is written as text (AC-21).
// - The commit is commitDraftRevision — one revision, the same single writer
//   of Draft.htmlContent as mode 1 (AC-24, FR-19). The stored HTML is NOT
//   re-sanitized: only the resolved element's bytes change, and those are an
//   escaped text node or one grammar-serialized declaration.
//
// Responses (every error carries a stable `code` for the client — T24):
//   200 { reply, revisionId, revisionNumber, exportUrl }   (mode 1's shape plus
//       revisionNumber — the draft's new pointer, the next edit's base)
//   400 invalid-element-edit  — payload fails the schema (incl. unknown edit.kind,
//                               a missing baseRevisionNumber)
//   400 invalid-color | invalid-size | invalid-text — value outside the grammar
//                               (invalid-text also: a <pre>/<listing> text that
//                               starts with a line break)
//   400 element-not-text-leaf — text edit on an element with child elements
//   400 element-not-editable  — the element can't take this edit (script, style, void…)
//   404 (no code)             — draft missing or not visible (same as mode 1)
//   409 draft-busy            — inlineEditBlockReason (action running / not exported),
//                               or an action claimed the draft while this edit
//                               rendered (the commit's single-flight check)
//   409 element-stale         — the draft moved past baseRevisionNumber (checked
//                               before resolution and again at commit), a path
//                               miss, or a tag / text fingerprint mismatch
//   409 element-unsupported   — the stored HTML can't be edited reliably
//                               element-by-element (use the whole-document mode)
async function handleElementEdit(raw: unknown, draftId: string, user: TeamAuthedUser) {
  const parsed = elementEditRequestSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const path = issue.path.join('.')
    return NextResponse.json(
      { error: path ? `${path}: ${issue.message}` : issue.message, code: 'invalid-element-edit' },
      { status: 400 },
    )
  }

  const draft = await findVisibleDraft(draftId, user)
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

  // Same single-flight rule as mode 1: a running refine/regenerate 409s this.
  const blocked = inlineEditBlockReason(draft.status, draft.pendingAction)
  if (blocked) return NextResponse.json({ error: blocked, code: 'draft-busy' }, { status: 409 })

  // The edit applies to the revision the editor loaded, or not at all.
  const { baseRevisionNumber } = parsed.data.locator
  const moved = checkElementBaseRevision(baseRevisionNumber, draft.currentRevisionNumber)
  if (moved) return NextResponse.json({ error: moved.error, code: moved.code }, { status: moved.status })

  if (!draft.htmlContent) {
    return NextResponse.json(
      { error: 'This draft has no design to edit', code: 'element-unsupported' },
      { status: 409 },
    )
  }

  const result = applyElementEdit(draft.htmlContent, parsed.data)
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
  }

  const { width, height } = dimensionsFor(draft.brief.aspectRatio)
  let committed: Awaited<ReturnType<typeof commitDraftRevision>>
  try {
    committed = await commitDraftRevision({
      draftId: draft.id,
      instruction: result.instruction,
      html: result.html,
      width,
      height,
      // The compare-and-swap: commit only if the pointer is still the base
      // (a commit that landed while this one rendered would otherwise be
      // silently overwritten) and no refine/regenerate claimed the draft
      // meanwhile (single-flight). A miss writes nothing.
      expectedRevisionNumber: baseRevisionNumber,
    })
  } catch (err) {
    if (err instanceof RevisionConflictError) {
      const conflict = elementCommitConflict(err.pendingAction)
      return NextResponse.json({ error: conflict.error, code: conflict.code }, { status: conflict.status })
    }
    throw err
  }

  return NextResponse.json({
    reply: 'Design updated',
    revisionId: committed.revisionId,
    revisionNumber: committed.revisionNumber,
    exportUrl: await resolveExportUrl(committed.exportKey),
  })
}
