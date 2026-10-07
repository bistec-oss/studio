import { test, expect, type APIRequestContext } from '@playwright/test'
import { loginAs, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable, NO_DB_MSG } from '../helpers/db'

const ADMIN_EMAIL = 'admin@bisteccare.lk' // super admin
const ADMIN_PASSWORD = 'BistecStudio2026!'

// Every case runs in its OWN freshly created team (soft-deleted afterwards), so
// the cases don't depend on each other's order or on rows left behind in the
// shared test DB, and never disturb the seeded Bistec team's provider defaults
// (005 T1: the first row in a slot now becomes its default, FR-02).
// Key validation runs through the MOCK_AI seam (mockProviderKeyValidation):
// a key containing "invalid" is rejected with 422, anything else passes.
async function freshTeamSession(request: APIRequestContext, label: string) {
  const sa = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  const name = `Provider-Suite ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const teamRes = await sa.post('/api/admin/teams', { name })
  expect(teamRes.status()).toBe(201)
  const team = await teamRes.json()
  // A super admin can make any live team active, member or not.
  const api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD, { team: name })
  return {
    api,
    async dispose() {
      await api.dispose()
      await sa.del(`/api/admin/teams/${team.id}`)
      await sa.dispose()
    },
  }
}

type ProviderRow = { id: string; slot: string; providerName: string; isEnabled: boolean; isDefault: boolean }

test.describe('Provider registration', () => {
  let api: ApiClient
  let session: Awaited<ReturnType<typeof freshTeamSession>>
  test.beforeEach(async ({ request }, testInfo) => {
    session = await freshTeamSession(request, testInfo.title.slice(0, 24))
    api = session.api
  })
  test.afterEach(async () => { await session.dispose() })

  test('sk-ant- prefix auto-detects Anthropic', async () => {
    // Use a clearly-invalid key so the API validation call fails gracefully.
    // We're testing prefix detection, not live validation.
    const res = await api.post('/api/admin/providers', {
      apiKey: 'sk-ant-test-key-abc123',
      slot: 'COPY',
    })
    // The MOCK_AI key-validation seam accepts any key without "invalid".
    expect(res.status()).toBe(201)
    expect((await res.json()).providerName).toBe('anthropic')
  })

  test('sk- prefix auto-detects OpenAI', async () => {
    const res = await api.post('/api/admin/providers', {
      apiKey: 'sk-test-openai-fake-key',
      slot: 'COPY',
    })
    expect(res.status()).toBe(201)
    expect((await res.json()).providerName).toBe('openai')
  })

  test('unknown prefix requires manual name + label', async () => {
    // Missing name for unknown key — should 400
    const res = await api.post('/api/admin/providers', {
      apiKey: 'gsk_abcdef123456',
      slot: 'COPY',
    })
    expect(res.status()).toBe(400)

    // With name + label — accepted
    const res2 = await api.post('/api/admin/providers', {
      apiKey: 'gsk_abcdef123456',
      slot: 'COPY',
      providerName: 'groq',
      label: 'Llama 3 (Groq)',
    })
    expect(res2.status()).toBe(201)
  })

  test('registered provider appears in available list', async () => {
    // Register a fake provider (unknown prefix — skips validation)
    const regRes = await api.post('/api/admin/providers', {
      apiKey: 'testprovider_abc123456789',
      slot: 'COPY',
      providerName: 'testprovider',
      label: 'Test Model (TestProvider)',
    })
    expect(regRes.status()).toBe(201)

    const provider = await regRes.json()
    expect(provider.label).toBe('Test Model (TestProvider)')

    // It should appear in the available providers list
    const listRes = await api.get('/api/providers/available?slot=COPY')
    const available = await listRes.json()
    const found = available.find((p: { providerKey: string }) => p.providerKey === provider.providerKey)
    expect(found).toBeTruthy()
    expect(found.label).toBe('Test Model (TestProvider)')

    // Full API key never returned
    expect(found.encryptedApiKey).toBeUndefined()
    expect(found.apiKey).toBeUndefined()

    // Disable → removed from available list
    await api.patch(`/api/admin/providers/${provider.id}`, { isEnabled: false })
    const listRes2 = await api.get('/api/providers/available?slot=COPY')
    const available2 = await listRes2.json()
    expect(available2.find((p: { providerKey: string }) => p.providerKey === provider.providerKey)).toBeUndefined()

    // Cleanup
    await api.del(`/api/admin/providers/${provider.id}`)
  })

  // TC-PROV-06 — Only one default per slot (atomic toggle). Guards M1.
  test('setting a second default for a slot unsets the first', async () => {
    const a = await api.post('/api/admin/providers', {
      apiKey: 'provA_key_123456789', slot: 'COPY', providerName: 'provA', label: 'Provider A', isDefault: true,
    })
    expect(a.status()).toBe(201)
    const provA = await a.json()

    const b = await api.post('/api/admin/providers', {
      apiKey: 'provB_key_123456789', slot: 'COPY', providerName: 'provB', label: 'Provider B', isDefault: true,
    })
    expect(b.status()).toBe(201)
    const provB = await b.json()

    const list = await (await api.get('/api/providers/available?slot=COPY')).json()
    const defaults = list.filter((p: { isDefault: boolean }) => p.isDefault)
    expect(defaults.length).toBe(1)
    expect(defaults[0].providerKey).toBe(provB.providerKey)

    // Cleanup.
    await api.del(`/api/admin/providers/${provA.id}`)
    await api.del(`/api/admin/providers/${provB.id}`)
  })

  // ── 005 T1 fix round: the auto-default / disable-clears rules are IMAGE-only;
  // COPY behaves exactly as before T1.
  test('COPY: a first registration is NOT auto-default; disabling a COPY default keeps isDefault', async () => {
    const first = await (await api.post('/api/admin/providers', {
      apiKey: 'copyA_key_123456789', slot: 'COPY', providerName: 'copyA', label: 'Copy A',
    })).json()
    expect(first.isDefault).toBe(false)

    const def = await (await api.post('/api/admin/providers', {
      apiKey: 'copyB_key_123456789', slot: 'COPY', providerName: 'copyB', label: 'Copy B', isDefault: true,
    })).json()
    expect(def.isDefault).toBe(true)

    const off = await api.patch(`/api/admin/providers/${def.id}`, { isEnabled: false })
    expect(off.status()).toBe(200)
    expect((await off.json()).isDefault).toBe(true)
    const on = await api.patch(`/api/admin/providers/${def.id}`, { isEnabled: true })
    expect((await on.json()).isDefault).toBe(true)

    // Pre-T1: a disabled COPY row could be made the default.
    const off2 = await api.patch(`/api/admin/providers/${first.id}`, { isEnabled: false, isDefault: true })
    expect(off2.status()).toBe(200)
  })

  test('two registrations in the same millisecond get distinct providerKeys', async () => {
    const [a, b] = await Promise.all([
      api.post('/api/admin/providers', { apiKey: 'sk-image-race-a-0020', slot: 'IMAGE' }),
      api.post('/api/admin/providers', { apiKey: 'sk-image-race-b-0021', slot: 'IMAGE' }),
    ])
    expect([a.status(), b.status()]).toEqual([201, 201])
    expect((await a.json()).providerKey).not.toBe((await b.json()).providerKey)
  })

  // ── 005 T1: IMAGE slot rules (FR-02, FR-03, FR-04) ────────────────────────

  async function listImageRows(): Promise<ProviderRow[]> {
    const all: ProviderRow[] = await (await api.get('/api/admin/providers')).json()
    return all.filter((p) => p.slot === 'IMAGE')
  }

  async function registerImage(apiKey: string, extra: Record<string, unknown> = {}): Promise<ProviderRow> {
    const res = await api.post('/api/admin/providers', { apiKey, slot: 'IMAGE', ...extra })
    expect(res.status()).toBe(201)
    return res.json()
  }

  test('AC-05: the first IMAGE row becomes the default; a second row leaves it', async () => {
    const first = await registerImage('sk-image-first-000001')
    expect(first.providerName).toBe('openai')
    expect(first.isDefault).toBe(true)

    const second = await registerImage('sk-image-second-000002')
    expect(second.isDefault).toBe(false)

    const rows = await listImageRows()
    expect(rows.filter((r) => r.isDefault).map((r) => r.id)).toEqual([first.id])

    // A later row takes the default only when it asks for it.
    const third = await registerImage('sk-image-third-000003', { isDefault: true })
    expect(third.isDefault).toBe(true)
    expect((await listImageRows()).filter((r) => r.isDefault).map((r) => r.id)).toEqual([third.id])
  })

  test('AC-04: disabling the default clears isDefault; the next row registered becomes the default', async () => {
    const def = await registerImage('sk-image-default-000004')
    const other = await registerImage('sk-image-other-000005')
    expect(def.isDefault).toBe(true)

    const disabled = await api.patch(`/api/admin/providers/${def.id}`, { isEnabled: false })
    expect(disabled.status()).toBe(200)
    const body = await disabled.json()
    expect(body.isEnabled).toBe(false)
    expect(body.isDefault).toBe(false)
    expect((await listImageRows()).some((r) => r.isDefault)).toBe(false)

    // The slot now has no enabled default, so a new row takes it (FR-02).
    const next = await registerImage('sk-image-next-000006')
    expect(next.isDefault).toBe(true)
    expect((await listImageRows()).find((r) => r.id === other.id)?.isDefault).toBe(false)

    // A disabled row can't be made the default.
    expect((await api.patch(`/api/admin/providers/${def.id}`, { isDefault: true })).status()).toBe(400)
    expect(
      (await api.patch(`/api/admin/providers/${other.id}`, { isEnabled: false, isDefault: true })).status(),
    ).toBe(400)
  })

  test('FR-03: unsetting the default with PATCH {isDefault:false} is allowed', async () => {
    const def = await registerImage('sk-image-unset-000007')
    const res = await api.patch(`/api/admin/providers/${def.id}`, { isDefault: false })
    expect(res.status()).toBe(200)
    expect((await res.json()).isDefault).toBe(false)
    expect((await listImageRows()).some((r) => r.isDefault)).toBe(false)
  })

  test('AC-06: an sk-ant- key as IMAGE is refused with 400 and creates no row', async () => {
    const res = await api.post('/api/admin/providers', { apiKey: 'sk-ant-image-attempt-000008', slot: 'IMAGE' })
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toBe('Provider anthropic cannot serve the IMAGE slot')
    expect(await listImageRows()).toEqual([])

    // An unknown provider name is refused for IMAGE too.
    const unknown = await api.post('/api/admin/providers', {
      apiKey: 'gsk_image_attempt_000009', slot: 'IMAGE', providerName: 'groq', label: 'Groq',
    })
    expect(unknown.status()).toBe(400)
    expect((await unknown.json()).error).toBe('Provider groq cannot serve the IMAGE slot')
    expect(await listImageRows()).toEqual([])

    // An image-only provider is refused for COPY.
    const geminiCopy = await api.post('/api/admin/providers', {
      apiKey: 'gem_copy_attempt_000010', slot: 'COPY', providerName: 'gemini', label: 'Gemini',
    })
    expect(geminiCopy.status()).toBe(400)
    expect((await geminiCopy.json()).error).toBe('Provider gemini cannot serve the COPY slot')
  })

  test('AC-06: a PATCH cannot move a row into an incompatible slot/provider', async () => {
    const row = await registerImage('sk-image-patch-000011')
    const res = await api.patch(`/api/admin/providers/${row.id}`, { slot: 'COPY', providerName: 'anthropic' })
    expect(res.status()).toBe(200)
    const after = (await listImageRows()).find((r) => r.id === row.id)
    expect(after?.slot).toBe('IMAGE')
    expect(after?.providerName).toBe('openai')
  })

  test('AC-06: a legacy incompatible IMAGE row cannot be re-enabled or made default', async () => {
    test.skip(!dbAvailable, NO_DB_MSG)
    const me = await (await api.get('/api/me')).json()
    // Seed the legacy state directly — the POST route no longer allows it.
    const legacy = await prisma!.availableProvider.create({
      data: {
        teamId: me.activeTeamId, slot: 'IMAGE', providerKey: `legacy-anthropic-${Date.now()}`,
        providerName: 'anthropic', label: 'Legacy Anthropic as IMAGE', keyPrefix: '…0012',
        encryptedApiKey: 'not-a-real-ciphertext', isEnabled: false, isDefault: false,
      },
    })
    const enable = await api.patch(`/api/admin/providers/${legacy.id}`, { isEnabled: true })
    expect(enable.status()).toBe(400)
    expect((await enable.json()).error).toBe('Provider anthropic cannot serve the IMAGE slot')
    expect((await api.patch(`/api/admin/providers/${legacy.id}`, { isDefault: true })).status()).toBe(400)
    // Clean-up stays possible: a label edit and a delete still work.
    expect((await api.patch(`/api/admin/providers/${legacy.id}`, { label: 'renamed' })).status()).toBe(200)
    expect((await api.del(`/api/admin/providers/${legacy.id}`)).status()).toBe(204)
  })

  // ── 005 T8: Gemini (FR-13, AC-20). An AIza… key is detected as gemini with no
  // providerName in the body; validation goes through the MOCK_AI seam, never
  // the live Gemini models endpoint (mock-verified only, AC-21).
  const GEMINI_KEY = 'AIzaSy' + 'E2Egemini_fake_key_0123456789abcd' // AIzaSy + 33 chars

  test('AC-20: an AIza… key registers as gemini in the IMAGE slot and, as the first row, is the default', async () => {
    const res = await api.post('/api/admin/providers', { apiKey: GEMINI_KEY, slot: 'IMAGE' })
    expect(res.status()).toBe(201)
    const row = await res.json()
    expect(row.providerName).toBe('gemini')
    expect(row.label).toBe('Gemini (Google)')
    expect(row.isDefault).toBe(true)
    expect(row.keyPrefix).toBe('…abcd')
    expect(JSON.stringify(row)).not.toContain(GEMINI_KEY)
    expect((await listImageRows()).map((r) => [r.providerName, r.isDefault])).toEqual([['gemini', true]])
  })

  test('AC-20: a gemini row registered after an OpenAI default can be made the default', async () => {
    const openai = await registerImage('sk-image-before-gemini-0014')
    expect(openai.isDefault).toBe(true)
    const gemini = await registerImage(GEMINI_KEY)
    expect(gemini.providerName).toBe('gemini')
    expect(gemini.isDefault).toBe(false)

    const res = await api.patch(`/api/admin/providers/${gemini.id}`, { isDefault: true })
    expect(res.status()).toBe(200)
    expect((await res.json()).isDefault).toBe(true)
    expect((await listImageRows()).filter((r) => r.isDefault).map((r) => r.id)).toEqual([gemini.id])
  })

  test('AC-20: an AIza… key as COPY is refused with 400 and creates no row', async () => {
    const res = await api.post('/api/admin/providers', { apiKey: GEMINI_KEY, slot: 'COPY' })
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toBe('Provider gemini cannot serve the COPY slot')
    const all: ProviderRow[] = await (await api.get('/api/admin/providers')).json()
    expect(all).toEqual([])
  })

  test('NFR-06: the MOCK_AI key-validation seam rejects a key containing "invalid" with 422', async () => {
    const res = await api.post('/api/admin/providers', { apiKey: 'sk-invalid-image-key-0013', slot: 'IMAGE' })
    expect(res.status()).toBe(422)
    expect((await res.json()).error).toBe('API key validation failed')
    expect(await listImageRows()).toEqual([])
  })
})
