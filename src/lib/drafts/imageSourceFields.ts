// The Draft.imageSource write fragments (031 FR-13), beside the
// backgroundSkip fragments in backgroundNotice.ts. Server-only: the JSON null
// needs Prisma.DbNull, which would pull @prisma/client into a client bundle if
// it lived in the pure notice modules.

import { Prisma } from '@prisma/client'
import type { BackgroundResult } from '@/lib/drafts/backgroundNotice'

export type ImageSourceWrite = Prisma.InputJsonValue | typeof Prisma.DbNull

function asWrite(result: BackgroundResult | null): ImageSourceWrite {
  return result?.imageSource ? (result.imageSource as unknown as Prisma.InputJsonValue) : Prisma.DbNull
}

// Generation, regenerate-design and Path A: the design was made from scratch, so
// the field always describes THIS render (null when no image provider ran).
export function generationImageSource(result: BackgroundResult | null): ImageSourceWrite {
  return asWrite(result)
}

// Refine, like refineSkipFields: it only speaks when it made an image or a
// provider failed. Everything else is undefined, meaning leave the field as it is.
export function refineImageSource(result: BackgroundResult): ImageSourceWrite | undefined {
  if (result.url !== null) return asWrite(result)
  if (result.skip === 'PROVIDER_ERROR') return asWrite(result)
  return undefined
}
