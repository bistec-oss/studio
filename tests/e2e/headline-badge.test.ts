import { test, expect, type Page } from '@playwright/test'
import { loginAs, waitForAction, waitForDraft, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'
import { ADMIN_EMAIL, ADMIN_PASSWORD, pageLogin } from '../helpers/ui'
import { formatScheduledDate } from '../../src/lib/renderedText/noticeText'

// §AH: the stale-headline badge (change 030, T5; AC-11 to AC-19; TC-HL-01 to
// TC-HL-10). Mock mode (MOCK_AI + MOCK_PUPPETEER): the mock design paints the
// headline it was given in one element, and the check is the text stand-in
// (src/lib/renderedText/mockCheck.ts).
//
// Seams (all dormant in prod):
//   __MOCK_HEADLINE_HIDDEN__   in the brief topic: the design carries the
//                              sentinel and the check says `not-visible`.
//   POST /api/test/draft-rendered-text  { draftId }: nulls renderedText on the
//                              draft and its revisions (a draft from before 030).
//   GET/DELETE /api/test/analytics-events   the event store.
// The headline is changed through PATCH /api/drafts/[id] ({ headline }). The mock
// regenerate-copy returns the same headline as generation, so TC-HL-02 first
// writes an older painted headline into the stamp through the DB.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const NEW_HEADLINE = 'A brand new headline'

test.describe.configure({ mode: 'serial' })

type Img = {
  state: string
  renderedHeadline: string | null
  reason: string | null
  scheduledPosts: { count: number; nextAt: string } | null
}
type Draft = Record<string, unknown> & { id: string; headline: string; headlineImage: Img }

let api: ApiClient
test.beforeEach(async ({ request }) => {
  api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
})
test.afterEach(async () => {
  await api.dispose()
})

async function generate(topic: string): Promise<Draft> {
  const brief = await api.post('/api/briefs', {
    topic,
    goal: 'g',
    tone: 'professional',
    channels: ['INSTAGRAM'],
    designMode: 'GENERATE',
    copyProviderKey: 'cli',
  })
  expect(brief.status()).toBe(201)
  const { id: briefId } = await brief.json()
  const res = await api.post('/api/generate/assemble-b', { briefId })
  expect(res.status()).toBe(202)
  const { draftId } = await res.json()
  const draft = (await waitForDraft(api, draftId)) as Draft
  expect(draft.status).toBe('EXPORTED')
  return draft
}

async function getDraft(id: string): Promise<Draft> {
  return (await (await api.get(`/api/drafts/${id}`)).json()) as Draft
}

async function setHeadline(id: string, headline: string) {
  const res = await api.patch(`/api/drafts/${id}`, { headline })
  expect(res.status()).toBe(200)
}

const topicOf = (label: string) => `HL ${label} ${Date.now()}`

// The page, signed in, on a draft, loaded.
async function openDraft(page: Page, id: string) {
  await pageLogin(page)
  await page.goto(`/drafts/${id}`)
  await expect(page.getByRole('button', { name: /^publish$/i })).toBeVisible({ timeout: 20_000 })
}

async function clearEvents() {
  expect((await api.del('/api/test/analytics-events')).status()).toBe(204)
}
type AEvent = { name: string; outcome: string | null; payload: Record<string, unknown> }
async function eventsOf(draftId: string, name: string): Promise<AEvent[]> {
  const res = await api.get(`/api/test/analytics-events?draftId=${draftId}`)
  expect(res.status()).toBe(200)
  return ((await res.json()).events as AEvent[]).filter((e) => e.name === name)
}
async function waitEvents(draftId: string, name: string, count: number): Promise<AEvent[]> {
  await expect
    .poll(async () => (await eventsOf(draftId, name)).length, { message: name, timeout: 15_000 })
    .toBeGreaterThanOrEqual(count)
  await new Promise((r) => setTimeout(r, 400))
  return eventsOf(draftId, name)
}

test.describe('§AH stale-headline badge', () => {
  test('TC-HL-01: a headline edit shows the stale badge with the old headline and both buttons', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await generate(topicOf('edit'))
    expect(draft.headlineImage.state).toBe('fresh')
    const old = draft.headline
    await setHeadline(draft.id, NEW_HEADLINE)

    await openDraft(page, draft.id)
    const badge = page.getByTestId('headline-image-notice')
    await expect(badge).toBeVisible()
    await expect(badge).toHaveAttribute('data-state', 'stale')
    await expect(badge).toContainText('The image still shows the previous headline')
    await expect(badge).toContainText(old)
    await expect(badge.getByRole('button', { name: 'Edit inline' })).toBeEnabled()
    await expect(badge.getByRole('button', { name: 'Regenerate design' })).toBeEnabled()
  })

  test('TC-HL-02: Regenerate headline (regenerate-copy with the headline target) shows the badge', async ({ page }) => {
    if (!MOCKED() || !dbAvailable) { test.skip(); return }
    const draft = await generate(topicOf('regen'))
    // The mock regenerates the same headline the design painted; make the stamp
    // say the design painted an older one, as it would after a real reword.
    await prisma!.draft.update({
      where: { id: draft.id },
      data: { renderedText: { headline: { text: 'The older painted headline', verified: true } } },
    })

    const res = await api.post(`/api/drafts/${draft.id}/regenerate-copy`, { headline: true })
    expect(res.status()).toBe(202)
    const done = (await waitForAction(api, draft.id)) as Draft
    expect(done.pendingActionError ?? null).toBeNull()
    expect(done.headlineImage.state).toBe('stale')

    await openDraft(page, draft.id)
    const badge = page.getByTestId('headline-image-notice')
    await expect(badge).toBeVisible()
    await expect(badge).toContainText('The older painted headline')
  })

  test('TC-HL-03: an inline edit that paints the new headline clears the badge, and so does Regenerate design', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await generate(topicOf('clear'))
    await setHeadline(draft.id, NEW_HEADLINE)
    expect((await getDraft(draft.id)).headlineImage.state).toBe('stale')

    const html = `<!doctype html><html><body style="width:1080px;height:1080px"><div>${NEW_HEADLINE}</div></body></html>`
    const edit = await api.post(`/api/drafts/${draft.id}/inline-edit`, { html })
    expect(edit.status()).toBe(200)
    expect((await getDraft(draft.id)).headlineImage.state).toBe('fresh')
    await openDraft(page, draft.id)
    await expect(page.getByTestId('headline-image-notice')).toHaveCount(0)

    // Stale again, then Regenerate design from the badge itself.
    await setHeadline(draft.id, 'Another brand new headline')
    await page.reload()
    const badge = page.getByTestId('headline-image-notice')
    await expect(badge).toBeVisible()
    const regenerated = page.waitForResponse(
      (r) => r.url().includes(`/api/drafts/${draft.id}/regenerate-design`) && r.request().method() === 'POST',
    )
    await badge.getByRole('button', { name: 'Regenerate design' }).click()
    expect((await regenerated).status()).toBe(202)
    await waitForAction(api, draft.id)
    expect((await getDraft(draft.id)).headlineImage.state).toBe('fresh')
    await page.reload()
    await expect(page.getByRole('button', { name: /^publish$/i })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('headline-image-notice')).toHaveCount(0)
  })

  test('TC-HL-04: a hidden headline shows the unconfirmed badge, and it stays unconfirmed after an edit', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await generate(`${topicOf('hidden')} __MOCK_HEADLINE_HIDDEN__`)
    expect(draft.headlineImage.state).toBe('unconfirmed')
    expect(draft.headlineImage.reason).toBe('not-visible')

    await openDraft(page, draft.id)
    const badge = page.getByTestId('headline-image-notice')
    await expect(badge).toBeVisible()
    await expect(badge).toHaveAttribute('data-state', 'unconfirmed')
    await expect(badge).toHaveAttribute('data-reason', 'not-visible')
    await expect(badge).toContainText("We couldn't confirm that the image shows the current headline.")
    await expect(badge).toContainText('It is in the design but hidden, clipped or covered.')

    await setHeadline(draft.id, NEW_HEADLINE)
    expect((await getDraft(draft.id)).headlineImage.state).toBe('unconfirmed')
    await page.reload()
    await expect(page.getByTestId('headline-image-notice')).toHaveAttribute('data-state', 'unconfirmed')
  })

  test('TC-HL-05: a draft from before 030 shows no badge after an edit', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await generate(topicOf('pre030'))
    const seam = await api.post('/api/test/draft-rendered-text', { draftId: draft.id })
    expect(seam.status()).toBe(200)
    await setHeadline(draft.id, NEW_HEADLINE)
    expect((await getDraft(draft.id)).headlineImage.state).toBe('unknown')

    await openDraft(page, draft.id)
    await expect(page.getByTestId('headline-image-notice')).toHaveCount(0)
  })

  test('TC-HL-06: restoring the pre-edit revision keeps the stale badge; restoring a pre-030 revision brings none', async ({ page }) => {
    if (!MOCKED() || !dbAvailable) { test.skip(); return }
    const draft = await generate(topicOf('restore'))
    const html = `<!doctype html><html><body style="width:1080px;height:1080px"><div>${draft.headline}</div><p>v2</p></body></html>`
    expect((await api.post(`/api/drafts/${draft.id}/inline-edit`, { html })).status()).toBe(200)
    await setHeadline(draft.id, NEW_HEADLINE)
    // Revision 2 painted the old headline, so the new headline differs from it.
    expect((await getDraft(draft.id)).headlineImage.state).toBe('stale')

    // Revision 1 also painted the old headline: still stale after the restore.
    expect((await api.post(`/api/drafts/${draft.id}/revisions/1/restore`, {})).status()).toBe(200)
    expect((await getDraft(draft.id)).headlineImage.state).toBe('stale')
    await openDraft(page, draft.id)
    await expect(page.getByTestId('headline-image-notice')).toHaveAttribute('data-state', 'stale')

    // A pre-030 revision: null its stamp, restore it, and no badge comes back.
    await prisma!.$executeRaw`UPDATE "DraftRevision" SET "renderedText" = NULL WHERE "draftId" = ${draft.id} AND "revisionNumber" = 2`
    expect((await api.post(`/api/drafts/${draft.id}/revisions/2/restore`, {})).status()).toBe(200)
    expect((await getDraft(draft.id)).headlineImage.state).toBe('unknown')
    await page.reload()
    await expect(page.getByRole('button', { name: /^publish$/i })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('headline-image-notice')).toHaveCount(0)
  })

  test('TC-HL-07: a SCHEDULED post shows the scheduled line on the badge', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await generate(topicOf('sched'))
    const when = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
    const post = await api.post('/api/posts', { draftId: draft.id, channel: 'INSTAGRAM', scheduledAt: when })
    expect(post.status()).toBe(201)
    await setHeadline(draft.id, NEW_HEADLINE)

    const got = await getDraft(draft.id)
    expect(got.headlineImage.scheduledPosts?.count).toBe(1)
    await openDraft(page, draft.id)
    await expect(page.getByTestId('headline-image-notice')).toBeVisible()
    await expect(page.getByTestId('headline-scheduled-line')).toHaveText(
      `1 scheduled post will publish this image, the next on ${formatScheduledDate(got.headlineImage.scheduledPosts!.nextAt)}.`,
    )
  })

  test('TC-HL-08: the publish dialog on the draft page shows the line when stale, none when fresh, and Confirm stays usable', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const fresh = await generate(topicOf('dlg-fresh'))
    const stale = await generate(topicOf('dlg-stale'))
    await setHeadline(stale.id, NEW_HEADLINE)

    await openDraft(page, stale.id)
    await page.getByRole('button', { name: /^publish$/i }).click()
    const dialog = page.getByRole('dialog', { name: 'Publish post' })
    await expect(dialog.getByTestId('publish-headline-line')).toHaveText('The image shows an older headline.')
    await dialog.getByRole('checkbox').first().check()
    await expect(dialog.getByRole('button', { name: /^publish$/i })).toBeEnabled()
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    await page.goto(`/drafts/${fresh.id}`)
    await expect(page.getByRole('button', { name: /^publish$/i })).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: /^publish$/i }).click()
    const dialog2 = page.getByRole('dialog', { name: 'Publish post' })
    await expect(dialog2).toBeVisible()
    await expect(dialog2.getByTestId('publish-headline-line')).toHaveCount(0)
    await dialog2.getByRole('checkbox').first().check()
    await expect(dialog2.getByRole('button', { name: /^publish$/i })).toBeEnabled()
  })

  test('TC-HL-09: the publish dialog on the library page shows the line for a stale draft, and the library shows no badge', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const topic = topicOf('lib')
    const draft = await generate(topic)
    await setHeadline(draft.id, NEW_HEADLINE)
    const list = await (await api.get(`/api/library?search=${encodeURIComponent(topic)}&pageSize=50`)).json()
    // LibraryResponse (api-types.ts): { drafts, total, page, pageSize }.
    const items = list.drafts as Array<{
      id: string
      headlineState: string
    }>
    expect(items.find((d) => d.id === draft.id)?.headlineState).toBe('stale')

    await pageLogin(page)
    await page.goto('/library')
    await page.getByPlaceholder('Search by topic…').fill(topic)
    await expect(page.getByRole('button', { name: 'Publish', exact: true })).toHaveCount(1, { timeout: 20_000 })
    await expect(page.getByTestId('headline-image-notice')).toHaveCount(0)
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Publish post' })
    await expect(dialog.getByTestId('publish-headline-line')).toHaveText('The image shows an older headline.')
    await dialog.getByRole('checkbox').first().check()
    await expect(dialog.getByRole('button', { name: /^publish$/i })).toBeEnabled()
  })

  test('TC-HL-10: draft.headline_edited once per change, none for an unchanged save; publish.settled carries headlineState', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await generate(topicOf('events'))
    await clearEvents()

    await setHeadline(draft.id, NEW_HEADLINE)
    let edited = await waitEvents(draft.id, 'draft.headline_edited', 1)
    expect(edited).toHaveLength(1)
    expect(edited[0].payload).toMatchObject({ via: 'edit', state: 'stale', scheduledPending: false })
    expect(JSON.stringify(edited[0].payload)).not.toContain(NEW_HEADLINE)
    expect(JSON.stringify(edited[0].payload)).not.toContain(draft.headline)

    // The same text again changes nothing and writes nothing.
    await setHeadline(draft.id, NEW_HEADLINE)
    await new Promise((r) => setTimeout(r, 600))
    expect(await eventsOf(draft.id, 'draft.headline_edited')).toHaveLength(1)

    // Regenerate headline writes one more, via regenerate.
    expect((await api.post(`/api/drafts/${draft.id}/regenerate-copy`, { headline: true })).status()).toBe(202)
    await waitForAction(api, draft.id)
    edited = await waitEvents(draft.id, 'draft.headline_edited', 2)
    expect(edited).toHaveLength(2)
    expect(edited.map((e) => e.payload.via).sort()).toEqual(['edit', 'regenerate'])

    // Publishing a stale draft records it.
    await setHeadline(draft.id, 'Yet another headline')
    const post = await api.post('/api/posts', { draftId: draft.id, channel: 'INSTAGRAM' })
    expect(post.status()).toBe(201)
    const settled = await waitEvents(draft.id, 'publish.settled', 1)
    expect(settled[0].payload).toMatchObject({ headlineState: 'stale' })
  })
})
