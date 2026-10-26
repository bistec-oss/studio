import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { loginAs, waitForDraft, addTeamMember, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'
import { ADMIN_EMAIL, ADMIN_PASSWORD } from '../helpers/ui'

// §AB — The caption credential route (change 024, TC-ROUTE-01 → TC-ROUTE-09).
//
// Contract (spec FR-02 → FR-10):
//   Team.captionRoute (null = never chosen, CLI, API_KEY) decides the
//   credential captions run on. One pure selector (selectRoute) answers it for
//   resolveCopyProvider, copyProviderIsClaude, GET/PUT /api/team/caption-route,
//   the brief wizard, POST /api/briefs and the Opus gate's credential tier. A
//   chosen route can only run or fail closed; a never-chosen team is today's
//   behaviour, byte for byte.
//
// Seams (MOCK_AI + MOCK_PUPPETEER):
//   - the MOCK_AI copy provider records the decision's route on its
//     GET /api/test/model-calls record (label "copy", field `route`); a chosen
//     route that is not ready throws before the mock and records nothing.
//   - the stamp (DraftCaption.route, Draft.headlineRoute) is read through prisma.
//
// Not covered here, deliberately (spec A3): the CLI route's happy path. The
// E2E server runs API mode (.env.test, DESIGN_PROVIDER=claude-html), where a
// chosen CLI route is not-ready (TC-ROUTE-04). The CLI path is covered by the
// unit tests (captionRouteResolve, captionRouteGate).
//
// Isolation: every case runs on a team created for it (as background-notice
// does), so the seeded Bistec and ClientX teams stay on "never chosen" and no
// route outlives its case. The model-calls ring is global, so it is cleared
// before each case and after the file.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const EDITOR_EMAIL = 'editor@bisteccare.lk'
const EDITOR_PASSWORD = 'BistecStudio2026!'

test.describe.configure({ mode: 'serial' })

const CALLS = '/api/test/model-calls'
type Call = { surface: string; label: string | null; route: string | null }

interface Row {
  id: string
  providerKey: string
}
interface TeamSession {
  api: ApiClient
  teamId: string
  teamName: string
  kitId: string
  dispose(): Promise<void>
}

async function freshTeam(request: APIRequestContext, label: string): Promise<TeamSession> {
  const sa = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  const name = `Route ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const teamRes = await sa.post('/api/admin/teams', { name })
  expect(teamRes.status()).toBe(201)
  const team = await teamRes.json()
  const api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD, { team: name })
  const kitRes = await api.post('/api/admin/brandkits', { name: 'Route Kit', colors: ['#0284c7', '#020617'] })
  expect(kitRes.status()).toBe(201)
  return {
    api,
    teamId: team.id,
    teamName: name,
    kitId: (await kitRes.json()).id,
    async dispose() {
      await api.dispose()
      await sa.del(`/api/admin/teams/${team.id}`)
      await sa.dispose()
    },
  }
}

let rowSeq = 0
async function addRow(api: ApiClient, kind: 'anthropic' | 'openai', isDefault = true): Promise<Row> {
  rowSeq += 1
  const apiKey = kind === 'anthropic' ? `sk-ant-e2e-route-key-${rowSeq}` : `sk-e2e-route-openai-key-${rowSeq}`
  const res = await api.post('/api/admin/providers', { apiKey, slot: 'COPY', isDefault })
  expect(res.status(), await res.text()).toBe(201)
  return res.json()
}

type RouteState = {
  setting: string | null
  state: string
  effective: string | null
  servingProviderId: string | null
  message: string | null
  mode: string
}
const getRoute = async (api: ApiClient): Promise<RouteState> => (await api.get('/api/team/caption-route')).json()
async function putRoute(api: ApiClient, route: 'CLI' | 'API_KEY' | null): Promise<RouteState> {
  const res = await api.put('/api/team/caption-route', { route })
  expect(res.status(), await res.text()).toBe(200)
  return res.json()
}

async function clearCalls(api: ApiClient) {
  expect((await api.del(CALLS)).status()).toBe(204)
}
async function copyCalls(api: ApiClient): Promise<Call[]> {
  const res = await api.get(CALLS)
  expect(res.status()).toBe(200)
  return ((await res.json()).calls as Call[]).filter((c) => c.label === 'copy')
}

function briefBody(t: TeamSession, topic: string, copyProviderKey?: string) {
  return {
    topic,
    goal: 'awareness',
    tone: 'professional',
    channels: ['LINKEDIN'],
    designMode: 'GENERATE',
    copyProviderKey,
    brandKitId: t.kitId,
  }
}

// Create a brief and run it; the draft is returned whatever it ended as.
async function generate(t: TeamSession, topic: string, copyProviderKey?: string): Promise<Record<string, unknown>> {
  const briefRes = await t.api.post('/api/briefs', briefBody(t, topic, copyProviderKey))
  expect(briefRes.status(), await briefRes.text()).toBe(201)
  const brief = await briefRes.json()
  const res = await t.api.post('/api/generate/assemble-b', { briefId: brief.id })
  expect(res.status()).toBe(202)
  return waitForDraft(t.api, (await res.json()).draftId)
}

async function pageLoginToTeam(page: Page, teamId: string) {
  await page.goto('/login')
  await page.getByPlaceholder('Username').fill(ADMIN_EMAIL)
  await page.getByPlaceholder('Password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => url.pathname === '/' || url.pathname === '/choose-team')
  // page.request shares the browser context's cookie jar.
  const res = await page.request.post('/api/me/active-team', { data: { teamId } })
  expect(res.ok()).toBe(true)
}

// A Path B walk to the Review step on `kitId`.
async function walkToReview(page: Page, kitId: string, topic: string) {
  await page.goto('/brief')
  await expect(page.getByRole('heading', { name: 'Select a campaign' })).toBeVisible({ timeout: 20_000 })
  const cont = page.getByRole('button', { name: /continue/i })
  await cont.click()
  await expect(page.getByRole('heading', { name: 'Size & Design' })).toBeVisible()
  const kit = page.getByRole('combobox', { name: 'Brand kit' })
  await expect(kit.locator(`option[value="${kitId}"]`)).toBeAttached()
  await kit.selectOption(kitId)
  await page.getByRole('button', { name: /^Freeform/ }).click()
  await expect(page.getByRole('button', { name: 'No reference' })).toBeVisible()
  await cont.click()
  await expect(page.getByRole('heading', { name: 'Description & caption direction' })).toBeVisible()
  await page.getByPlaceholder('e.g. Q3 product launch').fill(topic)
  await page.locator('textarea').fill('Announce the caption route with a short call to action.')
  for (const heading of [/Images/, 'Review & Generate']) {
    await cont.click()
    await expect(page.getByRole('heading', { name: heading })).toBeVisible()
  }
}

async function discardBriefDrafts(api: ApiClient, before: Set<string>) {
  const body = await (await api.get('/api/brief-drafts')).json()
  for (const d of (body.drafts ?? []) as { id: string }[]) {
    if (!before.has(d.id)) await api.del(`/api/brief-drafts/${d.id}`)
  }
}

test.describe('§AB — the caption credential route', () => {
  let t: TeamSession
  test.beforeEach(async ({ request }, testInfo) => {
    test.skip(!MOCKED() || !dbAvailable, 'needs MOCK_AI + MOCK_PUPPETEER and test DB access')
    t = await freshTeam(request, testInfo.title.slice(0, 12))
    await clearCalls(t.api)
  })
  test.afterEach(async () => {
    await t?.dispose()
  })
  test.afterAll(async ({ playwright }) => {
    if (!MOCKED()) return
    const ctx = await playwright.request.newContext({ baseURL: process.env.TEST_BASE_URL })
    try {
      const a = await loginAs(ctx, ADMIN_EMAIL, ADMIN_PASSWORD)
      await clearCalls(a)
      await a.dispose()
    } finally {
      await ctx.dispose()
    }
  })

  // TC-ROUTE-01 — AC-02, AC-11 (no choice): today's resolution, with the route recorded.
  test('TC-ROUTE-01: a never-chosen team is unset and records its legacy route', async () => {
    const anthropic = await addRow(t.api, 'anthropic')
    const state = await getRoute(t.api)
    expect(state).toMatchObject({ setting: null, state: 'unset', effective: 'API_KEY', message: null })
    expect(state.servingProviderId).toBe(anthropic.id)

    let draft = await generate(t, `Route 01a ${Date.now()}`, anthropic.providerKey)
    expect(draft.status, String(draft.failureReason)).toBe('EXPORTED')
    let calls = await copyCalls(t.api)
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) expect(c.route).toBe('API_KEY')

    // An openai default row: byte-identical to today, recorded as OTHER.
    const openai = await addRow(t.api, 'openai')
    await clearCalls(t.api)
    draft = await generate(t, `Route 01b ${Date.now()}`, openai.providerKey)
    expect(draft.status, String(draft.failureReason)).toBe('EXPORTED')
    calls = await copyCalls(t.api)
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) expect(c.route).toBe('OTHER')
  })

  // TC-ROUTE-02 — AC-04, AC-05, AC-11 (the reported example).
  test('TC-ROUTE-02: API_KEY with an anthropic row is ready, serves captions and stamps API_KEY', async () => {
    const anthropic = await addRow(t.api, 'anthropic')
    const state = await putRoute(t.api, 'API_KEY')
    expect(state).toMatchObject({ setting: 'API_KEY', state: 'ready', effective: 'API_KEY', message: null })
    expect(state.servingProviderId).toBe(anthropic.id)

    // No key on the brief: a chosen route ignores it.
    const draft = await generate(t, `Route 02 ${Date.now()}`)
    expect(draft.status, String(draft.failureReason)).toBe('EXPORTED')
    const rows = await prisma!.draftCaption.findMany({ where: { draftId: draft.id as string } })
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) expect(r.route, r.channel).toBe('API_KEY')
    const row = await prisma!.draft.findUniqueOrThrow({
      where: { id: draft.id as string },
      select: { headlineRoute: true },
    })
    expect(row.headlineRoute).toBe('API_KEY')
    const calls = await copyCalls(t.api)
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) expect(c.route).toBe('API_KEY')
  })

  // TC-ROUTE-03 — AC-04: fail closed.
  test('TC-ROUTE-03: API_KEY with the row deleted is not-ready, fails the run and uses no other key', async () => {
    const anthropic = await addRow(t.api, 'anthropic')
    await putRoute(t.api, 'API_KEY')
    // The brief is created while the route is ready; the row goes before it runs.
    const briefRes = await t.api.post('/api/briefs', briefBody(t, `Route 03 ${Date.now()}`))
    expect(briefRes.status()).toBe(201)
    const brief = await briefRes.json()
    expect((await t.api.del(`/api/admin/providers/${anthropic.id}`)).ok()).toBe(true)

    const state = await getRoute(t.api)
    expect(state).toMatchObject({ setting: 'API_KEY', state: 'not-ready', effective: null, servingProviderId: null })
    expect(state.message).toContain('API key route')

    const res = await t.api.post('/api/generate/assemble-b', { briefId: brief.id })
    expect(res.status()).toBe(202)
    const draft = await waitForDraft(t.api, (await res.json()).draftId)
    expect(draft.status).toBe('FAILED')
    expect(String(draft.failureReason)).toContain('API key route')
    expect(await copyCalls(t.api)).toEqual([])
  })

  // TC-ROUTE-04 — AC-04: CLI in an API-mode server.
  test('TC-ROUTE-04: CLI chosen in this API-mode server is not-ready and the run fails closed', async () => {
    const anthropic = await addRow(t.api, 'anthropic')
    const briefRes = await t.api.post('/api/briefs', briefBody(t, `Route 04 ${Date.now()}`, anthropic.providerKey))
    expect(briefRes.status()).toBe(201)
    const brief = await briefRes.json()

    const state = await putRoute(t.api, 'CLI')
    expect(state).toMatchObject({ setting: 'CLI', state: 'not-ready', effective: null, mode: 'api' })
    expect(state.message).toContain('CLI route')
    expect(state.message).toContain('not in CLI mode')

    const res = await t.api.post('/api/generate/assemble-b', { briefId: brief.id })
    expect(res.status()).toBe(202)
    const draft = await waitForDraft(t.api, (await res.json()).draftId)
    expect(draft.status).toBe('FAILED')
    expect(String(draft.failureReason)).toContain('CLI route')
    expect(await copyCalls(t.api)).toEqual([])
  })

  // TC-ROUTE-05 — AC-06, AC-07: the brief's key.
  test('TC-ROUTE-05: a chosen route ignores the brief key; a never-chosen team still honours it; not-ready is a 422', async () => {
    const anthropic = await addRow(t.api, 'anthropic')
    const openai = await addRow(t.api, 'openai', false)
    await putRoute(t.api, 'API_KEY')

    const draft = await generate(t, `Route 05a ${Date.now()}`, openai.providerKey)
    expect(draft.status, String(draft.failureReason)).toBe('EXPORTED')
    const brief = await prisma!.brief.findFirstOrThrow({ where: { drafts: { some: { id: draft.id as string } } } })
    expect(brief.copyProviderKey).toBe('cli')
    let calls = await copyCalls(t.api)
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) expect(c.route).toBe('API_KEY')

    // Cleared back to never chosen: the same key picks the openai row again.
    await putRoute(t.api, null)
    await clearCalls(t.api)
    const again = await generate(t, `Route 05b ${Date.now()}`, openai.providerKey)
    expect(again.status, String(again.failureReason)).toBe('EXPORTED')
    calls = await copyCalls(t.api)
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) expect(c.route).toBe('OTHER')

    // A chosen route that is not ready: 422, and no brief is created.
    await putRoute(t.api, 'API_KEY')
    expect((await t.api.del(`/api/admin/providers/${anthropic.id}`)).ok()).toBe(true)
    const before = await prisma!.brief.count({ where: { teamId: t.teamId } })
    const refused = await t.api.post('/api/briefs', briefBody(t, `Route 05c ${Date.now()}`, openai.providerKey))
    expect(refused.status()).toBe(422)
    expect(await refused.json()).toMatchObject({ code: 'CAPTION_ROUTE_NOT_READY' })
    expect(await prisma!.brief.count({ where: { teamId: t.teamId } })).toBe(before)
  })

  // TC-ROUTE-06 — AC-14 (E2E half): the scheduler follows the team route.
  test('TC-ROUTE-06: a scheduled entry runs on the team route, and fails naming it once the row is gone', async () => {
    const anthropic = await addRow(t.api, 'anthropic')
    await putRoute(t.api, 'API_KEY')
    const camp = await (await t.api.post('/api/campaigns', { name: `Route Camp ${Date.now()}`, brandKitId: t.kitId })).json()
    const entryBody = (topic: string) => ({
      topic,
      goal: 'Awareness',
      tone: 'professional',
      channels: ['INSTAGRAM'],
      designMode: 'GENERATE',
      generateAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
      postAction: 'HOLD',
    })
    const makeDueAndTick = async (entryId: string) => {
      await prisma!.scheduledGeneration.update({
        where: { id: entryId },
        data: { generateAt: new Date(Date.now() - 1000), nextRetryAt: null },
      })
      expect((await t.api.post('/api/test/generation-tick', {})).status()).toBe(200)
    }

    const ok = await (await t.api.post(`/api/campaigns/${camp.id}/queue`, entryBody(`Route 06a ${Date.now()}`))).json()
    await makeDueAndTick(ok.id)
    const done = await prisma!.scheduledGeneration.findUniqueOrThrow({ where: { id: ok.id } })
    expect(done.draftId).toBeTruthy()
    const calls = await copyCalls(t.api)
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) expect(c.route).toBe('API_KEY')

    expect((await t.api.del(`/api/admin/providers/${anthropic.id}`)).ok()).toBe(true)
    await clearCalls(t.api)
    const bad = await (await t.api.post(`/api/campaigns/${camp.id}/queue`, entryBody(`Route 06b ${Date.now()}`))).json()
    await makeDueAndTick(bad.id)
    const failed = await prisma!.scheduledGeneration.findUniqueOrThrow({ where: { id: bad.id } })
    expect(failed.draftId).toBeNull()
    expect(failed.errorReason).toContain('API key route')
    expect(await copyCalls(t.api)).toEqual([])
  })

  // TC-ROUTE-07 — AC-08: the Opus gate's credential tier for captions.
  test('TC-ROUTE-07: /api/models reports captionCredential "team" on API_KEY and the plain credential otherwise', async () => {
    await addRow(t.api, 'anthropic')
    let view = await (await t.api.get('/api/models')).json()
    expect(view.captionCredential).toBe(view.credential)

    await putRoute(t.api, 'API_KEY')
    view = await (await t.api.get('/api/models')).json()
    expect(view.captionCredential).toBe('team')

    await putRoute(t.api, null)
    view = await (await t.api.get('/api/models')).json()
    expect(view.captionCredential).toBe(view.credential)
  })

  // TC-ROUTE-08 — AC-09, AC-10, AC-11: the API, tenancy and /team.
  test('TC-ROUTE-08: the API gates and tenancy, and /team shows the card, the state and the row chips', async ({
    request,
    playwright,
    page,
  }) => {
    // 401 with no valid session (the proxy redirects a cookie-less request to
    // /login, so a bogus session cookie is what reaches the route's own check);
    // 403 for an editor's PUT; 400 for a bad body.
    const anon = await playwright.request.newContext({
      baseURL: process.env.TEST_BASE_URL,
      extraHTTPHeaders: { cookie: 'better-auth.session_token=not-a-real-session' },
    })
    try {
      expect((await anon.get('/api/team/caption-route')).status()).toBe(401)
      expect((await anon.put('/api/team/caption-route', { data: { route: null } })).status()).toBe(401)
    } finally {
      await anon.dispose()
    }
    const sa = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    try {
      const users = (await (await sa.get('/api/admin/users')).json()) as { id: string; email: string }[]
      const editorUser = users.find((u) => u.email === EDITOR_EMAIL)
      expect(editorUser).toBeTruthy()
      await addTeamMember(sa, t.teamId, editorUser!.id, 'EDITOR')
      const editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD, { team: t.teamName })
      try {
        expect((await editor.get('/api/team/caption-route')).status()).toBe(200)
        expect((await editor.put('/api/team/caption-route', { route: 'CLI' })).status()).toBe(403)
      } finally {
        await editor.dispose()
      }
    } finally {
      await sa.dispose()
    }
    for (const bad of [{ route: 'MAGIC' }, { route: 'CLI', teamId: 'x' }, {}]) {
      expect((await t.api.put('/api/team/caption-route', bad)).status()).toBe(400)
    }

    // Team A's PUT leaves team B on unset.
    const b = await freshTeam(request, 'other')
    try {
      await putRoute(t.api, 'API_KEY')
      expect((await getRoute(b.api)).state).toBe('unset')
      expect((await getRoute(b.api)).setting).toBeNull()
    } finally {
      await b.dispose()
    }
    await putRoute(t.api, null)

    // /team: the card, the state line, the chips, the COPY slot.
    const anthropic = await addRow(t.api, 'anthropic')
    await addRow(t.api, 'openai', false)
    await pageLoginToTeam(page, t.teamId)
    await page.goto('/team')
    const card = page.getByRole('region', { name: 'Caption route' })
    await expect(card).toBeVisible({ timeout: 20_000 })
    const stateLine = page.getByTestId('caption-route-state')
    await expect(stateLine).toHaveAttribute('data-state', 'unset')
    await expect(page.getByRole('heading', { name: /Captions \(text generation\)/ })).toBeVisible()
    await expect(page.getByText('Not used in CLI mode')).toHaveCount(0)
    await expect(page.getByText('safe to delete')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Register provider' })).toBeVisible()
    const chips = page.getByTestId('copy-row-serving')
    await expect(chips).toHaveCount(2)
    await expect(page.locator('[data-testid="copy-row-serving"][data-serving="true"]')).toHaveCount(1)
    await expect(page.locator('[data-testid="copy-row-serving"][data-serving="true"]')).toContainText('Serving captions')
    await expect(page.locator('[data-testid="copy-row-serving"][data-serving="false"]')).toContainText('Not serving captions')

    // Choose the API key route: the PUT, then ready.
    const saved = page.waitForResponse(
      (r) => r.url().includes('/api/team/caption-route') && r.request().method() === 'PUT' && r.status() === 200,
    )
    await card.getByRole('tab', { name: 'Anthropic API key' }).click()
    await saved
    await expect(stateLine).toHaveAttribute('data-state', 'ready')
    await expect(card.getByRole('tab', { name: 'Anthropic API key' })).toHaveAttribute('aria-selected', 'true')
    expect((await getRoute(t.api)).servingProviderId).toBe(anthropic.id)

    // Not-ready shows the server's message and says new captions fail.
    expect((await t.api.del(`/api/admin/providers/${anthropic.id}`)).ok()).toBe(true)
    await page.reload()
    await expect(page.getByTestId('caption-route-state')).toHaveAttribute('data-state', 'not-ready')
    await expect(page.getByTestId('caption-route-state')).toContainText('API key route')
    await expect(page.getByTestId('caption-route-state')).toContainText('New captions fail')

    // "Use the default" clears the choice.
    const cleared = page.waitForResponse(
      (r) => r.url().includes('/api/team/caption-route') && r.request().method() === 'PUT' && r.status() === 200,
    )
    await card.getByRole('button', { name: 'Use the default' }).click()
    await cleared
    await expect(page.getByTestId('caption-route-state')).toHaveAttribute('data-state', 'unset')
    await expect(card.getByRole('button', { name: 'Use the default' })).toHaveCount(0)
  })

  // TC-ROUTE-09 — AC-11: the wizard.
  test('TC-ROUTE-09: the wizard gates on a not-ready route and is unchanged for a never-chosen team', async ({ page }) => {
    test.setTimeout(120_000)
    const anthropic = await addRow(t.api, 'anthropic')
    await pageLoginToTeam(page, t.teamId)
    const before = new Set<string>(
      (((await (await t.api.get('/api/brief-drafts')).json()).drafts ?? []) as { id: string }[]).map((d) => d.id),
    )
    try {
      // Never chosen: Generate is live, no warning, and the brief carries the row's key.
      await walkToReview(page, t.kitId, `Route 09a ${Date.now()}`)
      await expect(page.getByRole('button', { name: 'Generate Post' })).toBeEnabled()
      await expect(page.getByTestId('caption-route-warning')).toHaveCount(0)

      // Chosen and ready: the wizard sends no copyProviderKey.
      await putRoute(t.api, 'API_KEY')
      await walkToReview(page, t.kitId, `Route 09b ${Date.now()}`)
      await expect(page.getByRole('button', { name: 'Generate Post' })).toBeEnabled()
      const posted = page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/briefs')
      await page.getByRole('button', { name: 'Generate Post' }).click()
      const body = (await posted).postDataJSON() as Record<string, unknown>
      expect(body).not.toHaveProperty('copyProviderKey')
      await page.waitForURL(/\/drafts\/[^/]+$/, { timeout: 30_000 })

      // Chosen and not ready: Generate is disabled and the server's message shows.
      expect((await t.api.del(`/api/admin/providers/${anthropic.id}`)).ok()).toBe(true)
      const message = (await getRoute(t.api)).message!
      expect(message).toContain('API key route')
      await walkToReview(page, t.kitId, `Route 09c ${Date.now()}`)
      await expect(page.getByTestId('caption-route-warning')).toContainText(message)
      await expect(page.getByRole('button', { name: 'Generate Post' })).toBeDisabled()
    } finally {
      await discardBriefDrafts(t.api, before)
    }
  })
})
