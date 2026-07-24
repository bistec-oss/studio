import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { PROMPT_VERSION } from '@/lib/agent/prompts/shared'

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
        const last = await tx.draftRevision.findFirst({
          where: { draftId },
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
        ...(backgroundImageUrl ? { imageUrl: backgroundImageUrl } : {}),
      },
    })

    return created
  })

  return { revisionId: revision.id, exportKey: finalExportKey }
}
