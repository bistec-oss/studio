import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { loginAs, waitForAction, waitForDraft, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'
import { expectNoAxeViolations } from '../helpers/axe'
import { ADMIN_EMAIL, ADMIN_PASSWORD, briefDraftIds, pageLogin } from '../helpers/ui'
import { archetypes } from '../../src/lib/designData/composition'

// §AF — image looks (change 028, FR-05, FR-10 to FR-13, NFR-10; AC-10 to AC-14,
// AC-18; TC-LOOK-01 to TC-LOOK-20). Adapted from §AA (hero-image.test.ts), with
// the same MOCK_AI + MOCK_PUPPETEER seams and the same `__MOCK_HERO_*__`
// sentinels (no new sentinel):
//   __MOCK_BG__            an image exists (a hero look needs it)
//   __MOCK_HERO_BUSY__ / _CONTRAST__   synthetic samples through the REAL evaluateRegions
//   __MOCK_HERO_LAYOUT__   a box outside every text region (the layout observation)
//
// `KEPT` reads the expected contract version from the dataset (a look's
// `current`), so a later version bump does not break this file; the 028 versions
// are also written out where the spec names them (v2 for the two original looks
// at 9:16, v1 for the two new ones).
//
// Generation cases run in their OWN fresh team (disposed afterwards), with one
// enabled non-default IMAGE row, as §AA does. The wizard and queue cases run in
// the seeded Bistec team and clean up after themselves.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const MOCKED_ALL = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER && process.env.MOCK_SOCIAL)
const SIZES = ['SQUARE', 'PORTRAIT', 'STORY'] as const
const tag = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`

interface TeamSession {
  api: ApiClient
  teamId: string
  kitId: string
  copyKey: string
  dispose(): Promise<void>
}

async function freshTeam(request: APIRequestContext, label: string): Promise<TeamSession> {
  const sa = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  const name = `Look ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const teamRes = await sa.post('/api/admin/teams', { name })
  expect(teamRes.status()).toBe(201)
  const team = await teamRes.json()
  const api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD, { team: name })

  const kitRes = await api.post('/api/admin/brandkits', { name: 'Look Kit', colors: ['#0284c7', '#020617'] })
  expect(kitRes.status()).toBe(201)
  const kit = await kitRes.json()
  const copyRes = await api.post('/api/admin/providers', {
    apiKey: 'lookcopy_key_123456789',
    slot: 'COPY',
    providerName: 'lookcopy',
    label: 'Look Copy',
  })
  expect(copyRes.status()).toBe(201)
  const copy = await copyRes.json()
  const imageRes = await api.post('/api/admin/providers', { apiKey: 'sk-look-fake-openai-key', slot: 'IMAGE' })
  expect(imageRes.status()).toBe(201)
  const image = await imageRes.json()
  expect((await api.patch(`/api/admin/providers/${image.id}`, { isDefault: false })).status()).toBe(200)

  return {
    api,
    teamId: team.id,
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
  pendingAction: string | null
  pendingActionError: string | null
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
  return done
}

const IMAGE_URL = /^https?:\/\/.+\/background-.+\.png$/

