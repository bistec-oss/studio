import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
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

export async function GET(req: NextRequest) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

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
}

export async function POST(req: NextRequest) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  const body = await req.json()
  const { apiKey, slot, providerName: bodyProviderName, label: bodyLabel, isDefault } = body

  if (!apiKey?.trim()) return NextResponse.json({ error: 'apiKey is required' }, { status: 400 })
  if (!slot || !['COPY', 'IMAGE'].includes(slot)) {
    return NextResponse.json({ error: 'slot must be COPY or IMAGE' }, { status: 400 })
  }

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

  // Clearing the prior default + creating the new row must be atomic so a
  // failure can't leave the slot with zero (or two) defaults.
  const provider = await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.availableProvider.updateMany({ where: { slot }, data: { isDefault: false } })
    }
    return tx.availableProvider.create({
      data: { slot, providerKey, providerName, label, keyPrefix, encryptedApiKey, isEnabled: true, isDefault: isDefault ?? false },
      select: { id: true, slot: true, providerKey: true, providerName: true, label: true, keyPrefix: true, isEnabled: true, isDefault: true, createdAt: true },
    })
  })

  return NextResponse.json(provider, { status: 201 })
}
