import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withAdmin, parseBody } from '@/lib/api/handler'

type Params = { id: string; tid: string }

const patchSchema = z.object({
  name: z.string().trim().optional(),
  htmlTemplate: z.string().trim().optional(),
})

export const PATCH = withAdmin<Params>(async (req, { params }) => {
  const body = await parseBody(req, patchSchema)
  if (body.response) return body.response
  const { name, htmlTemplate } = body.data

  const template = await prisma.brandKitTemplate.findFirst({
    where: { id: params.tid, brandKitId: params.id },
  })
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.brandKitTemplate.update({
    where: { id: params.tid },
    data: {
      ...(name !== undefined && { name }),
      ...(htmlTemplate !== undefined && { htmlTemplate }),
    },
  })

  return NextResponse.json(updated)
})

export const DELETE = withAdmin<Params>(async (_req, { params }) => {
  const template = await prisma.brandKitTemplate.findFirst({
    where: { id: params.tid, brandKitId: params.id },
  })
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.brandKitTemplate.delete({ where: { id: params.tid } })

  return new NextResponse(null, { status: 204 })
})
