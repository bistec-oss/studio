import { test, expect } from '@playwright/test'
import { loginAs, type ApiClient } from '../helpers/api'
import { pageLogin } from '../helpers/ui'

// §AL (docs/e2e-test-plan.md): 031 FR-30 to FR-34. TC-AS-01 to TC-AS-03: the briefing
// assistant's schedule uses post styles. TC-AS-04 to TC-AS-06: the brand-kit assistant proposes
// and applies fonts.
//
// Under MOCK_AI the schedule reply (`buildMockBriefingReply`) has two rows:
// "Mock scheduled post 1" with the active style `launch`, and
// "Mock scheduled post 2" with the bad key `flash-sale`, which the parser
// replaces with the campaign default (or General). No model is called.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const ADMIN_EMAIL = 'admin@bisteccare.lk'
const PASSWORD = 'BistecStudio2026!'

async function makeCampaign(api: ApiClient, label: string, defaultPostStyle?: string) {
  const name = `AS ${label} ${Date.now()}`
  const res = await api.post('/api/campaigns', { name, ...(defaultPostStyle ? { defaultPostStyle } : {}) })
  expect(res.status()).toBe(201)
  return { ...(await res.json()), name } as { id: string; name: string }
}

async function openPlan(page: import('@playwright/test').Page, campId: string) {
  await pageLogin(page)
  await page.goto(`/campaigns/${campId}`)
  await page.getByRole('button', { name: 'Draft with AI' }).click()
  const drawer = page.getByRole('dialog', { name: 'Draft briefing with AI' })
  await expect(drawer).toBeVisible()
  const ask = drawer.getByLabel('Message', { exact: true })
  await ask.fill('Please schedule a short series of posts.')
  const replied = page.waitForResponse(
    (r) => r.url().endsWith(`/api/campaigns/${campId}/briefing/chat`) && r.request().method() === 'POST',
  )
  await ask.press('Enter')
  expect((await replied).status()).toBe(200)
  const plan = drawer.getByRole('region', { name: 'Proposed schedule' })
  await expect(plan).toBeVisible({ timeout: 30_000 })
  return { drawer, plan, rows: plan.getByRole('listitem') }
}

test.describe.configure({ mode: 'serial' })

test.describe('Briefing assistant schedule with post styles (031)', () => {
  let admin: ApiClient
  test.beforeEach(async ({ request }) => {
    admin = await loginAs(request, ADMIN_EMAIL, PASSWORD)
  })
  test.afterEach(async () => {
    await admin.dispose()
  })

  test('TC-AS-01: each plan row has a post-style select and no goal text', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(90_000)
    const camp = await makeCampaign(admin, '01')
    const { plan, rows } = await openPlan(page, camp.id)
    await expect(rows).toHaveCount(2)
    for (let i = 0; i < 2; i++) {
      await expect(rows.nth(i).getByRole('combobox', { name: 'Post style' })).toHaveCount(1)
    }
    await expect(rows.nth(0).getByRole('combobox', { name: 'Post style' })).toHaveValue('launch')
    await expect(plan).not.toContainText('awareness')
  })

  test('TC-AS-02: a bad style key is replaced by the campaign default and the row says so', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(90_000)
    const camp = await makeCampaign(admin, '02', 'event')
    const { rows } = await openPlan(page, camp.id)
    const bad = rows.nth(1)
    await expect(bad.getByRole('combobox', { name: 'Post style' })).toHaveValue('event')
    await expect(bad.getByTestId('style-replaced')).toHaveText(
      'Suggested style flash-sale is not available; using Event',
    )
    await expect(rows.nth(0).getByTestId('style-replaced')).toHaveCount(0)
  })

  test('TC-AS-03: Schedule creates queue entries whose postStyle is the shown value', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(90_000)
    const camp = await makeCampaign(admin, '03', 'event')
    const { plan, rows } = await openPlan(page, camp.id)
    // The user changes the replaced row's style before scheduling.
    await rows.nth(1).getByRole('combobox', { name: 'Post style' }).selectOption('tip')
    await expect(rows.nth(1).getByTestId('style-replaced')).toHaveCount(0)

    const batch = page.waitForResponse(
      (r) => r.url().endsWith(`/api/campaigns/${camp.id}/queue/batch`) && r.request().method() === 'POST',
    )
    await plan.getByRole('button', { name: /^Schedule 2 posts$/ }).click()
    const res = await batch
    expect(res.status()).toBe(201)
    expect(res.request().postDataJSON().entries.every((e: Record<string, unknown>) => !('goal' in e))).toBe(true)

    const queue = (await (await admin.get(`/api/campaigns/${camp.id}/queue`)).json()) as Array<{
      topic: string
      postStyle: string
    }>
    const byTopic = Object.fromEntries(queue.map((e) => [e.topic, e.postStyle]))
    expect(byTopic).toEqual({ 'Mock scheduled post 1': 'launch', 'Mock scheduled post 2': 'tip' })
  })
})

// ── TC-AS-04 to TC-AS-06: the brand-kit assistant fonts (FR-33, FR-34) ──────────────────────────
//
// Under MOCK_AI the reply proposes heading Playfair Display, body Inter and a Sinhala font
// Noto Sans Sinhala. The sentinel __MOCK_FONT_UNKNOWN__ in the chat message swaps the body for a
// name that is not in the font list.

