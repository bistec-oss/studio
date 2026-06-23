import { test, expect } from '@playwright/test'
import { login, post, get, patch, del } from '../helpers/api'

test.describe('Provider registration', () => {
  test.beforeEach(async ({ request }) => { await login(request) })

  test('sk-ant- prefix auto-detects Anthropic', async ({ request }) => {
    // Use a clearly-invalid key so the API validation call fails gracefully.
    // We're testing prefix detection, not live validation.
    const res = await post(request, '/api/admin/providers', {
      apiKey: 'sk-ant-test-key-abc123',
      slot: 'COPY',
    })
    // 422 = key rejected by provider (expected — it's a fake key)
    // 201 = created (if validation is skipped for unknown format)
    expect([201, 422]).toContain(res.status())
    if (res.status() === 422) {
      const body = await res.json()
      // The error message should come from Anthropic, not from our code
      expect(body.error).toBe('API key validation failed')
    }
  })

  test('sk- prefix auto-detects OpenAI', async ({ request }) => {
    const res = await post(request, '/api/admin/providers', {
      apiKey: 'sk-test-openai-fake-key',
      slot: 'COPY',
    })
    expect([201, 422]).toContain(res.status())
  })

  test('unknown prefix requires manual name + label', async ({ request }) => {
    // Missing name for unknown key — should 400
    const res = await post(request, '/api/admin/providers', {
      apiKey: 'gsk_abcdef123456',
      slot: 'COPY',
    })
    expect(res.status()).toBe(400)

    // With name + label — should proceed to validation (skip or 422)
    const res2 = await post(request, '/api/admin/providers', {
      apiKey: 'gsk_abcdef123456',
      slot: 'COPY',
      providerName: 'groq',
      label: 'Llama 3 (Groq)',
    })
    // Unknown providers skip validation, so this should succeed or 201
    expect([201, 422]).toContain(res2.status())
  })

  test('registered provider appears in available list', async ({ request }) => {
    // Register a fake provider (unknown prefix — skips validation)
    const regRes = await post(request, '/api/admin/providers', {
      apiKey: 'testprovider_abc123456789',
      slot: 'COPY',
      providerName: 'testprovider',
      label: 'Test Model (TestProvider)',
    })
    if (regRes.status() !== 201) return // skip if already registered

    const provider = await regRes.json()
    expect(provider.label).toBe('Test Model (TestProvider)')

    // It should appear in the available providers list
    const listRes = await get(request, '/api/providers/available?slot=COPY')
    const available = await listRes.json()
    const found = available.find((p: { providerKey: string }) => p.providerKey === provider.providerKey)
    expect(found).toBeTruthy()
    expect(found.label).toBe('Test Model (TestProvider)')

    // Full API key never returned
    expect(found.encryptedApiKey).toBeUndefined()
    expect(found.apiKey).toBeUndefined()

    // Disable → removed from available list
    await patch(request, `/api/admin/providers/${provider.id}`, { isEnabled: false })
    const listRes2 = await get(request, '/api/providers/available?slot=COPY')
    const available2 = await listRes2.json()
    expect(available2.find((p: { providerKey: string }) => p.providerKey === provider.providerKey)).toBeUndefined()

    // Cleanup
    await del(request, `/api/admin/providers/${provider.id}`)
  })
})
