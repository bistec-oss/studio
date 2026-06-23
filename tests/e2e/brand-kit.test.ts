import { test, expect } from '@playwright/test'
import { login, post, get, patch, del } from '../helpers/api'

test.describe('Brand kit management', () => {
  test.beforeEach(async ({ request }) => { await login(request) })

  test('create kit with colors, fonts, logo, template', async ({ request }) => {
    const res = await post(request, '/api/admin/brandkits', {
      name: 'E2E Test Kit',
      colors: ['#0284c7', '#0f172a'],
      fonts: [{ name: 'Inter', url: 'https://fonts.gstatic.com/inter.woff2' }],
      logoUrl: null,
    })
    expect(res.status()).toBe(201)
    const kit = await res.json()
    expect(kit.id).toBeTruthy()
    expect(kit.colors).toContain('#0284c7')

    // Add a template
    const tRes = await post(request, `/api/admin/brandkits/${kit.id}/templates`, {
      name: 'Event Post',
      htmlTemplate: '<html><body style="width:1080px;height:1080px;background:#0284c7">{{topic}}</body></html>',
    })
    expect(tRes.status()).toBe(201)
    const template = await tRes.json()
    expect(template.id).toBeTruthy()

    // Update colors
    const pRes = await patch(request, `/api/admin/brandkits/${kit.id}`, {
      colors: ['#0284c7', '#0f172a', '#7dd3fc'],
    })
    expect(pRes.status()).toBe(200)
    const updated = await pRes.json()
    expect(updated.colors).toContain('#7dd3fc')
  })

  test('brand voice prompt versioning', async ({ request }) => {
    const kitRes = await post(request, '/api/admin/brandkits', { name: 'Prompt Versioning Kit' })
    const kit = await kitRes.json()

    const v1 = await post(request, `/api/admin/brandkits/${kit.id}/prompts`, {
      content: 'Professional and concise brand voice.',
      createdBy: 'test',
    })
    expect(v1.status()).toBe(201)
    const p1 = await v1.json()
    expect(p1.version).toBe(1)
    expect(p1.isActive).toBe(true)

    const v2 = await post(request, `/api/admin/brandkits/${kit.id}/prompts`, {
      content: 'Bold and innovative brand voice.',
      createdBy: 'test',
    })
    const p2 = await v2.json()
    expect(p2.version).toBe(2)

    // Activate v2
    const activateRes = await post(request, `/api/admin/brandkits/${kit.id}/prompts/${p2.id}/activate`, {})
    expect(activateRes.status()).toBe(200)

    // List prompts — v2 should be active
    const listRes = await get(request, `/api/admin/brandkits/${kit.id}`)
    const detail = await listRes.json()
    const active = detail.prompts.find((p: { isActive: boolean }) => p.isActive)
    expect(active.version).toBe(2)
  })

  test('AI-assisted generate and improve return draft, not auto-saved', async ({ request }) => {
    const kitRes = await post(request, '/api/admin/brandkits', { name: 'AI Assist Kit' })
    const kit = await kitRes.json()

    const genRes = await post(request, `/api/admin/brandkits/${kit.id}/prompts/generate`, {
      description: 'Tech startup with a focus on AI products',
    })
    expect(genRes.status()).toBe(200)
    const gen = await genRes.json()
    expect(typeof gen.draft).toBe('string')
    expect(gen.draft.length).toBeGreaterThan(10)

    // Verify no prompt was auto-saved
    const detailRes = await get(request, `/api/admin/brandkits/${kit.id}`)
    const detail = await detailRes.json()
    expect(detail.prompts.length).toBe(0)
  })

  test('soft delete excludes kit from brief picker', async ({ request }) => {
    const kitRes = await post(request, '/api/admin/brandkits', { name: 'To Delete Kit' })
    const kit = await kitRes.json()

    const delRes = await del(request, `/api/admin/brandkits/${kit.id}`)
    expect(delRes.status()).toBe(204)

    // Deleted kit should not appear in list
    const listRes = await get(request, '/api/admin/brandkits')
    const kits = await listRes.json()
    expect(kits.find((k: { id: string }) => k.id === kit.id)).toBeUndefined()
  })
})
