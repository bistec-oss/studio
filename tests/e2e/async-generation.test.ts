import { test, expect } from '@playwright/test'
import { loginAs, waitForDraft, type ApiClient } from '../helpers/api'

// F1 — async generation + inline retry.
//
// Contract:
//   POST /api/generate/assemble-b {briefId}  → 202 { draftId }; draft starts
//     IN_PROGRESS and finishes EXPORTED / FAILED in the background.
//   POST /api/drafts/[id]/retry              → 202 (only when FAILED; else 409),
//     resets to IN_PROGRESS and re-runs generation.
//
// Deterministic failure via the "__FAIL_GEN_ONCE__" sentinel in the brief topic
// (testHooks.shouldMockGenerateFail) — fails the first design attempt, succeeds
// on retry. Requires MOCK_AI + MOCK_PUPPETEER in the app env.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'

async function briefFor(api: ApiClient, topic: string): Promise<string> {
  const kit = await (await api.post('/api/admin/brandkits', { name: `Async Kit ${topic}`, colors: ['#0284c7'] })).json()
  const camp = await (await api.post('/api/campaigns', { name: `Async Camp ${topic}`, brandKitId: kit.id })).json()
  const brief = await (await api.post('/api/briefs', {
    topic, goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
    designMode: 'GENERATE', copyProviderKey: 'cli', campaignId: camp.id,
  })).json()
  return brief.id
}

test.describe('Async generation + retry (F1)', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => { await api.dispose() })

  test('assemble returns 202 and the draft starts IN_PROGRESS then reaches EXPORTED', async () => {
    if (!MOCKED()) { test.skip(); return }
    const briefId = await briefFor(api, `Async OK ${Date.now()}`)

    const res = await api.post('/api/generate/assemble-b', { briefId })
    expect(res.status()).toBe(202)
    const { draftId } = await res.json()
    expect(draftId).toBeTruthy()

    const draft = await waitForDraft(api, draftId)
    expect(draft.status).toBe('EXPORTED')
    expect(draft.exportUrl).toMatch(/^https?:\/\//)
    // v1 revision recorded (F2) so the draft is immediately versionable.
    expect(draft.currentRevisionNumber).toBe(1)
  })

  test('a generation failure lands FAILED with a reason, then Retry recovers it', async () => {
    if (!MOCKED()) { test.skip(); return }
    // __FAIL_GEN_ONCE__ → first design attempt throws, retry succeeds.
    const briefId = await briefFor(api, `__FAIL_GEN_ONCE__ ${Date.now()}`)

    const res = await api.post('/api/generate/assemble-b', { briefId })
    expect(res.status()).toBe(202)
    const { draftId } = await res.json()

    const failed = await waitForDraft(api, draftId)
    expect(failed.status).toBe('FAILED')
    expect(failed.failureReason).toBeTruthy()
    expect(failed.exportUrl).toBeNull()

    // Retry → re-runs in place; the second attempt succeeds.
    const retryRes = await api.post(`/api/drafts/${draftId}/retry`, {})
    expect(retryRes.status()).toBe(202)

    const recovered = await waitForDraft(api, draftId)
    expect(recovered.status).toBe('EXPORTED')
    expect(recovered.exportUrl).toMatch(/^https?:\/\//)
    expect(recovered.failureReason).toBeNull()
  })

  test('retry on a non-FAILED (EXPORTED) draft is a 409', async () => {
    if (!MOCKED()) { test.skip(); return }
    const briefId = await briefFor(api, `Async Guard ${Date.now()}`)
    const { draftId } = await (await api.post('/api/generate/assemble-b', { briefId })).json()
    await waitForDraft(api, draftId) // EXPORTED

    const retryRes = await api.post(`/api/drafts/${draftId}/retry`, {})
    expect(retryRes.status()).toBe(409)
  })
})
