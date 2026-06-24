import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, forbiddenIfNotOwner } from '@/lib/auth'
import { resolveCopyProvider } from '@/providers/registry'
import { buildBriefInput } from '@/lib/agent/pathB'

export const maxDuration = 120

// Regenerates the post copy for a draft by re-running the resolved copy provider
// against the brief, then persists the new copy. Returns both the new and the
// previous copy so the UI can offer an immediate Undo. The design HTML/PNG is
// untouched — copy and design regenerate independently.
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

  try {
    const provider = await resolveCopyProvider(draft.brief.copyProviderKey ?? undefined)
    const copyText = await provider.generateCopy(buildBriefInput(draft.brief))

    const previousCopyText = draft.copyText
    await prisma.draft.update({
      where: { id: draft.id },
      data: {
        copyText,
        // A copy change invalidates a prior export (mirrors the PATCH route).
        ...(draft.status === 'EXPORTED' ? { status: 'IN_PROGRESS' } : {}),
      },
    })

    return NextResponse.json({ copyText, previousCopyText })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ code: 'COPY_ERROR', message }, { status: 422 })
  }
}
