import { test, expect } from '@playwright/test'
import { loginAs, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'

// §F — Export (docs/e2e-test-plan.md).
//
// Contract (src/app/api/generate/export/route.ts):
//   POST /api/generate/export {draftId}
//     → 200 {exportUrl}  (signed). Short-circuits if exportUrl already set.
//     → 422 {error} if the draft has no htmlContent and no exportUrl.
// Requires MOCK_AI + MOCK_PUPPETEER to mint a draft and re-render deterministically.
// EXP-01 / EXP-03 need a draft in a state the happy path never leaves, so they
// seed it directly via the test DB.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'

async function createExportedDraft(api: ApiClient): Promise<string> {
  const kit = await (await api.post('/api/admin/brandkits', { name: 'Export Kit', colors: ['#0284c7'] })).json()
  const camp = await (await api.post('/api/campaigns', { name: 'Export Campaign', brandKitId: kit.id })).json()
  const brief = await (await api.post('/api/briefs', {
    topic: 'Export Test', goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
    designMode: 'GENERATE', copyProviderKey: 'cli', campaignId: camp.id,
  })).json()
  const assembled = await (await api.post('/api/generate/assemble-b', { briefId: brief.id })).json()
  return assembled.draftId
}

test.describe('Export', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => { await api.dispose() })

  // TC-EXP-01 — Export re-renders a draft that has HTML but no exportUrl.
  test('export re-renders a draft missing its PNG', async () => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const draftId = await createExportedDraft(api)

    // Drop the export but keep the HTML.
    await prisma!.draft.update({ where: { id: draftId }, data: { exportUrl: null, status: 'IN_PROGRESS' } })

    const res = await api.post('/api/generate/export', { draftId })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.exportUrl).toMatch(/^https?:\/\//)

    const draft = await (await api.get(`/api/drafts/${draftId}`)).json()
    expect(draft.status).toBe('EXPORTED')
  })

  // TC-EXP-02 — Export short-circuits when an exportUrl already exists.
  test('export short-circuits and returns the existing signed URL', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draftId = await createExportedDraft(api) // already EXPORTED with an exportUrl

    const res = await api.post('/api/generate/export', { draftId })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.exportUrl).toMatch(/^https?:\/\//)
  })

  // TC-EXP-03 — Export of a draft with no HTML (and no export) → 422.
  test('export of a draft without HTML content returns 422', async () => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const draftId = await createExportedDraft(api)

    await prisma!.draft.update({ where: { id: draftId }, data: { htmlContent: null, exportUrl: null, status: 'IN_PROGRESS' } })

    const res = await api.post('/api/generate/export', { draftId })
    expect(res.status()).toBe(422)
  })
})
