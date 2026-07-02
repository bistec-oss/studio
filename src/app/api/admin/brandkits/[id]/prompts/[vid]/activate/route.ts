import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAdmin } from '@/lib/api/handler'

export const POST = withAdmin<{ id: string; vid: string }>(async (_req, { params }) => {
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
