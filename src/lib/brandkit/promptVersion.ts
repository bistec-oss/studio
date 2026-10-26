import { Prisma } from '@prisma/client'

// The one place a brand-kit voice prompt version is allocated (031 T12): the next version
// number, the current active version deactivated, the new one created active. It runs inside the
// caller's transaction. Concurrent saves can read the same max version and collide on
// @@unique([brandKitId, version]); the callers surface that P2002 as a 409.
export async function createPromptVersion(
  tx: Prisma.TransactionClient,
  kitId: string,
  content: string,
  userId: string,
  previousFonts?: Prisma.InputJsonValue,
) {
  const latest = await tx.brandKitPrompt.findFirst({
    where: { brandKitId: kitId },
    orderBy: { version: 'desc' },
    select: { version: true },
  })
  const nextVersion = (latest?.version ?? 0) + 1

  await tx.brandKitPrompt.updateMany({
    where: { brandKitId: kitId, isActive: true },
    data: { isActive: false },
  })

  return tx.brandKitPrompt.create({
    data: {
      brandKitId: kitId,
      content,
      version: nextVersion,
      isActive: true,
      createdBy: userId,
      ...(previousFonts !== undefined && { previousFonts }),
    },
  })
}
