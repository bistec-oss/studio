import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { Prisma } from '@prisma/client'
import { loginAs, waitForAction, waitForDraft, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'
import { expectNoAxeViolations } from '../helpers/axe'
import { archetypes } from '../../src/lib/designData/composition'
import { ADMIN_EMAIL, ADMIN_PASSWORD, briefDraftIds, mintExportedDraft, pageLogin } from '../helpers/ui'

// §AA — hero imagery: the image-style choice, the fail-closed check, the
// recorded composition stamp and the draft notice (change 009, FR-03, FR-12 to
// FR-15, FR-17; AC-04, AC-05, AC-17 to AC-19, AC-21; TC-HERO-01 to TC-HERO-16).
//
// Contract (spec FR-03 to FR-15):
//   POST /api/briefs        { imageStyle? }  absent = classic; unknown, non-string
//                           and (non-classic + TEMPLATE) are 400; STORY accepted.
//   GET  /api/drafts/[id]   adds composition (the parsed stamp or null) and
//                           compositionNotice ({ reason, message } or null).
//   The stamp is on the draft and on each revision (one JSON column).
//
// Deterministic seams (MOCK_AI + MOCK_PUPPETEER, src/lib/testHooks.ts), read from
// the brief topic (or a refine instruction):
//   __MOCK_BG__            an image exists (the REAL resolver picks the provider;
//                          only its generateImage is swapped for a fixture PNG).
//                          A hero style needs it, else the run settles to no-image.
//   __MOCK_BG_FAIL__ / __MOCK_BG_NOT_NEEDED__   no image
//   __MOCK_HERO_BUSY__ / _CONTRAST__ / _CHECK_ERROR__   synthetic samples that go
//                          through the REAL evaluateRegions
//   __MOCK_HERO_LAYOUT__   a box outside every text region, through the REAL
//                          layout comparison
//
// Every generation case runs in its OWN fresh team (disposed afterwards), with
// one enabled non-default IMAGE row, as §BG does. The wizard case runs in the
// seeded Bistec team and discards the unfinished brief it autosaved.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)

interface TeamSession {
  api: ApiClient
  teamId: string
  teamName: string
  kitId: string
  copyKey: string
  dispose(): Promise<void>
}

async function freshTeam(request: APIRequestContext, label: string): Promise<TeamSession> {
  const sa = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  const name = `Hero ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const teamRes = await sa.post('/api/admin/teams', { name })
  expect(teamRes.status()).toBe(201)
  const team = await teamRes.json()
  const api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD, { team: name })

  const kitRes = await api.post('/api/admin/brandkits', { name: 'Hero Kit', colors: ['#0284c7', '#020617'] })
  expect(kitRes.status()).toBe(201)
  const kit = await kitRes.json()
  const copyRes = await api.post('/api/admin/providers', {
    apiKey: 'herocopy_key_123456789',
    slot: 'COPY',
    providerName: 'herocopy',
    label: 'Hero Copy',
  })
  expect(copyRes.status()).toBe(201)
  const copy = await copyRes.json()
  // One enabled IMAGE row that is NOT the default: resolution reaches it
  // through the oldest-enabled fallback (005 FR-01), no personal key needed.
  const imageRes = await api.post('/api/admin/providers', { apiKey: 'sk-hero-fake-openai-key', slot: 'IMAGE' })
  expect(imageRes.status()).toBe(201)
  const image = await imageRes.json()
  expect((await api.patch(`/api/admin/providers/${image.id}`, { isDefault: false })).status()).toBe(200)

  return {
    api,
    teamId: team.id,
    teamName: name,
    kitId: kit.id,
    copyKey: copy.providerKey,
    async dispose() {
      await api.dispose()
      await sa.del(`/api/admin/teams/${team.id}`)
      await sa.dispose()
    },
  }
}

type Stamp = {
  requestedArchetype: string
  appliedArchetype: string
  contractVersion: number | null
  fallbackReason?: string
  observations?: string[]
  imageQuality: string
}
type Notice = { reason: string; message: string } | null
type Draft = Record<string, unknown> & {
  id: string
  status: string
  imageUrl: string | null
  composition: Stamp | null
  compositionNotice: Notice
  backgroundSkipped: { reason: string } | null
}

const briefBody = (t: TeamSession, topic: string, extra: Record<string, unknown> = {}) => ({
  topic,
  goal: 'awareness',
  tone: 'professional',
  channels: ['LINKEDIN'],
  designMode: 'GENERATE',
  copyProviderKey: t.copyKey,
  brandKitId: t.kitId,
  ...extra,
})

// A Path B generation with the given style and size; returns the settled draft.
async function generate(
  t: TeamSession,
  topic: string,
  extra: Record<string, unknown> = {},
): Promise<{ draft: Draft; briefId: string }> {
  const briefRes = await t.api.post('/api/briefs', briefBody(t, topic, extra))
  expect(briefRes.status(), await briefRes.text()).toBe(201)
  const brief = await briefRes.json()
  const res = await t.api.post('/api/generate/assemble-b', { briefId: brief.id })
  expect(res.status()).toBe(202)
  const draft = (await waitForDraft(t.api, (await res.json()).draftId)) as Draft
  expect(draft.status, String(draft.failureReason)).toBe('EXPORTED')
  return { draft, briefId: brief.id }
}

const stamp = (over: Partial<Stamp> & Pick<Stamp, 'requestedArchetype' | 'appliedArchetype'>): Stamp => ({
  contractVersion: null,
  imageQuality: 'default',
  ...over,
})
// 028: the kept version is the look's current one, read from the dataset.
const KEPT = (key: string): Stamp =>
  stamp({ requestedArchetype: key, appliedArchetype: key, contractVersion: archetypes[key].current })
const FELL_BACK = (key: string, reason: string): Stamp =>
  stamp({ requestedArchetype: key, appliedArchetype: 'classic', fallbackReason: reason })

async function refine(t: TeamSession, draftId: string, instruction: string): Promise<Draft> {
  const res = await t.api.post(`/api/drafts/${draftId}/refine`, { instruction })
  expect(res.status()).toBe(202)
  const done = (await waitForAction(t.api, draftId)) as Draft
  expect(done.pendingAction).toBeNull()
  expect(done.pendingActionError).toBeNull()
  expect(done.notApplied).toBeNull()
  return done
}

async function revisionStamps(draftId: string): Promise<Array<{ n: number; composition: unknown }>> {
  const rows = await prisma!.draftRevision.findMany({
    where: { draftId, revisionNumber: { not: null } },
    orderBy: { revisionNumber: 'asc' },
    select: { revisionNumber: true, composition: true },
  })
  return rows.map((r) => ({ n: r.revisionNumber as number, composition: r.composition }))
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

test.describe('§AA — hero imagery, generation and the stamp', () => {
  let t: TeamSession
  test.beforeEach(async ({ request }, testInfo) => {
    test.skip(!MOCKED(), 'needs MOCK_AI + MOCK_PUPPETEER (the hero seams)')
    t = await freshTeam(request, testInfo.title.slice(0, 14).replace(/[^A-Za-z0-9]/g, ''))
  })
  test.afterEach(async () => {
    await t?.dispose()
  })

  // TC-HERO-01 — a classic Path B brief records a classic stamp and says nothing.
  test('TC-HERO-01: a classic brief is stamped classic with no notice', async () => {
    const { draft } = await generate(t, `Hero classic ${Date.now()}`)
    expect(draft.composition).toEqual(stamp({ requestedArchetype: 'classic', appliedArchetype: 'classic' }))
    expect(draft.compositionNotice).toBeNull()
  })

  // TC-HERO-02 — AC-21: product-showcase at 1:1 is kept; one stamp, two places.
  test('TC-HERO-02: product-showcase at 1:1 is kept, with the same stamp on the draft and the v1 revision', async () => {
    const { draft } = await generate(t, `Hero showcase __MOCK_BG__ ${Date.now()}`, {
      imageStyle: 'product-showcase',
      aspectRatio: 'SQUARE',
    })
    expect(draft.composition).toEqual(KEPT('product-showcase'))
    expect(draft.imageUrl).toMatch(/^https?:\/\/.+\/background-.+\.png$/)
    expect(draft.compositionNotice).toBeNull()
    if (dbAvailable) {
      const row = await prisma!.draft.findUnique({ where: { id: draft.id }, select: { composition: true } })
      expect(row?.composition).toEqual(KEPT('product-showcase'))
      expect(await revisionStamps(draft.id)).toEqual([{ n: 1, composition: KEPT('product-showcase') }])
    }
  })

  // TC-HERO-03
  test('TC-HERO-03: editorial-split at 4:5 is kept', async () => {
    const { draft } = await generate(t, `Hero editorial __MOCK_BG__ ${Date.now()}`, {
      imageStyle: 'editorial-split',
      aspectRatio: 'PORTRAIT',
    })
    expect(draft.composition).toEqual(KEPT('editorial-split'))
    expect(draft.compositionNotice).toBeNull()
  })

  // TC-HERO-04 — the image is too busy where the text goes: classic, same image.
  test('TC-HERO-04: a busy image falls back to classic with reason busy, reusing the hero image', async () => {
    const { draft } = await generate(t, `Hero busy __MOCK_BG__ __MOCK_HERO_BUSY__ ${Date.now()}`, {
      imageStyle: 'product-showcase',
    })
    expect(draft.composition).toEqual(FELL_BACK('product-showcase', 'busy'))
    expect(draft.imageUrl).toMatch(/^https?:\/\/.+\/background-.+\.png$/)
    expect(draft.compositionNotice).toMatchObject({ reason: 'busy' })
    expect(draft.compositionNotice!.message).toContain('Product showcase')
  })

  // TC-HERO-05
  test('TC-HERO-05: low contrast behind the text falls back to classic with reason contrast', async () => {
    const { draft } = await generate(t, `Hero contrast __MOCK_BG__ __MOCK_HERO_CONTRAST__ ${Date.now()}`, {
      imageStyle: 'editorial-split',
    })
    expect(draft.composition).toEqual(FELL_BACK('editorial-split', 'contrast'))
    expect(draft.compositionNotice).toMatchObject({ reason: 'contrast' })
  })

  // TC-HERO-06 — fail closed.
  test('TC-HERO-06: a check that cannot run falls back to classic with reason check-error', async () => {
    const { draft } = await generate(t, `Hero check __MOCK_BG__ __MOCK_HERO_CHECK_ERROR__ ${Date.now()}`, {
      imageStyle: 'product-showcase',
    })
    expect(draft.composition).toEqual(FELL_BACK('product-showcase', 'check-error'))
    expect(draft.compositionNotice).toMatchObject({ reason: 'check-error' })
  })

  // TC-HERO-07 — both notices, each with its own cause.
  test('TC-HERO-07: a failed image call is no-image, and the composition and background notices both show', async ({ page }) => {
    const { draft } = await generate(t, `Hero nofail __MOCK_BG_FAIL__ ${Date.now()}`, { imageStyle: 'product-showcase' })
    expect(draft.composition).toEqual(FELL_BACK('product-showcase', 'no-image'))
    expect(draft.imageUrl).toBeNull()
    expect(draft.compositionNotice).toMatchObject({ reason: 'no-image' })
    expect(draft.backgroundSkipped).toMatchObject({ reason: 'PROVIDER_ERROR' })

    await pageLoginToTeam(page, t.teamId)
    await page.goto(`/drafts/${draft.id}`)
    const composition = page.getByTestId('composition-notice')
    const background = page.getByTestId('background-notice')
    await expect(composition).toBeVisible()
    await expect(composition).toHaveAttribute('role', 'status')
    await expect(composition).toHaveAttribute('data-reason', 'no-image')
    await expect(composition).toContainText('needs an image and none was made')
    await expect(background).toBeVisible()
    await expect(background).toHaveAttribute('data-reason', 'PROVIDER_ERROR')
  })

  // TC-HERO-08 — an empty prompt from the art director is no image.
  test('TC-HERO-08: a not-needed decision (empty prompt) with a hero style is no-image', async () => {
    const { draft } = await generate(t, `Hero notneeded __MOCK_BG_NOT_NEEDED__ ${Date.now()}`, {
      imageStyle: 'editorial-split',
    })
    expect(draft.composition).toEqual(FELL_BACK('editorial-split', 'no-image'))
    expect(draft.imageUrl).toBeNull()
    expect(draft.compositionNotice).toMatchObject({ reason: 'no-image' })
    // NOT_NEEDED is the model's own choice: the background notice stays quiet.
    expect(draft.backgroundSkipped).toBeNull()
  })

  // TC-HERO-09 — STORY is accepted at the API; since 028 the two looks support it.
  test('TC-HERO-09: a look on 9:16 is accepted and kept with the v2 contract, on the hero image path', async () => {
    const { draft } = await generate(t, `Hero story __MOCK_BG__ ${Date.now()}`, {
      imageStyle: 'product-showcase',
      aspectRatio: 'STORY',
    })
    expect(draft.composition).toEqual(KEPT('product-showcase'))
    expect(draft.composition!.contractVersion).toBe(2)
    expect(draft.imageUrl).toMatch(/^https?:\/\/.+\/background-.+\.png$/)
    expect(draft.compositionNotice).toBeNull()
  })

  // TC-HERO-10 — AC-18: regenerate re-resolves from the brief's style.
  test('TC-HERO-10: a retired key then regenerate-design records unknown-archetype, and v1 keeps its stamp', async () => {
    test.skip(!dbAvailable, 'writes the retired key straight into the test DB')
    const { draft, briefId } = await generate(t, `Hero retired __MOCK_BG__ ${Date.now()}`, {
      imageStyle: 'editorial-split',
    })
    expect(draft.composition).toEqual(KEPT('editorial-split'))

    await prisma!.brief.update({ where: { id: briefId }, data: { imageStyle: 'retired-style' } })
    const res = await t.api.post(`/api/drafts/${draft.id}/regenerate-design`, {})
    expect(res.status()).toBe(202)
    const after = (await waitForAction(t.api, draft.id)) as Draft
    expect(after.pendingActionError).toBeNull()
    expect(after.composition).toEqual(FELL_BACK('retired-style', 'unknown-archetype'))
    expect(after.compositionNotice).toMatchObject({ reason: 'unknown-archetype' })
    expect(after.compositionNotice!.message).toBe('That image style is no longer available, so the classic style was used.')

    const revisions = await revisionStamps(draft.id)
    expect(revisions.map((r) => r.n)).toEqual([1, 2])
    expect(revisions[0].composition).toEqual(KEPT('editorial-split'))
    expect(revisions[1].composition).toEqual(FELL_BACK('retired-style', 'unknown-archetype'))
  })

  // TC-HERO-11 — AC-17: refine carries the stamp; a replaced image re-stamps.
  test('TC-HERO-11: a refine carries the stamp, a refine that replaces the image re-stamps a kept draft, and a classic draft is unchanged', async () => {
    const { draft } = await generate(t, `Hero refine __MOCK_BG__ ${Date.now()}`, { imageStyle: 'product-showcase' })
    expect(draft.composition).toEqual(KEPT('product-showcase'))

    // The topic carries __MOCK_BG__, which a refine falls back to when its own
    // instruction has no sentinel: say plainly that this one needs no image.
    const carried = await refine(t, draft.id, 'Make the headline bigger __MOCK_BG_NOT_NEEDED__ __VERIFY_PASS__')
    expect(carried.composition).toEqual(KEPT('product-showcase'))
    expect(carried.compositionNotice).toBeNull()

    const replaced = await refine(t, draft.id, 'Put a city skyline behind it __MOCK_BG__ __VERIFY_PASS__')
    expect(replaced.composition).toEqual(
      stamp({
        requestedArchetype: 'product-showcase',
        appliedArchetype: 'classic',
        fallbackReason: 'refine-replaced-image',
      }),
    )
    expect(replaced.compositionNotice).toMatchObject({ reason: 'refine-replaced-image' })

    // A classic draft keeps its stamp, replaced image or not.
    const classic = (await generate(t, `Hero refine classic __MOCK_BG__ ${Date.now()}`)).draft
    const classicAfter = await refine(t, classic.id, 'Put a city skyline behind it __MOCK_BG__ __VERIFY_PASS__')
    expect(classicAfter.composition).toEqual(stamp({ requestedArchetype: 'classic', appliedArchetype: 'classic' }))
    expect(classicAfter.compositionNotice).toBeNull()
  })

  // TC-HERO-12 — AC-04: the API.
  test('TC-HERO-12: POST /api/briefs validates imageStyle', async () => {
    const post = (extra: Record<string, unknown>) => t.api.post('/api/briefs', briefBody(t, 'Hero api', extra))

    for (const bad of ['not-a-style', 'Product-Showcase', '', 42, true, {}, ['classic']]) {
      const res = await post({ imageStyle: bad })
      expect(res.status(), `imageStyle ${JSON.stringify(bad)}`).toBe(400)
    }
    // A non-classic style needs the freeform path.
    const template = await post({ imageStyle: 'product-showcase', designMode: 'TEMPLATE' })
    expect(template.status()).toBe(400)

    // Absent stores classic; each valid key is stored as given; STORY is accepted.
    const absent = await post({})
    expect(absent.status()).toBe(201)
    expect((await absent.json()).imageStyle).toBe('classic')
    for (const key of ['classic', 'product-showcase', 'editorial-split']) {
      const res = await post({ imageStyle: key })
      expect(res.status(), key).toBe(201)
      expect((await res.json()).imageStyle).toBe(key)
    }
    const story = await post({ imageStyle: 'editorial-split', aspectRatio: 'STORY' })
    expect(story.status()).toBe(201)
    expect((await story.json()).imageStyle).toBe('editorial-split')
    // classic on the template path is valid (it is what every Path A brief is).
    const classicTemplate = await post({ imageStyle: 'classic', designMode: 'TEMPLATE' })
    expect(classicTemplate.status()).toBe(201)
  })

  // TC-HERO-14 — AC-16: restore carries the revision's own stamp.
  test('TC-HERO-14: restore to v1 copies v1\'s stamp, and a legacy null stamp stays null', async () => {
    test.skip(!dbAvailable, 'nulls a stamp straight in the test DB')
    const { draft } = await generate(t, `Hero restore __MOCK_BG__ ${Date.now()}`, { imageStyle: 'editorial-split' })
    expect(draft.composition).toEqual(KEPT('editorial-split'))
    const replaced = await refine(t, draft.id, 'Put a city skyline behind it __MOCK_BG__ __VERIFY_PASS__')
    expect(replaced.composition).toMatchObject({ appliedArchetype: 'classic', fallbackReason: 'refine-replaced-image' })

    const restored = await t.api.post(`/api/drafts/${draft.id}/revisions/1/restore`, {})
    expect(restored.status(), await restored.text()).toBe(200)
    const back = (await (await t.api.get(`/api/drafts/${draft.id}`)).json()) as Draft
    expect(back.composition).toEqual(KEPT('editorial-split'))
    expect(back.compositionNotice).toBeNull()

    // A pre-009 draft: no stamp anywhere. A refine carries the null, a restore
    // brings the null back; nothing is invented.
    const legacy = (await generate(t, `Hero legacy ${Date.now()}`)).draft
    await prisma!.draft.update({ where: { id: legacy.id }, data: { composition: Prisma.DbNull } })
    await prisma!.draftRevision.updateMany({ where: { draftId: legacy.id }, data: { composition: Prisma.DbNull } })
    const refined = await refine(t, legacy.id, 'Make the headline bigger __VERIFY_PASS__')
    expect(refined.composition).toBeNull()
    expect((await revisionStamps(legacy.id)).map((r) => r.composition)).toEqual([null, null])
    const back1 = await t.api.post(`/api/drafts/${legacy.id}/revisions/1/restore`, {})
    expect(back1.status()).toBe(200)
    const legacyBack = (await (await t.api.get(`/api/drafts/${legacy.id}`)).json()) as Draft
    expect(legacyBack.composition).toBeNull()
    expect(legacyBack.compositionNotice).toBeNull()
  })

  // TC-HERO-15 — a layout violation is an observation: kept, noted, unchanged.
  test('TC-HERO-15: a layout violation keeps the archetype, records the observation and shows the notice', async () => {
    const { draft } = await generate(t, `Hero layout __MOCK_BG__ __MOCK_HERO_LAYOUT__ ${Date.now()}`, {
      imageStyle: 'product-showcase',
    })
    expect(draft.composition).toEqual({ ...KEPT('product-showcase'), observations: ['layout-violation'] })
    expect(draft.compositionNotice).toMatchObject({ reason: 'layout-violation' })
    expect(draft.compositionNotice!.message).toContain('The post is unchanged')
  })
})

// ── TC-HERO-13: the wizard (the seeded Bistec team) ──────────────────────────

const nextPost = (page: Page, suffix: string) =>
  page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname.endsWith(suffix))

// The autosave PUT whose payload satisfies `match`.
const autosaved = (page: Page, match: (payload: Record<string, unknown>) => boolean) =>
  page.waitForResponse((r) => {
    if (r.request().method() !== 'PUT' || new URL(r.url()).pathname !== '/api/brief-drafts') return false
    return match((r.request().postDataJSON() as { payload: Record<string, unknown> }).payload)
  })

const summary = (page: Page, label: string) =>
  page.getByRole('term').filter({ hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]')

test.describe('§AA — the wizard picker', () => {
  let api: ApiClient
  let before: Set<string>
  let kitId = ''
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    before = new Set(await briefDraftIds(api))
    const kit = await (
      await api.post('/api/admin/brandkits', { name: `Hero Wizard Kit ${Date.now()}`, colors: ['#8c4812'] })
    ).json()
    kitId = kit.id
  })
  test.afterEach(async () => {
    for (const id of await briefDraftIds(api)) {
      if (!before.has(id)) await api.del(`/api/brief-drafts/${id}`)
    }
    if (kitId) await api.del(`/api/admin/brandkits/${kitId}`)
    await api.dispose()
  })

  test('TC-HERO-13: Path B only, every look enabled at 9:16, the resets, the Review row, the request body, autosave and resume', async ({
    page,
  }) => {
    await pageLogin(page)
    await page.goto('/brief')
    await expect(page.getByRole('heading', { name: 'Select a campaign' })).toBeVisible({ timeout: 20_000 })
    const cont = page.getByRole('button', { name: /continue/i })
    await cont.click()
    await expect(page.getByRole('heading', { name: 'Size & Design' })).toBeVisible()
    const kit = page.getByRole('combobox', { name: 'Brand kit' })
    await expect(kit.locator(`option[value="${kitId}"]`)).toBeAttached()
    await kit.selectOption(kitId)

    const section = page.getByTestId('image-style-section')
    const option = (key: string) => page.getByTestId(`image-style-${key}`)

    // Path A (the default): no picker.
    await expect(section).toHaveCount(0)
    await page.getByRole('button', { name: /^Freeform/ }).click()
    await expect(section).toBeVisible()
    await expect(option('classic')).toHaveAttribute('aria-pressed', 'true')
    await expect(option('product-showcase')).toBeEnabled()
    await expect(option('editorial-split')).toBeEnabled()

    // 9:16 (028): every look is available, and a chosen one stays chosen.
    await option('editorial-split').click()
    await expect(option('editorial-split')).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: /9:16 Story/ }).click()
    await expect(option('product-showcase')).toBeEnabled()
    await expect(option('editorial-split')).toBeEnabled()
    await expect(option('editorial-split')).not.toContainText('Not available')
    await expect(option('classic')).toBeEnabled()
    await expect(option('editorial-split')).toHaveAttribute('aria-pressed', 'true')
    await expect(option('classic')).toHaveAttribute('aria-pressed', 'false')
    await option('product-showcase').click()
    await expect(option('product-showcase')).toHaveAttribute('aria-pressed', 'true')

    // Back to 1:1; a Path A switch hides the picker and resets the choice.
    await page.getByRole('button', { name: /1:1 Square/ }).click()
    await expect(option('product-showcase')).toBeEnabled()
    await option('product-showcase').click()
    await expect(option('product-showcase')).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: /^Template/ }).click()
    await expect(section).toHaveCount(0)
    await page.getByRole('button', { name: /^Freeform/ }).click()
    await expect(option('classic')).toHaveAttribute('aria-pressed', 'true')

    // The choice that goes forward.
    await option('editorial-split').click()
    await cont.click()
    await expect(page.getByRole('heading', { name: 'Description & caption direction' })).toBeVisible()
    await page.getByPlaceholder('e.g. Q3 product launch').fill('Hero wizard topic')
    await page.locator('textarea').fill('Announce the hero image styles with a short call to action.')
    await cont.click()
    await expect(page.getByRole('heading', { name: /Images/ })).toBeVisible()
    const saved = autosaved(page, (p) => p.step === 4 && p.imageStyle === 'editorial-split')
    await cont.click()
    await expect(page.getByRole('heading', { name: 'Review & Generate' })).toBeVisible()
    await expect(summary(page, 'Image style')).toHaveText('Editorial split')
    const draftId = ((await (await saved).json()) as { id: string }).id

    // The creation request carries it. The brief POST is stubbed so no
    // generation starts: this case is about what the wizard sends.
    let body: Record<string, unknown> = {}
    await page.route('**/api/briefs', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      body = route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'stubbed' }) })
    })
    const posted = nextPost(page, '/api/briefs')
    await page.getByRole('button', { name: 'Generate Post' }).click()
    await posted
    expect(body.imageStyle).toBe('editorial-split')
    expect(body.designMode).toBe('GENERATE')
    await page.unroute('**/api/briefs')

    // Resume restores it; an unknown stored value resumes as classic.
    await page.goto(`/brief?resume=${draftId}`)
    await expect(page.getByRole('heading', { name: 'Review & Generate' })).toBeVisible({ timeout: 20_000 })
    await expect(summary(page, 'Image style')).toHaveText('Editorial split')

    const row = (await (await api.get(`/api/brief-drafts/${draftId}`)).json()) as { payload: Record<string, unknown> }
    expect(row.payload.imageStyle).toBe('editorial-split')
    const put = await api.put('/api/brief-drafts', { id: draftId, payload: { ...row.payload, imageStyle: 'retired-style' } })
    expect(put.status()).toBe(200)
    await page.goto(`/brief?resume=${draftId}`)
    await expect(page.getByRole('heading', { name: 'Review & Generate' })).toBeVisible({ timeout: 20_000 })
    await expect(summary(page, 'Image style')).toHaveText('Classic')
  })
})

// ── TC-HERO-16: the payload and the notice on the page (the seeded team) ─────

test.describe('§AA — the payload and the page', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    test.skip(!MOCKED() || !dbAvailable, 'needs the mock seams and test DB access (a stamp is set in the DB)')
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => {
    await api?.dispose()
  })

  test('TC-HERO-16: GET exposes composition and compositionNotice; the page shows the notice with no axe violation', async ({ page }) => {
    const minted = await mintExportedDraft(api, `Hero payload ${Date.now()}`)
    const get = async () => (await (await api.get(`/api/drafts/${minted.id}`)).json()) as Draft

    // A fresh Path B draft in the seeded team is stamped classic, with no notice.
    const fresh = await get()
    expect(fresh.composition).toEqual(stamp({ requestedArchetype: 'classic', appliedArchetype: 'classic' }))
    expect(fresh.compositionNotice).toBeNull()

    // A stored fallback is parsed and its notice derived.
    const fellBack = FELL_BACK('product-showcase', 'busy')
    await prisma!.draft.update({ where: { id: minted.id }, data: { composition: fellBack } })
    const shown = await get()
    expect(shown.composition).toEqual(fellBack)
    expect(shown.compositionNotice).toMatchObject({ reason: 'busy' })

    // An unreadable stored value is null, never a 500.
    await prisma!.draft.update({ where: { id: minted.id }, data: { composition: { nonsense: true } } })
    const unreadable = await get()
    expect(unreadable.composition).toBeNull()
    expect(unreadable.compositionNotice).toBeNull()

    // The page, with the notice shown (390 px and 1440 px), and an axe pass.
    await prisma!.draft.update({ where: { id: minted.id }, data: { composition: fellBack } })
    await pageLogin(page)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/drafts/${minted.id}`)
      const notice = page.getByTestId('composition-notice')
      await expect(notice).toBeVisible()
      await expect(notice).toHaveAttribute('role', 'status')
      await expect(notice).toHaveAttribute('data-reason', 'busy')
      await expect(notice).toContainText('Product showcase could not be used for this post')
    }
    await expectNoAxeViolations(page, '/drafts/[id] with the composition notice', { settle: true })
  })
})
