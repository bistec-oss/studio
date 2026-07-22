import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin } from '@/lib/api/handler'

export const POST = withTeamAdmin<{ id: string; vid: string }>(async (_req, { params }, user) => {
  const kit = await prisma.brandKit.findFirst({
    where: { id: params.id, isDeleted: false },
    select: { id: true, teamId: true },
  })
  if (!kit || kit.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const prompt = await prisma.brandKitPrompt.findFirst({
    where: { id: params.vid, brandKitId: params.id },
  })
  if (!prompt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.$transaction([
    prisma.brandKitPrompt.updateMany({
      where: { brandKitId: params.id, isActive: true },
      data: { isActive: false },
    }),
    prisma.brandKitPrompt.update({
      where: { id: params.vid },
      data: { isActive: true },
    }),
  ])

  return NextResponse.json({ activated: params.vid })
})
