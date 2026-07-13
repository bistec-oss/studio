import { test, expect } from '@playwright/test'
import { loginAs, type ApiClient } from '../helpers/api'

// F5 — conversational brand-kit extraction from references.
//
// Contract:
//   POST /api/admin/brandkits/[id]/assistant/chat {messages}
//     → 200 { reply, suggestion: { voice, tone, style, fonts, colors } | null }
//   Apply reuses the existing endpoints:
//     POST /api/admin/brandkits/[id]/prompts {content}  → new active voice prompt
//     PATCH /api/admin/brandkits/[id] {colors}          → palette
//
// Under MOCK_AI the chat returns a deterministic ```brandkit suggestion and
// MOCK_PUPPETEER yields a fixed sampled palette, so no live vision/render runs.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const EDITOR_EMAIL = 'editor@bisteccare.lk'
const EDITOR_PASSWORD = 'BistecStudio2026!'

test.describe('Brand-kit assistant (F5)', () => {
  let admin: ApiClient
  test.beforeEach(async ({ request }) => { admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD) })
  test.afterEach(async () => { await admin.dispose() })

  test('chat returns a suggestion (voice + sampled colors), which applies to the kit', async () => {
    if (!MOCKED()) { test.skip(); return }
    const kit = await (await admin.post('/api/admin/brandkits', { name: `F5 Kit ${Date.now()}`, colors: [] })).json()

    const chatRes = await admin.post(`/api/admin/brandkits/${kit.id}/assistant/chat`, {
      messages: [{ role: 'user', content: 'Extract the brand voice and style from these references' }],
    })
    expect(chatRes.status()).toBe(200)
    const { suggestion } = await chatRes.json()
    expect(suggestion).toBeTruthy()
    expect(typeof suggestion.voice).toBe('string')
    expect(suggestion.voice.length).toBeGreaterThan(0)
    expect(Array.isArray(suggestion.colors)).toBe(true)
    expect(suggestion.colors.length).toBeGreaterThan(0)
    expect(suggestion.colors[0]).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(Array.isArray(suggestion.fonts)).toBe(true)

    // Apply voice + colors via the existing endpoints (as the panel does).
    const promptRes = await admin.post(`/api/admin/brandkits/${kit.id}/prompts`, { content: suggestion.voice })
    expect(promptRes.status()).toBe(201)
    const patchRes = await admin.patch(`/api/admin/brandkits/${kit.id}`, { colors: suggestion.colors })
    expect(patchRes.status()).toBe(200)

    // The kit now carries the applied palette and an active voice prompt.
    const kitAfter = await (await admin.get(`/api/admin/brandkits/${kit.id}`)).json()
    expect(kitAfter.colors).toEqual(suggestion.colors)
    expect(kitAfter.prompts.some((p: { isActive: boolean; content: string }) => p.isActive && p.content === suggestion.voice)).toBe(true)
  })

  test('chat on a missing kit is 404', async () => {
    if (!MOCKED()) { test.skip(); return }
    const res = await admin.post('/api/admin/brandkits/does-not-exist/assistant/chat', {
      messages: [{ role: 'user', content: 'extract' }],
    })
    expect(res.status()).toBe(404)
  })

  test('an editor cannot use the brand-kit assistant', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const kit = await (await admin.post('/api/admin/brandkits', { name: `F5 RBAC ${Date.now()}`, colors: [] })).json()
    const editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    try {
      const res = await editor.post(`/api/admin/brandkits/${kit.id}/assistant/chat`, {
        messages: [{ role: 'user', content: 'extract' }],
      })
      expect(res.status()).toBe(403)
    } finally {
      await editor.dispose()
    }
  })
})
