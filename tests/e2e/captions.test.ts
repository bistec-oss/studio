import { test, expect, type Locator, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { loginAs, waitForDraft, waitForAction, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'
import { expectNoAxeViolations } from '../helpers/axe'
import { ADMIN_EMAIL, ADMIN_PASSWORD, pageLogin } from '../helpers/ui'

// §W — Per-channel captions (change 012, wave 1: AC-12 → AC-20, AC-22, AC-26;
// wave 2, T13: AC-21 and AC-24, at the end of this file). The legacy-caption
// cases (AC-23: TC-CAP-11/12/13, TC-CAP-19) were removed by 016.
//
// Contract (spec FR-08 → FR-17):
//   GET /api/drafts/[id] → headline, captions[] (one per registry channel,
//     INSTAGRAM, LINKEDIN, in that order; a legacy WHATSAPP row is hidden, 026).
//   POST regenerate-copy {} | {channel} | {headline:true} → 202; one
//     draft-level REGENERATE_COPY claim, the target rows PENDING.
//   PATCH {channel, text} | {headline}; never touches Draft.status.
//   Publishing resolves the post channel's own caption, and refuses a FAILED,
//     PENDING, empty or over-limit one terminally; WhatsApp has no caption (026) (422
//     CAPTION_UNPUBLISHABLE up front; FAILED with no retry in the scheduler).
//
// Deterministic seams (MOCK_AI + MOCK_PUPPETEER + MOCK_SOCIAL):
//   - the mock caption reply is "Mock <Label> caption [<topic>]" and "Mock
//     headline <topic>", parsed by the real extractor;
//   - "__DROP_CAPTION_<X>__" in the topic drops that key, only in a reply that
//     requests every channel;
//   - the mock publishers' platformId ends in sha256(caption)[0:12].

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const SOCIAL = () => process.env.MOCK_SOCIAL === 'true'

type Caption = {
  channel: 'INSTAGRAM' | 'LINKEDIN' | 'WHATSAPP' // WHATSAPP only as a hidden legacy row (026)
  text: string
  status: 'PENDING' | 'READY' | 'FAILED'
  failureReason: string | null
  updatedAt: string
}

const captionsOf = (draft: Record<string, unknown>) => draft.captions as Caption[]
const captionOf = (draft: Record<string, unknown>, channel: Caption['channel']) => {
  const c = captionsOf(draft).find((x) => x.channel === channel)
  expect(c, `the draft has a ${channel} caption`).toBeTruthy()
  return c!
}
const sha12 = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 12)
const hashOfPlatformId = (platformId: string) => platformId.split('-').pop()

// One kit + campaign per worker, shared by every generation in this suite.
let campaignId: string | null = null
async function suiteCampaign(api: ApiClient): Promise<string> {
  if (campaignId) return campaignId
  const stamp = Date.now()
  const kit = await (await api.post('/api/admin/brandkits', { name: `Captions Kit ${stamp}`, colors: ['#0b6e4f'] })).json()
  const camp = await (await api.post('/api/campaigns', { name: `Captions Camp ${stamp}`, brandKitId: kit.id })).json()
  campaignId = camp.id as string
  return campaignId
}

// A Path B generation, polled until it leaves IN_PROGRESS.
async function generate(api: ApiClient, topic: string): Promise<Record<string, unknown>> {
  const brief = await (
    await api.post('/api/briefs', {
      topic,
      goal: 'g',
      tone: 'professional',
      channels: ['INSTAGRAM'],
      designMode: 'GENERATE',
      copyProviderKey: 'cli',
      campaignId: await suiteCampaign(api),
    })
  ).json()
  const res = await api.post('/api/generate/assemble-b', { briefId: brief.id })
  expect(res.status()).toBe(202)
  const { draftId } = await res.json()
  return waitForDraft(api, draftId)
}

async function exportedDraft(api: ApiClient, topic: string) {
  const draft = await generate(api, topic)
  expect(draft.status).toBe('EXPORTED')
  return draft
}

const tick = (api: ApiClient) => api.post('/api/test/scheduler-tick', {})

// ── AC-12 → AC-20, AC-22: generation, partial failure, publishing ───────────

test.describe('§W — per-channel captions', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => {
    await api.dispose()
  })

  // TC-CAP-01 — AC-12 (FR-10), AC-02 (026 FR-02): two READY captions and a headline.
  test('a generated draft has a headline and two READY captions, normalised', async () => {
    if (!MOCKED()) { test.skip(); return }
    const topic = `Cap Gen ${Date.now()}`
    const draft = await exportedDraft(api, topic)

    expect(draft.headline).toBe(`Mock headline ${topic}`)

    const captions = captionsOf(draft)
    expect(captions.map((c) => c.channel)).toEqual(['INSTAGRAM', 'LINKEDIN'])
    for (const c of captions) {
      expect(c.status).toBe('READY')
      expect(c.failureReason).toBeNull()
      expect(c.text).toContain(topic)
      expect(c.text).not.toContain('**')
    }
    expect(captionOf(draft, 'INSTAGRAM').text).toBe(`Mock Instagram caption [${topic}]`)
    expect(captionOf(draft, 'LINKEDIN').text).toBe(`Mock LinkedIn caption [${topic}]`)
  })

  // TC-CAP-02 — AC-13 (FR-08, FR-11) and the first half of AC-16 (FR-15).
  test('a dropped LinkedIn caption fails alone, refuses to publish, and a LinkedIn-only regenerate fixes only it', async () => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const topic = `Cap Drop LI __DROP_CAPTION_LINKEDIN__ ${Date.now()}`
    const draft = await exportedDraft(api, topic)

    const li = captionOf(draft, 'LINKEDIN')
    expect(li.status).toBe('FAILED')
    expect(li.text).toBe('')
    expect(li.failureReason).toContain('missing')
    const ig = captionOf(draft, 'INSTAGRAM')
    expect(ig.status).toBe('READY')

    // AC-16: the refused caption is a 422 up front, and no Post row is made.
    const refused = await api.post('/api/posts', { draftId: draft.id, channel: 'LINKEDIN' })
    expect(refused.status()).toBe(422)
    const body = await refused.json()
    expect(body.code).toBe('CAPTION_UNPUBLISHABLE')
    expect(body.error).toContain('LinkedIn')
    expect(await prisma!.post.count({ where: { draftId: draft.id as string } })).toBe(0)

    // The single-channel retry: the sentinel only drops keys from an
    // all-channel reply, so this one succeeds.
    const res = await api.post(`/api/drafts/${draft.id}/regenerate-copy`, { channel: 'LINKEDIN' })
    expect(res.status()).toBe(202)
    const done = await waitForAction(api, draft.id as string)
    expect(done.pendingActionError).toBeNull()

    const liAfter = captionOf(done, 'LINKEDIN')
    expect(liAfter.status).toBe('READY')
    expect(liAfter.failureReason).toBeNull()
    expect(liAfter.text).toBe(`Mock LinkedIn caption [${topic}]`)
    // The other row was never touched: same text, same updatedAt.
    for (const before of [ig]) {
      const after = captionOf(done, before.channel)
      expect(after.text).toBe(before.text)
      expect(after.updatedAt).toBe(before.updatedAt)
    }
    expect(done.headline).toBe(draft.headline)
    expect(done.currentRevisionNumber).toBe(draft.currentRevisionNumber)
  })

  // TC-CAP-03 — AC-14 (FR-09): no headline fails the generation.
  test('a reply with no headline fails the draft, and the captions that validated are kept', async () => {
    if (!MOCKED()) { test.skip(); return }
    const topic = `Cap Drop HL __DROP_CAPTION_HEADLINE__ ${Date.now()}`
    const draft = await generate(api, topic)

    expect(draft.status).toBe('FAILED')
    expect(String(draft.failureReason)).toContain('headline')
    expect(draft.headline).toBeNull()
    for (const c of captionsOf(draft)) {
      expect(c.status).toBe('READY')
      expect(c.text).toContain(topic)
    }
  })

  // TC-CAP-04 — AC-15 (FR-14): each channel receives only its own caption.
  test('LinkedIn receives only the LinkedIn caption and Instagram only the Instagram one', async () => {
    if (!MOCKED() || !SOCIAL()) { test.skip(); return }
    const draft = await exportedDraft(api, `Cap Route ${Date.now()}`)
    const igText = captionOf(draft, 'INSTAGRAM').text
    const liText = captionOf(draft, 'LINKEDIN').text
    expect(sha12(igText)).not.toBe(sha12(liText))

    for (const [channel, own, other] of [
      ['LINKEDIN', liText, igText],
      ['INSTAGRAM', igText, liText],
    ] as const) {
      const res = await api.post('/api/posts', { draftId: draft.id, channel })
      expect(res.status()).toBe(201)
      const { postId, status } = await res.json()
      expect(status).toBe('PUBLISHED')
      const post = await (await api.get(`/api/posts/${postId}`)).json()
      expect(post.platformId).toMatch(new RegExp(`^mock-${channel.toLowerCase()}-\\d+-[0-9a-f]{12}$`))
      expect(hashOfPlatformId(post.platformId)).toBe(sha12(own))
      expect(hashOfPlatformId(post.platformId)).not.toBe(sha12(other))
      // FR-13: the post's draft.caption is that channel's text.
      expect(post.draft.caption).toBe(own)
    }
  })

  // TC-CAP-05 — AC-16 (FR-14, FR-16): the scheduler refuses an emptied caption.
  test('a scheduled post whose caption was emptied fails terminally at publish time and is never retried', async () => {
    if (!MOCKED() || !SOCIAL()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const draft = await exportedDraft(api, `Cap Sched Empty ${Date.now()}`)

    // Scheduled on a READY caption: accepted.
    const scheduled = await api.post('/api/posts', {
      draftId: draft.id,
      channel: 'INSTAGRAM',
      scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
    })
    expect(scheduled.status()).toBe(201)
    const { postId, status } = await scheduled.json()
    expect(status).toBe('SCHEDULED')

    // The caption is emptied after scheduling, then the post falls due.
    const cleared = await api.patch(`/api/drafts/${draft.id}`, { channel: 'INSTAGRAM', text: '' })
    expect(cleared.status()).toBe(200)
    await prisma!.post.update({ where: { id: postId }, data: { scheduledAt: new Date(Date.now() - 1000) } })

    expect((await tick(api)).status()).toBe(200)
    const failed = await prisma!.post.findUniqueOrThrow({ where: { id: postId } })
    expect(failed.status).toBe('FAILED')
    expect(failed.errorReason).toContain('caption is empty')
    expect(failed.retryCount).toBe(0)
    expect(failed.nextRetryAt).toBeNull()

    // A second tick changes nothing: terminal, not a retry.
    expect((await tick(api)).status()).toBe(200)
    const again = await prisma!.post.findUniqueOrThrow({ where: { id: postId } })
    expect(again).toEqual(failed)
  })

  // TC-CAP-06 — AC-17 (FR-14, FR-15), AC-08 (026 FR-07): WhatsApp fails closed everywhere.
  test('WhatsApp is refused at POST /api/posts, and a due WhatsApp post fails terminally', async () => {
    if (!MOCKED() || !SOCIAL()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const draft = await exportedDraft(api, `Cap WA ${Date.now()}`)
    expect(captionsOf(draft).map((c) => c.channel)).toEqual(['INSTAGRAM', 'LINKEDIN']) // no WhatsApp caption now

    const res = await api.post('/api/posts', { draftId: draft.id, channel: 'WHATSAPP' })
    expect(res.status()).toBe(400)
    expect(await prisma!.post.count({ where: { draftId: draft.id as string } })).toBe(0)

    // A due SCHEDULED WhatsApp row, as an old client or a direct write could leave.
    const row = await prisma!.draft.findUniqueOrThrow({
      where: { id: draft.id as string },
      select: { teamId: true, brief: { select: { userId: true } } },
    })
    const post = await prisma!.post.create({
      data: {
        teamId: row.teamId,
        draftId: draft.id as string,
        userId: row.brief.userId,
        channel: 'WHATSAPP',
        status: 'SCHEDULED',
        scheduledAt: new Date(Date.now() - 1000),
      },
    })

    expect((await tick(api)).status()).toBe(200)
    const failed = await prisma!.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(failed.status).toBe('FAILED')
    expect(failed.errorReason).toContain("WhatsApp publishing isn't available.")
    expect(failed.retryCount).toBe(0)
    expect(failed.nextRetryAt).toBeNull()

    expect((await tick(api)).status()).toBe(200)
    expect(await prisma!.post.findUniqueOrThrow({ where: { id: post.id } })).toEqual(failed)
  })

  // TC-CAP-07 — AC-18 (FR-15): WhatsApp is in no channel input (API half).
  test('briefs and queue entries reject a WhatsApp channel with 400', async () => {
    const camp = await suiteCampaign(api)
    const brief = await api.post('/api/briefs', {
      topic: `Cap WA brief ${Date.now()}`,
      goal: 'g',
      tone: 'professional',
      channels: ['WHATSAPP'],
      designMode: 'GENERATE',
      copyProviderKey: 'cli',
      campaignId: camp,
    })
    expect(brief.status()).toBe(400)

    const entry = await api.post(`/api/campaigns/${camp}/queue`, {
      topic: `Cap WA queue ${Date.now()}`,
      goal: 'Awareness',
      tone: 'professional',
      channels: ['WHATSAPP'],
      designMode: 'GENERATE',
      generateAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
      postAction: 'HOLD',
    })
    expect(entry.status()).toBe(400)
  })

  // TC-CAP-08 — AC-18 (FR-15): the two pickers offer Instagram and LinkedIn only.
  test('the publish dialog and the queue modal show exactly Instagram and LinkedIn', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await exportedDraft(api, `Cap Pickers ${Date.now()}`)
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)

    const expectTwoChannels = async (scope: Locator) => {
      const group = scope.getByRole('group', { name: 'Channels', exact: true })
      await expect(group).toBeVisible()
      await expect(group.getByRole('checkbox')).toHaveCount(2)
      await expect(group.getByRole('checkbox', { name: 'Instagram' })).toHaveCount(1)
      await expect(group.getByRole('checkbox', { name: 'LinkedIn' })).toHaveCount(1)
      await expect(group.getByText('WhatsApp')).toHaveCount(0)
    }

    await page.goto(`/drafts/${draft.id}`)
    await expect(page.getByRole('button', { name: 'View full screen', exact: true })).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: /^publish$/i }).click()
    await expectTwoChannels(page.getByRole('dialog', { name: 'Publish post' }))

    await page.goto(`/campaigns/${await suiteCampaign(api)}`)
    await page.getByRole('button', { name: 'Plan a post' }).click()
    await expectTwoChannels(page.getByRole('dialog', { name: 'Plan a post' }))
  })

  // TC-CAP-09 — AC-20 (FR-11, FR-12): one draft-level caption claim.
  test('while REGENERATE_COPY runs, every other action 409s, and a PENDING row refuses its edit', async () => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const draft = await exportedDraft(api, `Cap Flight ${Date.now()}`)
    const id = draft.id as string

    // A caption action in flight: the claim, and its LinkedIn row being written.
    await prisma!.draft.update({ where: { id }, data: { pendingAction: 'REGENERATE_COPY' } })
    await prisma!.draftCaption.update({
      where: { draftId_channel: { draftId: id, channel: 'LINKEDIN' } },
      data: { status: 'PENDING' },
    })

    const inFlight = 'Another action is already running on this draft'
    for (const [path, body] of [
      ['regenerate-copy', { channel: 'INSTAGRAM' }],
      ['regenerate-copy', { headline: true }],
      ['regenerate-design', {}],
      ['revisions/1/restore', {}],
    ] as const) {
      const res = await api.post(`/api/drafts/${id}/${path}`, body)
      expect(res.status(), path).toBe(409)
      expect((await res.json()).error).toBe(inFlight)
    }

    // The PENDING row refuses an edit; a READY row on the same draft does not.
    const pendingEdit = await api.patch(`/api/drafts/${id}`, { channel: 'LINKEDIN', text: 'Typed over a regenerate' })
    expect(pendingEdit.status()).toBe(409)
    expect((await pendingEdit.json()).error).toBe('This caption is being generated')
    const readyEdit = await api.patch(`/api/drafts/${id}`, { channel: 'INSTAGRAM', text: 'Typed while LinkedIn runs' })
    expect(readyEdit.status()).toBe(200)
    expect(captionOf(await readyEdit.json(), 'INSTAGRAM').text).toBe('Typed while LinkedIn runs')

    // Release the slot so nothing else meets it.
    await prisma!.draftCaption.update({
      where: { draftId_channel: { draftId: id, channel: 'LINKEDIN' } },
      data: { status: 'READY' },
    })
    await prisma!.draft.update({ where: { id }, data: { pendingAction: null } })
  })

  // TC-CAP-10 — AC-22 (FR-11): revisions are design-only.
  test('restoring a revision never touches the captions or the headline', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await exportedDraft(api, `Cap Restore ${Date.now()}`)
    const id = draft.id as string

    const refine = await api.post(`/api/drafts/${id}/refine`, { instruction: 'Make the background darker' })
    expect(refine.status()).toBe(202)
    const refined = await waitForAction(api, id)
    expect(refined.pendingActionError).toBeNull()
    expect(refined.currentRevisionNumber).toBe(2)

    const edited = await api.patch(`/api/drafts/${id}`, { channel: 'LINKEDIN', text: 'An edited LinkedIn caption.' })
    expect(edited.status()).toBe(200)
    const before = await edited.json()

    const restore = await api.post(`/api/drafts/${id}/revisions/1/restore`, {})
    expect(restore.status()).toBe(200)
    const after = await (await api.get(`/api/drafts/${id}`)).json()
    expect(after.currentRevisionNumber).toBe(1)
    expect(after.captions).toEqual(before.captions)
    expect(after.headline).toBe(before.headline)
    expect(captionOf(after, 'LINKEDIN').text).toBe('An edited LinkedIn caption.')
  })
})

