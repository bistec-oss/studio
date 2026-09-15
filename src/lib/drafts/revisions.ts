import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { PROMPT_VERSION } from '@/lib/agent/prompts/shared'
import { getFontSetId } from '@/lib/renderer/fontSet'

// A rejected revision (migration 20260915140000) is a render the refine
// verifier threw away, retained OUT OF CHAIN for diagnosis. It is numbered
// negatively so it can neither collide with nor consume a chain number, but
// nothing in the schema keeps it out of a chain READ — an unfiltered
// `draftRevision.find*` returns it like any other row, and it would then show up
// in the version-switch list, be restorable by number, inflate the revision
// count, or be handed to Undo.
//
// So the chain reads live HERE, next to the filter that defines them, and a
// consumer that needs the chain calls one of them instead of writing its own
// query. An eslint `no-restricted-syntax` rule turns a `draftRevision.find*`
// outside this file into a lint error, so a future tenth consumer cannot
// reintroduce the leak by simply forgetting — it has to opt out in writing.
// Writes are unaffected: `rejected` defaults to false, so every revision
// committed through this module is in-chain by construction.
const CHAIN_ONLY = { rejected: false } as const

// The same filter as a relation-count fragment, for the one chain read that is
// not a query on DraftRevision itself (the draft GET's `_count.revisions`).
export const CHAIN_REVISION_COUNT_FILTER = { where: CHAIN_ONLY }

// Restore/Undo addresses a revision by NUMBER taken straight from the URL, and
// a rejected render HAS a number — a negative one. `Number.isInteger` alone
// therefore accepts `POST /api/drafts/[id]/revisions/-1/restore`, which would
// pull a rejected render into the live draft. Chain numbers start at 1, so the
// guard is positivity, not just integrality. Pure, so it is testable without a
// route; the query filter below is the second, independent half of the fix.
export function parseChainRevisionNumber(raw: string): number | null {
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) return null
  return n
}

// The version-switch list: chain revisions only, newest first.
export function listChainRevisions(draftId: string) {
  // eslint-disable-next-line no-restricted-syntax -- this file IS the chokepoint
  return prisma.draftRevision.findMany({
    where: { draftId, ...CHAIN_ONLY },
    orderBy: { revisionNumber: 'desc' },
    select: {
      id: true,
      revisionNumber: true,
      instruction: true,
      exportUrl: true,
      createdAt: true,
    },
  })
}

// Lookup by number for restore / Undo. Returns null for a rejected row even if
// its number is named directly, so the route guard and the query agree.
export function findChainRevision(draftId: string, revisionNumber: number) {
  // eslint-disable-next-line no-restricted-syntax -- this file IS the chokepoint
  return prisma.draftRevision.findFirst({
    where: { draftId, revisionNumber, ...CHAIN_ONLY },
  })
}

// Allocates the next revisionNumber for a draft and runs `body` inside a
// transaction with it. The @@unique([draftId, revisionNumber]) constraint
// serializes concurrent refines; each loser recomputes and retries on P2002.
// The budget must cover the worst case (every other in-flight refine commits
// first), so it is sized generously — a small budget (e.g. 4) 500s under
// ~10-way concurrency (see TC-REG-H7a). One implementation for refine and
// regenerate-design so their retry budgets can never drift again.
const MAX_ATTEMPTS = 12

export async function withNextRevisionNumber<T>(
  draftId: string,
  body: (tx: Prisma.TransactionClient, revisionNumber: number) => Promise<T>
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        // CHAIN_ONLY is required, not decorative: MAX(revisionNumber) over a
        // draft that has any chain revision is unaffected by the negative
        // rejected rows, but a draft whose ONLY revisions are rejected would
        // yield -1 here and mint revision 0 — outside the chain's numbering.
        // eslint-disable-next-line no-restricted-syntax -- this file IS the chokepoint
        const last = await tx.draftRevision.findFirst({
          where: { draftId, ...CHAIN_ONLY },
          orderBy: { revisionNumber: 'desc' },
          select: { revisionNumber: true },
        })
        return body(tx, (last?.revisionNumber ?? 0) + 1)
      })
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        attempt < MAX_ATTEMPTS
      ) {
        continue // revision number collided — recompute and retry
      }
      throw err
    }
  }
}

export interface CommitRevisionArgs {
  draftId: string
  instruction: string
  html: string
  width: number
  height: number
  exportKey?: string
  backgroundImageUrl?: string | null
}

// Shared commit path for refine + inline-edit. Renders the HTML to a PNG when
// no export key is supplied (the override / inline-edit case), then allocates a
// revision number and writes the DraftRevision + updates the draft atomically
// (P2002 collision retry via withNextRevisionNumber). Returns the new revision
// id and the EXPORTS object key (unsigned).
export async function commitDraftRevision(
  args: CommitRevisionArgs,
): Promise<{ revisionId: string; exportKey: string }> {
  const { draftId, instruction, html, width, height, backgroundImageUrl } = args

  let finalExportKey = args.exportKey
  if (!finalExportKey) {
    const { renderHtmlToPng } = await import('@/lib/renderer/puppeteer')
    const { uploadObject, exportKey, BUCKET_EXPORTS } = await import('@/lib/storage/minio')
    const buffer = await renderHtmlToPng(html, width, height)
    finalExportKey = exportKey('refine', draftId)
    await uploadObject(buffer, BUCKET_EXPORTS, finalExportKey, 'image/png')
  }

  const revision = await withNextRevisionNumber(draftId, async (tx, revisionNumber) => {
    const created = await tx.draftRevision.create({
      data: {
        draftId,
        revisionNumber,
        instruction,
        htmlSnapshot: html,
        exportUrl: finalExportKey,
      },
      select: { id: true },
    })

    await tx.draft.update({
      where: { id: draftId },
      data: {
        htmlContent: html,
        exportUrl: finalExportKey,
        currentRevisionNumber: revisionNumber,
        pendingConflict: Prisma.JsonNull,
        promptVersion: PROMPT_VERSION,
        fontSetId: getFontSetId(),
        ...(backgroundImageUrl ? { imageUrl: backgroundImageUrl } : {}),
      },
    })

    return created
  })

  return { revisionId: revision.id, exportKey: finalExportKey }
}
