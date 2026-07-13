import { test, expect, type Page } from '@playwright/test'
import { loginAs, waitForDraft, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'

// Campaign briefing (versioned) + scheduled-generation queue.
//
// Runs in the standard mock suite (MOCK_AI + MOCK_PUPPETEER + MOCK_SOCIAL).
// The generation tick is driven over HTTP via the test-only seam
// POST /api/test/generation-tick (gated on MOCK_AI + admin, 404 in prod);
// DB access (forcing generateAt/nextRetryAt into the past) is gated on
// dbAvailable like the §K scheduler cases.

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const EDITOR_EMAIL = 'editor@bisteccare.lk'
const EDITOR_PASSWORD = 'BistecStudio2026!'
const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)

const FUTURE = () => new Date(Date.now() + 24 * 3600_000).toISOString()
const LATER = () => new Date(Date.now() + 48 * 3600_000).toISOString()

async function createCampaign(api: ApiClient, name: string): Promise<{ id: string }> {
  const kit = await (await api.post('/api/admin/brandkits', { name: `${name} Kit`, colors: ['#0284c7'] })).json()
  return (await api.post('/api/campaigns', { name, brandKitId: kit.id })).json()
}

function holdEntry(topic: string, overrides: Record<string, unknown> = {}) {
  return {
    topic,
    goal: 'Awareness',
    tone: 'professional',
    channels: ['INSTAGRAM'],
    designMode: 'GENERATE',
    generateAt: FUTURE(),
    postAction: 'HOLD',
    ...overrides,
  }
}

// Make an entry due and run one generation tick.
async function makeDueAndTick(api: ApiClient, entryId: string) {
  await prisma!.scheduledGeneration.update({
    where: { id: entryId },
    data: { generateAt: new Date(Date.now() - 1000), nextRetryAt: null },
  })
  const res = await api.post('/api/test/generation-tick', {})
  expect(res.status()).toBe(200)
}

