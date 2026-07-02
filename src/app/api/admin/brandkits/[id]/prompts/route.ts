import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { withAdmin, parseBody } from '@/lib/api/handler'

type Params = { id: string }

export const GET = withAdmin<Params>(async (_req, { params }) => {
  const prompts = await prisma.brandKitPrompt.findMany({
    where: { brandKitId: params.id },
    orderBy: { version: 'desc' },
  })

  return NextResponse.json(prompts)
})

const createSchema = z.object({
  content: z.string().trim().min(1, 'content is required'),
})

export const POST = withAdmin<Params>(async (req, { params }, user) => {
  const { userId } = user

  const body = await parseBody(req, createSchema)
  if (body.response) return body.response
  const { content } = body.data

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
          content,
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
})
