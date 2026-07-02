import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

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
