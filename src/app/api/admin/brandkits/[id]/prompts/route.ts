import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
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

  // Allocate the next version, deactivate the current active prompt, and create
  // the new active prompt atomically. Concurrent saves can read the same max
  // version and collide on @@unique([brandKitId, version]); surface that as 409
  // rather than a raw P2002 500.
  try {
    const prompt = await prisma.$transaction(async (tx) => {
      const latest = await tx.brandKitPrompt.findFirst({
        where: { brandKitId: params.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      })
      const nextVersion = (latest?.version ?? 0) + 1

      await tx.brandKitPrompt.updateMany({
        where: { brandKitId: params.id, isActive: true },
        data: { isActive: false },
      })

      return tx.brandKitPrompt.create({
        data: {
          brandKitId: params.id,
          content: content.trim(),
          version: nextVersion,
          isActive: true,
          createdBy: userId,
        },
      })
    })

    return NextResponse.json(prompt, { status: 201 })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json(
        { error: 'A concurrent edit created a new version — please retry.' },
        { status: 409 }
      )
    }
    throw err
  }
}
