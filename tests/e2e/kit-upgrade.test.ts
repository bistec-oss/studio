import { test, expect, request as pwRequest, type Page } from '@playwright/test'
import { loginAs, type ApiClient } from '../helpers/api'
import { pageLogin } from '../helpers/ui'
import { isMeasurable } from '../../src/lib/designData/authoring/measurable'

// §AC (docs/e2e-test-plan.md): 007 brand-kit design-rule upgrade.
//
// Contract:
//   POST /api/admin/brandkits/[id]/prompts/upgrade { text, baseVersion }
//     -> 200 { outcome: 'edits', edits, rejected, candidates }
//     -> 200 { outcome: 'none', reason, rejected, candidates }
//     -> 409 STALE_BASE | 502 UPGRADE_PARSE_FAILED | 422 | 404 | 403 | 401 | 400
//   POST /api/admin/brandkits/[id]/prompts/improve -> { draft, lostRules }
//
// Under MOCK_AI the model reply is deterministic and picked by a sentinel in
// the posted text (src/lib/testHooks.ts), so the real detector, validation and
// provenance code run and no model is called. The recorder
// (GET/DELETE /api/test/model-calls) shows one `kit-upgrade` record per call
// that reached the model.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const ADMIN_EMAIL = 'admin@bisteccare.lk'
const EDITOR_EMAIL = 'editor@bisteccare.lk'
const CLIENTX_EMAIL = 'clientx.admin@users.bistec.internal'
const PASSWORD = 'BistecStudio2026!'

const HEARTS_TEXT = [
  'Hearts Academy posts use a teal-to-green gradient.',
  'Place the Hearts Academy and BISTEC Global logos in a compact pill with similar visual heights.',
  'Keep generous clear space around the lockup.',
  'The teal-to-green gradient is the primary canvas, with navy for accent bands.',
  'The photo sits in its own panel, with a soft edge where the photo meets the type.',
  'IRP is fine on-image.',
].join(' ')

const VOICE_TEXT = 'Voice: warm, confident, friendly, bold, modern, clean, professional, approachable.'

const THREE_PHRASES =
  'Give the logo generous clear space. Keep the logo a similar size to the wordmark. Leave plenty of breathing room around the logo.'

const SENTINEL = {
  unparseable: '__MOCK_UPGRADE_UNPARSEABLE__',
  none: '__MOCK_UPGRADE_NONE__',
  bad: '__MOCK_UPGRADE_BAD__',
  outOfRange: '__MOCK_UPGRADE_OUTOFRANGE__',
  dropRules: '__MOCK_IMPROVE_DROP_RULES__',
}

const CALLS = '/api/test/model-calls'
const RULE_KEYS = ['mark-size-match', 'logo-clear-space', 'canvas-share', 'edge-blend']

interface PromptRow { id: string; version: number; content: string; isActive: boolean }
interface EditJson { id: string; kind: string; quote: string; replacement: string; entryKey: string; provenance: string; rationale: string }
interface Rejected { candidateId: string; reason: string }

async function clearCalls(api: ApiClient) {
  expect((await api.del(CALLS)).status()).toBe(204)
}
async function upgradeCalls(api: ApiClient): Promise<unknown[]> {
  const res = await api.get(CALLS)
  expect(res.status()).toBe(200)
  const { calls } = (await res.json()) as { calls: Array<{ label: string | null }> }
  return calls.filter((c) => c.label === 'kit-upgrade')
}

async function makeKit(api: ApiClient, label: string, prompt?: string): Promise<{ id: string; name: string }> {
  const name = `KU ${label} ${Date.now()}`
  const res = await api.post('/api/admin/brandkits', { name, colors: [] })
  expect(res.status()).toBe(201)
  const kit = await res.json()
  if (prompt !== undefined) {
    expect((await api.post(`/api/admin/brandkits/${kit.id}/prompts`, { content: prompt })).status()).toBe(201)
  }
  return { id: kit.id, name }
}

async function prompts(api: ApiClient, kitId: string): Promise<PromptRow[]> {
  const res = await api.get(`/api/admin/brandkits/${kitId}/prompts`)
  expect(res.status()).toBe(200)
  return res.json()
}