const UNKNOWN_BODY = '__MOCK_FONT_UNKNOWN__'

async function makeKit(api: ApiClient, label: string) {
  const name = `AS Kit ${label} ${Date.now()}`
  const res = await api.post('/api/admin/brandkits', {
    name,
    colors: [],
    fonts: [
      { name: 'Roboto', url: '' },
      { name: 'Lora', url: '' },
    ],
  })
  expect(res.status()).toBe(201)
  return { ...(await res.json()), name } as { id: string; name: string }
}

async function openAssistant(page: import('@playwright/test').Page, kitName: string, message: string) {
  await pageLogin(page)
  await page.goto('/admin/brandkits')
  await page
    .getByRole('region', { name: 'Brand kits', exact: true })
    .getByRole('button', { name: new RegExp(`^${kitName}`) })
    .click()
  await expect(page.getByRole('heading', { name: kitName, level: 2 })).toBeVisible()
  await page.getByRole('button', { name: 'Extract from references' }).click()
  const drawer = page.getByRole('dialog', { name: 'Extract brand from references' })
  await expect(drawer).toBeVisible()
  const ask = drawer.getByLabel('Message', { exact: true })
  await ask.fill(message)
  const replied = page.waitForResponse(
    (r) => r.url().endsWith('/assistant/chat') && r.request().method() === 'POST',
  )
  await ask.press('Enter')
  expect((await replied).status()).toBe(200)
  const proposed = drawer.getByRole('region', { name: 'Proposed brand' })
  await expect(proposed).toBeVisible({ timeout: 30_000 })
  return { drawer, proposed }
}

test.describe('Brand-kit assistant fonts (031)', () => {
  let admin: ApiClient
  const kits: string[] = []
  test.beforeEach(async ({ request }) => {
    admin = await loginAs(request, ADMIN_EMAIL, PASSWORD)
  })
  test.afterEach(async () => {
    for (const id of kits.splice(0)) await admin.del(`/api/admin/brandkits/${id}`)
    await admin.dispose()
  })

  test('TC-AS-04: the accept view shows current versus proposed, and a name not in the list is off', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(90_000)
    const kit = await makeKit(admin, '04')
    kits.push(kit.id)
    const { proposed } = await openAssistant(page, kit.name, `Extract the style ${UNKNOWN_BODY}`)
    await expect(proposed.getByText('Current: Roboto → Proposed: Playfair Display')).toBeVisible()
    await expect(proposed.getByText('Current: none → Proposed: Noto Sans Sinhala')).toBeVisible()
    await expect(
      proposed.getByText("Zzyzx Mock Sans is not in the font list and won't be applied"),
    ).toBeVisible()
    await expect(proposed.getByRole('checkbox', { name: /Heading font/ })).toBeChecked()
    const body = proposed.getByRole('checkbox', { name: /Body font/ })
    await expect(body).not.toBeChecked()
    await expect(body).toBeDisabled()
  })

  test('TC-AS-05: Apply changes the kit heading, body and Sinhala fonts in one call', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(90_000)
    const kit = await makeKit(admin, '05')
    kits.push(kit.id)
    const { drawer, proposed } = await openAssistant(page, kit.name, 'Extract the style')
    await expect(proposed.getByText('Current: Lora → Proposed: Inter')).toBeVisible()

    const apply = page.waitForResponse(
      (r) => r.url().endsWith(`/api/admin/brandkits/${kit.id}/assistant/apply`) && r.request().method() === 'POST',
    )
    await proposed.getByRole('button', { name: 'Apply to brand kit' }).click()
    expect((await apply).status()).toBe(200)
    await expect(drawer).toBeHidden()

    const after = (await (await admin.get(`/api/admin/brandkits/${kit.id}`)).json()) as {
      fonts: Array<{ name: string; url: string }>
      scriptFonts: Record<string, string> | null
    }
    expect(after.fonts.map((f) => f.name)).toEqual(['Playfair Display', 'Inter'])
    expect(after.fonts[0].url).toContain('fonts.googleapis.com')
    expect(after.scriptFonts).toEqual({ sinhala: 'Noto Sans Sinhala' })
  })

  test('TC-AS-06: the History shows the previous fonts on the new version', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(90_000)
    const kit = await makeKit(admin, '06')
    kits.push(kit.id)
    const { proposed } = await openAssistant(page, kit.name, 'Extract the style')
    await expect(proposed.getByText('Current: Roboto → Proposed: Playfair Display')).toBeVisible()
    const apply = page.waitForResponse(
      (r) => r.url().endsWith(`/api/admin/brandkits/${kit.id}/assistant/apply`) && r.request().method() === 'POST',
    )
    await proposed.getByRole('button', { name: 'Apply to brand kit' }).click()
    expect((await apply).status()).toBe(200)

    const versions = (await (await admin.get(`/api/admin/brandkits/${kit.id}/prompts`)).json()) as Array<{
      version: number
      previousFonts: { fonts: Array<{ name: string }> } | null
    }>
    expect(versions).toHaveLength(1)
    expect(versions[0].previousFonts?.fonts.map((f) => f.name)).toEqual(['Roboto', 'Lora'])

    // The kit detail refreshes after Apply; open the History tab of the voice prompt.
    await page.getByRole('tab', { name: 'History' }).click()
    await expect(page.getByTestId('previous-fonts')).toHaveText('Fonts before this version: Roboto, Lora')
  })
})