test.describe('§AF — image looks, generation and the stamp', () => {
  let t: TeamSession
  test.beforeEach(async ({ request }, testInfo) => {
    test.skip(!MOCKED(), 'needs MOCK_AI + MOCK_PUPPETEER (the hero seams)')
    t = await freshTeam(request, testInfo.title.slice(0, 12).replace(/[^A-Za-z0-9]/g, ''))
  })
  test.afterEach(async () => {
    await t?.dispose()
  })

  test('TC-LOOK-01: product-showcase at 9:16 is kept with contract v2, the image set, no notice, one stamp on the draft and its first revision', async () => {
    const { draft } = await generate(t, `Look showcase story __MOCK_BG__ ${tag()}`, {
      imageStyle: 'product-showcase',
      aspectRatio: 'STORY',
    })
    expect(draft.composition).toEqual(KEPT('product-showcase'))
    expect(draft.composition!.contractVersion).toBe(2)
    expect(draft.imageUrl).toMatch(IMAGE_URL)
    expect(draft.compositionNotice).toBeNull()
    if (dbAvailable) {
      const row = await prisma!.draft.findUnique({ where: { id: draft.id }, select: { composition: true } })
      expect(row?.composition).toEqual(KEPT('product-showcase'))
      const revs = await prisma!.draftRevision.findMany({
        where: { draftId: draft.id, revisionNumber: { not: null } },
        orderBy: { revisionNumber: 'asc' },
        select: { revisionNumber: true, composition: true },
      })
      expect(revs).toEqual([{ revisionNumber: 1, composition: KEPT('product-showcase') }])
    }
  })

  test('TC-LOOK-02: editorial-split at 9:16 is kept with contract v2', async () => {
    const { draft } = await generate(t, `Look editorial story __MOCK_BG__ ${tag()}`, {
      imageStyle: 'editorial-split',
      aspectRatio: 'STORY',
    })
    expect(draft.composition).toEqual(KEPT('editorial-split'))
    expect(draft.composition!.contractVersion).toBe(2)
    expect(draft.compositionNotice).toBeNull()
  })

  // 031 T18: spotlight is at contract v2 (OP-031 passed); full-bleed-scene is still v1.
  for (const [id, key, version] of [
    ['TC-LOOK-03', 'full-bleed-scene', 1],
    ['TC-LOOK-04', 'spotlight', 2],
  ] as const) {
    test(`${id}: ${key} at 1:1, 4:5 and 9:16 is kept with contract v${version}`, async () => {
      for (const aspectRatio of SIZES) {
        const { draft } = await generate(t, `Look ${key} ${aspectRatio} __MOCK_BG__ ${tag()}`, {
          imageStyle: key,
          aspectRatio,
        })
        expect(draft.composition, aspectRatio).toEqual(KEPT(key))
        expect(draft.composition!.contractVersion, aspectRatio).toBe(version)
        expect(draft.imageUrl, aspectRatio).toMatch(IMAGE_URL)
        expect(draft.compositionNotice, aspectRatio).toBeNull()
      }
    })
  }

  test('TC-LOOK-05: full-bleed-scene on a busy image falls back to classic with reason busy, reusing the hero image, and the notice names it', async () => {
    const { draft } = await generate(t, `Look fullbleed busy __MOCK_BG__ __MOCK_HERO_BUSY__ ${tag()}`, {
      imageStyle: 'full-bleed-scene',
    })
    expect(draft.composition).toEqual(FELL_BACK('full-bleed-scene', 'busy'))
    expect(draft.imageUrl).toMatch(IMAGE_URL)
    expect(draft.compositionNotice).toMatchObject({ reason: 'busy' })
    expect(draft.compositionNotice!.message).toContain('Full-bleed scene')
  })

  test('TC-LOOK-06: spotlight with low contrast behind the text falls back to classic with reason contrast, and the notice names it', async () => {
    const { draft } = await generate(t, `Look spotlight contrast __MOCK_BG__ __MOCK_HERO_CONTRAST__ ${tag()}`, {
      imageStyle: 'spotlight',
    })
    expect(draft.composition).toEqual(FELL_BACK('spotlight', 'contrast'))
    expect(draft.compositionNotice).toMatchObject({ reason: 'contrast' })
    expect(draft.compositionNotice!.message).toContain('Spotlight')
  })

  test('TC-LOOK-07: a layout violation on spotlight keeps the look, records the observation and shows the notice naming it', async () => {
    const { draft } = await generate(t, `Look spotlight layout __MOCK_BG__ __MOCK_HERO_LAYOUT__ ${tag()}`, {
      imageStyle: 'spotlight',
    })
    expect(draft.composition).toEqual({ ...KEPT('spotlight'), observations: ['layout-violation'] })
    expect(draft.compositionNotice).toMatchObject({ reason: 'layout-violation' })
    expect(draft.compositionNotice!.message).toContain('Spotlight')
    expect(draft.compositionNotice!.message).toContain('The post is unchanged')
  })

  test('TC-LOOK-08: a layout violation on full-bleed-scene at 9:16 is the same', async () => {
    const { draft } = await generate(t, `Look fullbleed layout __MOCK_BG__ __MOCK_HERO_LAYOUT__ ${tag()}`, {
      imageStyle: 'full-bleed-scene',
      aspectRatio: 'STORY',
    })
    expect(draft.composition).toEqual({ ...KEPT('full-bleed-scene'), observations: ['layout-violation'] })
    expect(draft.compositionNotice).toMatchObject({ reason: 'layout-violation' })
    expect(draft.compositionNotice!.message).toContain('Full-bleed scene')
  })

  test('TC-LOOK-09: POST /api/briefs accepts both new keys on GENERATE at every size; a new key on TEMPLATE is 400; an unknown key is 400', async () => {
    const post = (extra: Record<string, unknown>) => t.api.post('/api/briefs', briefBody(t, 'Look api', extra))
    for (const key of ['full-bleed-scene', 'spotlight']) {
      for (const aspectRatio of SIZES) {
        const res = await post({ imageStyle: key, aspectRatio })
        expect(res.status(), `${key} ${aspectRatio}`).toBe(201)
        expect((await res.json()).imageStyle).toBe(key)
      }
      const template = await post({ imageStyle: key, designMode: 'TEMPLATE' })
      expect(template.status(), `${key} on TEMPLATE`).toBe(400)
    }
    for (const bad of ['not-a-look', 'Spotlight', 'full-bleed']) {
      expect((await post({ imageStyle: bad })).status(), bad).toBe(400)
    }
  })

  // TC-LOOK-12 — AC-14: an old draft keeps its own contract version.
  test('TC-LOOK-12: a v1 stamp is carried by refine without a warning, regenerate design records v2, and restore copies the v1 stamp back', async () => {
    test.skip(!dbAvailable, 'writes the v1 stamp straight into the test DB')
    const { draft } = await generate(t, `Look oldstamp __MOCK_BG__ ${tag()}`, {
      imageStyle: 'product-showcase',
      aspectRatio: 'SQUARE',
    })
    expect(draft.composition).toEqual(KEPT('product-showcase'))

    // Make this draft look like one made before 028: a v1 stamp on the draft
    // and on its first revision.
    const v1 = { ...KEPT('product-showcase'), contractVersion: 1 }
    await prisma!.draft.update({ where: { id: draft.id }, data: { composition: v1 } })
    await prisma!.draftRevision.updateMany({ where: { draftId: draft.id, revisionNumber: 1 }, data: { composition: v1 } })

    // Refine carries the stamp as it is, with no warning.
    const carried = await refine(t, draft.id, 'Make the headline bigger __MOCK_BG_NOT_NEEDED__ __VERIFY_PASS__')
    expect(carried.composition).toEqual(v1)
    expect(carried.compositionNotice).toBeNull()

    // Regenerate design re-resolves from the brief and records the current version.
    const res = await t.api.post(`/api/drafts/${draft.id}/regenerate-design`, {})
    expect(res.status()).toBe(202)
    const regenerated = (await waitForAction(t.api, draft.id)) as Draft
    expect(regenerated.pendingActionError).toBeNull()
    expect(regenerated.composition).toEqual(KEPT('product-showcase'))
    expect(regenerated.composition!.contractVersion).toBe(2)
    expect(regenerated.compositionNotice).toBeNull()

    // Restore to the first revision copies its own (v1) stamp.
    const restored = await t.api.post(`/api/drafts/${draft.id}/revisions/1/restore`, {})
    expect(restored.status(), await restored.text()).toBe(200)
    const back = (await (await t.api.get(`/api/drafts/${draft.id}`)).json()) as Draft
    expect(back.composition).toEqual(v1)
    expect(back.compositionNotice).toBeNull()
  })
})

