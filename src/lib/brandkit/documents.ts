import { prisma } from "@/lib/prisma"
import { DOC_IMAGE_MIME_TYPES, MAX_DOC_IMAGES_CONTEXT } from "@/lib/campaign/documents"

// Brand-kit source documents: per-kit uploads (PDF/DOCX/TXT/MD + PNG/JPG) that
// ground the brand-kit assistant chat — mirrors src/lib/campaign/documents.ts.
// Deliberately NOT artifacts: these must never enter generation prompts
// (Path B reads only feedToAI artifacts).

export const MAX_DOCS_PER_BRAND_KIT = 5

// Parsed text rows of a kit's uploaded documents, for buildDocsContext (image
// "documents" store empty parsedText and are filtered there).
export async function collectBrandKitDocTexts(
  kitId: string
): Promise<Array<{ name: string; parsedText: string; truncated: boolean }>> {
  return prisma.brandKitDocument.findMany({
    where: { brandKitId: kitId },
    orderBy: { createdAt: "asc" },
    select: { name: true, parsedText: true, truncated: true },
  })
}

// Presigned URLs for a kit's uploaded reference IMAGES (the docs bucket is
// private — the vision model fetches these server-side). Mirrors
// collectCampaignDocImageUrls, same cap.
export async function collectBrandKitDocImageUrls(kitId: string): Promise<string[]> {
  const { BUCKET_DOCS, getPresignedUrl } = await import("@/lib/storage/minio")
  const images = await prisma.brandKitDocument.findMany({
    where: { brandKitId: kitId, contentType: { in: DOC_IMAGE_MIME_TYPES } },
    orderBy: { createdAt: "asc" },
    take: MAX_DOC_IMAGES_CONTEXT,
    select: { objectKey: true },
  })
  return Promise.all(images.map((d) => getPresignedUrl(BUCKET_DOCS, d.objectKey)))
}
