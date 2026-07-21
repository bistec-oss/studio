import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withSuperAdmin, parseBody } from '@/lib/api/handler'

type Params = { id: string; userId: string }

const patchSchema = z.object({
  role: z.enum(['ADMIN', 'EDITOR'], { errorMap: () => ({ message: 'role must be ADMIN or EDITOR' }) }),
})

export const PATCH = withSuperAdmin<Params>(async (req: NextRequest, { params }) => {
  const existing = await prisma.teamMembership.findUnique({
    where: { teamId_userId: { teamId: params.id, userId: params.userId } },
  })
  if (!existing) return NextResponse.json({ error: 'Membership not found' }, { status: 404 })

  const body = await parseBody(req, patchSchema)
  if (body.response) return body.response
  const { role } = body.data

  await prisma.teamMembership.update({
    where: { teamId_userId: { teamId: params.id, userId: params.userId } },
    data: { role },
  })

  return NextResponse.json({ userId: params.userId, role })
})

export const DELETE = withSuperAdmin<Params>(async (_req, { params }) => {
  const existing = await prisma.teamMembership.findUnique({
    where: { teamId_userId: { teamId: params.id, userId: params.userId } },
  })
  if (!existing) return NextResponse.json({ error: 'Membership not found' }, { status: 404 })

  await prisma.teamMembership.delete({
    where: { teamId_userId: { teamId: params.id, userId: params.userId } },
  })

  return new NextResponse(null, { status: 204 })
})