// ── TC-LOOK-11: unattended surfaces stay classic (the seeded team) ───────────

test.describe('§AF — unattended surfaces are unchanged', () => {
  let admin: ApiClient
  let campaignId = ''
  test.beforeEach(async ({ request }) => {
    test.skip(!MOCKED_ALL() || !dbAvailable, 'needs the mock seams and test DB access (the generation tick)')
    admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    // Stale due entries from earlier suites would be claimed by the tick's small batch.
    await prisma!.scheduledGeneration.updateMany({ where: { status: 'PENDING' }, data: { status: 'CANCELLED' } })
    const kitId = (await (await admin.post('/api/admin/brandkits', { name: `Look Q Kit ${tag()}`, colors: ['#0284c7'] })).json()).id
    campaignId = (await (await admin.post('/api/campaigns', { name: `Look Q Camp ${tag()}`, brandKitId: kitId })).json()).id
  })
  test.afterEach(async () => {
    if (campaignId) {
      await prisma!.scheduledGeneration.updateMany({ where: { campaignId, status: 'PENDING' }, data: { status: 'CANCELLED' } })
    }
    await admin?.dispose()
  })

  test('TC-LOOK-11: a queue entry with postStyle launch at 9:16 runs classic: the brief stores classic and the stamp is a classic one', async () => {
    const res = await admin.post(`/api/campaigns/${campaignId}/queue`, {
      topic: `Look queue launch ${tag()}`,
      channels: ['INSTAGRAM'],
      designMode: 'GENERATE',
      aspectRatio: 'STORY',
      postStyle: 'launch',
      generateAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
      postAction: 'HOLD',
    })
    expect(res.status(), await res.text()).toBe(201)
    const entryId = (await res.json()).id as string

    let row = await prisma!.scheduledGeneration.findUnique({ where: { id: entryId } })
    for (let i = 0; i < 6; i++) {
      await prisma!.scheduledGeneration.update({
        where: { id: entryId },
        data: { generateAt: new Date(Date.now() - 1000), nextRetryAt: null },
      })
      expect((await admin.post('/api/test/generation-tick', {})).status()).toBe(200)
      row = await prisma!.scheduledGeneration.findUnique({ where: { id: entryId } })
      if (row && (row.status !== 'PENDING' || row.retryCount > 0)) break
    }
    expect(row!.status, String(row!.errorReason)).toBe('COMPLETED')
    expect(row!.heldReason).toBeNull()

    const brief = await prisma!.brief.findUnique({ where: { id: row!.briefId! } })
    expect(brief!.imageStyle).toBe('classic')
    expect(brief!.aspectRatio).toBe('STORY')
    const draft = await prisma!.draft.findUnique({ where: { id: row!.draftId! }, select: { composition: true } })
    expect(draft!.composition).toEqual(stamp({ requestedArchetype: 'classic', appliedArchetype: 'classic' }))
  })

  // T7 (FR-16, AC-20): Event and Hiring now default to Full-bleed scene in the wizard;
  // an unattended entry for either still resolves classic (unattended-classic).
  for (const [id, postStyle] of [
    ['TC-LOOK-15', 'event'],
    ['TC-LOOK-16', 'hiring'],
    ['TC-LOOK-19', 'promotion'], // 031 T18
    ['TC-LOOK-20', 'milestone'], // 031 T18
  ] as const) {
    test(`${id}: a queue entry with postStyle ${postStyle} at 9:16 runs classic although the style now defaults to a look`, async () => {
      const res = await admin.post(`/api/campaigns/${campaignId}/queue`, {
        topic: `Look queue ${postStyle} ${tag()}`,
        channels: ['INSTAGRAM'],
        designMode: 'GENERATE',
        aspectRatio: 'STORY',
        postStyle,
        generateAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
        postAction: 'HOLD',
      })
      expect(res.status(), await res.text()).toBe(201)
      const entryId = (await res.json()).id as string

      let row = await prisma!.scheduledGeneration.findUnique({ where: { id: entryId } })
      for (let i = 0; i < 6; i++) {
        await prisma!.scheduledGeneration.update({
          where: { id: entryId },
          data: { generateAt: new Date(Date.now() - 1000), nextRetryAt: null },
        })
        expect((await admin.post('/api/test/generation-tick', {})).status()).toBe(200)
        row = await prisma!.scheduledGeneration.findUnique({ where: { id: entryId } })
        if (row && (row.status !== 'PENDING' || row.retryCount > 0)) break
      }
      expect(row!.status, String(row!.errorReason)).toBe('COMPLETED')
      expect(row!.heldReason).toBeNull()

      const brief = await prisma!.brief.findUnique({ where: { id: row!.briefId! } })
      expect(brief!.postStyle).toBe(postStyle)
      expect(brief!.imageStyle).toBe('classic')
      expect(brief!.aspectRatio).toBe('STORY')
      const draft = await prisma!.draft.findUnique({ where: { id: row!.draftId! }, select: { composition: true } })
      expect(draft!.composition).toEqual(stamp({ requestedArchetype: 'classic', appliedArchetype: 'classic' }))
    })
  }
})