// ── AC-17 (ACP part) and AC-26: the machine surface ─────────────────────────

test.describe('§W — captions on the ACP surface', () => {
  let plaintextKey: string
  let keyId: string

  test.beforeAll(async ({ request }) => {
    const admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const created = await (await admin.post('/api/team/api-keys', { label: `Captions suite ${Date.now()}` })).json()
    plaintextKey = created.plaintext
    keyId = created.id
    await admin.dispose()
  })
  test.afterAll(async ({ request }) => {
    if (!keyId) return
    const admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    await admin.del(`/api/team/api-keys/${keyId}`)
    await admin.dispose()
  })

  // TC-CAP-14 — AC-26 (FR-17) and AC-17's ACP part (FR-15).
  test('generate_post returns the headline and two captions; publish_post refuses WhatsApp with no row', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const topic = `Cap ACP ${Date.now()}`
    const gen = await request.post('/api/acp/run', {
      headers: { 'x-bistec-api-key': plaintextKey },
      data: {
        capability: 'generate_post',
        input: { topic, goal: 'Drive signups', tone: 'professional', channels: ['INSTAGRAM'], designMode: 'GENERATE' },
      },
    })
    expect(gen.status()).toBe(200)
    const output = (await gen.json()).output
    expect(output.draftId).toBeTruthy()
    expect(output.headline).toBe(`Mock headline ${topic}`)
    expect(output.captions).toHaveLength(2)
    expect(output.captions.map((c: { channel: string }) => c.channel)).toEqual(['INSTAGRAM', 'LINKEDIN'])
    for (const c of output.captions as { text: string; status: string }[]) {
      expect(c.status).toBe('READY')
      expect(c.text).toContain(topic)
    }

    const pub = await request.post('/api/acp/run', {
      headers: { 'x-bistec-api-key': plaintextKey },
      data: { capability: 'publish_post', input: { draftId: output.draftId, channel: 'WHATSAPP' } },
    })
    expect(pub.status()).toBe(400)
    expect((await pub.json()).error).toBeTruthy()
    expect(await prisma!.post.count({ where: { draftId: output.draftId } })).toBe(0)
  })
})

