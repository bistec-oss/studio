import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getDraftAccessInfo } from '@/lib/auth'
import { withTeamAuth } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { CompositePlacementError } from '@/lib/composite/render'
import { uploadObject, resolveExportUrl, exportKey, BUCKET_EXPORTS } from '@/lib/storage/minio'
import { dimensionsFor } from '@/lib/aspectRatio'
import { track } from '@/lib/analytics/track'
import {
  findCommittedRevision,
  restoreDraftToRevision,
  restoredRenderStamp,
  draftPostStyleStamp,
  renderDraftHtml,
  DraftBusyError,
} from '@/lib/drafts/revisions'

export const maxDuration = 120

type Params = { id: string; rev: string }

export const POST = withTeamAuth<Params>(async (_req, { params }, user) => {
  const revisionNumber = Number(params.rev)
  if (!Number.isInteger(revisionNumber)) {
    return NextResponse.json({ error: 'Invalid revision number' }, { status: 400 })
  }

  const info = await getDraftAccessInfo(params.id)
  if (!info || !canAccessContent(user, info)) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  // A running async action (regenerate/refine) will move the revision pointer
  // itself — restoring concurrently would race it.
  const draftState = await prisma.draft.findUnique({
    where: { id: params.id },
    select: { pendingAction: true, currentRevisionNumber: true, postStyle: true },
  })
  if (draftState?.pendingAction) {
    return NextResponse.json(
      { error: 'Another action is already running on this draft' },
      { status: 409 },
    )
  }

  // Committed chain rows only — this is also Undo's path (the client restores
  // the revision number it captured before an action). A rejected refine render
  // has no revision number, so it can never be restored or undone to; it is
  // adopted only through "Use anyway", which commits a fresh revision (T19).
  const revision = await findCommittedRevision(params.id, revisionNumber)
  if (!revision) return NextResponse.json({ error: 'Revision not found' }, { status: 404 })

  // Switching versions just moves the pointer and reuses the revision's ALREADY
  // rendered PNG — no Puppeteer, so switching is instant. Every revision stores
  // its exportUrl (EXPORTS object key) at creation; only legacy rows that lack
  // one fall back to a re-render.
  let key = revision.exportUrl
  // F3 (AC-04): the draft takes the restored revision's own render stamp — or,
  // when its PNG is re-rendered below, the font set that rasterizes it now.
  // 027: the draft's current post-style stamp is carried (a restore moves the
  // render pointer; it does not re-run the rules).
  const stamp = restoredRenderStamp(revision, !key, draftPostStyleStamp(draftState ?? {}))
  if (!key) {
    const draft = await prisma.draft.findUnique({
      where: { id: params.id },
      select: { brief: { select: { aspectRatio: true } } },
    })
    const { width, height } = dimensionsFor(draft?.brief.aspectRatio)
    let buffer: Buffer
    try {
      // 025 FR-16: the revision's own stamp decides the screenshot.
      // 030: a restore stamps nothing from this render (the row's own stamp is carried).
      buffer = (await renderDraftHtml(params.id, revision.htmlSnapshot, stamp.composition, width, height, null)).png
    } catch (err) {
      if (err instanceof CompositePlacementError) {
        return NextResponse.json({ error: err.message, code: 'composite-not-placed' }, { status: 422 })
      }
      throw err
    }
    key = exportKey('restore', params.id)
    await uploadObject(buffer, BUCKET_EXPORTS, key, 'image/png')
  }

  // T18 (Ruling, T17 concern 4): a restore also clears any not-applied
  // outcome. The rejected render a "Use anyway" would adopt was made from the
  // PRE-restore design — leaving it live would let a later adopt silently
  // undo this restore. F2: the draft write is guarded on pendingAction being
  // null, so an action that claimed the draft after the pre-check above
  // makes this a 409 that writes nothing.
  try {
    await restoreDraftToRevision(params.id, revisionNumber, revision.htmlSnapshot, key, stamp)
  } catch (err) {
    if (err instanceof DraftBusyError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    throw err
  }
  await track('revision.restored', {
    source: 'web',
    teamId: user.teamId,
    userId: user.userId,
    draftId: params.id,
    outcome: 'ok',
    payload: { from: draftState?.currentRevisionNumber ?? 0, to: revisionNumber },
  })

  return NextResponse.json({ exportUrl: await resolveExportUrl(key) })
})
