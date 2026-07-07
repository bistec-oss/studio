import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withSuperAdmin, parseBody } from '@/lib/api/handler'
import { auth } from '@/lib/auth'

type Params = { id: string }

const patchSchema = z
  .object({
    role: z.enum(['admin', 'editor']).optional(),
    disabled: z.boolean().optional(),
    password: z.string().min(8).optional(),
  })
  .refine((d) => d.role !== undefined || d.disabled !== undefined || d.password !== undefined, {
    message: 'Nothing to update',
  })

export const PATCH = withSuperAdmin<Params>(async (req, { params }, user) => {
  const body = await parseBody(req, patchSchema)
  if (body.response) return body.response
  const { role, disabled, password } = body.data

  const target = await prisma.user.findUnique({ where: { id: params.id } })
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Super-admins can't lock themselves out or manage other super-admins.
  if (target.id === user.userId) {
    return NextResponse.json({ error: 'You cannot modify your own account' }, { status: 403 })
  }
  if (target.role === 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Super-admin accounts cannot be modified here' }, { status: 403 })
  }

  if (password !== undefined) {
    const ctx = await auth.$context
    const hashed = await ctx.password.hash(password)
    await ctx.internalAdapter.updatePassword(target.id, hashed)
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      ...(role !== undefined ? { role: role === 'admin' ? 'ADMIN' : 'EDITOR' } : {}),
      ...(disabled !== undefined ? { disabled } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      displayUsername: true,
      role: true,
      disabled: true,
      createdAt: true,
    },
  })

  // Deactivation revokes live sessions so the lockout is immediate.
  if (disabled === true) {
    await prisma.session.deleteMany({ where: { userId: target.id } })
  }

  return NextResponse.json(updated)
})
