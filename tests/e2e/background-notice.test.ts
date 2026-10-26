import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { addTeamMember, loginAs, waitForAction, waitForDraft, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'

// §BG — skipped AI backgrounds are recorded and shown (005 FR-06/FR-07,
// AC-01 E2E half, AC-08..AC-11), driven through the NFR-06 background seam.
//
// The seam (src/lib/testHooks.ts, consulted in src/lib/agent/background.ts) is
// gated on MOCK_AI plus a sentinel in the BRIEF TOPIC:
//   __MOCK_BG__            the decision is "needed"; the REAL resolver picks the
//                          provider; only its generateImage is swapped for a
//                          fixture PNG, which is persisted to the IMAGES bucket
//   __MOCK_BG_FAIL__       same, but the fixture throws  → PROVIDER_ERROR
//   __MOCK_BG_NOT_NEEDED__ the decision is "not needed"  → NOT_NEEDED
// Without a sentinel MOCK_AI keeps its early return, so no other suite changes.
// Refine reads the sentinel from its INSTRUCTION when that carries one (so one
// refine can fail on a draft whose generation produced a background), else
// from the draft's brief topic.
//
// Every case runs in its OWN fresh team (soft-deleted afterwards), because the
// point is the team's IMAGE rows: none, or one enabled NON-default row
// registered through the API (T1's key-validation seam accepts the fake key).
// The acting super admin has no personal OpenAI key, so tier 1 never serves.

const ADMIN_EMAIL = 'admin@bisteccare.lk' // super admin
const ADMIN_PASSWORD = 'BistecStudio2026!'
const EDITOR_EMAIL = 'editor@bisteccare.lk' // seed editor; global role EDITOR
const EDITOR_PASSWORD = 'BistecStudio2026!'

const NO_PROVIDER_TEXT = 'No image provider is set up'

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
  const name = `BG-Notice ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const teamRes = await sa.post('/api/admin/teams', { name })
  expect(teamRes.status()).toBe(201)
  const team = await teamRes.json()
  const api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD, { team: name })

  const kitRes = await api.post('/api/admin/brandkits', { name: 'BG Kit', colors: ['#0284c7', '#020617'] })
  expect(kitRes.status()).toBe(201)
  const kit = await kitRes.json()
  // API mode (claude-html) needs a COPY key on the brief; MOCK_AI stubs the
  // copy call itself. An unknown provider name registers without being
  // auto-defaulted (FR-02 is IMAGE-only).
  const copyRes = await api.post('/api/admin/providers', {
    apiKey: 'bgcopy_key_123456789',
    slot: 'COPY',
    providerName: 'bgcopy',
    label: 'BG Copy',
  })
  expect(copyRes.status()).toBe(201)
  const copy = await copyRes.json()

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

// One enabled IMAGE row that is NOT the default (registering it makes it the
// default under FR-02, so it is explicitly unset). Resolution then reaches it
// only through the FR-01 tier 4 fallback.
async function addNonDefaultImageRow(api: ApiClient): Promise<{ id: string }> {
  const res = await api.post('/api/admin/providers', { apiKey: 'sk-bg-notice-fake-openai-key', slot: 'IMAGE' })
  expect(res.status()).toBe(201)
  const row = await res.json()
  const patched = await api.patch(`/api/admin/providers/${row.id}`, { isDefault: false })
  expect(patched.status()).toBe(200)
  const rows = (await (await api.get('/api/admin/providers')).json()) as Array<{
    id: string
    slot: string
    isEnabled: boolean
    isDefault: boolean
  }>
  const image = rows.filter((r) => r.slot === 'IMAGE')
  expect(image).toEqual([expect.objectContaining({ id: row.id, isEnabled: true, isDefault: false })])
  return row
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
    // No imageProviderKey: what the scheduler, MCP and ACP send.
  })
  expect(briefRes.status()).toBe(201)
  const brief = await briefRes.json()
  expect(brief.imageProviderKey ?? null).toBeNull()
  const res = await t.api.post('/api/generate/assemble-b', { briefId: brief.id })
  expect(res.status()).toBe(202)
  const draft = await waitForDraft(t.api, (await res.json()).draftId)
  expect(draft.status).toBe('EXPORTED')
  return draft
}

async function refine(t: TeamSession, draftId: string, instruction: string): Promise<Record<string, unknown>> {
  const res = await t.api.post(`/api/drafts/${draftId}/refine`, { instruction })
  expect(res.status()).toBe(202)
  const done = await waitForAction(t.api, draftId)
  expect(done.pendingAction).toBeNull()
  expect(done.pendingActionError).toBeNull()
  expect(done.notApplied).toBeNull()
  return done
}

async function pageLoginToTeam(page: Page, teamId: string, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  await page.goto('/login')
  await page.getByPlaceholder('Username').fill(email)
  await page.getByPlaceholder('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => url.pathname === '/' || url.pathname === '/choose-team')
  // page.request shares the browser context's cookie jar.
  const res = await page.request.post('/api/me/active-team', { data: { teamId } })
  expect(res.ok()).toBe(true)
}

function mocked() {
  return !!process.env.MOCK_AI && !!process.env.MOCK_PUPPETEER
}

test.describe('§BG — skipped AI background notice', () => {
  let t: TeamSession
  test.beforeEach(async ({ request }, testInfo) => {
    test.skip(!mocked(), 'needs MOCK_AI + MOCK_PUPPETEER (the background seam)')
    t = await freshTeam(request, testInfo.title.slice(0, 20))
  })
  test.afterEach(async () => {
    await t?.dispose()
  })

  // TC-BG-01 — AC-08.
  test('AC-08: no image row ⇒ NO_PROVIDER stored, polled and shown; the draft is still EXPORTED', async ({ page }) => {
    const draft = await generate(t, `BG no provider __MOCK_BG__ ${Date.now()}`)
    expect(draft.imageUrl).toBeNull()
    expect(draft.backgroundSkipped).toEqual({
      reason: 'NO_PROVIDER',
      message: expect.stringContaining(NO_PROVIDER_TEXT),
    })
    if (dbAvailable) {
      const row = await prisma!.draft.findUnique({ where: { id: draft.id as string } })
      expect(row?.backgroundSkipReason).toBe('NO_PROVIDER')
      expect(row?.backgroundSkipDetail).toBeNull()
    }

    await pageLoginToTeam(page, t.teamId)
    await page.goto(`/drafts/${draft.id}`)
    const notice = page.getByTestId('background-notice')
    await expect(notice).toBeVisible()
    await expect(notice).toHaveAttribute('role', 'status')
    await expect(notice).toContainText('No AI background') // the title
    await expect(notice).toContainText(NO_PROVIDER_TEXT) // the body, leading with the cause
    // A team admin (here a super admin) is sent to /team to fix it.
    await expect(notice.getByRole('link', { name: 'Open Team settings' })).toHaveAttribute('href', '/team')
  })

  // TC-BG-02 — AC-01 (E2E half).
  test('AC-01: one enabled NON-default IMAGE row and a brief with no imageProviderKey ⇒ a background, no personal key', async () => {
    const me = await (await t.api.get('/api/me/openai-key')).json()
    expect(me.connected).toBe(false)
    await addNonDefaultImageRow(t.api)

    const draft = await generate(t, `BG fallback __MOCK_BG__ ${Date.now()}`)
    expect(draft.imageUrl).toMatch(/^https?:\/\/.+\/background-.+\.png$/)
    expect(draft.backgroundSkipped).toBeNull()
  })

  // TC-BG-11 — 005 T8, AC-20. The team's ONLY image row is a gemini key (the
  // default, as the first row), so the real resolver can only serve it: before
  // T8 instantiateImageProvider had no gemini case, so the step would fail
  // with PROVIDER_ERROR. The seam swaps only generateImage, so no request ever
  // reaches Google (mock-verified only, AC-21). Which class the resolver built
  // is not visible over HTTP; tests/unit/geminiImage.test.ts asserts that a
  // gemini row resolves to a GeminiImageProvider.
  test('AC-20: a gemini default IMAGE row serves a background through the seam', async () => {
    const res = await t.api.post('/api/admin/providers', {
      apiKey: 'AIzaSy' + 'E2Egemini_bg_key_00123456789abcde', // AIzaSy + 33 chars
      slot: 'IMAGE',
    })
    expect(res.status()).toBe(201)
    const row = await res.json()
    expect(row.providerName).toBe('gemini')
    expect(row.isDefault).toBe(true)

    const draft = await generate(t, `BG gemini __MOCK_BG__ ${Date.now()}`)
    expect(draft.backgroundSkipped).toBeNull()
    expect(draft.imageUrl).toMatch(/^https?:\/\/.+\/background-.+\.png$/)
    if (dbAvailable) {
      const stored = await prisma!.draft.findUnique({ where: { id: draft.id as string } })
      expect(stored?.backgroundSkipReason).toBeNull()
    }
  })

  // TC-BG-03 — AC-09.
  test('AC-09: the model decided no background ⇒ no skip stored, no notice', async ({ page }) => {
    await addNonDefaultImageRow(t.api)
    const draft = await generate(t, `BG not needed __MOCK_BG_NOT_NEEDED__ ${Date.now()}`)
    expect(draft.imageUrl).toBeNull()
    expect(draft.backgroundSkipped).toBeNull()
    if (dbAvailable) {
      const row = await prisma!.draft.findUnique({ where: { id: draft.id as string } })
      expect(row?.backgroundSkipReason).toBeNull()
    }

    await pageLoginToTeam(page, t.teamId)
    await page.goto(`/drafts/${draft.id}`)
    await expect(page.getByText('Preview', { exact: true })).toBeVisible()
    await expect(page.getByTestId('background-notice')).toHaveCount(0)
  })

  // TC-BG-04 — AC-10.
  test('AC-10: the provider throws ⇒ PROVIDER_ERROR, and the draft still completes', async () => {
    await addNonDefaultImageRow(t.api)
    const draft = await generate(t, `BG provider error __MOCK_BG_FAIL__ ${Date.now()}`)
    expect(draft.status).toBe('EXPORTED')
    expect(draft.exportUrl).toMatch(/^https?:\/\//)
    expect(draft.imageUrl).toBeNull()
    expect(draft.backgroundSkipped).toEqual({
      reason: 'PROVIDER_ERROR',
      message:
        'The image provider returned an error (Mock image provider failure (__MOCK_BG_FAIL__ sentinel)), so the post was designed without one.',
    })
  })

  // TC-BG-05 — AC-11, regenerate-design.
  test('AC-11: a regenerate-design that produces a background clears an earlier skip', async () => {
    const draft = await generate(t, `BG regen __MOCK_BG__ ${Date.now()}`)
    expect((draft.backgroundSkipped as { reason: string }).reason).toBe('NO_PROVIDER')

    await addNonDefaultImageRow(t.api)
    const res = await t.api.post(`/api/drafts/${draft.id}/regenerate-design`, {})
    expect(res.status()).toBe(202)
    const done = await waitForAction(t.api, draft.id as string)
    expect(done.pendingActionError).toBeNull()
    expect(done.backgroundSkipped).toBeNull()
    expect(done.imageUrl).toMatch(/\/background-.+\.png$/)
    expect(done.currentRevisionNumber).toBe(2)
  })

  // TC-BG-06 — AC-11, refine that produces a background.
  test('AC-11: a refine that produces a background clears the skip', async () => {
    const draft = await generate(t, `BG refine clears __MOCK_BG__ ${Date.now()}`)
    expect((draft.backgroundSkipped as { reason: string }).reason).toBe('NO_PROVIDER')

    await addNonDefaultImageRow(t.api)
    const done = await refine(t, draft.id as string, 'Put a city skyline behind it __VERIFY_PASS__')
    expect(done.currentRevisionNumber).toBe(2)
    expect(done.backgroundSkipped).toBeNull()
    expect(done.imageUrl).toMatch(/\/background-.+\.png$/)
  })

  // TC-BG-07 — AC-11, refine that wanted a background and failed.
  test('AC-11: a refine that wanted a background and failed sets the skip', async () => {
    await addNonDefaultImageRow(t.api)
    const draft = await generate(t, `BG refine sets __MOCK_BG__ ${Date.now()}`)
    expect(draft.backgroundSkipped).toBeNull()
    const firstBackground = draft.imageUrl
    expect(firstBackground).toMatch(/\/background-.+\.png$/)

    // The instruction's sentinel wins over the topic's: this refine's decision
    // wants a background, the real resolver finds the row, and the provider fails.
    const done = await refine(t, draft.id as string, 'Swap the background for a beach __MOCK_BG_FAIL__ __VERIFY_PASS__')
    expect(done.currentRevisionNumber).toBe(2) // the edit itself committed
    expect(done.backgroundSkipped).toEqual({
      reason: 'PROVIDER_ERROR',
      message:
        'The image provider returned an error (Mock image provider failure (__MOCK_BG_FAIL__ sentinel)), so the post was designed without one.',
    })
    if (dbAvailable) {
      const row = await prisma!.draft.findUnique({ where: { id: draft.id as string } })
      expect(row?.backgroundSkipReason).toBe('PROVIDER_ERROR')
      expect(row?.backgroundSkipDetail).toBe('Mock image provider failure (__MOCK_BG_FAIL__ sentinel)')
      expect(row?.imageUrl).toBe(firstBackground)
    }
    // Like imageUrl, a failed refine background never clears what was there.
    expect(done.imageUrl).toBe(firstBackground)
  })

  // TC-BG-08 — AC-11, refine that didn't want a background.
  test("AC-11: a refine that didn't want a background leaves the skip unchanged", async () => {
    await addNonDefaultImageRow(t.api)
    const draft = await generate(t, `BG refine leaves __MOCK_BG_FAIL__ ${Date.now()}`)
    expect((draft.backgroundSkipped as { reason: string }).reason).toBe('PROVIDER_ERROR')

    // A provider resolves, so this refine really decides — and does not want one.
    const done = await refine(t, draft.id as string, 'Make the headline bigger __MOCK_BG_NOT_NEEDED__ __VERIFY_PASS__')
    expect(done.currentRevisionNumber).toBe(2) // committed, and still...
    expect(done.backgroundSkipped).toEqual(draft.backgroundSkipped) // ...unchanged
  })

  // TC-BG-09 — the FR-07 refine rule with no provider: refine resolves first and
  // never decides, so it can't know whether one was wanted and leaves the skip.
  test('AC-11: a refine on a team with no image provider leaves the skip unchanged (never NO_PROVIDER)', async () => {
    const row = await addNonDefaultImageRow(t.api)
    const draft = await generate(t, `BG refine no provider __MOCK_BG_FAIL__ ${Date.now()}`)
    expect((draft.backgroundSkipped as { reason: string }).reason).toBe('PROVIDER_ERROR')

    // The team loses its only image provider; the next refine asks for one.
    expect((await t.api.patch(`/api/admin/providers/${row.id}`, { isEnabled: false })).status()).toBe(200)
    const done = await refine(t, draft.id as string, 'Put a city skyline behind it __MOCK_BG__ __VERIFY_PASS__')
    expect(done.currentRevisionNumber).toBe(2)
    expect(done.backgroundSkipped).toEqual(draft.backgroundSkipped) // still the PROVIDER_ERROR
    expect(done.imageUrl).toBeNull()
  })

  // TC-BG-10 — FR-07 link: a team EDITOR is sent to /settings, never /team.
  test('FR-07: a team editor viewing a NO_PROVIDER draft gets the /settings link, not /team', async ({ request, page }) => {
    const sa = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const probe = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    const editorId = (await (await probe.get('/api/me')).json()).userId as string
    expect(editorId).toBeTruthy()
    await probe.dispose()
    await addTeamMember(sa, t.teamId, editorId, 'EDITOR')
    try {
      const editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD, { team: t.teamName })
      const draft = await generate({ ...t, api: editor }, `BG editor link __MOCK_BG__ ${Date.now()}`)
      expect((draft.backgroundSkipped as { reason: string }).reason).toBe('NO_PROVIDER')
      await editor.dispose()

      await pageLoginToTeam(page, t.teamId, EDITOR_EMAIL, EDITOR_PASSWORD)
      await page.goto(`/drafts/${draft.id}`)
      const notice = page.getByTestId('background-notice')
      await expect(notice).toBeVisible()
      await expect(notice).toContainText(NO_PROVIDER_TEXT)
      await expect(notice.getByRole('link', { name: 'Open Settings' })).toHaveAttribute('href', '/settings')
      await expect(notice.locator('a[href="/team"]')).toHaveCount(0)
    } finally {
      // The seed editor must leave with exactly the memberships it came with.
      expect((await sa.del(`/api/admin/teams/${t.teamId}/members/${editorId}`)).status()).toBe(204)
      await sa.dispose()
    }
  })
})
