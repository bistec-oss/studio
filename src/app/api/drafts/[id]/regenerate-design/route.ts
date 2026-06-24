import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, forbiddenIfNotOwner } from '@/lib/auth'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { resolveExportUrl } from '@/lib/storage/minio'
import { runPathBDesign } from '@/lib/agent/pathB'
import { AgentToolLimitError } from '@/lib/agent/types'

export const maxDuration = 300

// Regenerates the freeform (Path B) design for a draft: produces a brand-new
// design variant from the same brief + existing copy. Before overwriting, the
// CURRENT design is snapshotted as a DraftRevision so the user can return to it
// (the response includes its revisionNumber for an immediate "Undo", and it also
// appears in the revision history). Path B only — Path A is a template fill.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const draft = await prisma.draft.findUnique({
    where: { id: params.id },
    include: { brief: true },
  })
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  const forbidden = forbiddenIfNotOwner(user, draft.brief.userId)
  if (forbidden) return forbidden

  if (draft.brief.designMode !== 'GENERATE') {
    return NextResponse.json(
      { code: 'NOT_PATH_B', message: 'Design regeneration is only available for Path B (freeform) drafts.' },
      { status: 400 }
    )
  }

  const kit = await resolveBrandKit(draft.brief.campaignId ?? undefined, draft.brief.brandKitId ?? undefined)
  if (!kit) {
    return NextResponse.json(
      { code: 'NO_BRAND_KIT', message: 'No brand kit found for this draft.' },
      { status: 422 }
    )
  }

  try {
    // Run the new design first — if it fails, the draft is left untouched.
    const result = await runPathBDesign(draft.brief, kit, draft.copyText)

    // Snapshot the design we are replacing as a revision (so "go back" works),
    // then point the draft at the new design — atomically, with the standard
    // revision-number collision retry.
    let previousRevisionNumber: number | null = null
    if (draft.htmlContent) {
      const MAX_ATTEMPTS = 4
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          previousRevisionNumber = await prisma.$transaction(async (tx) => {
            const last = await tx.draftRevision.findFirst({
              where: { draftId: draft.id },
              orderBy: { revisionNumber: 'desc' },
              select: { revisionNumber: true },
            })
            const revisionNumber = (last?.revisionNumber ?? 0) + 1
            await tx.draftRevision.create({
              data: {
                draftId: draft.id,
                revisionNumber,
                instruction: 'Design before regenerate',
                htmlSnapshot: draft.htmlContent!,
                exportUrl: draft.exportUrl ?? '',
              },
            })
            return revisionNumber
          })
          break
        } catch (err) {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002' &&
            attempt < MAX_ATTEMPTS
          ) {
            continue
          }
          throw err
        }
      }
    }

    await prisma.draft.update({
      where: { id: draft.id },
      data: {
        htmlContent: result.htmlContent,
        exportUrl: result.exportUrl,
        status: 'EXPORTED',
        pendingConflict: Prisma.JsonNull,
      },
    })

    return NextResponse.json({
      exportUrl: await resolveExportUrl(result.exportUrl),
      previousRevisionNumber,
    })
  } catch (err) {
    if (err instanceof AgentToolLimitError) {
      return NextResponse.json({ code: 'AGENT_LIMIT', message: err.message }, { status: 422 })
    }
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ code: 'AGENT_ERROR', message }, { status: 422 })
  }
}
