import { test, expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { login, post, get } from '../helpers/api'
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

async function createExportedDraft(request: APIRequestContext): Promise<string> {
  const kit = await (await post(request, '/api/admin/brandkits', { name: 'Export Kit', colors: ['#0284c7'] })).json()
  const camp = await (await post(request, '/api/campaigns', { name: 'Export Campaign', brandKitId: kit.id })).json()
  const brief = await (await post(request, '/api/briefs', {
    topic: 'Export Test', goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
    designMode: 'GENERATE', copyProviderKey: 'cli', campaignId: camp.id,
  })).json()
  const assembled = await (await post(request, '/api/generate/assemble-b', { briefId: brief.id })).json()
  return assembled.draftId
}

test.describe('Export', () => {
  test.beforeEach(async ({ request }) => { await login(request) })

  // TC-EXP-01 — Export re-renders a draft that has HTML but no exportUrl.
  test('export re-renders a draft missing its PNG', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const draftId = await createExportedDraft(request)

    // Drop the export but keep the HTML.
    await prisma!.draft.update({ where: { id: draftId }, data: { exportUrl: null, status: 'IN_PROGRESS' } })

    const res = await post(request, '/api/generate/export', { draftId })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.exportUrl).toMatch(/^https?:\/\//)

    const draft = await (await get(request, `/api/drafts/${draftId}`)).json()
    expect(draft.status).toBe('EXPORTED')
  })

  // TC-EXP-02 — Export short-circuits when an exportUrl already exists.
  test('export short-circuits and returns the existing signed URL', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const draftId = await createExportedDraft(request) // already EXPORTED with an exportUrl

    const res = await post(request, '/api/generate/export', { draftId })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.exportUrl).toMatch(/^https?:\/\//)
  })

  // TC-EXP-03 — Export of a draft with no HTML (and no export) → 422.
  test('export of a draft without HTML content returns 422', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const draftId = await createExportedDraft(request)

    await prisma!.draft.update({ where: { id: draftId }, data: { htmlContent: null, exportUrl: null, status: 'IN_PROGRESS' } })

    const res = await post(request, '/api/generate/export', { draftId })
    expect(res.status()).toBe(422)
  })
})
