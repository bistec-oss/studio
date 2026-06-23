import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  const prompts = await prisma.brandKitPrompt.findMany({
    where: { brandKitId: params.id },
    orderBy: { version: 'desc' },
  })

  return NextResponse.json(prompts)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const body = await req.json()
  const { content } = body

  if (!content?.trim()) return NextResponse.json({ error: 'content is required' }, { status: 400 })

  const latest = await prisma.brandKitPrompt.findFirst({
    where: { brandKitId: params.id },
    orderBy: { version: 'desc' },
    select: { version: true },
  })

  const nextVersion = (latest?.version ?? 0) + 1

  // Deactivate existing active prompt, then create new active one
  await prisma.brandKitPrompt.updateMany({
    where: { brandKitId: params.id, isActive: true },
    data: { isActive: false },
  })

  const prompt = await prisma.brandKitPrompt.create({
    data: {
      brandKitId: params.id,
      content: content.trim(),
      version: nextVersion,
      isActive: true,
      createdBy: userId,
    },
  })

  return NextResponse.json(prompt, { status: 201 })
}
