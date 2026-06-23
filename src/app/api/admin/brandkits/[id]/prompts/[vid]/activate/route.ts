import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

export async function POST(_: NextRequest, { params }: { params: { id: string; vid: string } }) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

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
}
