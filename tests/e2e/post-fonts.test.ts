import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { loginAs, waitForDraft, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'
import { ADMIN_EMAIL, ADMIN_PASSWORD } from '../helpers/ui'

// §AJ — post fonts (change 031 group B, T8 — AC-18, AC-22, AC-23 (E2E part), AC-24):
// the searchable font picker, the Sinhala font picker, the snapshot date, the save
// validation, the code-injected font link and stack, and the fallback-font notice.
//
// The seams (dormant in prod): MOCK_PUPPETEER lets a kit font or Sinhala font whose name carries
// `__MOCK_FONT_MISSING__` into the font plan (src/lib/fonts/plan.ts), and the mock renderer then
// reports it as missing, so the draft page shows `data-testid="font-notice"`. The kit PATCH refuses
// that name, so the case writes the kit's fonts straight to the test database.
//
// Every case runs in its own fresh team (soft-deleted afterwards). Every
// `page.waitForResponse` is created before the click that triggers it.

const SINHALA = 'Noto Sans Sinhala'

interface TeamSession {
  api: ApiClient
  teamId: string
  kitId: string
  kitName: string
  copyKey: string
  dispose(): Promise<void>
}

async function freshTeam(request: APIRequestContext, label: string): Promise<TeamSession> {
  const sa = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  const name = `Post fonts ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const teamRes = await sa.post('/api/admin/teams', { name })
  expect(teamRes.status()).toBe(201)
  const team = await teamRes.json()
  const api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD, { team: name })

  const kitName = `PF Kit ${label}`
  const kitRes = await api.post('/api/admin/brandkits', {
    name: kitName,
    colors: ['#0284c7', '#020617'],
    fonts: [{ name: 'Inter', url: '' }],
  })
  expect(kitRes.status()).toBe(201)
  const kit = await kitRes.json()
  const copyRes = await api.post('/api/admin/providers', {
    apiKey: 'pfcopy_key_123456789',
    slot: 'COPY',
    providerName: 'pfcopy',
    label: 'PF Copy',
  })
  expect(copyRes.status()).toBe(201)
  const copy = await copyRes.json()

  return {
    api,
    teamId: team.id,
    kitId: kit.id,
    kitName,
    copyKey: copy.providerKey,
    async dispose() {
      await api.dispose()
      await sa.del(`/api/admin/teams/${team.id}`)
      await sa.dispose()
    },
  }
}

async function pageLoginToTeam(page: Page, teamId: string) {
  await page.goto('/login')
  await page.getByPlaceholder('Username').fill(ADMIN_EMAIL)
  await page.getByPlaceholder('Password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => url.pathname === '/' || url.pathname === '/choose-team')
  const res = await page.request.post('/api/me/active-team', { data: { teamId } })
  expect(res.ok()).toBe(true)
}

async function openKit(page: Page, t: TeamSession) {
  await page.goto('/admin/brandkits')
  await page
    .getByRole('region', { name: 'Brand kits', exact: true })
    .getByRole('button', { name: new RegExp(`^${t.kitName}`) })
    .click()
  await expect(page.getByRole('heading', { name: t.kitName, level: 2 })).toBeVisible()
  return page.getByRole('region', { name: t.kitName, exact: true })
}

async function saveKit(page: Page, panel: ReturnType<Page['locator']>) {
  const saved = page.waitForResponse(
    (r) => /\/api\/admin\/brandkits\/[^/]+$/.test(r.url()) && r.request().method() === 'PATCH',
  )
  await panel.getByRole('button', { name: 'Save', exact: true }).click()
  expect((await saved).status()).toBe(200)
}

async function getKit(t: TeamSession): Promise<Record<string, unknown>> {
  return (await (await t.api.get(`/api/admin/brandkits/${t.kitId}`)).json()) as Record<
    string,
    unknown
  >
}

async function generate(t: TeamSession, topic: string): Promise<Record<string, unknown>> {
  const briefRes = await t.api.post('/api/briefs', {
    topic,
    goal: 'awareness',
    tone: 'professional',
    channels: ['LINKEDIN'],
    designMode: 'GENERATE',
    copyProviderKey: t.copyKey,
    brandKitId: t.kitId,
  })
  expect(briefRes.status()).toBe(201)
  const brief = await briefRes.json()
  const res = await t.api.post('/api/generate/assemble-b', { briefId: brief.id })
  expect(res.status()).toBe(202)
  const draft = await waitForDraft(t.api, (await res.json()).draftId)
  expect(draft.status).toBe('EXPORTED')
  return draft
}

function mocked() {
  return !!process.env.MOCK_AI && !!process.env.MOCK_PUPPETEER
}

test.describe('§AJ — post fonts', () => {
  let t: TeamSession
  test.beforeEach(async ({ request }, testInfo) => {
    t = await freshTeam(request, testInfo.title.slice(0, 10).replace(/\W/g, ''))
  })
  test.afterEach(async () => {
    await t?.dispose()
  })

  // TC-PF-01 — AC-24 (search half), AC-18
  test('TC-PF-01: typing "instr" finds Instrument Serif; adding and saving stores it with a computed URL', async ({
    page,
  }) => {
    await pageLoginToTeam(page, t.teamId)
    const panel = await openKit(page, t)
    await panel.getByRole('button', { name: 'Edit', exact: true }).click()
    const box = panel.getByRole('combobox', { name: 'Search Google Fonts', exact: true })
    await box.fill('instr')
    const option = panel
      .getByRole('listbox', { name: 'Google Fonts matches' })
      .getByRole('option', { name: /Instrument Serif/ })
    await expect(option).toBeVisible()
    await option.locator('button').dispatchEvent('mousedown')
    await expect(panel.getByRole('button', { name: 'Remove font Instrument Serif' })).toBeVisible()
    await saveKit(page, panel)
    const kit = await getKit(t)
    const fonts = kit.fonts as Array<{ name: string; url: string }>
    expect(fonts.map((f) => f.name)).toEqual(['Inter', 'Instrument Serif'])
    expect(fonts[1].url).toContain('https://fonts.googleapis.com/css2?family=Instrument+Serif')
    await expect(panel.getByText('Heading', { exact: true })).toBeVisible()
    await expect(panel.getByText('Body', { exact: true })).toBeVisible()
  })

  // TC-PF-02 — AC-24 (Sinhala half)
  test('TC-PF-02: the Sinhala picker lists only Sinhala families and saves one', async ({
    page,
  }) => {
    const list = await (await t.api.get('/api/fonts?script=sinhala')).json()
    const names = (list.families as Array<{ family: string }>).map((f) => f.family)
    expect(names.length).toBeGreaterThan(0)
    for (const f of list.families as Array<{ scripts: string[] }>)
      expect(f.scripts).toContain('sinhala')

    await pageLoginToTeam(page, t.teamId)
    const panel = await openKit(page, t)
    await panel.getByRole('button', { name: 'Edit', exact: true }).click()
    const select = panel.getByLabel('Sinhala font')
    await expect(select.locator('option').first()).toHaveText('None (system font)')
    await expect
      .poll(async () => (await select.locator('option').allTextContents()).slice(1))
      .toEqual(names)
    await select.selectOption(SINHALA)
    await saveKit(page, panel)
    expect((await getKit(t)).scriptFonts).toEqual({ sinhala: SINHALA })
    await expect(panel.getByText(SINHALA, { exact: true })).toBeVisible()
  })

  // TC-PF-03 — AC-24 (the date)
  test('TC-PF-03: the kit page shows the font list date', async ({ page }) => {
    const kit = await getKit(t)
    expect(kit.fontCatalogueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    await pageLoginToTeam(page, t.teamId)
    const panel = await openKit(page, t)
    await expect(panel.getByText(`Font list from ${kit.fontCatalogueDate}`)).toBeVisible()
  })

  // TC-PF-04 — AC-17 (API), AC-18
  test('TC-PF-04: an unknown family is refused on save and nothing is written', async () => {
    const before = await getKit(t)
    const res = await t.api.patch(`/api/admin/brandkits/${t.kitId}`, {
      fonts: [
        { name: 'Inter', url: '' },
        { name: 'Not A Real Family', url: '' },
      ],
    })
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toMatch(/Unknown font/)
    const bad = await t.api.patch(`/api/admin/brandkits/${t.kitId}`, {
      scriptFonts: { sinhala: 'Inter' },
    })
    expect(bad.status()).toBe(400)
    const after = await getKit(t)
    expect(after.fonts).toEqual(before.fonts)
    expect(after.scriptFonts ?? null).toBeNull()
  })

  // TC-PF-05 — AC-22
  test('TC-PF-05: a kit with a Sinhala font stores the marked link and the stack entry, though the mock design never names it', async () => {
    test.skip(!mocked(), 'needs MOCK_AI + MOCK_PUPPETEER')
    expect(
      (
        await t.api.patch(`/api/admin/brandkits/${t.kitId}`, { scriptFonts: { sinhala: SINHALA } })
      ).status(),
    ).toBe(200)
    const draft = await generate(t, 'Post fonts sinhala stack')
    const html = String(draft.htmlContent ?? '')
    expect(html).toMatch(/<link[^>]*data-post-fonts[^>]*>/)
    expect(html).toContain('Noto+Sans+Sinhala')
    expect(html).toMatch(/font-family\s*:[^;}"]*Noto Sans Sinhala/)
    expect(draft.fontNotice ?? null).toBeNull()
  })

  // TC-PF-06 — AC-23 (E2E part)
  test('TC-PF-06: __MOCK_FONT_MISSING__ shows the fallback-font notice on the draft page', async ({
    page,
  }) => {
    test.skip(!mocked() || !dbAvailable || !prisma, 'needs the mock seams and the test database')
    // The kit PATCH refuses the sentinel name, so write the kit's Sinhala font directly.
    await prisma!.brandKit.update({
      where: { id: t.kitId },
      data: { scriptFonts: { sinhala: 'Ghost __MOCK_FONT_MISSING__' } },
    })
    const draft = await generate(t, 'Post fonts missing')
    await pageLoginToTeam(page, t.teamId)
    await page.goto(`/drafts/${draft.id}`)
    const notice = page.getByTestId('font-notice')
    await expect(notice).toBeVisible()
    await expect(notice).toContainText('did not load')
    await expect(notice).toContainText('__MOCK_FONT_MISSING__')
  })

  // TC-PF-07 — FR-21: clearing
  test('TC-PF-07: choosing None clears the Sinhala font', async ({ page }) => {
    expect(
      (
        await t.api.patch(`/api/admin/brandkits/${t.kitId}`, { scriptFonts: { sinhala: SINHALA } })
      ).status(),
    ).toBe(200)
    await pageLoginToTeam(page, t.teamId)
    const panel = await openKit(page, t)
    await panel.getByRole('button', { name: 'Edit', exact: true }).click()
    const select = panel.getByLabel('Sinhala font')
    await expect(select).toHaveValue(SINHALA)
    await select.selectOption({ label: 'None (system font)' })
    await saveKit(page, panel)
    expect((await getKit(t)).scriptFonts ?? null).toBeNull()
    await expect(panel.getByText(SINHALA, { exact: true })).toHaveCount(0)
  })

  // TC-PF-08 — AC-17: a stored non-catalogue entry survives a save
  test('TC-PF-08: a FONT artifact entry survives a save through the editor', async ({ page }) => {
    test.skip(!dbAvailable || !prisma, 'needs the test database')
    const artifact = { name: 'Brand Sans (uploaded)', url: 'https://example.com/brand-sans.woff2' }
    await prisma!.brandKit.update({
      where: { id: t.kitId },
      data: {
        fonts: [{ name: 'Inter', url: 'https://fonts.googleapis.com/css2?family=Inter' }, artifact],
      },
    })
    const before = (await getKit(t)).fonts
    await pageLoginToTeam(page, t.teamId)
    const panel = await openKit(page, t)
    await panel.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(panel.getByRole('button', { name: `Remove font ${artifact.name}` })).toBeVisible()
    await saveKit(page, panel)
    const after = (await getKit(t)).fonts as Array<{ name: string; url: string }>
    expect(after).toEqual(before)
    expect(after[1]).toEqual(artifact)
  })
})