function upgrade(api: ApiClient, kitId: string, text: string, baseVersion = 1) {
  return api.post(`/api/admin/brandkits/${kitId}/prompts/upgrade`, { text, baseVersion })
}

async function openKit(page: Page, name: string) {
  await page.goto('/admin/brandkits')
  await page.getByRole('button', { name }).first().click()
  await expect(page.getByText('Brand voice prompt').first()).toBeVisible()
}

const editor = (page: Page) => page.getByLabel('Brand voice prompt')
const panel = (page: Page) => page.getByRole('region', { name: 'Design rules' })

test.describe.configure({ mode: 'serial' })

test.describe('Kit design-rule upgrade (007)', () => {
  let admin: ApiClient

  test.beforeEach(async ({ request }) => {
    admin = await loginAs(request, ADMIN_EMAIL, PASSWORD)
    if (MOCKED()) await clearCalls(admin)
  })
  test.afterEach(async () => {
    await admin.dispose()
  })

  test('TC-KU-01: the live detector flags the Hearts text in the browser and makes no upgrade request', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(120_000)
    const kit = await makeKit(admin, '01')
    const upgradeRequests: string[] = []
    page.on('request', (r) => { if (r.url().includes('/prompts/upgrade')) upgradeRequests.push(r.url()) })

    await pageLogin(page)
    await openKit(page, kit.name)
    await page.getByRole('button', { name: 'Write manually' }).click()

    await editor(page).fill(HEARTS_TEXT)
    await expect(panel(page).getByRole('list', { name: 'Flagged phrases' }).getByRole('listitem')).toHaveCount(4)
    await expect(panel(page).getByText('4 phrases flagged')).toBeVisible()

    await editor(page).fill(VOICE_TEXT)
    await expect(panel(page).getByText('No vague phrases flagged')).toBeVisible()
    await expect(panel(page).getByRole('list', { name: 'Flagged phrases' })).toHaveCount(0)

    expect(upgradeRequests).toEqual([])
  })

  test('TC-KU-02: upgrade returns four dataset edits and records one kit-upgrade call', async () => {
    if (!MOCKED()) { test.skip(); return }
    const kit = await makeKit(admin, '02', HEARTS_TEXT)
    const res = await upgrade(admin, kit.id, HEARTS_TEXT)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.outcome).toBe('edits')
    expect(body.baseVersion).toBe(1)
    expect(body.edits).toHaveLength(4)
    expect((body.edits as EditJson[]).map((e) => e.entryKey)).toEqual(RULE_KEYS)
    for (const e of body.edits as EditJson[]) expect(e.provenance).toBe('dataset')
    expect(await upgradeCalls(admin)).toHaveLength(1)
  })

  test('TC-KU-03: every replacement is measurable and every quote occurs exactly once', async () => {
    if (!MOCKED()) { test.skip(); return }
    const kit = await makeKit(admin, '03', HEARTS_TEXT)
    const body = await (await upgrade(admin, kit.id, HEARTS_TEXT)).json()
    expect(body.edits.length).toBeGreaterThan(0)
    for (const e of body.edits as EditJson[]) {
      expect(isMeasurable(e.replacement), e.replacement).toBe(true)
      expect(HEARTS_TEXT.split(e.quote).length - 1, e.quote).toBe(1)
    }
  })

  test('TC-KU-04: an unparseable reply is 502 UPGRADE_PARSE_FAILED and the UI offers Try again', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(120_000)
    const kit = await makeKit(admin, '04', HEARTS_TEXT)
    const text = `${HEARTS_TEXT} ${SENTINEL.unparseable}`

    const res = await upgrade(admin, kit.id, text)
    expect(res.status()).toBe(502)
    const body = await res.json()
    expect(body.code).toBe('UPGRADE_PARSE_FAILED')
    expect(body.edits).toBeUndefined()

    await pageLogin(page)
    await openKit(page, kit.name)
    await page.getByRole('button', { name: 'Write manually' }).click()
    await editor(page).fill(text)
    await panel(page).getByRole('button', { name: 'Upgrade' }).click()
    await expect(panel(page).getByRole('alert')).toBeVisible()
    await expect(panel(page).getByRole('button', { name: 'Try again' })).toBeVisible()
  })

  test('TC-KU-05: a model that proposes nothing is none/model-proposed-none; no vague phrase is none/no-candidates with no model call', async () => {
    if (!MOCKED()) { test.skip(); return }
    const kit = await makeKit(admin, '05', HEARTS_TEXT)

    const none = await upgrade(admin, kit.id, `${HEARTS_TEXT} ${SENTINEL.none}`)
    expect(none.status()).toBe(200)
    expect(await none.json()).toMatchObject({ outcome: 'none', reason: 'model-proposed-none' })
    expect(await upgradeCalls(admin)).toHaveLength(1)

    await clearCalls(admin)
    const empty = await upgrade(admin, kit.id, VOICE_TEXT)
    expect(empty.status()).toBe(200)
    expect(await empty.json()).toMatchObject({ outcome: 'none', reason: 'no-candidates' })
    expect(await upgradeCalls(admin)).toHaveLength(0)
  })

  test('TC-KU-06: BAD keeps one edit and gives three rejection reasons; OUTOFRANGE is unverified in the API and the UI', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(120_000)
    const kit = await makeKit(admin, '06', THREE_PHRASES)

    const bad = await (await upgrade(admin, kit.id, `${THREE_PHRASES} ${SENTINEL.bad}`)).json()
    expect(bad.outcome).toBe('edits')
    expect(bad.edits).toHaveLength(1)
    expect((bad.rejected as Rejected[]).map((r) => r.reason).sort()).toEqual(
      ['forbidden-content', 'not-measurable', 'unknown-candidate'],
    )

    const oor = await (await upgrade(admin, kit.id, `${HEARTS_TEXT} ${SENTINEL.outOfRange}`)).json()
    expect(oor.outcome).toBe('edits')
    expect(oor.edits).toHaveLength(1)
    expect(oor.edits[0].provenance).toBe('unverified')

    await pageLogin(page)
    await openKit(page, kit.name)
    await page.getByRole('button', { name: 'Write manually' }).click()
    await editor(page).fill(`${HEARTS_TEXT} ${SENTINEL.outOfRange}`)
    await panel(page).getByRole('button', { name: 'Upgrade' }).click()
    await expect(panel(page).getByText('Number not from the dataset, check it')).toBeVisible()
  })

  test('TC-KU-07: improve this version, review, accept two, reject one, save', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(180_000)
    const kit = await makeKit(admin, '07', HEARTS_TEXT)

    await pageLogin(page)
    await openKit(page, kit.name)
    await page.getByRole('button', { name: 'Improve this version' }).click()
    await expect(editor(page)).toHaveValue(HEARTS_TEXT)
    await expect(page.getByText(/Save makes this the live prompt for new posts straight away/)).toBeVisible()
    await expect(page.getByText(/posts already made keep what they were generated with/)).toBeVisible()

    await panel(page).getByRole('button', { name: 'Upgrade' }).click()
    const edits = panel(page).getByRole('list', { name: 'Proposed edits' }).getByRole('listitem')
    await expect(edits).toHaveCount(4)
    const first = edits.first()
    // The first edit is an insert: it names the phrase it follows and strikes nothing.
    await expect(first.getByText('Add after')).toBeVisible()
    await expect(first.locator('del')).toHaveCount(0)
    await expect(first.getByText(/After the sentence with “similar visual heights”/)).toBeVisible()
    // The second is a replace: its quote is struck through.
    await expect(edits.nth(1).locator('del')).toHaveText('generous clear space')
    await expect(first.locator('ins')).not.toBeEmpty()
    await expect(first.getByText('From the design-rule dataset')).toBeVisible()
    await expect(first.getByText(/wordmark|logo|canvas|clear/i).first()).toBeVisible()

    const accept = panel(page).getByRole('button', { name: 'Accept' })
    await accept.first().click()
    await accept.first().click()
    await panel(page).getByRole('button', { name: 'Reject' }).first().click()

    const after = await editor(page).inputValue()
    expect(after).not.toBe(HEARTS_TEXT)
    expect(after).toContain('Set the wordmark capitals of each logo to the same height, within 5%.')
    expect(after).toContain('clear space of 1 to 2 wordmark letters on every side')
    expect(after).toContain('primary canvas')
    expect((await prompts(admin, kit.id)).length).toBe(1)

    const saved = page.waitForResponse(
      (r) => r.url().endsWith(`/api/admin/brandkits/${kit.id}/prompts`) && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Save as new version' }).click()
    expect((await saved).status()).toBe(201)

    const rows = await prompts(admin, kit.id)
    expect(rows).toHaveLength(2)
    const active = rows.find((p) => p.isActive)!
    expect(active.version).toBe(2)
    expect(active.content).toBe(after)

    // Accepting nothing and saving creates a version equal to the base.
    await expect(page.getByRole('button', { name: 'Improve this version' })).toBeVisible()
    await page.getByRole('button', { name: 'Improve this version' }).click()
    await expect(editor(page)).toHaveValue(after)
    const saved2 = page.waitForResponse(
      (r) => r.url().endsWith(`/api/admin/brandkits/${kit.id}/prompts`) && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Save as new version' }).click()
    expect((await saved2).status()).toBe(201)
    const rows2 = await prompts(admin, kit.id)
    expect(rows2).toHaveLength(3)
    expect(rows2.find((p) => p.isActive)!.content).toBe(after)
  })

  test('TC-KU-08: a stale base is 409 with no model call, and the UI asks before replacing a newer version', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(180_000)
    const kit = await makeKit(admin, '08', HEARTS_TEXT)
    expect((await admin.post(`/api/admin/brandkits/${kit.id}/prompts`, { content: `${HEARTS_TEXT} Second.` })).status()).toBe(201)
    const active = (await prompts(admin, kit.id)).find((p) => p.isActive)!
    expect(active.version).toBe(2)

    await clearCalls(admin)
    const stale = await upgrade(admin, kit.id, HEARTS_TEXT, 1)
    expect(stale.status()).toBe(409)
    expect(await stale.json()).toMatchObject({ code: 'STALE_BASE', activeVersion: 2 })
    expect(await upgradeCalls(admin)).toHaveLength(0)

    // UI: seed from v2, another admin saves v3, then Save asks first.
    await pageLogin(page)
    await openKit(page, kit.name)
    await page.getByRole('button', { name: 'Improve this version' }).click()
    await expect(editor(page)).toHaveValue(active.content)
    expect((await admin.post(`/api/admin/brandkits/${kit.id}/prompts`, { content: 'Someone else saved this.' })).status()).toBe(201)

    await page.getByRole('button', { name: 'Save as new version' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(/Version 3 was saved since you started this text\. Saving now will replace it as the live prompt\. Save anyway\?/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
    expect((await prompts(admin, kit.id)).length).toBe(3)

    const saved = page.waitForResponse(
      (r) => r.url().endsWith(`/api/admin/brandkits/${kit.id}/prompts`) && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Save as new version' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Save anyway' }).click()
    expect((await saved).status()).toBe(201)
    const rows = await prompts(admin, kit.id)
    expect(rows).toHaveLength(4)
    expect(rows.find((p) => p.isActive)!.content).toBe(active.content)
  })

  test('TC-KU-09: an edit whose quote changed is disabled as stale; a dismissed flag stays hidden until reload', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(180_000)
    const kit = await makeKit(admin, '09', HEARTS_TEXT)

    await pageLogin(page)
    await openKit(page, kit.name)
    await page.getByRole('button', { name: 'Improve this version' }).click()
    await panel(page).getByRole('button', { name: 'Upgrade' }).click()
    const edits = panel(page).getByRole('list', { name: 'Proposed edits' }).getByRole('listitem')
    await expect(edits).toHaveCount(4)

    await editor(page).fill(HEARTS_TEXT.replace('similar visual heights', 'a height of 40 px'))
    const stale = panel(page).getByRole('group', { name: 'Edit for similar visual heights' })
    await expect(stale.getByRole('button', { name: 'Accept' })).toBeDisabled()
    await expect(stale.getByText(/no longer applies/)).toBeVisible()

    const flags = panel(page).getByRole('list', { name: 'Flagged phrases' }).getByRole('listitem')
    await expect(flags).toHaveCount(3)
    await panel(page).getByRole('button', { name: 'Dismiss flag: generous clear space' }).click()
    await expect(flags).toHaveCount(2)
    await expect(flags.getByText('generous clear space', { exact: true })).toHaveCount(0)

    await openKit(page, kit.name)
    await page.getByRole('button', { name: 'Improve this version' }).click()
    await expect(flags).toHaveCount(4)
  })

  test('TC-KU-10: Improve with AI reports the measurable rules the rewrite dropped', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(120_000)
    const dropText = `Keep clear space of 1.5 wordmark letters around the logo. ${SENTINEL.dropRules}`
    const dropKit = await makeKit(admin, '10a', dropText)
    const normalKit = await makeKit(admin, '10b', `Keep clear space of 1.5 wordmark letters around the logo.`)

    const drop = await (await admin.post(`/api/admin/brandkits/${dropKit.id}/prompts/improve`, {})).json()
    expect(drop.lostRules).toContain('1.5 wordmark letters')
    expect(typeof drop.draft).toBe('string')

    const normal = await (await admin.post(`/api/admin/brandkits/${normalKit.id}/prompts/improve`, {})).json()
    expect(normal.lostRules).toEqual([])
    expect(normal.draft).toBe(
      'Keep clear space of 1.5 wordmark letters around the logo. [MOCK improved brand voice prompt for E2E tests — deterministic.]',
    )
    expect(Object.keys(normal).sort()).toEqual(['draft', 'lostRules'])

    await pageLogin(page)
    await openKit(page, dropKit.name)
    await page.getByRole('button', { name: 'Improve with AI' }).click()
    await expect(page.getByText(/The rewrite dropped \d+ measurable rules:/)).toBeVisible()
    await expect(page.getByText(/1\.5 wordmark letters/).first()).toBeVisible()
  })

  test('TC-KU-11: 401 with no session, 403 for an editor, 404 for another team or a deleted kit, 400 for a bad body', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const kit = await makeKit(admin, '11', HEARTS_TEXT)
    const path = `/api/admin/brandkits/${kit.id}/prompts/upgrade`
    const body = { text: HEARTS_TEXT, baseVersion: 1 }

    // The proxy redirects a cookie-less request to /login, so a bogus session
    // cookie is what reaches the route's own 401.
    const anon = await pwRequest.newContext({
      baseURL: process.env.TEST_BASE_URL ?? 'http://localhost:3001',
      extraHTTPHeaders: { cookie: 'better-auth.session_token=not-a-real-session' },
    })
    try {
      expect((await anon.post(path, { data: body })).status()).toBe(401)
    } finally {
      await anon.dispose()
    }

    const ed = await loginAs(request, EDITOR_EMAIL, PASSWORD)
    const clientx = await loginAs(request, CLIENTX_EMAIL, PASSWORD, { team: 'ClientX' })
    try {
      expect((await ed.post(path, body)).status()).toBe(403)

      // Another team's kit, from both directions.
      expect((await clientx.post(path, body)).status()).toBe(404)
      const xKit = await makeKit(clientx, '11x', HEARTS_TEXT)
      expect((await upgrade(admin, xKit.id, HEARTS_TEXT)).status()).toBe(404)

      expect((await admin.post(path, { baseVersion: 1 })).status()).toBe(400)
      expect((await admin.post(path, { text: HEARTS_TEXT, baseVersion: -1 })).status()).toBe(400)
      expect((await admin.post(path, { text: 'x'.repeat(20_001), baseVersion: 1 })).status()).toBe(400)
      expect((await admin.post(path, { text: '', baseVersion: 1 })).status()).toBe(400)

      expect((await admin.del(`/api/admin/brandkits/${kit.id}`)).status()).toBeLessThan(300)
      expect((await admin.post(path, body)).status()).toBe(404)
    } finally {
      await ed.dispose()
      await clientx.dispose()
    }
    expect(await upgradeCalls(admin)).toHaveLength(0)
  })
})
