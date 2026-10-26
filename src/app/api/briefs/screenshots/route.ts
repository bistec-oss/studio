import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { withTeamAuth } from '@/lib/api/handler'
import { draftVisibilityWhere } from '@/lib/authz/visibility'
import { BUCKET_DOCS, getObjectBytes, uploadObject } from '@/lib/storage/minio'
import { checkScreenshot, readImageHeader, SCREENSHOT_MIME, MAX_SCREENSHOT_BYTES } from '@/lib/composite/imageHeader'
import { isOwnScreenshotKey, screenshotKeyPrefix } from '@/lib/brief/compositeSource'
import { parseCompositionStamp } from '@/lib/designData'

// 025 FR-10: the per-post product screenshot. Private storage (BUCKET_DOCS),
// keyed screenshots/<teamId>/<userId>/<timestamp>-<random>.<ext>. The type is
// decided by the file's own bytes, never by the client's MIME type or name.

// POST: multipart `file`. Responds { key, width, height }, never a URL.
export const POST = withTeamAuth(async (req: NextRequest, _ctx, user) => {
  let file: FormDataEntryValue | null
  try {
    file = (await req.formData()).get('file')
  } catch {
    return NextResponse.json({ error: 'Send the screenshot as a multipart file' }, { status: 400 })
  }
  if (!(file instanceof File)) return NextResponse.json({ error: 'file is required' }, { status: 400 })
  // Bound the read before decoding it (the parser checks the size again).
  if (file.size > MAX_SCREENSHOT_BYTES) {
    return NextResponse.json({ error: 'The screenshot is larger than 10 MB' }, { status: 400 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const checked = checkScreenshot(bytes)
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })

  const key = `${screenshotKeyPrefix(user.teamId, user.userId)}${Date.now()}-${randomBytes(6).toString('hex')}.${checked.ext}`
  await uploadObject(Buffer.from(bytes), BUCKET_DOCS, key, checked.mime)
  return NextResponse.json({ key, width: checked.width, height: checked.height })
})

// GET ?key=: streams the object only to the person whose team and user the key
// names. GET ?key=&draftId=: also to anyone who can see that draft, but only for
// the key in the draft's own composition stamp. Every refusal is the same 404.
export const GET = withTeamAuth(async (req: NextRequest, _ctx, user) => {
  const url = new URL(req.url)
  const key = url.searchParams.get('key')
  const draftId = url.searchParams.get('draftId')
  const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!key) return notFound()

  if (draftId) {
    const draft = await prisma.draft.findFirst({
      where: { id: draftId, ...draftVisibilityWhere(user) },
      select: { composition: true },
    })
    const stampKey = parseCompositionStamp(draft?.composition)?.composites?.[0]?.source.key
    // The key must be this team's and exactly the stamped one.
    if (!draft || !stampKey || stampKey !== key || !key.startsWith(`screenshots/${user.teamId}/`) || key.includes('..')) {
      return notFound()
    }
  } else if (!isOwnScreenshotKey(key, user.teamId, user.userId)) {
    return notFound()
  }

  let bytes: Buffer
  try {
    bytes = await getObjectBytes(BUCKET_DOCS, key)
  } catch {
    return notFound()
  }
  const header = readImageHeader(bytes)
  if (!header.ok) return notFound()
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': SCREENSHOT_MIME[header.type],
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
