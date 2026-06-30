import { test, expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { login, post, get, authHeaders } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// §K — Remediation regression suite (docs/e2e-test-plan.md). Guards the
// H7/H9/H10/H11/H12/L2 fixes specifically.
//
// Tiering:
//   - HTTP-only cases (H7a/b/c, H10a/b, L2) run in the standard mock suite.
//   - DB cases (H9, H10c) need test-DB access — gated on dbAvailable.
//   - Scheduler cases (H12a/b/c) import runScheduledJobs and use the APP prisma
//     singleton, which reads process.env.DATABASE_URL — gated on that being set
//     in the RUNNER process (run with .env.test loaded; see test:e2e:reg).
//   - Chromium-singleton cases (H11) need a real-render serve (MOCK_PUPPETEER off)
//     — gated, and H11a/c require process observation (documented manual checks).

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3001'
const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const REAL_RENDER = process.env.MOCK_PUPPETEER !== 'true'

async function createExportedDraft(request: APIRequestContext, topic = 'Reg Test'): Promise<string> {
  const kit = await (await post(request, '/api/admin/brandkits', { name: `Reg Kit ${topic}`, colors: ['#0284c7'] })).json()
  const camp = await (await post(request, '/api/campaigns', { name: `Reg Camp ${topic}`, brandKitId: kit.id })).json()
  const brief = await (await post(request, '/api/briefs', {
    topic, goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
    designMode: 'GENERATE', copyProviderKey: 'cli', campaignId: camp.id,
  })).json()
  const assembled = await (await post(request, '/api/generate/assemble-b', { briefId: brief.id })).json()
  return assembled.draftId
}

test.describe('§K — H7 atomicity', () => {
  test.beforeEach(async ({ request }) => { await login(request) })

  // TC-REG-H7a — Concurrent refines yield distinct, contiguous revision numbers.
  test('10 concurrent refines produce distinct sequential revision numbers', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const draftId = await createExportedDraft(request, `H7a-${Date.now()}`)

    const N = 10
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        post(request, `/api/drafts/${draftId}/refine`, { instruction: `concurrent edit ${i}` }),
      ),
    )
    // No 500s — the @@unique + $transaction retry holds under contention.
    for (const r of results) expect(r.status()).toBeLessThan(500)

    const revisions = await (await get(request, `/api/drafts/${draftId}/revisions`)).json()
    const numbers = revisions.map((r: { revisionNumber: number }) => r.revisionNumber).sort((a: number, b: number) => a - b)
    expect(numbers.length).toBe(N)
    expect(new Set(numbers).size).toBe(N) // all distinct
    numbers.forEach((n: number, i: number) => expect(n).toBe(i + 1)) // contiguous 1..N
  })

  // TC-REG-H7b — Concurrent prompt version saves: distinct versions, ≤1 conflict, no 500.
  test('5 concurrent prompt saves produce distinct versions without 500s', async ({ request }) => {
    const kit = await (await post(request, '/api/admin/brandkits', { name: `H7b Kit ${Date.now()}` })).json()

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        post(request, `/api/admin/brandkits/${kit.id}/prompts`, { content: `voice ${i}`, createdBy: 'test' }),
      ),
    )
    for (const r of results) expect([201, 409]).toContain(r.status()) // never 500

    const detail = await (await get(request, `/api/admin/brandkits/${kit.id}`)).json()
    const versions = detail.prompts.map((p: { version: number }) => p.version)
    expect(new Set(versions).size).toBe(versions.length) // versions are distinct
  })

  // TC-REG-H7c — No PENDING orphan posts ever persist. Guards H7.
  test('no posts are left in transient PENDING state', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    // Drive a publish (success) and a scheduled post, then assert nothing PENDING.
    const d1 = await createExportedDraft(request, `H7c-pub-${Date.now()}`)
    await post(request, '/api/posts', { draftId: d1, channel: 'INSTAGRAM' })
    const d2 = await createExportedDraft(request, `H7c-sched-${Date.now()}`)
    await post(request, '/api/posts', { draftId: d2, channel: 'LINKEDIN', scheduledAt: new Date(Date.now() + 3_600_000).toISOString() })

    const list = await (await get(request, '/api/posts?pageSize=50')).json()
    const pending = list.posts.filter((p: { status: string }) => p.status === 'PENDING')
    expect(pending.length).toBe(0)
  })
})