// ── TC-LOOK-10: the wizard (the seeded Bistec team) ──────────────────────────

const nextPost = (page: Page, suffix: string) =>
  page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname.endsWith(suffix))

const autosaved = (page: Page, match: (payload: Record<string, unknown>) => boolean) =>
  page.waitForResponse((r) => {
    if (r.request().method() !== 'PUT' || new URL(r.url()).pathname !== '/api/brief-drafts') return false
    return match((r.request().postDataJSON() as { payload: Record<string, unknown> }).payload)
  })

const summary = (page: Page, label: string) =>
  page.getByRole('term').filter({ hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]')

const LOOK_KEYS = ['classic', 'product-showcase', 'editorial-split', 'full-bleed-scene', 'spotlight']

test.describe('§AF — the wizard picker', () => {
  let api: ApiClient
  let before: Set<string>
  let kitId = ''
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    before = new Set(await briefDraftIds(api))
    kitId = (await (await api.post('/api/admin/brandkits', { name: `Look Wizard Kit ${tag()}`, colors: ['#8c4812'] })).json()).id
  })
  test.afterEach(async () => {
    for (const id of await briefDraftIds(api)) {
      if (!before.has(id)) await api.del(`/api/brief-drafts/${id}`)
    }
    if (kitId) await api.del(`/api/admin/brandkits/${kitId}`)
    await api.dispose()
  })

  test('TC-LOOK-10: five cards, none disabled at any size; Launch and Announcement at 9:16 pre-fill their look; Spotlight at 9:16 is sent, shown on Review and resumed; axe on step 1', async ({ page }) => {
    await pageLogin(page)
    await page.goto('/brief')
    await expect(page.getByRole('heading', { name: 'Select a campaign' })).toBeVisible({ timeout: 20_000 })
    const cont = page.getByRole('button', { name: /continue/i })
    await cont.click()
    await expect(page.getByRole('heading', { name: 'Size & Design' })).toBeVisible()
    const kit = page.getByRole('combobox', { name: 'Brand kit' })
    await expect(kit.locator(`option[value="${kitId}"]`)).toBeAttached()
    await kit.selectOption(kitId)
    await page.getByRole('button', { name: /^Freeform/ }).click()

    const option = (key: string) => page.getByTestId(`image-style-${key}`)
    const styleCard = (key: string) => page.getByTestId(`post-style-${key}`)
    const section = page.getByTestId('image-style-section')

    // Five cards, none disabled, at every size. 025 adds a sixth card, device-screen,
    // disabled with its reason until the brief carries a product screenshot.
    for (const size of [/1:1 Square/, /4:5/, /9:16 Story/]) {
      await page.getByRole('button', { name: size }).click()
      await expect(section.locator('button[aria-pressed]')).toHaveCount(LOOK_KEYS.length + 1)
      for (const key of LOOK_KEYS) {
        await expect(option(key), `${key} at ${String(size)}`).toBeEnabled()
        await expect(option(key)).not.toContainText('Not available')
      }
      await expect(option('device-screen'), `device-screen at ${String(size)}`).toBeDisabled()
      await expect(option('device-screen')).toContainText('Needs a product screenshot')
    }
    await expectNoAxeViolations(page, 'brief step 1 with five image looks at 9:16', { settle: true })

    // At 9:16 an untouched Launch / Announcement pre-fills its look, with the hint.
    await expect(page.getByTestId('image-style-from-style')).toHaveCount(0)
    await styleCard('launch').click()
    await expect(option('product-showcase')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('image-style-from-style')).toBeVisible()
    await styleCard('announcement').click()
    await expect(option('editorial-split')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('image-style-from-style')).toBeVisible()

    // Spotlight picked by hand at 9:16 goes forward.
    await option('spotlight').click()
    await expect(option('spotlight')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('image-style-from-style')).toHaveCount(0)
    await cont.click()
    await expect(page.getByRole('heading', { name: 'Description & caption direction' })).toBeVisible()
    await page.getByPlaceholder('e.g. Q3 product launch').fill('Look wizard topic')
    await page.locator('textarea').fill('Announce the new image looks with a short call to action.')
    await cont.click()
    await expect(page.getByRole('heading', { name: /Images/ })).toBeVisible()
    const saved = autosaved(page, (p) => p.step === 4 && p.imageStyle === 'spotlight')
    await cont.click()
    await expect(page.getByRole('heading', { name: 'Review & Generate' })).toBeVisible()
    await expect(summary(page, 'Image style')).toHaveText('Spotlight')
    const draftId = ((await (await saved).json()) as { id: string }).id

    // The request carries it (the brief POST is stubbed so no generation starts).
    let body: Record<string, unknown> = {}
    await page.route('**/api/briefs', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      body = route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'stubbed' }) })
    })
    const posted = nextPost(page, '/api/briefs')
    await page.getByRole('button', { name: 'Generate Post' }).click()
    await posted
    expect(body.imageStyle).toBe('spotlight')
    expect(body.aspectRatio).toBe('STORY')
    expect(body.designMode).toBe('GENERATE')
    await page.unroute('**/api/briefs')

    // A 9:16 autosave with a look resumes with it.
    await page.goto(`/brief?resume=${draftId}`)
    await expect(page.getByRole('heading', { name: 'Review & Generate' })).toBeVisible({ timeout: 20_000 })
    await expect(summary(page, 'Image style')).toHaveText('Spotlight')
    const row = (await (await api.get(`/api/brief-drafts/${draftId}`)).json()) as { payload: Record<string, unknown> }
    expect(row.payload.imageStyle).toBe('spotlight')
    expect(row.payload.aspectRatio).toBe('STORY')
  })

  // T7 (FR-16, AC-20): the post styles whose default moved after OP-028.
  for (const [id, postStyle, look] of [
    ['TC-LOOK-13', 'event', 'full-bleed-scene'],
    ['TC-LOOK-14', 'hiring', 'full-bleed-scene'],
    ['TC-LOOK-17', 'promotion', 'spotlight'], // 031 T18
    ['TC-LOOK-18', 'milestone', 'spotlight'], // 031 T18
  ] as const) {
    test(`${id}: the ${postStyle} post style pre-fills ${look} at 1:1 and at 9:16, with the hint`, async ({ page }) => {
      await pageLogin(page)
      await page.goto('/brief')
      await expect(page.getByRole('heading', { name: 'Select a campaign' })).toBeVisible({ timeout: 20_000 })
      await page.getByRole('button', { name: /continue/i }).click()
      await expect(page.getByRole('heading', { name: 'Size & Design' })).toBeVisible()
      const kit = page.getByRole('combobox', { name: 'Brand kit' })
      await expect(kit.locator(`option[value="${kitId}"]`)).toBeAttached()
      await kit.selectOption(kitId)
      await page.getByRole('button', { name: /^Freeform/ }).click()

      const option = (key: string) => page.getByTestId(`image-style-${key}`)
      await page.getByRole('button', { name: /1:1 Square/ }).click()
      await expect(page.getByTestId('image-style-from-style')).toHaveCount(0)
      await page.getByTestId(`post-style-${postStyle}`).click()
      await expect(option(look)).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByTestId('image-style-from-style')).toBeVisible()

      // An untouched pre-fill survives the size change.
      await page.getByRole('button', { name: /9:16 Story/ }).click()
      await expect(option(look)).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByTestId('image-style-from-style')).toBeVisible()

      // Picking the style afresh at 9:16 gives the same look.
      await page.getByTestId('post-style-general').click()
      await expect(option('classic')).toHaveAttribute('aria-pressed', 'true')
      await page.getByTestId(`post-style-${postStyle}`).click()
      await expect(option(look)).toHaveAttribute('aria-pressed', 'true')
    })
  }
})
