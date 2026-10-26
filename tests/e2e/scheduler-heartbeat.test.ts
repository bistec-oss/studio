import { test, expect, type Page } from '@playwright/test'
import { loginAs, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'

// §Z (023): the scheduler heartbeat. The table is global and no worker runs in
// E2E, so the rows are seeded through POST /api/test/worker-heartbeat (gated on
// MOCK_AI + admin, 404 in prod). Serial, and the rows are cleared before each
// case and after the file, so every other suite sees the default "no rows".

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const MOCKED = () => !!process.env.MOCK_AI

const SEC = 1000
const MIN = 60_000

test.describe.configure({ mode: 'serial' })

async function createCampaign(api: ApiClient, name: string): Promise<{ id: string }> {
  const kit = await (await api.post('/api/admin/brandkits', { name: `${name} Kit`, colors: ['#0284c7'] })).json()
  return (await api.post('/api/campaigns', { name, brandKitId: kit.id })).json()
}

function holdEntry(topic: string) {
  return {
    topic,
    goal: 'Awareness',
    tone: 'professional',
    channels: ['INSTAGRAM'],
    designMode: 'GENERATE',
    generateAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
    postAction: 'HOLD',
  }
}

async function pageLogin(page: Page) {
  await page.goto('/login')
  await page.getByPlaceholder('Username').fill(ADMIN_EMAIL)
  await page.getByPlaceholder('Password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(url => url.pathname === '/' || url.pathname === '/choose-team')
  // A super admin with two teams seeded lands on /choose-team (see
  // campaign-scheduling.test.ts); a fresh navigation settles team resolution.
  await page.goto('/')
  if (page.url().includes('/choose-team')) {
    await page.getByRole('button', { name: 'Bistec' }).click()
    await page.waitForURL(url => url.pathname === '/')
  }
}

test.describe('Scheduler heartbeat (§Z)', () => {
  let admin: ApiClient

  async function seed(loop: 'scheduler' | 'generation', startedAgoMs: number, endedAgoMs: number | null) {
    const res = await admin.post('/api/test/worker-heartbeat', { loop, startedAgoMs, endedAgoMs })
    expect(res.status()).toBe(200)
  }
  async function clear() {
    const res = await admin.post('/api/test/worker-heartbeat', { clear: true })
    expect(res.status()).toBe(200)
  }

  test.beforeEach(async ({ request }) => {
    admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    if (MOCKED()) await clear()
  })
  test.afterEach(async () => { await admin.dispose() })
  test.afterAll(async ({ playwright }) => {
    if (!MOCKED()) return
    const ctx = await playwright.request.newContext({ baseURL: process.env.TEST_BASE_URL })
    try {
      const a = await loginAs(ctx, ADMIN_EMAIL, ADMIN_PASSWORD)
      await a.post('/api/test/worker-heartbeat', { clear: true })
      await a.dispose()
    } finally {
      await ctx.dispose()
    }
  })

  test('TC-HB-01: fresh heartbeats, and a generation loop inside a 10-minute tick, show no banner', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const camp = await createCampaign(admin, `HB Fresh ${Date.now()}`)
    await seed('scheduler', 20 * SEC, 10 * SEC)
    await seed('generation', 10 * MIN, null)

    await pageLogin(page)
    // Wait for the status query to settle before asserting an absence. Listen
    // before navigating: the query fires on mount and next refetches at 60 s,
    // so a listener attached after the page loads misses the only response.
    const status = page.waitForResponse(r => r.url().includes('/api/scheduler/status') && r.status() === 200)
    await page.goto(`/campaigns/${camp.id}`)
    await expect(page.getByText(/Planned Posts \(0\)/)).toBeVisible()
    await status
    await expect(page.getByTestId('scheduler-offline-banner')).toHaveCount(0)
  })

  test('TC-HB-02: a generation loop idle for 4 minutes shows the generation banner', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const camp = await createCampaign(admin, `HB Gen ${Date.now()}`)
    await seed('scheduler', 20 * SEC, 10 * SEC)
    await seed('generation', 4 * MIN + 5 * SEC, 4 * MIN)

    await pageLogin(page)
    await page.goto(`/campaigns/${camp.id}`)
    const banner = page.getByTestId('scheduler-offline-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('Scheduler offline')
    await expect(banner).toContainText('The generation loop was last seen')
    await expect(banner).toContainText('Planned posts will not generate')
    await expect(banner).not.toContainText('publishing loop')
  })

  test('TC-HB-03: a publishing loop idle for 4 minutes shows the publishing banner', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const camp = await createCampaign(admin, `HB Pub ${Date.now()}`)
    await seed('scheduler', 4 * MIN + 5 * SEC, 4 * MIN)
    await seed('generation', 20 * SEC, 10 * SEC)

    await pageLogin(page)
    await page.goto(`/campaigns/${camp.id}`)
    const banner = page.getByTestId('scheduler-offline-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('The publishing loop was last seen')
    await expect(banner).toContainText('Scheduled posts will not publish')
    await expect(banner).not.toContainText('generation loop')
  })

  test('TC-HB-04: no rows shows the never-reported banner', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const camp = await createCampaign(admin, `HB Never ${Date.now()}`)

    await pageLogin(page)
    await page.goto(`/campaigns/${camp.id}`)
    const banner = page.getByTestId('scheduler-offline-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('The publishing loop has not reported in')
    await expect(banner).toContainText('The generation loop has not reported in')
  })

  test('TC-HB-05: a retrying entry shows its reason, a first-try one does not', async ({ page }) => {
    if (!MOCKED() || !dbAvailable) { test.skip(); return }
    const camp = await createCampaign(admin, `HB Retry ${Date.now()}`)
    const retrying = await (await admin.post(`/api/campaigns/${camp.id}/queue`, holdEntry('HB retrying post'))).json()
    const fresh = await (await admin.post(`/api/campaigns/${camp.id}/queue`, holdEntry('HB first-try post'))).json()
    const reason = 'No Claude credential for this team. '.repeat(4)
    await prisma!.scheduledGeneration.update({
      where: { id: retrying.id },
      data: { retryCount: 1, errorReason: reason },
    })
    await prisma!.scheduledGeneration.update({
      where: { id: fresh.id },
      data: { retryCount: 0, errorReason: 'HB_SHOULD_NOT_SHOW' },
    })

    await pageLogin(page)
    await page.goto(`/campaigns/${camp.id}`)
    const row = page.getByRole('row', { name: /HB retrying post/ })
    await expect(row).toBeVisible()
    await expect(row.getByText('retry 1')).toBeVisible()
    // Truncated at 80 characters, with the full text in the tooltip.
    const shown = row.getByText(/^No Claude credential/)
    await expect(shown).toBeVisible()
    expect(((await shown.textContent()) ?? '').length).toBe(81)
    await expect(shown).toHaveAttribute('title', reason)
    await expect(page.getByText('HB_SHOULD_NOT_SHOW')).toHaveCount(0)
  })

  test('TC-HB-06: the status route is 401 without a valid session, and has only the contract keys with one', async ({ playwright }) => {
    // The proxy redirects a cookie-less request to /login, so a bogus session
    // cookie is what reaches the route's own check.
    const anon = await playwright.request.newContext({
      baseURL: process.env.TEST_BASE_URL,
      extraHTTPHeaders: { cookie: 'better-auth.session_token=not-a-real-session' },
    })
    try {
      expect((await anon.get('/api/scheduler/status')).status()).toBe(401)
    } finally {
      await anon.dispose()
    }

    const res = await admin.get('/api/scheduler/status')
    expect(res.status()).toBe(200)
    expect(res.headers()['cache-control']).toContain('no-store')
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['loops', 'offline'])
    expect(body.loops.map((l: { loop: string }) => l.loop)).toEqual(['scheduler', 'generation'])
    for (const l of body.loops) expect(Object.keys(l).sort()).toEqual(['lastSeenAt', 'loop', 'state'])
  })
})
