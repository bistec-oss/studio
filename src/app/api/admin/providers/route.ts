import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin, parseBody } from '@/lib/api/handler'
import { encrypt } from '@/lib/crypto'
import { MOCK_AI, mockProviderKeyValidation } from '@/lib/testHooks'
import { IMAGE_PROVIDERS, canServeSlot } from '@/providers/imageCapabilities'

function detectProvider(apiKey: string): { providerName: string; autoLabel: string } | null {
  if (apiKey.startsWith('sk-ant-')) return { providerName: 'anthropic', autoLabel: 'Claude (Anthropic)' }
  if (apiKey.startsWith('sk-')) return { providerName: 'openai', autoLabel: 'GPT (OpenAI)' }
  // Google API keys (Gemini): IMAGE only, which canServeSlot enforces (005 FR-13).
  if (apiKey.startsWith('AIza')) return { providerName: 'gemini', autoLabel: 'Gemini (Google)' }
  return null
}

async function validateApiKey(providerName: string, apiKey: string): Promise<string | null> {
  // Test seam (005 NFR-06): E2E registers fake keys, which the live models
  // endpoints would reject, so no suite could create a usable row.
  if (MOCK_AI) {
    const result = mockProviderKeyValidation(apiKey)
    return result.ok ? null : (result.error ?? 'Provider rejected the key')
  }
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
    } else if (providerName === 'gemini') {
      // The key goes in the header, never in a ?key= query string.
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
        headers: { 'x-goog-api-key': apiKey },
      })
      if (!res.ok) return `Gemini API rejected the key (HTTP ${res.status})`
    }
    // Unknown providers: skip validation
    return null
  } catch {
    return 'Could not reach the provider API to validate the key'
  }
}

export const GET = withTeamAdmin(async (_req, _ctx, user) => {
  const providers = await prisma.availableProvider.findMany({
    where: { teamId: user.teamId },
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

export const POST = withTeamAdmin(async (req: NextRequest, _ctx, user) => {
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
  // 005 FR-04: refuse a pair the slot can't instantiate (e.g. an sk-ant- key
  // as IMAGE) before any live validation call.
  if (!canServeSlot(slot, providerName)) {
    return NextResponse.json({ error: `Provider ${providerName} cannot serve the ${slot} slot` }, { status: 400 })
  }

  const validationError = await validateApiKey(providerName, apiKey)
  if (validationError) {
    return NextResponse.json({ error: 'API key validation failed', detail: validationError }, { status: 422 })
  }

  const providerKey = `${providerName}-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`
  // Store only a masked last-4 suffix — never a leading slice of the secret.
  const keyPrefix = `…${apiKey.slice(-4)}`
  const encryptedApiKey = encrypt(apiKey)

  const teamId = user.teamId

  // Clearing the prior default + creating the new row must be atomic so a
  // failure can't leave the slot with zero (or two) defaults.
  const provider = await prisma.$transaction(async (tx) => {
    // 005 FR-02 (IMAGE only): a row registered while the slot has no enabled
    // default becomes the default; a later row only takes it when asked to. A
    // legacy incompatible IMAGE default doesn't count: the resolver skips it.
    // COPY is unchanged: default only when the request asks for it.
    let makeDefault = isDefault === true
    if (slot === 'IMAGE' && !makeDefault) {
      const enabledDefault = await tx.availableProvider.findFirst({
        where: { slot, teamId, isEnabled: true, isDefault: true, providerName: { in: [...IMAGE_PROVIDERS] } },
        select: { id: true },
      })
      makeDefault = !enabledDefault
    }
    if (makeDefault) {
      await tx.availableProvider.updateMany({ where: { slot, teamId }, data: { isDefault: false } })
    }
    return tx.availableProvider.create({
      data: { teamId, slot, providerKey, providerName, label, keyPrefix, encryptedApiKey, isEnabled: true, isDefault: makeDefault },
      select: { id: true, slot: true, providerKey: true, providerName: true, label: true, keyPrefix: true, isEnabled: true, isDefault: true, createdAt: true },
    })
  })

  return NextResponse.json(provider, { status: 201 })
})
