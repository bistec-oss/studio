import { test, expect } from '@playwright/test'
import { loginAs, waitForDraft, type ApiClient } from '../helpers/api'

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const MOCKED = () => process.env.MOCK_PUPPETEER === 'true'

async function createExportedDraft(api: ApiClient, topic: string) {
  const kit = await (
    await api.post('/api/admin/brandkits', { name: `Inline Kit ${topic}`, colors: ['#0284c7'] })
  ).json()
  const camp = await (
    await api.post('/api/campaigns', { name: `Inline Camp ${topic}`, brandKitId: kit.id })
  ).json()
  const brief = await (
    await api.post('/api/briefs', {
      topic,
      goal: 'g',
      tone: 'professional',
      channels: ['INSTAGRAM'],
      designMode: 'GENERATE',
      copyProviderKey: 'cli',
      campaignId: camp.id,
    })
  ).json()
  const assembleRes = await api.post('/api/generate/assemble-b', { briefId: brief.id })
  expect(assembleRes.status()).toBe(202)
  const { draftId } = await assembleRes.json()
  const draft = await waitForDraft(api, draftId)
  expect(draft.status).toBe('EXPORTED')
  return draft
}

// §T — Manual inline edit (synchronous save → new revision).
test.describe('§T — draft inline edit', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => {
    await api.dispose()
  })

  // TC-INLINE-01 — save edited HTML → new revision, pointer advances, re-rendered.
  test('inline-edit saves a new revision and advances the pointer', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline Save ${Date.now()}`)
    expect(draft.currentRevisionNumber).toBe(1)

    const edited =
      '<!doctype html><html><body style="width:1080px;height:1080px">Edited headline</body></html>'
    const res = await api.post(`/api/drafts/${draft.id}/inline-edit`, { html: edited })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.revisionId).toBeTruthy()
    expect(body.exportUrl).toMatch(/^https?:\/\//)

    const after = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(after.currentRevisionNumber).toBe(2)
    expect(after.htmlContent).toContain('Edited headline')

    const revisions = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()
    expect(
      revisions.some((r: { instruction: string }) => r.instruction === 'Manual inline edit'),
    ).toBe(true)
  })

  // TC-INLINE-02 — restore to the prior revision still works after an inline edit.
  test('the prior revision is restorable after an inline edit', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline Restore ${Date.now()}`)
    await api.post(`/api/drafts/${draft.id}/inline-edit`, {
      html: '<!doctype html><html><body style="width:1080px;height:1080px">v2</body></html>',
    })

    const restore = await api.post(`/api/drafts/${draft.id}/revisions/1/restore`, {})
    expect(restore.status()).toBe(200)
    const after = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(after.currentRevisionNumber).toBe(1)
  })

  // TC-INLINE-03 — empty html → 400; missing html → 400.
  test('rejects a missing/empty html body with 400', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline Bad ${Date.now()}`)
    const res = await api.post(`/api/drafts/${draft.id}/inline-edit`, {})
    expect(res.status()).toBe(400)

    const emptyRes = await api.post(`/api/drafts/${draft.id}/inline-edit`, { html: '' })
    expect(emptyRes.status()).toBe(400)
  })

  // TC-INLINE-04 — a foreign draft id is a 404 (no existence leak).
  test('an unknown draft id is 404', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const res = await api.post('/api/drafts/does-not-exist/inline-edit', {
      html: '<!doctype html><html><body>x</body></html>',
    })
    expect(res.status()).toBe(404)
  })
})
