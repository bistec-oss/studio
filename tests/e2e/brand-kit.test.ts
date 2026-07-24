import { test, expect } from '@playwright/test'
import { loginAs, type ApiClient } from '../helpers/api'

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const EDITOR_EMAIL = 'editor@bisteccare.lk'
const EDITOR_PASSWORD = 'BistecStudio2026!'

// A tiny valid 1×1 PNG used as a real upload payload.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

test.describe('Brand kit management', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => { await api.dispose() })

  test('create kit with colors, fonts, logo, template', async () => {
    const res = await api.post('/api/admin/brandkits', {
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
    const tRes = await api.post(`/api/admin/brandkits/${kit.id}/templates`, {
      name: 'Event Post',
      htmlTemplate: '<html><body style="width:1080px;height:1080px;background:#0284c7">{{topic}}</body></html>',
    })
    expect(tRes.status()).toBe(201)
    const template = await tRes.json()
    expect(template.id).toBeTruthy()

    // Update colors
    const pRes = await api.patch(`/api/admin/brandkits/${kit.id}`, {
      colors: ['#0284c7', '#0f172a', '#7dd3fc'],
    })
    expect(pRes.status()).toBe(200)
    const updated = await pRes.json()
    expect(updated.colors).toContain('#7dd3fc')
  })

  test('brand voice prompt versioning', async () => {
    const kitRes = await api.post('/api/admin/brandkits', { name: 'Prompt Versioning Kit' })
    const kit = await kitRes.json()

    const v1 = await api.post(`/api/admin/brandkits/${kit.id}/prompts`, {
      content: 'Professional and concise brand voice.',
      createdBy: 'test',
    })
    expect(v1.status()).toBe(201)
    const p1 = await v1.json()
    expect(p1.version).toBe(1)
    expect(p1.isActive).toBe(true)

    const v2 = await api.post(`/api/admin/brandkits/${kit.id}/prompts`, {
      content: 'Bold and innovative brand voice.',
      createdBy: 'test',
    })
    const p2 = await v2.json()
    expect(p2.version).toBe(2)

    // Activate v2
    const activateRes = await api.post(`/api/admin/brandkits/${kit.id}/prompts/${p2.id}/activate`, {})
    expect(activateRes.status()).toBe(200)

    // List prompts — v2 should be active
    const listRes = await api.get(`/api/admin/brandkits/${kit.id}`)
    const detail = await listRes.json()
    const active = detail.prompts.find((p: { isActive: boolean }) => p.isActive)
    expect(active.version).toBe(2)
  })

  test('AI-assisted generate and improve return draft, not auto-saved', async () => {
    const kitRes = await api.post('/api/admin/brandkits', { name: 'AI Assist Kit' })
    const kit = await kitRes.json()

    const genRes = await api.post(`/api/admin/brandkits/${kit.id}/prompts/generate`, {
      description: 'Tech startup with a focus on AI products',
    })
    expect(genRes.status()).toBe(200)
    const gen = await genRes.json()
    expect(typeof gen.draft).toBe('string')
    expect(gen.draft.length).toBeGreaterThan(10)

    // Verify no prompt was auto-saved
    const detailRes = await api.get(`/api/admin/brandkits/${kit.id}`)
    const detail = await detailRes.json()
    expect(detail.prompts.length).toBe(0)
  })

  test('soft delete excludes kit from brief picker', async () => {
    const kitRes = await api.post('/api/admin/brandkits', { name: 'To Delete Kit' })
    const kit = await kitRes.json()

    const delRes = await api.del(`/api/admin/brandkits/${kit.id}`)
    expect(delRes.status()).toBe(204)

    // Deleted kit should not appear in list
    const listRes = await api.get('/api/admin/brandkits')
    const kits = await listRes.json()
    expect(kits.find((k: { id: string }) => k.id === kit.id)).toBeUndefined()
  })

  // TC-BK-02 — Single-default invariant (atomic toggle). Guards M1.
  test('creating a second default kit unsets the first', async () => {
    const aRes = await api.post('/api/admin/brandkits', { name: 'Default Kit A', isDefault: true })
    const a = await aRes.json()
    const bRes = await api.post('/api/admin/brandkits', { name: 'Default Kit B', isDefault: true })
    const b = await bRes.json()

    const kits = await (await api.get('/api/admin/brandkits')).json()
    const defaults = kits.filter((k: { isDefault: boolean }) => k.isDefault)
    // Exactly one default exists, and it is B (the most recent).
    expect(defaults.length).toBe(1)
    expect(defaults[0].id).toBe(b.id)
    const fetchedA = kits.find((k: { id: string }) => k.id === a.id)
    expect(fetchedA.isDefault).toBe(false)
  })

  // TC-BK-04 — Logo upload returns a public, anonymously-readable URL. Guards H10.
  test('logo upload returns a public URL readable without auth', async ({ request }) => {
    const kit = await (await api.post('/api/admin/brandkits', { name: 'Logo Upload Kit' })).json()

    const uploadRes = await api.multipart(`/api/admin/brandkits/${kit.id}/upload`, {
      file: { name: 'logo.png', mimeType: 'image/png', buffer: PNG_1x1 },
    })
    expect(uploadRes.status()).toBe(200)
    const uploaded = await uploadRes.json()
    expect(uploaded.url).toMatch(/^https?:\/\//)
    expect(uploaded.key).toBeTruthy()

    // The returned URL is public — an anonymous GET (no session cookie; MinIO is a
    // different origin so the :3001 cookie is never sent) returns the bytes.
    const anon = await request.get(uploaded.url, { headers: {} })
    expect(anon.status()).toBe(200)
  })

  // TC-BK-05 — LOGO artifact upload syncs BrandKit.logoUrl; url is public.
  test('LOGO artifact upload syncs the kit logoUrl', async () => {
    const kit = await (await api.post('/api/admin/brandkits', { name: 'Artifact Sync Kit' })).json()

    const artRes = await api.multipart(`/api/admin/brandkits/${kit.id}/artifacts`, {
      file: { name: 'brand-logo.png', mimeType: 'image/png', buffer: PNG_1x1 },
      type: 'LOGO',
      feedToAI: 'true',
    })
    expect(artRes.status()).toBe(201)
    const artifact = await artRes.json()
    expect(artifact.url).toMatch(/^https?:\/\//)
    expect(artifact.type).toBe('LOGO')

    // BrandKit.logoUrl now points at the uploaded artifact.
    const detail = await (await api.get(`/api/admin/brandkits/${kit.id}`)).json()
    expect(detail.logoUrl).toBe(artifact.url)
  })

  // TC-BK-06 — Deleting the LOGO artifact clears BrandKit.logoUrl. Guards M5.
  test('deleting a LOGO artifact clears the kit logoUrl', async () => {
    const kit = await (await api.post('/api/admin/brandkits', { name: 'Artifact Delete Kit' })).json()
    const artifact = await (await api.multipart(`/api/admin/brandkits/${kit.id}/artifacts`, {
      file: { name: 'logo.png', mimeType: 'image/png', buffer: PNG_1x1 },
      type: 'LOGO',
    })).json()

    // Precondition: logoUrl is set.
    let detail = await (await api.get(`/api/admin/brandkits/${kit.id}`)).json()
    expect(detail.logoUrl).toBe(artifact.url)

    const delRes = await api.del(`/api/admin/brandkits/${kit.id}/artifacts/${artifact.id}`)
    expect(delRes.status()).toBe(204)

    detail = await (await api.get(`/api/admin/brandkits/${kit.id}`)).json()
    expect(detail.logoUrl).toBeNull()
  })

  // TC-BK-10 — a SECOND logo upload does not clobber the primary.
  test('second LOGO upload keeps the first as primary', async () => {
    const kit = await (await api.post('/api/admin/brandkits', { name: 'Multi Logo Kit' })).json()

    const first = await (
      await api.multipart(`/api/admin/brandkits/${kit.id}/artifacts`, {
        file: { name: 'primary.png', mimeType: 'image/png', buffer: PNG_1x1 },
        type: 'LOGO',
      })
    ).json()
    const second = await (
      await api.multipart(`/api/admin/brandkits/${kit.id}/artifacts`, {
        file: { name: 'secondary.png', mimeType: 'image/png', buffer: PNG_1x1 },
        type: 'LOGO',
      })
    ).json()

    const detail = await (await api.get(`/api/admin/brandkits/${kit.id}`)).json()
    // First upload became + stayed primary; both LOGO artifacts are present.
    expect(detail.logoUrl).toBe(first.url)
    const logoTypes = detail.artifacts.filter((a: { type: string }) => a.type === 'LOGO')
    expect(logoTypes.map((a: { url: string }) => a.url).sort()).toEqual(
      [first.url, second.url].sort(),
    )
  })

  // TC-BK-11 — set primary via PATCH logoUrl (must match a LOGO artifact).
  test('set-primary PATCH accepts a LOGO artifact url and rejects a foreign url', async () => {
    const kit = await (await api.post('/api/admin/brandkits', { name: 'Set Primary Kit' })).json()
    const first = await (
      await api.multipart(`/api/admin/brandkits/${kit.id}/artifacts`, {
        file: { name: 'a.png', mimeType: 'image/png', buffer: PNG_1x1 },
        type: 'LOGO',
      })
    ).json()
    const second = await (
      await api.multipart(`/api/admin/brandkits/${kit.id}/artifacts`, {
        file: { name: 'b.png', mimeType: 'image/png', buffer: PNG_1x1 },
        type: 'LOGO',
      })
    ).json()

    const ok = await api.patch(`/api/admin/brandkits/${kit.id}`, { logoUrl: second.url })
    expect(ok.status()).toBe(200)
    const detail = await (await api.get(`/api/admin/brandkits/${kit.id}`)).json()
    expect(detail.logoUrl).toBe(second.url)

    // A URL that is not a LOGO artifact of this kit is rejected.
    const bad = await api.patch(`/api/admin/brandkits/${kit.id}`, {
      logoUrl: 'https://evil.example.com/x.png',
    })
    expect(bad.status()).toBe(400)
    void first
  })

  // TC-BK-12 — deleting the primary reassigns to a remaining logo (not null).
  test('deleting the primary reassigns logoUrl to a remaining logo', async () => {
    const kit = await (await api.post('/api/admin/brandkits', { name: 'Reassign Kit' })).json()
    const first = await (
      await api.multipart(`/api/admin/brandkits/${kit.id}/artifacts`, {
        file: { name: 'a.png', mimeType: 'image/png', buffer: PNG_1x1 },
        type: 'LOGO',
      })
    ).json()
    const second = await (
      await api.multipart(`/api/admin/brandkits/${kit.id}/artifacts`, {
        file: { name: 'b.png', mimeType: 'image/png', buffer: PNG_1x1 },
        type: 'LOGO',
      })
    ).json()

    // first is primary; delete it → logoUrl reassigns to second (still present).
    const del = await api.del(`/api/admin/brandkits/${kit.id}/artifacts/${first.id}`)
    expect(del.status()).toBe(204)
    const detail = await (await api.get(`/api/admin/brandkits/${kit.id}`)).json()
    expect(detail.logoUrl).toBe(second.url)
  })

  // TC-BK-07 — Upload size + MIME validation. Guards H8.
  test('oversized upload and SVG to /briefs/images are rejected with 400', async () => {
    const kit = await (await api.post('/api/admin/brandkits', { name: 'Validation Kit' })).json()

    // >10MB file → 400 (size cap).
    const big = Buffer.alloc(11 * 1024 * 1024, 0)
    const bigRes = await api.multipart(`/api/admin/brandkits/${kit.id}/upload`, {
      file: { name: 'big.png', mimeType: 'image/png', buffer: big },
    })
    expect(bigRes.status()).toBe(400)

    // SVG to /briefs/images → 400 (MIME allow-list excludes script-bearing SVG).
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    const svgRes = await api.multipart('/api/briefs/images', {
      file: { name: 'x.svg', mimeType: 'image/svg+xml', buffer: svg },
    })
    expect(svgRes.status()).toBe(400)
  })

  // TC-BK-09 — logoUrl must be an http(s) URL: data: URIs are rejected at every
  // write surface (a 136k base64 logoUrl once blew the design prompt to 277k
  // chars); clearing with null stays allowed. Guards FR-10 (async-draft-actions).
  test('data: URI logoUrl is rejected on create and PATCH; null clears it', async () => {
    const dataUri = `data:image/png;base64,${PNG_1x1.toString('base64')}`

    // POST create with a data: URI → 400.
    const createRes = await api.post('/api/admin/brandkits', {
      name: 'Data URI Kit',
      logoUrl: dataUri,
    })
    expect(createRes.status()).toBe(400)

    // PATCH an existing kit with a data: URI → 400, logoUrl untouched.
    const kit = await (await api.post('/api/admin/brandkits', {
      name: 'Logo Hygiene Kit',
      logoUrl: 'https://example.com/logo.png',
    })).json()
    const patchRes = await api.patch(`/api/admin/brandkits/${kit.id}`, { logoUrl: dataUri })
    expect(patchRes.status()).toBe(400)
    let detail = await (await api.get(`/api/admin/brandkits/${kit.id}`)).json()
    expect(detail.logoUrl).toBe('https://example.com/logo.png')

    // PATCH with null → 200 (clearing the logo stays allowed).
    const clearRes = await api.patch(`/api/admin/brandkits/${kit.id}`, { logoUrl: null })
    expect(clearRes.status()).toBe(200)
    detail = await (await api.get(`/api/admin/brandkits/${kit.id}`)).json()
    expect(detail.logoUrl).toBeNull()
  })

  // TC-BK-08 — Non-admin (editor) cannot write brand kits. Guards H4.
  test('non-admin cannot create or mutate a brand kit', async ({ request }) => {
    const editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    try {
      const createRes = await editor.post('/api/admin/brandkits', { name: 'Editor Kit Attempt' })
      expect(createRes.status()).toBe(403)
    } finally {
      await editor.dispose()
    }
  })
})
