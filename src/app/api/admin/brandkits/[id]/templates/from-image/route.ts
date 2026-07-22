import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin } from '@/lib/api/handler'
import { uploadObject, publicUrl, BUCKET_BRANDKITS, validateUpload } from '@/lib/storage/minio'
import { generateTemplateFromImage } from '@/lib/brandkit/templateFromImage'
import { withClaudeAuth } from '@/lib/agent/userToken'
import { isAspectRatio } from '@/lib/aspectRatio'

export const maxDuration = 300

type Params = { id: string }

// F6 — upload an image → AI generates a reusable Path A template. The source
// image is stored as a REFERENCE_IMAGE artifact (provenance), the aspect ratio
// is inferred from the image (admin can override via the `aspectRatio` field),
// and the generated HTML is RETURNED (not saved): the admin tweaks it in the
// template editor and saves through the normal POST /templates flow.
export const POST = withTeamAdmin<Params>(async (req, { params }, user) => {
  const kit = await prisma.brandKit.findUnique({
    where: { id: params.id },
    select: { id: true, isDeleted: true, teamId: true },
  })
  if (!kit || kit.isDeleted || kit.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Brand kit not found' }, { status: 404 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const overrideRaw = formData.get('aspectRatio') as string | null
  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })
  const invalid = validateUpload(file)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })
  const aspectRatioOverride = overrideRaw && isAspectRatio(overrideRaw) ? overrideRaw : undefined

  const buffer = Buffer.from(await file.arrayBuffer())
  const contentType = file.type || 'image/png'
  const key = `${params.id}/artifacts/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  await uploadObject(buffer, BUCKET_BRANDKITS, key, contentType)
  const url = publicUrl(BUCKET_BRANDKITS, key)

  // Keep the source image as a reference artifact (provenance + re-generate later).
  const artifact = await prisma.brandKitArtifact.create({
    data: { brandKitId: params.id, type: 'REFERENCE_IMAGE', name: file.name, url, feedToAI: false },
  })

  const imageDataUrl = `data:${contentType};base64,${buffer.toString('base64')}`
  try {
    // CLI mode bills the acting user's personal Claude token when connected
    // (the team token otherwise) — see src/lib/agent/userToken.ts.
    const result = await withClaudeAuth(user.userId, user.teamId, () =>
      generateTemplateFromImage({ imageDataUrl, imageUrl: url, aspectRatioOverride, teamId: user.teamId })
    )
    return NextResponse.json({ html: result.html, aspectRatio: result.aspectRatio, sourceArtifact: artifact })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ code: 'AGENT_ERROR', message }, { status: 422 })
  }
})
