import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAuth } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { dimensionsFor } from '@/lib/aspectRatio'
import { resolveExportUrl } from '@/lib/storage/minio'
import { commitDraftRevision, AdoptConflictError } from '@/lib/drafts/revisions'
import { inlineEditBlockReason } from '@/lib/drafts/inlineEdit'

// "Use anyway" (change 004 Phase 2, T19, FR-14a): adopts a twice-failed
// refine's retained rejected render as a normal, committed chain revision.
//
// Synchronous — no model call and no re-render, the rejected row's own
// stored export is reused as-is (Ruling D: a row with no export has nothing
// to adopt) — so, unlike refine/regenerate-design, this route never claims
// Draft.pendingAction: no DraftAction enum value describes "adopt a stored
// render" honestly (it is neither a regenerate nor a refine), and adding one
// would need a new migration on top of T15's — which the task's ruling says
// to avoid. Single-flight instead comes from two layers:
//   1. a route-level `inlineEditBlockReason` check (fix round 1, Minor 2 —
//      the same shared helper inline-edit uses, rather than a hand-rolled
//      copy of half its logic) — 409s while another action is genuinely
//      running OR the draft isn't ready, same messages inline-edit uses for
//      the same cases;
//   2. the load-bearing guard: atomic conditional UPDATEs inside
//      commitDraftRevision's own transaction (adoptRejectedRevisionId) —
//      one on the Draft row (re-checking pendingAction AND the not-applied
//      pointer together, fix round 1 Minor 1) and one on the rejected row
//      itself (adoptedAt flips from NULL exactly once). Two concurrent
//      adopts of the same row can never both win, and a refine/regenerate
//      claimed after this route's check still 409s — the loser's commit
//      aborts with AdoptConflictError, mapped to 409 below.
export const POST = withTeamAuth<{ id: string; revisionId: string }>(async (_req, { params }, user) => {
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
  if (blocked) {
    return NextResponse.json({ error: blocked }, { status: 409 })
  }

  // Fix round 1, Important 1: scope the lookup to THIS draft in the query
  // itself (findFirst, not findUnique-by-id-alone). A row that belongs to a
  // different draft — or team entirely — now comes back null exactly like an
  // unknown id: both are 404. The old findUnique-by-id-alone let a caller who
  // can see any one draft learn "a DraftRevision with this id exists
  // somewhere" from a 409 vs 404 split, which is exactly the existence leak
  // the tenancy rule (cross-team is always 404) forbids.
  const row = await prisma.draftRevision.findFirst({
    where: { id: params.revisionId, draftId: draft.id },
    select: {
      id: true,
      instruction: true,
      htmlSnapshot: true,
      exportUrl: true,
      rejectedAt: true,
      adoptedAt: true,
      discardedAt: true,
    },
  })
  // Unknown to this draft — whether the id doesn't exist at all, or exists
  // on a different draft/team — is uniformly 404 (no existence leak).
  if (!row) {
    return NextResponse.json({ error: 'Rejected render not found' }, { status: 404 })
  }
  // The row IS one of this draft's rows, but some other precondition fails:
  // it isn't (or is no longer) the draft's live not-applied outcome, it was
  // already adopted or discarded, or it was never a usable rejected render
  // at all (no export — Ruling D). All 409, matching the task's own
  // enumerated preconditions.
  const eligible =
    row.id === draft.notAppliedRevisionId &&
    row.rejectedAt !== null &&
    row.adoptedAt === null &&
    row.discardedAt === null &&
    row.exportUrl !== null
  if (!eligible) {
    return NextResponse.json({ error: 'This render can no longer be adopted' }, { status: 409 })
  }

  const { width, height } = dimensionsFor(draft.brief.aspectRatio)

  try {
    const { revisionId, exportKey } = await commitDraftRevision({
      draftId: draft.id,
      // Recognizably user-accepted despite a failed check (FR-14a).
      instruction: `Use anyway: ${row.instruction}`,
      html: row.htmlSnapshot,
      width,
      height,
      // The rejected row's own export, reused as-is — nothing re-renders.
      exportKey: row.exportUrl as string,
      adoptRejectedRevisionId: row.id,
    })
    return NextResponse.json({
      reply: 'Design updated',
      revisionId,
      exportUrl: await resolveExportUrl(exportKey),
    })
  } catch (err) {
    if (err instanceof AdoptConflictError) {
      return NextResponse.json({ error: 'This render can no longer be adopted' }, { status: 409 })
    }
    throw err
  }
})
