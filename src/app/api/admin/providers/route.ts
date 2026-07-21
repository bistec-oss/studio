import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withAdmin, parseBody } from '@/lib/api/handler'
import { encrypt } from '@/lib/crypto'

function detectProvider(apiKey: string): { providerName: string; autoLabel: string } | null {
  if (apiKey.startsWith('sk-ant-')) return { providerName: 'anthropic', autoLabel: 'Claude (Anthropic)' }
  if (apiKey.startsWith('sk-')) return { providerName: 'openai', autoLabel: 'GPT (OpenAI)' }
  return null
}

async function validateApiKey(providerName: string, apiKey: string): Promise<string | null> {
  try {
    if (providerName === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      })
      if (!res.ok) return `Anthropic API rejected the key (HTTP ${res.status})`
    } else if (providerName === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!res.ok) return `OpenAI API rejected the key (HTTP ${res.status})`
    }
    // Unknown providers: skip validation
    return null
  } catch {
    return 'Could not reach the provider API to validate the key'
  }
}

export const GET = withAdmin(async () => {
  const providers = await prisma.availableProvider.findMany({
    select: {
      id: true,
      slot: true,
      providerKey: true,
      providerName: true,
      label: true,
      keyPrefix: true,
      isEnabled: true,
      isDefault: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(providers)
})

const createSchema = z.object({
  // The key is encrypted verbatim — validate presence without altering the value.
  apiKey: z.string().refine((v) => v.trim().length > 0, 'apiKey is required'),
  slot: z.enum(['COPY', 'IMAGE'], {
    errorMap: () => ({ message: 'slot must be COPY or IMAGE' }),
  }),
  providerName: z.string().optional(),
  label: z.string().optional(),
  isDefault: z.boolean().optional(),
})

export const POST = withAdmin(async (req: NextRequest) => {
  const body = await parseBody(req, createSchema)
  if (body.response) return body.response
  const { apiKey, slot, providerName: bodyProviderName, label: bodyLabel, isDefault } = body.data

  const detected = detectProvider(apiKey)
  const providerName = detected?.providerName ?? bodyProviderName?.trim()?.toLowerCase()
  const label = bodyLabel?.trim() ?? detected?.autoLabel

  if (!providerName) {
    return NextResponse.json({ error: 'providerName is required for unrecognized API key formats' }, { status: 400 })
  }
  if (!label) {
    return NextResponse.json({ error: 'label is required for unrecognized API key formats' }, { status: 400 })
  }

  const validationError = await validateApiKey(providerName, apiKey)
  if (validationError) {
    return NextResponse.json({ error: 'API key validation failed', detail: validationError }, { status: 422 })
  }

  const providerKey = `${providerName}-${Date.now()}`
  // Store only a masked last-4 suffix — never a leading slice of the secret.
  const keyPrefix = `…${apiKey.slice(-4)}`
  const encryptedApiKey = encrypt(apiKey)

  // No wrapper-supplied team yet (Task 7/8 flips withAdmin → withTeamAdmin and
  // will pass the real value here).
  const teamId: string | null = null

  // Clearing the prior default + creating the new row must be atomic so a
  // failure can't leave the slot with zero (or two) defaults.
  const provider = await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.availableProvider.updateMany({ where: { slot }, data: { isDefault: false } })
    }
    return tx.availableProvider.create({
      data: { teamId, slot, providerKey, providerName, label, keyPrefix, encryptedApiKey, isEnabled: true, isDefault: isDefault ?? false },
      select: { id: true, slot: true, providerKey: true, providerName: true, label: true, keyPrefix: true, isEnabled: true, isDefault: true, createdAt: true },
    })
  })

  return NextResponse.json(provider, { status: 201 })
})
