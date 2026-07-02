import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  const body = await req.json()
  const { isEnabled, isDefault, label } = body
  const { id } = params

  const existing = await prisma.availableProvider.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Provider not found' }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (isEnabled !== undefined) data.isEnabled = isEnabled
  if (isDefault !== undefined) data.isDefault = isDefault
  if (label !== undefined) data.label = label.trim()

  // Clearing the prior default + updating this row must be atomic so a
  // failure can't leave the slot with zero (or two) defaults.
  const updated = await prisma.$transaction(async (tx) => {
    if (isDefault === true) {
      await tx.availableProvider.updateMany({ where: { slot: existing.slot }, data: { isDefault: false } })
    }
    return tx.availableProvider.update({
      where: { id },
      data,
      select: { id: true, slot: true, providerKey: true, providerName: true, label: true, keyPrefix: true, isEnabled: true, isDefault: true, createdAt: true },
    })
  })

  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  const { id } = params
  const existing = await prisma.availableProvider.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Provider not found' }, { status: 404 })

  await prisma.availableProvider.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