// ── Wave 2 (T13): AC-21 (Regenerate all, the headline) and AC-24 (the panels) ─

type ShownChannel = Exclude<Caption['channel'], 'WHATSAPP'>
const LABELS = { INSTAGRAM: 'Instagram', LINKEDIN: 'LinkedIn' } as const
const n = (x: number) => x.toLocaleString('en-US')
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const startsWith = (s: string) => new RegExp(`^${escapeRe(s)}`)

// 014's AC-19 axe scan (tests/helpers/axe.ts, 018 FR-07), run here over the
// draft page in the caption states 014's own scan never sees: notices,
// warnings, a FAILED row (NFR-07). No settle step: each case waits for the
// state it asserts on, as it always has.

test.describe('§W — wave 2: Regenerate all, the headline and the caption panels', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => {
    await api.dispose()
  })

  const openDraft = async (page: Page, id: unknown) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto(`/drafts/${id}`)
    await expect(page.getByRole('button', { name: 'View full screen', exact: true })).toBeVisible({ timeout: 20_000 })
  }
  const field = (page: Page, channel: ShownChannel) =>
    page.getByRole('textbox', { name: LABELS[channel], exact: true })
  const read = async (id: unknown) => (await api.get(`/api/drafts/${id}`)).json()

  // TC-CAP-15 — AC-21 (FR-11), AC-03 (026): {} regenerates the two captions, never the
  // headline or the design.
  test('Regenerate all rewrites the two captions and leaves the headline and the revision alone', async () => {
    if (!MOCKED()) { test.skip(); return }
    const topic = `Cap Regen All ${Date.now()}`
    const draft = await exportedDraft(api, topic)
    const before = captionsOf(draft)
    // A hand-set headline: the mock headline is the same on every run, so only
    // a value the mock would never produce can show it was left alone.
    const handHeadline = `Hand headline ${Date.now()}`
    expect((await api.patch(`/api/drafts/${draft.id}`, { headline: handHeadline })).status()).toBe(200)

    const res = await api.post(`/api/drafts/${draft.id}/regenerate-copy`, {})
    expect(res.status()).toBe(202)
    const done = await waitForAction(api, draft.id as string)
    expect(done.pendingActionError).toBeNull()

    const after = captionsOf(done)
    expect(after.map((c) => c.channel)).toEqual(['INSTAGRAM', 'LINKEDIN'])
    for (const c of after) {
      const was = before.find((b) => b.channel === c.channel)!
      expect(c.status, c.channel).toBe('READY')
      expect(c.failureReason, c.channel).toBeNull()
      expect(c.text, c.channel).toContain(topic)
      expect(Date.parse(c.updatedAt), `${c.channel} updatedAt moved`).toBeGreaterThan(Date.parse(was.updatedAt))
    }
    expect(done.headline).toBe(handHeadline)
    expect(done.currentRevisionNumber).toBe(draft.currentRevisionNumber)
  })

  // TC-CAP-16 — AC-21 (FR-11): {headline:true} sets the headline and touches
  // no caption. The headline is nulled first, so "set" is visible.
  test('a headline-only regenerate sets the headline and leaves every caption row unchanged', async () => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const topic = `Cap Regen HL ${Date.now()}`
    const draft = await exportedDraft(api, topic)
    await prisma!.draft.update({ where: { id: draft.id as string }, data: { headline: null } })
    const cleared = await read(draft.id)
    expect(cleared.headline).toBeNull()

    const res = await api.post(`/api/drafts/${draft.id}/regenerate-copy`, { headline: true })
    expect(res.status()).toBe(202)
    const done = await waitForAction(api, draft.id as string)
    expect(done.pendingActionError).toBeNull()

    expect(done.headline).toBe(`Mock headline ${topic}`)
    expect(done.captions).toEqual(cleared.captions) // text, status, updatedAt: every field
    expect(done.currentRevisionNumber).toBe(cleared.currentRevisionNumber)
  })

  // TC-CAP-17 — AC-24 (FR-18, FR-19): the desk's structure, names, counters
  // and limit warnings; neither warning blocks the save.
  test('the caption desk: headings, names, counters and the Instagram limit', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await exportedDraft(api, `Cap Panels ${Date.now()}`)
    await openDraft(page, draft.id)

    // "Captions" (h2), then the h3s, in registry order.
    const desk = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Captions', level: 2, exact: true }) })
      .last()
    await expect(desk.getByRole('heading', { level: 3 })).toHaveText(['Headline', 'Instagram', 'LinkedIn'])
    await expect(desk.getByRole('textbox', { name: 'Headline', exact: true })).toHaveCount(1)

    // Each caption textarea is named by its own h3, and its counter is exact.
    const counters = {
      INSTAGRAM: (len: number) => `${n(len)} / 2,200 (Instagram)`,
      LINKEDIN: (len: number) => `${n(len)} / 3,000 (LinkedIn)`,
    }
    for (const c of captionsOf(draft) as (Caption & { channel: ShownChannel })[]) {
      const box = desk.getByRole('textbox', { name: LABELS[c.channel], exact: true })
      await expect(box).toHaveJSProperty('tagName', 'TEXTAREA')
      const heading = page.locator(`[id="${await box.getAttribute('aria-labelledby')}"]`)
      await expect(heading).toHaveJSProperty('tagName', 'H3')
      await expect(heading).toHaveText(LABELS[c.channel])
      await expect(box).toHaveValue(c.text)
      await expect(desk.getByText(counters[c.channel](c.text.length), { exact: true })).toBeVisible()
    }

    // No WhatsApp panel (026 FR-04, FR-09).
    await expect(desk.getByText('WhatsApp')).toHaveCount(0)

    // Instagram past its hard 2,200: "Over the Instagram limit", still saved.
    const longIg = 'i'.repeat(2201)
    await field(page, 'INSTAGRAM').fill(longIg)
    await expect(desk.getByText('2,201 / 2,200 (Instagram)', { exact: true })).toBeVisible()
    await expect(desk.getByText('Over the Instagram limit', { exact: true })).toBeVisible()
    await field(page, 'INSTAGRAM').blur()
    await expect.poll(async () => captionOf(await read(draft.id), 'INSTAGRAM').text).toBe(longIg)
    // Only the channel past its limit warns.
    await expect(desk.getByText(/^Over the .* limit$/)).toHaveCount(1)

    await expectNoAxeViolations(page, '/drafts/[id] with the limit warning showing')
  })

  // TC-CAP-18 — AC-24 (FR-19): Copy caption, and a per-panel Undo (retargeted from WhatsApp to LinkedIn, 026).
  test('Copy Instagram caption fills the clipboard, and Undo after a LinkedIn regenerate restores only LinkedIn', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    const topic = `Cap Copy Undo ${Date.now()}`
    const draft = await exportedDraft(api, topic)
    await openDraft(page, draft.id)

    // Copy: the clipboard holds exactly the Instagram text.
    const igText = captionOf(draft, 'INSTAGRAM').text
    await page.getByRole('button', { name: 'Copy Instagram caption', exact: true }).click()
    await expect(page.getByText('Caption copied', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(igText)

    // A hand edit, so the regenerate (which writes the mock text) is visible.
    const handLi = 'A hand-written LinkedIn caption.'
    await field(page, 'LINKEDIN').fill(handLi)
    await field(page, 'LINKEDIN').blur()
    await expect.poll(async () => captionOf(await read(draft.id), 'LINKEDIN').text).toBe(handLi)
    const beforeRegen = await read(draft.id)

    await page.getByRole('button', { name: 'Regenerate LinkedIn caption', exact: true }).click()
    await expect(field(page, 'LINKEDIN')).toHaveValue(`Mock LinkedIn caption [${topic}]`, { timeout: 20_000 })
    const undo = page.getByRole('button', { name: 'Undo LinkedIn caption', exact: true })
    await expect(undo).toBeEnabled({ timeout: 20_000 })
    // Only the regenerated panel has an Undo.
    await expect(page.getByRole('button', { name: /^Undo Instagram caption$/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Undo headline', exact: true })).toHaveCount(0)

    await undo.click()
    await expect(field(page, 'LINKEDIN')).toHaveValue(handLi)
    await expect(undo).toHaveCount(0)
    const after = await read(draft.id)
    expect(captionOf(after, 'LINKEDIN').text).toBe(handLi)
    // Instagram was never written: same text, same updatedAt.
    expect(captionOf(after, 'INSTAGRAM')).toEqual(captionOf(beforeRegen, 'INSTAGRAM'))
    expect(after.headline).toBe(beforeRegen.headline)
    await expect(field(page, 'INSTAGRAM')).toHaveValue(captionOf(beforeRegen, 'INSTAGRAM').text)
    await expect(field(page, 'LINKEDIN')).toHaveValue(handLi)
  })

  // TC-CAP-20 — AC-24 (FR-19): a FAILED row shows its error notice and Generate.
  test('a FAILED LinkedIn row shows the error notice and a Generate button that fills it', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const topic = `Cap Failed Panel __DROP_CAPTION_LINKEDIN__ ${Date.now()}`
    const draft = await exportedDraft(api, topic)
    const li = captionOf(draft, 'LINKEDIN')
    expect(li.status).toBe('FAILED')
    await openDraft(page, draft.id)

    const failed = `The LinkedIn caption failed to generate (${li.failureReason}).`
    await expect(page.getByText(failed, { exact: false })).toBeVisible()
    await expect(field(page, 'LINKEDIN')).toHaveValue('')
    await expect(field(page, 'LINKEDIN')).toBeEditable()
    await expect(field(page, 'LINKEDIN')).toHaveAccessibleDescription(startsWith(failed))
    const generate = page.getByRole('button', { name: 'Generate LinkedIn caption', exact: true })
    await expect(generate).toHaveText('Generate')
    await expect(generate).toBeEnabled()
    // The READY panels keep "Regenerate".
    await expect(page.getByRole('button', { name: 'Regenerate Instagram caption', exact: true })).toBeVisible()
    await expectNoAxeViolations(page, '/drafts/[id] with a FAILED caption')

    await generate.click()
    await expect(field(page, 'LINKEDIN')).toHaveValue(`Mock LinkedIn caption [${topic}]`, { timeout: 20_000 })
    await expect(page.getByText(failed, { exact: false })).toHaveCount(0)
    expect(captionOf(await read(draft.id), 'LINKEDIN').status).toBe('READY')
  })

  // TC-CAP-21 — AC-05 (026 FR-04, FR-05): a legacy WhatsApp row is hidden and kept.
  test('a legacy WhatsApp caption row is hidden from the API and the page, and left unchanged', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const draft = await exportedDraft(api, `Cap Legacy WA ${Date.now()}`)
    const id = draft.id as string
    const legacyText = 'A legacy WhatsApp caption that must stay hidden.'
    await prisma!.draftCaption.create({
      data: { draftId: id, channel: 'WHATSAPP', text: legacyText, status: 'READY' },
    })
    const rowBefore = await prisma!.draftCaption.findUniqueOrThrow({
      where: { draftId_channel: { draftId: id, channel: 'WHATSAPP' } },
    })

    const listed = await read(id)
    expect(captionsOf(listed).map((c) => c.channel)).toEqual(['INSTAGRAM', 'LINKEDIN'])
    expect(JSON.stringify(listed)).not.toContain(legacyText)

    await openDraft(page, id)
    const desk = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Captions', level: 2, exact: true }) })
      .last()
    await expect(desk.getByRole('heading', { level: 3 })).toHaveText(['Headline', 'Instagram', 'LinkedIn'])
    await expect(page.getByText('WhatsApp')).toHaveCount(0)
    await expect(page.getByText(legacyText)).toHaveCount(0)

    // It cannot be edited or regenerated either (FR-02).
    expect((await api.patch(`/api/drafts/${id}`, { channel: 'WHATSAPP', text: 'x' })).status()).toBe(400)
    expect((await api.post(`/api/drafts/${id}/regenerate-copy`, { channel: 'WHATSAPP' })).status()).toBe(400)

    const rowAfter = await prisma!.draftCaption.findUniqueOrThrow({
      where: { draftId_channel: { draftId: id, channel: 'WHATSAPP' } },
    })
    expect(rowAfter.text).toBe(legacyText)
    expect(rowAfter.status).toBe('READY')
    expect(rowAfter.updatedAt.getTime()).toBe(rowBefore.updatedAt.getTime())
  })

  // TC-CAP-22 — AC-09 (026 FR-08): Refine design sits under the Preview card.
  test('Refine design is under the Preview card from xl, and between Preview and Captions below it', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await exportedDraft(api, `Cap Layout ${Date.now()}`)
    await page.setViewportSize({ width: 1440, height: 900 })
    await openDraft(page, draft.id)

    const preview = page.locator('section[aria-label="Preview"]')
    const refine = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Refine design', exact: true }) })
      .last()
    const captions = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Captions', level: 2, exact: true }) })
      .last()
    await expect(refine).toBeVisible()

    const pb = (await preview.boundingBox())!
    const rb = (await refine.boundingBox())!
    expect(rb.y).toBeGreaterThanOrEqual(pb.y + pb.height - 1)
    expect(Math.abs(rb.x - pb.x)).toBeLessThanOrEqual(1)
    await expectNoAxeViolations(page, '/drafts/[id] at 1440 px, Refine design under Preview')

    await page.setViewportSize({ width: 390, height: 900 })
    const ys = {
      preview: (await preview.boundingBox())!.y,
      refine: (await refine.boundingBox())!.y,
      captions: (await captions.boundingBox())!.y,
    }
    expect(ys.preview).toBeLessThan(ys.refine)
    expect(ys.refine).toBeLessThan(ys.captions)
    const order = await page.evaluate(() => {
      const q = (el: Element | null) => el!
      const p = document.querySelector('section[aria-label="Preview"]')
      const headings = Array.from(document.querySelectorAll('h2'))
      const rf = headings.find((h) => h.textContent?.trim() === 'Refine design')!.closest('section')
      const cp = headings.find((h) => h.textContent?.trim() === 'Captions')!.closest('section')
      const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
      return before(q(p), q(rf)) && before(q(rf), q(cp))
    })
    expect(order).toBe(true)
    await expectNoAxeViolations(page, '/drafts/[id] at 390 px, one column')
  })
})
