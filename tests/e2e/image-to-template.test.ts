import { test, expect } from '@playwright/test'
import { loginAs, type ApiClient } from '../helpers/api'

// F6 — upload an image → AI generates a reusable Path A template.
//
// Contract:
//   POST /api/admin/brandkits/[id]/templates/from-image (multipart: file, [aspectRatio])
//     → 200 { html, aspectRatio, sourceArtifact }
//   The source image is stored as a REFERENCE_IMAGE artifact; the returned HTML
//   is NOT saved (the admin reviews + saves via POST /templates).
//
// Under MOCK_AI the generated HTML is deterministic; MOCK_PUPPETEER makes the
// dimension probe return a square, so an un-overridden ratio is SQUARE.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const EDITOR_EMAIL = 'editor@bisteccare.lk'
const EDITOR_PASSWORD = 'BistecStudio2026!'

// 1×1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)
const filePart = () => ({ name: 'ref.png', mimeType: 'image/png', buffer: PNG })

test.describe('Image → Path A template (F6)', () => {
  let admin: ApiClient
  test.beforeEach(async ({ request }) => { admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD) })
  test.afterEach(async () => { await admin.dispose() })

  test('generates template HTML + stores a source artifact; the HTML then saves as a template', async () => {
    if (!MOCKED()) { test.skip(); return }
    const kit = await (await admin.post('/api/admin/brandkits', { name: `F6 Kit ${Date.now()}`, colors: ['#0284c7'] })).json()

    const res = await admin.multipart(`/api/admin/brandkits/${kit.id}/templates/from-image`, { file: filePart() })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.html).toContain('<html')
    expect(body.aspectRatio).toBe('SQUARE') // inferred from the (mock) square probe
    expect(body.sourceArtifact.type).toBe('REFERENCE_IMAGE')

    // The source image is retained as an artifact.
    const artifacts = await (await admin.get(`/api/admin/brandkits/${kit.id}/artifacts`)).json()
    expect(artifacts.some((a: { type: string }) => a.type === 'REFERENCE_IMAGE')).toBe(true)

    // The generated HTML saves through the normal template flow.
    const saved = await admin.post(`/api/admin/brandkits/${kit.id}/templates`, {
      name: 'From image', htmlTemplate: body.html, aspectRatio: body.aspectRatio,
    })
    expect(saved.status()).toBe(201)
  })

  test('honors an explicit aspectRatio override', async () => {
    if (!MOCKED()) { test.skip(); return }
    const kit = await (await admin.post('/api/admin/brandkits', { name: `F6 Ovr ${Date.now()}`, colors: [] })).json()
    const res = await admin.multipart(`/api/admin/brandkits/${kit.id}/templates/from-image`, {
      file: filePart(),
      aspectRatio: 'PORTRAIT',
    })
    expect(res.status()).toBe(200)
    expect((await res.json()).aspectRatio).toBe('PORTRAIT')
  })

  test('an editor cannot generate templates from images', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const kit = await (await admin.post('/api/admin/brandkits', { name: `F6 RBAC ${Date.now()}`, colors: [] })).json()
    const editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    try {
      const res = await editor.multipart(`/api/admin/brandkits/${kit.id}/templates/from-image`, { file: filePart() })
      expect(res.status()).toBe(403)
    } finally {
      await editor.dispose()
    }
  })
})
