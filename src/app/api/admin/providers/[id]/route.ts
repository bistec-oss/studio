import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin, parseBody } from '@/lib/api/handler'

type Params = { id: string }

const patchSchema = z.object({
  isEnabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  label: z.string().trim().optional(),
})

export const PATCH = withTeamAdmin<Params>(async (req, { params }, user) => {
  const body = await parseBody(req, patchSchema)
  if (body.response) return body.response
  const { isEnabled, isDefault, label } = body.data
  const { id } = params

  const existing = await prisma.availableProvider.findUnique({ where: { id } })
  if (!existing || existing.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
  }

  const data: Record<string, unknown> = {}
  if (isEnabled !== undefined) data.isEnabled = isEnabled
  if (isDefault !== undefined) data.isDefault = isDefault
  if (label !== undefined) data.label = label

  // Clearing the prior default + updating this row must be atomic so a
  // failure can't leave the slot with zero (or two) defaults.
  const updated = await prisma.$transaction(async (tx) => {
    if (isDefault === true) {
      await tx.availableProvider.updateMany({
        where: { slot: existing.slot, teamId: existing.teamId },
        data: { isDefault: false },
      })
    }
    return tx.availableProvider.update({
      where: { id },
      data,
      select: { id: true, slot: true, providerKey: true, providerName: true, label: true, keyPrefix: true, isEnabled: true, isDefault: true, createdAt: true },
    })
  })

  return NextResponse.json(updated)
})

export const DELETE = withTeamAdmin<Params>(async (_req, { params }, user) => {
  const { id } = params
  const existing = await prisma.availableProvider.findUnique({ where: { id } })
  if (!existing || existing.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
  }

  await prisma.availableProvider.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
})
