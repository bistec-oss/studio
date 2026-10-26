import { test, expect } from '@playwright/test'
import { loginAs, type ApiClient } from '../helpers/api'
import { pageLogin } from '../helpers/ui'

// §AK (docs/e2e-test-plan.md): 031 FR-28 and FR-29, the design-rule upgrade in
// the campaign briefing editor.
//
// Contract:
//   POST /api/campaigns/[id]/briefing/upgrade { text, baseVersion }
//     -> 200 { outcome: 'edits' | 'none', ... } (the kit route's shape)
//     -> 409 STALE_BASE | 404 | 403 | 400
//
// Under MOCK_AI the reply is the 007 seam (`buildMockKitUpgradeReply`), so the
// real detector, validation and provenance run and no model is called. The
// recorder (GET/DELETE /api/test/model-calls) shows a `briefing-upgrade` record
// on the ASSISTANT_BRIEFING surface.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const ADMIN_EMAIL = 'admin@bisteccare.lk'
const EDITOR_EMAIL = 'editor@bisteccare.lk'
const PASSWORD = 'BistecStudio2026!'
const CALLS = '/api/test/model-calls'

const TEXT =
  'Audience: final-year students. Give the logo generous clear space. Keep the logo a similar size to the wordmark.'

interface Call { label: string | null; surface: string }

async function briefingCalls(api: ApiClient): Promise<Call[]> {
  const res = await api.get(CALLS)
  expect(res.status()).toBe(200)
  const { calls } = (await res.json()) as { calls: Call[] }
  return calls.filter((c) => c.label === 'briefing-upgrade')
}

async function makeCampaign(api: ApiClient, label: string, briefing?: string): Promise<{ id: string; name: string }> {
  const name = `BU ${label} ${Date.now()}`
  const res = await api.post('/api/campaigns', { name })
  expect(res.status()).toBe(201)
  const camp = await res.json()
  if (briefing !== undefined) {
    expect((await api.post(`/api/campaigns/${camp.id}/briefing`, { content: briefing })).status()).toBe(201)
  }
  return { id: camp.id, name }
}

function upgrade(api: ApiClient, id: string, text: string, baseVersion = 1) {
  return api.post(`/api/campaigns/${id}/briefing/upgrade`, { text, baseVersion })
}

const panel = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Design rules' })

test.describe.configure({ mode: 'serial' })

test.describe('Briefing design-rule upgrade (031)', () => {
  let admin: ApiClient

  test.beforeEach(async ({ request }) => {
    admin = await loginAs(request, ADMIN_EMAIL, PASSWORD)
    if (MOCKED()) expect((await admin.del(CALLS)).status()).toBe(204)
  })
  test.afterEach(async () => {
    await admin.dispose()
  })

  test('TC-BU-01: the editor flags vague phrases and Upgrade proposes edits through the briefing route', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(120_000)
    const camp = await makeCampaign(admin, '01', TEXT)

    await pageLogin(page)
    await page.goto(`/campaigns/${camp.id}`)
    await page.getByRole('button', { name: 'Edit as new version' }).click()
    await expect(panel(page).getByRole('list', { name: 'Flagged phrases' }).getByRole('listitem')).toHaveCount(2)

    const upgraded = page.waitForResponse(
      (r) => r.url().endsWith(`/api/campaigns/${camp.id}/briefing/upgrade`) && r.request().method() === 'POST',
    )
    await panel(page).getByRole('button', { name: 'Upgrade' }).click()
    const res = await upgraded
    expect(res.status()).toBe(200)
    expect((await res.json()).baseVersion).toBe(1)
    await expect(panel(page).getByRole('list', { name: 'Proposed edits' }).getByRole('listitem')).toHaveCount(2)
  })

  test('TC-BU-02: accepting an edit changes the textarea and Save makes a new version', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(120_000)
    const camp = await makeCampaign(admin, '02', TEXT)

    await pageLogin(page)
    await page.goto(`/campaigns/${camp.id}`)
    await page.getByRole('button', { name: 'Edit as new version' }).click()
    const box = page.getByRole('textbox', { name: 'Briefing' })
    await expect(box).toHaveValue(TEXT)
    await panel(page).getByRole('button', { name: 'Upgrade' }).click()
    const edits = panel(page).getByRole('list', { name: 'Proposed edits' }).getByRole('listitem')
    await expect(edits).toHaveCount(2)

    await edits.first().getByRole('button', { name: 'Accept' }).click()
    await expect(box).not.toHaveValue(TEXT)
    const next = await box.inputValue()

    const saved = page.waitForResponse(
      (r) => r.url().endsWith(`/api/campaigns/${camp.id}/briefing`) && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Save as new version' }).click()
    expect((await saved).status()).toBe(201)

    const versions = (await (await admin.get(`/api/campaigns/${camp.id}/briefing`)).json()) as Array<{
      version: number
      isActive: boolean
      content: string
    }>
    expect(versions).toHaveLength(2)
    expect(versions.find((v) => v.isActive)!.content).toBe(next)
  })

  test('TC-BU-03: a team editor gets 403 from the route and no model is called', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const camp = await makeCampaign(admin, '03', TEXT)
    const editor = await loginAs(request, EDITOR_EMAIL, PASSWORD)
    try {
      expect((await upgrade(editor, camp.id, TEXT)).status()).toBe(403)
    } finally {
      await editor.dispose()
    }
    expect(await briefingCalls(admin)).toHaveLength(0)
  })

  test('TC-BU-04: a stale base is 409 STALE_BASE with the active version and no model call', async () => {
    if (!MOCKED()) { test.skip(); return }
    const camp = await makeCampaign(admin, '04', TEXT)
    expect((await admin.post(`/api/campaigns/${camp.id}/briefing`, { content: `${TEXT} Second.` })).status()).toBe(201)

    const stale = await upgrade(admin, camp.id, TEXT, 1)
    expect(stale.status()).toBe(409)
    expect(await stale.json()).toEqual({ code: 'STALE_BASE', activeVersion: 2 })
    expect(await briefingCalls(admin)).toHaveLength(0)
    expect((await upgrade(admin, camp.id, TEXT, 2)).status()).toBe(200)
  })

  test('TC-BU-05: the model-calls record shows briefing-upgrade on the briefing surface', async () => {
    if (!MOCKED()) { test.skip(); return }
    const camp = await makeCampaign(admin, '05', TEXT)
    const res = await upgrade(admin, camp.id, TEXT)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.outcome).toBe('edits')
    expect(body.edits.length).toBeGreaterThan(0)
    const calls = await briefingCalls(admin)
    expect(calls).toHaveLength(1)
    expect(calls[0].surface).toBe('ASSISTANT_BRIEFING')
    const all = (await (await admin.get(CALLS)).json()).calls as Call[]
    expect(all.filter((c) => c.label === 'kit-upgrade')).toHaveLength(0)
  })
})