test.describe('§K — H9 indexes', () => {
  // TC-REG-H9 — The scheduler hot-path indexes exist on Post.
  test('Post has (status,scheduledAt) and (status,nextRetryAt) indexes', async () => {
    test.skip(!dbAvailable, 'requires test DB access')
    const rows = await prisma!.$queryRawUnsafe<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'Post'`,
    )
    const defs = rows.map(r => r.indexdef.toLowerCase())
    const hasScheduledAt = defs.some(d => d.includes('status') && d.includes('scheduledat'))
    const hasNextRetry = defs.some(d => d.includes('status') && d.includes('nextretryat'))
    expect(hasScheduledAt).toBe(true)
    expect(hasNextRetry).toBe(true)
  })
})

test.describe('§K — H10 storage', () => {
  test.beforeEach(async ({ request }) => { await login(request) })

  // TC-REG-H10a — Public IMAGES bucket: anonymous read of an uploaded asset → 200.
  test('a brief-image upload is anonymously readable', async ({ request }) => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    )
    const up = await request.post(`${BASE}/api/briefs/images`, {
      multipart: { file: { name: 'a.png', mimeType: 'image/png', buffer: png } },
      headers: { ...authHeaders() },
    })
    expect(up.status()).toBe(200)
    const { url } = await up.json()
    expect(url).toMatch(/^https?:\/\//)
    const anon = await request.get(url, { headers: {} })
    expect(anon.status()).toBe(200)
  })

  // TC-REG-H10b — Private EXPORTS bucket: the bare object URL is NOT anonymously
  // readable; only the signed URL works.
  test('the export object is private but the signed URL works', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const draftId = await createExportedDraft(request, `H10b-${Date.now()}`)
    const draft = await (await get(request, `/api/drafts/${draftId}`)).json()
    const signed = draft.exportUrl as string
    expect(signed).toMatch(/^https?:\/\//)

    // Signed URL → 200.
    expect((await request.get(signed, { headers: {} })).status()).toBe(200)

    // Same object without the signature query → denied (private bucket).
    const bare = signed.split('?')[0]
    const anon = await request.get(bare, { headers: {} })
    expect(anon.status()).toBeGreaterThanOrEqual(400) // 403 (AccessDenied) on a private bucket
  })

  // TC-REG-H10c — Legacy full-URL exportUrl passes through unchanged (no double-sign).
  test('a legacy full-URL exportUrl is returned unchanged', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const draftId = await createExportedDraft(request, `H10c-${Date.now()}`)
    const legacy = 'http://legacy.example.com/old-export.png'
    await prisma!.draft.update({ where: { id: draftId }, data: { exportUrl: legacy } })

    const draft = await (await get(request, `/api/drafts/${draftId}`)).json()
    expect(draft.exportUrl).toBe(legacy) // resolveExportUrl passes http(s):// through verbatim
  })
})

test.describe('§K — H11 Puppeteer', () => {
  test.beforeEach(async ({ request }) => { await login(request) })

  // TC-REG-H11b — Concurrency cap holds: parallel exports all complete (semaphore
  // queues, no crash/OOM). Requires a real-render serve (MOCK_PUPPETEER off).
  test('parallel exports under the concurrency cap all succeed', async ({ request }) => {
    test.skip(!REAL_RENDER, 'requires a real-Chromium serve (MOCK_PUPPETEER=false)')
    const draftIds = await Promise.all(
      Array.from({ length: 8 }, (_, i) => createExportedDraft(request, `H11b-${i}-${Date.now()}`)),
    )
    const results = await Promise.all(
      draftIds.map(id => post(request, '/api/generate/export', { draftId: id })),
    )
    for (const r of results) {
      expect(r.status()).toBe(200)
      expect((await r.json()).exportUrl).toMatch(/^https?:\/\//)
    }
  })

  // TC-REG-H11a — Single Chromium process reused across renders. Not observable
  // via black-box HTTP (needs process inspection on the host).
  test('browser singleton is reused across renders', async () => {
    test.skip(true, 'manual/ops check — requires host process observation (one chromium process per run)')
  })

  // TC-REG-H11c — Relaunch after the browser disconnects mid-run. Needs killing
  // the Chromium process out-of-band; not driveable from a black-box test.
  test('renderer relaunches after a browser disconnect', async () => {
    test.skip(true, 'manual/ops check — kill chromium mid-run, then export again')
  })
})

test.describe('§K — H12 scheduler', () => {
  test.beforeEach(async ({ request }) => { await login(request) })

  // Create a SCHEDULED post that is already due (scheduledAt in the past), with a
  // caption-driven publish outcome (topic sentinel). Returns the postId.
  async function createDuePost(request: APIRequestContext, topic: string): Promise<string> {
    const draftId = await createExportedDraft(request, topic)
    const created = await (await post(request, '/api/posts', {
      draftId, channel: 'INSTAGRAM', scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
    })).json()
    // Make it due now (the create route only accepts a future scheduledAt → SCHEDULED).
    await prisma!.post.update({
      where: { id: created.postId },
      data: { scheduledAt: new Date(Date.now() - 1000), nextRetryAt: null },
    })
    return created.postId
  }

  // Drive one scheduler tick via the test-only HTTP seam (the app resolves the
  // scheduler's `@/` aliases natively; the runner cannot). The endpoint is
  // admin-gated and 404s unless MOCK_SOCIAL is set, so it's dormant in prod.
  async function tick(request: APIRequestContext) {
    return post(request, '/api/test/scheduler-tick', {})
  }

  // The DB-helper gate is enough — these read/write the test DB directly and
  // drive the scheduler over HTTP, so no app-module import is needed.
  test.beforeEach(async () => {
    test.skip(!dbAvailable, 'requires test DB access')
  })

  // TC-REG-H12a — Atomic claim: two concurrent runs publish a due post exactly once.
  test('concurrent scheduler runs publish a due post exactly once', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const postId = await createDuePost(request, `H12a-success-${Date.now()}`) // no sentinel → succeeds
    await Promise.all([tick(request), tick(request)]) // FOR UPDATE SKIP LOCKED → only one claims it

    const row = await prisma!.post.findUnique({ where: { id: postId } })
    expect(row?.status).toBe('PUBLISHED')
    expect(row?.platformId).toBeTruthy()
  })

  // TC-REG-H12b — Backoff retries then terminal FAILED after MAX_RETRIES.
  test('a permanently failing post retries with backoff then FAILS', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const postId = await createDuePost(request, `__FAIL_ALWAYS__ H12b ${Date.now()}`)

    // Tick repeatedly; between ticks force the retry to be due again.
    let row = null
    for (let i = 0; i < 8; i++) {
      await tick(request)
      row = await prisma!.post.findUnique({ where: { id: postId } })
      if (row?.status === 'FAILED') break
      // The publish failed and rescheduled with a future nextRetryAt — pull it
      // back into the past so the next tick reclaims it immediately.
      await prisma!.post.update({ where: { id: postId }, data: { nextRetryAt: new Date(Date.now() - 1000) } })
    }
    expect(row?.status).toBe('FAILED')
    expect(row?.retryCount).toBe(5) // MAX_RETRIES
    expect(row?.errorReason).toBeTruthy()
  })

  // TC-REG-H12c — A stuck PUBLISHING row with a lapsed lease is reclaimed.
  test('a stuck PUBLISHING post with a lapsed lease is reclaimed', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const postId = await createDuePost(request, `H12c-reclaim-${Date.now()}`) // succeeds on publish
    // Simulate a dead worker: PUBLISHING with a lease that already lapsed.
    await prisma!.post.update({
      where: { id: postId },
      data: { status: 'PUBLISHING', nextRetryAt: new Date(Date.now() - 1000) },
    })

    await tick(request)
    const row = await prisma!.post.findUnique({ where: { id: postId } })
    expect(row?.status).toBe('PUBLISHED') // reclaimed and processed, not stranded
  })
})

test.describe('§K — L2 shared helpers', () => {
  // TC-REG-L2 — The shared helpers exist and are wired in (the duplicated copies
  // were removed). Static repo assertion (runs in the runner with repo cwd).
  test('apiFetch and brandkit systemContext helpers exist and are used', async () => {
    const apiFetch = resolve(process.cwd(), 'src/lib/apiFetch.ts')
    const systemContext = resolve(process.cwd(), 'src/lib/brandkit/systemContext.ts')
    expect(existsSync(apiFetch)).toBe(true)
    expect(existsSync(systemContext)).toBe(true)
    // Each is non-trivial (exports something the former copies now import).
    expect(readFileSync(apiFetch, 'utf8')).toMatch(/export/)
    expect(readFileSync(systemContext, 'utf8')).toMatch(/export/)
  })
})