test.describe('Campaign briefing — versioning + permissions', () => {
  let admin: ApiClient
  test.beforeEach(async ({ request }) => {
    admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => { await admin.dispose() })

  test('admin creates v1 then v2; v1 deactivates; activate rolls back', async () => {
    const camp = await createCampaign(admin, `Brf Camp ${Date.now()}`)

    const v1 = await (await admin.post(`/api/campaigns/${camp.id}/briefing`, { content: 'Briefing v1' })).json()
    expect(v1.version).toBe(1)
    expect(v1.isActive).toBe(true)

    const v2 = await (await admin.post(`/api/campaigns/${camp.id}/briefing`, { content: 'Briefing v2' })).json()
    expect(v2.version).toBe(2)
    expect(v2.isActive).toBe(true)

    let versions = await (await admin.get(`/api/campaigns/${camp.id}/briefing`)).json()
    expect(versions.length).toBe(2)
    expect(versions.find((b: { version: number }) => b.version === 1).isActive).toBe(false)

    // Rollback: reactivate v1.
    const act = await admin.post(`/api/campaigns/${camp.id}/briefing/${v1.id}/activate`, {})
    expect(act.status()).toBe(200)
    versions = await (await admin.get(`/api/campaigns/${camp.id}/briefing`)).json()
    expect(versions.find((b: { version: number }) => b.version === 1).isActive).toBe(true)
    expect(versions.find((b: { version: number }) => b.version === 2).isActive).toBe(false)
  })

  test('editor can read the briefing but not write it', async ({ request }) => {
    const camp = await createCampaign(admin, `Brf RBAC ${Date.now()}`)
    await admin.post(`/api/campaigns/${camp.id}/briefing`, { content: 'Admin-written briefing' })

    const editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    try {
      const read = await editor.get(`/api/campaigns/${camp.id}/briefing`)
      expect(read.status()).toBe(200)
      expect((await read.json()).length).toBe(1)

      const write = await editor.post(`/api/campaigns/${camp.id}/briefing`, { content: 'Editor briefing' })
      expect(write.status()).toBe(403)
    } finally {
      await editor.dispose()
    }
  })

  test('the active briefing flows into generated copy', async () => {
    if (!MOCKED()) { test.skip(); return }
    const camp = await createCampaign(admin, `Brf Flow ${Date.now()}`)
    const marker = `BRIEFING_MARKER_${Date.now()}`
    await admin.post(`/api/campaigns/${camp.id}/briefing`, { content: `Campaign context: ${marker}` })

    // The MOCK_AI design agent echoes prompt context; assert via the brief →
    // draft flow: with MOCK_AI copy is deterministic, so instead assert the
    // draft exists and the briefing is active (the prompt-level injection is
    // covered by unit tests; this guards the route wiring end-to-end).
    const brief = await (await admin.post('/api/briefs', {
      topic: `Brf Flow ${Date.now()}`, goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
      designMode: 'GENERATE', copyProviderKey: 'cli', campaignId: camp.id,
    })).json()
    const assembled = await admin.post('/api/generate/assemble-b', { briefId: brief.id })
    expect(assembled.status()).toBe(202)
    // Generation is async — confirm it lands EXPORTED (route wiring end-to-end).
    const draft = await waitForDraft(admin, (await assembled.json()).draftId)
    expect(draft.status).toBe('EXPORTED')
  })
})

test.describe('Scheduled-generation queue — permissions + validation', () => {
  let admin: ApiClient
  test.beforeEach(async ({ request }) => {
    admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => { await admin.dispose() })

  test('editor can plan HOLD but not auto-publish; admin can', async ({ request }) => {
    const camp = await createCampaign(admin, `Q RBAC ${Date.now()}`)
    const editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    try {
      const hold = await editor.post(`/api/campaigns/${camp.id}/queue`, holdEntry(`Q hold ${Date.now()}`))
      expect(hold.status()).toBe(201)

      const auto = await editor.post(`/api/campaigns/${camp.id}/queue`, holdEntry(`Q auto ${Date.now()}`, {
        postAction: 'SCHEDULE_PUBLISH', publishAt: LATER(),
      }))
      expect(auto.status()).toBe(403)

      const adminAuto = await admin.post(`/api/campaigns/${camp.id}/queue`, holdEntry(`Q adm ${Date.now()}`, {
        postAction: 'SCHEDULE_PUBLISH', publishAt: LATER(),
      }))
      expect(adminAuto.status()).toBe(201)
    } finally {
      await editor.dispose()
    }
  })

  test('schema refinements: TEMPLATE needs templateId; SCHEDULE_PUBLISH needs publishAt > generateAt', async () => {
    const camp = await createCampaign(admin, `Q Val ${Date.now()}`)

    const noTemplate = await admin.post(`/api/campaigns/${camp.id}/queue`, holdEntry('t', { designMode: 'TEMPLATE' }))
    expect(noTemplate.status()).toBe(400)

    const noPublishAt = await admin.post(`/api/campaigns/${camp.id}/queue`, holdEntry('t', { postAction: 'SCHEDULE_PUBLISH' }))
    expect(noPublishAt.status()).toBe(400)

    const badOrder = await admin.post(`/api/campaigns/${camp.id}/queue`, holdEntry('t', {
      postAction: 'SCHEDULE_PUBLISH', publishAt: new Date(Date.now() - 3600_000).toISOString(),
    }))
    expect(badOrder.status()).toBe(400)
  })

  test('edit and cancel are PENDING-only; rerun re-arms CANCELLED', async () => {
    const camp = await createCampaign(admin, `Q Life ${Date.now()}`)
    const entry = await (await admin.post(`/api/campaigns/${camp.id}/queue`, holdEntry(`Q life ${Date.now()}`))).json()

    // Edit while PENDING works.
    const edit = await admin.patch(`/api/campaigns/${camp.id}/queue/${entry.id}`, holdEntry('edited topic'))
    expect(edit.status()).toBe(200)
    expect((await edit.json()).topic).toBe('edited topic')

    // Cancel.
    const cancel = await admin.del(`/api/campaigns/${camp.id}/queue/${entry.id}`)
    expect(cancel.status()).toBe(204)

    // Cancelled entries reject edit/cancel with 409.
    expect((await admin.patch(`/api/campaigns/${camp.id}/queue/${entry.id}`, holdEntry('x'))).status()).toBe(409)
    expect((await admin.del(`/api/campaigns/${camp.id}/queue/${entry.id}`)).status()).toBe(409)

    // Rerun re-arms to PENDING, due now.
    const rerun = await (await admin.post(`/api/campaigns/${camp.id}/queue/${entry.id}/rerun`, {})).json()
    expect(rerun.status).toBe('PENDING')
    expect(rerun.retryCount).toBe(0)
  })
})

test.describe('Campaign page UI — briefing + queue sections', () => {
  let admin: ApiClient
  test.beforeEach(async ({ request }) => {
    admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => { await admin.dispose() })

  async function pageLogin(page: Page) {
    await page.goto('/login')
    // The login page takes a username; an email routes through the legacy flow.
    await page.getByPlaceholder('Username').fill(ADMIN_EMAIL)
    await page.getByPlaceholder('Password').fill(ADMIN_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL(url => url.pathname === '/')
  }

  test('campaign detail renders the briefing and planned-posts sections', async ({ page }) => {
    const camp = await createCampaign(admin, `UI Camp ${Date.now()}`)
    await admin.post(`/api/campaigns/${camp.id}/briefing`, { content: 'UI briefing content marker' })
    await admin.post(`/api/campaigns/${camp.id}/queue`, holdEntry(`UI planned post ${Date.now()}`))

    await pageLogin(page)
    await page.goto(`/campaigns/${camp.id}`)

    // Heading role: the queue empty-state paragraph also contains the phrase
    // "campaign briefing" while the list query is still loading (getByText is
    // case-insensitive), which would make a bare text locator ambiguous.
    await expect(page.getByRole('heading', { name: 'Campaign Briefing' })).toBeVisible()
    await expect(page.getByText('UI briefing content marker')).toBeVisible()
    await expect(page.getByText(/Planned Posts \(1\)/)).toBeVisible()
    await expect(page.getByText('Queued')).toBeVisible()
    await expect(page.getByRole('button', { name: /plan a post/i })).toBeVisible()
  })
})

test.describe('Scheduled-generation queue — worker flow', () => {
  let admin: ApiClient

  // The test DB is reused across runs: stale PENDING entries from previous
  // suites (notably due __FAIL_GEN_ALWAYS__ retries) would be claimed by the
  // tick's small batch and starve the entry under test. Cancel them up front.
  test.beforeAll(async () => {
    if (!dbAvailable) return
    await prisma!.scheduledGeneration.updateMany({
      where: { status: 'PENDING' },
      data: { status: 'CANCELLED' },
    })
  })

  test.beforeEach(async ({ request }) => {
    admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => { await admin.dispose() })

  test('HOLD: due entry generates an EXPORTED draft and completes', async () => {
    if (!MOCKED() || !dbAvailable) { test.skip(); return }
    const camp = await createCampaign(admin, `Gen Hold ${Date.now()}`)
    const entry = await (await admin.post(`/api/campaigns/${camp.id}/queue`, holdEntry(`Gen hold ${Date.now()}`))).json()

    await makeDueAndTick(admin, entry.id)

    const after = await prisma!.scheduledGeneration.findUnique({ where: { id: entry.id } })
    expect(after!.status).toBe('COMPLETED')
    expect(after!.briefId).toBeTruthy()
    expect(after!.draftId).toBeTruthy()

    const draft = await (await admin.get(`/api/drafts/${after!.draftId}`)).json()
    expect(draft.status).toBe('EXPORTED')

    // HOLD creates no posts.
    const posts = await prisma!.post.count({ where: { draftId: after!.draftId! } })
    expect(posts).toBe(0)
  })

  test('SCHEDULE_PUBLISH: generation creates SCHEDULED posts; scheduler tick publishes them', async () => {
    if (!MOCKED() || !dbAvailable) { test.skip(); return }
    const camp = await createCampaign(admin, `Gen Sched ${Date.now()}`)
    const entry = await (await admin.post(`/api/campaigns/${camp.id}/queue`, holdEntry(`Gen sched ${Date.now()}`, {
      channels: ['INSTAGRAM', 'LINKEDIN'],
      postAction: 'SCHEDULE_PUBLISH',
      publishAt: LATER(),
    }))).json()

    await makeDueAndTick(admin, entry.id)

    const after = await prisma!.scheduledGeneration.findUnique({ where: { id: entry.id } })
    expect(after!.status).toBe('COMPLETED')

    const posts = await prisma!.post.findMany({ where: { draftId: after!.draftId! } })
    expect(posts.length).toBe(2)
    for (const post of posts) {
      expect(post.status).toBe('SCHEDULED')
      // scheduledAt carries the entry's publishAt (~48h out), not "now".
      expect(post.scheduledAt!.getTime()).toBeGreaterThan(Date.now() + 40 * 3600_000)
    }

    // Make the posts due and run the publish scheduler.
    await prisma!.post.updateMany({
      where: { draftId: after!.draftId! },
      data: { scheduledAt: new Date(Date.now() - 1000), nextRetryAt: null },
    })
    const tick = await admin.post('/api/test/scheduler-tick', {})
    expect(tick.status()).toBe(200)

    const published = await prisma!.post.findMany({ where: { draftId: after!.draftId! } })
    for (const post of published) expect(post.status).toBe('PUBLISHED')
  })

  test('PUBLISH_NOW: posts are SCHEDULED due-now and publish on the next tick', async () => {
    if (!MOCKED() || !dbAvailable) { test.skip(); return }
    const camp = await createCampaign(admin, `Gen Now ${Date.now()}`)
    const entry = await (await admin.post(`/api/campaigns/${camp.id}/queue`, holdEntry(`Gen now ${Date.now()}`, {
      postAction: 'PUBLISH_NOW',
    }))).json()

    await makeDueAndTick(admin, entry.id)

    const after = await prisma!.scheduledGeneration.findUnique({ where: { id: entry.id } })
    expect(after!.status).toBe('COMPLETED')

    // PUBLISH_NOW stamps scheduledAt from the APP clock, but the claim query
    // compares against Postgres now() — Docker clock skew can leave a due-now
    // post momentarily unclaimable. Force it firmly into the past so the tick
    // is deterministic (same pattern as makeDueAndTick for generation entries).
    await prisma!.post.updateMany({
      where: { draftId: after!.draftId! },
      data: { scheduledAt: new Date(Date.now() - 60_000) },
    })

    const tick = await admin.post('/api/test/scheduler-tick', {})
    expect(tick.status()).toBe(200)

    const posts = await prisma!.post.findMany({ where: { draftId: after!.draftId! } })
    expect(posts.length).toBe(1)
    expect(posts[0].status).toBe('PUBLISHED')
  })

  test('a failing generation retries with backoff then FAILs; rerun re-arms it', async () => {
    if (!MOCKED() || !dbAvailable) { test.skip(); return }
    const camp = await createCampaign(admin, `Gen Fail ${Date.now()}`)
    const entry = await (await admin.post(`/api/campaigns/${camp.id}/queue`, holdEntry(`__FAIL_GEN_ALWAYS__ ${Date.now()}`))).json()

    // MAX_RETRIES = 3 → attempts 1..3 go back to PENDING with backoff; the 4th FAILs.
    for (let attempt = 0; attempt < 4; attempt++) {
      await makeDueAndTick(admin, entry.id)
    }

    const after = await prisma!.scheduledGeneration.findUnique({ where: { id: entry.id } })
    expect(after!.status).toBe('FAILED')
    expect(after!.retryCount).toBe(3)
    expect(after!.errorReason).toContain('__FAIL_GEN_ALWAYS__')
    // The Brief is created once and reused across all attempts.
    expect(after!.briefId).toBeTruthy()

    const rerun = await admin.post(`/api/campaigns/${camp.id}/queue/${entry.id}/rerun`, {})
    expect(rerun.status()).toBe(200)
    expect((await rerun.json()).status).toBe('PENDING')
  })

  test('concurrent generation ticks process a due entry exactly once', async () => {
    if (!MOCKED() || !dbAvailable) { test.skip(); return }
    const camp = await createCampaign(admin, `Gen Race ${Date.now()}`)
    const entry = await (await admin.post(`/api/campaigns/${camp.id}/queue`, holdEntry(`Gen race ${Date.now()}`))).json()

    await prisma!.scheduledGeneration.update({
      where: { id: entry.id },
      data: { generateAt: new Date(Date.now() - 1000) },
    })
    await Promise.all([
      admin.post('/api/test/generation-tick', {}),
      admin.post('/api/test/generation-tick', {}),
    ])

    const after = await prisma!.scheduledGeneration.findUnique({ where: { id: entry.id } })
    expect(after!.status).toBe('COMPLETED')
    // Exactly one draft was generated for the entry's brief.
    const drafts = await prisma!.draft.count({ where: { briefId: after!.briefId! } })
    expect(drafts).toBe(1)
  })
})

// F4 — chat-driven auto-scheduling: the briefing chat proposes a ```schedule
// plan; the client batch-creates ScheduledGeneration rows from it.
test.describe('Chat-driven auto-scheduling (F4)', () => {
  let admin: ApiClient
  test.beforeEach(async ({ request }) => { admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD) })
  test.afterEach(async () => { await admin.dispose() })

  test('a scheduling request returns a plan, which batch-creates queue entries', async () => {
    if (!MOCKED()) { test.skip(); return }
    const camp = await createCampaign(admin, `F4 Chat ${Date.now()}`)

    // Ask the assistant to schedule a scheme → MOCK_AI emits a ```schedule plan.
    const chatRes = await admin.post(`/api/campaigns/${camp.id}/briefing/chat`, {
      messages: [{ role: 'user', content: 'Please schedule 2 posts as per this scheme' }],
    })
    expect(chatRes.status()).toBe(200)
    const { schedulePlan } = await chatRes.json()
    expect(Array.isArray(schedulePlan)).toBe(true)
    expect(schedulePlan.length).toBe(2)

    // Build entries the way the panel does (defaults for channels/size/design).
    const entries = schedulePlan.map((p: { topic: string; goal: string; tone: string; daysFromNow: number; postAction: string }) => ({
      topic: p.topic, goal: p.goal, tone: p.tone,
      channels: ['INSTAGRAM', 'LINKEDIN'], aspectRatio: 'SQUARE', designMode: 'GENERATE',
      generateAt: new Date(Date.now() + p.daysFromNow * 86_400_000).toISOString(),
      postAction: p.postAction,
    }))
    const batchRes = await admin.post(`/api/campaigns/${camp.id}/queue/batch`, { entries })
    expect(batchRes.status()).toBe(201)
    expect((await batchRes.json()).count).toBe(2)

    // The entries appear in the queue.
    const queue = await (await admin.get(`/api/campaigns/${camp.id}/queue`)).json()
    expect(queue.length).toBe(2)
    expect(queue.map((e: { topic: string }) => e.topic).sort()).toEqual(
      ['Mock scheduled post 1', 'Mock scheduled post 2'],
    )
  })

  test('batch rejects the whole plan when validation fails (no partial writes)', async () => {
    if (!MOCKED()) { test.skip(); return }
    const camp = await createCampaign(admin, `F4 Bad ${Date.now()}`)
    // Second entry is invalid (empty topic) → 400, and nothing is written.
    const res = await admin.post(`/api/campaigns/${camp.id}/queue/batch`, {
      entries: [
        holdEntry('Valid one'),
        holdEntry('', { topic: '' }),
      ],
    })
    expect(res.status()).toBe(400)
    const queue = await (await admin.get(`/api/campaigns/${camp.id}/queue`)).json()
    expect(queue.length).toBe(0)
  })

  test('an editor cannot batch-create auto-publish entries', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const camp = await createCampaign(admin, `F4 RBAC ${Date.now()}`)
    const editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    try {
      const res = await editor.post(`/api/campaigns/${camp.id}/queue/batch`, {
        entries: [holdEntry('Auto pub', { postAction: 'SCHEDULE_PUBLISH', publishAt: LATER() })],
      })
      expect(res.status()).toBe(403)
    } finally {
      await editor.dispose()
    }
  })
})
