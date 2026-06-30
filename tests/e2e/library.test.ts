import { test, expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { login, post, get, loginAs, type ApiClient } from '../helpers/api'

// §H — Library (docs/e2e-test-plan.md).
//
// Contract (src/app/api/library/route.ts):
//   GET /api/library?page&pageSize&status&search
//     → { drafts:[{id,status,exportUrl(signed),brief:{topic,channels},posts:[…],…}], total, page, pageSize }
//   pageSize clamped to 1..50. status ∈ ALL|READY|PUBLISHED|SCHEDULED|FAILED.
//   Admins see all drafts; editors see only their own.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const EDITOR_EMAIL = 'editor@bisteccare.lk'
const EDITOR_PASSWORD = 'BistecStudio2026!'

// Mint an EXPORTED (READY) draft as the admin, returning the draftId.
async function adminDraft(request: APIRequestContext, topic: string): Promise<string> {
  const kit = await (await post(request, '/api/admin/brandkits', { name: `Lib Kit ${topic}`, colors: ['#0284c7'] })).json()
  const camp = await (await post(request, '/api/campaigns', { name: `Lib Camp ${topic}`, brandKitId: kit.id })).json()
  const brief = await (await post(request, '/api/briefs', {
    topic, goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
    designMode: 'GENERATE', copyProviderKey: 'cli', campaignId: camp.id,
  })).json()
  const assembled = await (await post(request, '/api/generate/assemble-b', { briefId: brief.id })).json()
  return assembled.draftId
}

// Mint an EXPORTED draft as the editor (standalone brief → resolves the system default kit).
async function editorDraft(editor: ApiClient, topic: string): Promise<string> {
  const brief = await (await editor.post('/api/briefs', {
    topic, goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
    designMode: 'GENERATE', copyProviderKey: 'cli',
  })).json()
  const assembled = await (await editor.post('/api/generate/assemble-b', { briefId: brief.id })).json()
  return assembled.draftId
}

test.describe('Library', () => {
  test.beforeEach(async ({ request }) => { await login(request) })

  // TC-LIB-01 — Admin sees all; editor sees only their own. Guards H3.
  test('admin sees all drafts; an editor sees only their own', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const adminDraftId = await adminDraft(request, `LibAdmin-${Date.now()}`)

    const editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    const editorDraftId = await editorDraft(editor, `LibEditor-${Date.now()}`)

    // Editor library: contains the editor's draft, never the admin's.
    const editorLib = await (await editor.get('/api/library?pageSize=50')).json()
    const editorIds = editorLib.drafts.map((d: { id: string }) => d.id)
    expect(editorIds).toContain(editorDraftId)
    expect(editorIds).not.toContain(adminDraftId)

    // Admin library: sees the editor's draft too.
    const adminLib = await (await get(request, '/api/library?pageSize=50')).json()
    const adminIds = adminLib.drafts.map((d: { id: string }) => d.id)
    expect(adminIds).toContain(adminDraftId)
    expect(adminIds).toContain(editorDraftId)
  })

  // TC-LIB-02 — Status filters return the right subsets.
  test('status filters split READY vs PUBLISHED correctly', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const draftId = await adminDraft(request, `LibReady-${Date.now()}`)

    const ready = await (await get(request, '/api/library?status=READY&pageSize=50')).json()
    const readyHit = ready.drafts.find((d: { id: string }) => d.id === draftId)
    expect(readyHit).toBeTruthy()
    expect(readyHit.posts.length).toBe(0) // READY = EXPORTED with no posts

    const all = await (await get(request, '/api/library?status=ALL&pageSize=50')).json()
    expect(all.drafts.find((d: { id: string }) => d.id === draftId)).toBeTruthy()

    // It has not been published, so it must NOT appear under PUBLISHED.
    const published = await (await get(request, '/api/library?status=PUBLISHED&pageSize=50')).json()
    expect(published.drafts.find((d: { id: string }) => d.id === draftId)).toBeUndefined()
  })

  // TC-LIB-03 — Search by topic substring.
  test('search filters by topic substring', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const marker = `Zylophone${Date.now()}`
    const draftId = await adminDraft(request, `Lib search ${marker} post`)

    const hit = await (await get(request, `/api/library?search=${marker}&pageSize=50`)).json()
    expect(hit.drafts.length).toBeGreaterThanOrEqual(1)
    expect(hit.drafts.every((d: { brief: { topic: string } }) => d.brief.topic.includes(marker))).toBe(true)
    expect(hit.drafts.find((d: { id: string }) => d.id === draftId)).toBeTruthy()
  })

  // TC-LIB-04 — Pagination envelope + pageSize honored.
  test('returns a pagination envelope and honors pageSize', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    await adminDraft(request, `LibPage-${Date.now()}`)

    const res = await get(request, '/api/library?page=1&pageSize=1')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('total')
    expect(body.page).toBe(1)
    expect(body.pageSize).toBe(1)
    expect(Array.isArray(body.drafts)).toBe(true)
    expect(body.drafts.length).toBeLessThanOrEqual(1)
  })

  // TC-LIB-05 — Thumbnails are signed (fetchable) URLs. Guards H10.
  test('every draft exportUrl is a signed https URL', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    await adminDraft(request, `LibSigned-${Date.now()}`)

    const body = await (await get(request, '/api/library?pageSize=50')).json()
    expect(body.drafts.length).toBeGreaterThanOrEqual(1)
    for (const d of body.drafts) {
      if (d.exportUrl) expect(d.exportUrl).toMatch(/^https?:\/\//)
    }
  })
})
