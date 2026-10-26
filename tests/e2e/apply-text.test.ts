import { test, expect, type Page } from '@playwright/test'
import { loginAs, waitForAction, waitForDraft, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'
import { ADMIN_EMAIL, ADMIN_PASSWORD, pageLogin } from '../helpers/ui'
import { applyFailureNotice } from '../../src/lib/applyText/noticeText'

// §AM: Apply to image (change 031, T15; AC-38 to AC-40; TC-AP-01 to TC-AP-10).
// Mock mode (MOCK_AI + MOCK_PUPPETEER): the mock design paints its headline in
// one element, and the check is the text stand-in (src/lib/renderedText/mockCheck.ts).
//
// Seams (all dormant in prod): a NEW headline carrying one of
//   __MOCK_APPLY_NOT_PAINTED__ | __MOCK_APPLY_OLD_PAINTED__ | __MOCK_APPLY_RENDER_FAIL__
// forces that verdict from the in-render check; __MOCK_HEADLINE_HIDDEN__ in the
// brief topic makes a draft `unconfirmed`; POST /api/test/draft-rendered-text
// makes it `unknown`; GET/DELETE /api/test/analytics-events is the event store.
// The headline is changed through PATCH /api/drafts/[id] ({ headline }).

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const NEW_HEADLINE = 'A brand new headline'

test.describe.configure({ mode: 'serial' })

type Img = { state: string; renderedHeadline: string | null; reason: string | null }
type Draft = Record<string, unknown> & {
  id: string
  headline: string
  htmlContent: string
  currentRevisionNumber: number
  pendingActionError: string | null
  headlineImage: Img
}

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

async function revisionCount(id: string): Promise<number> {
  return ((await (await api.get(`/api/drafts/${id}/revisions`)).json()) as unknown[]).length
}

async function setHeadline(id: string, headline: string) {
  const res = await api.patch(`/api/drafts/${id}`, { headline })
  expect(res.status()).toBe(200)
}

const topicOf = (label: string) => `AP ${label} ${Date.now()}`

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

// Clicks Apply in the badge, answers the confirm dialog and returns the 202/422 response.
async function applyFromBadge(page: Page, draftId: string) {
  const badge = page.getByTestId('headline-image-notice')
  await expect(badge).toBeVisible()
  await badge.getByRole('button', { name: 'Apply the new headline to the image' }).click()
  const dialog = page.getByRole('dialog', { name: 'Apply to image' })
  await expect(dialog).toBeVisible()
  const applied = page.waitForResponse(
    (r) => r.url().includes(`/api/drafts/${draftId}/apply-text`) && r.request().method() === 'POST',
  )
  await dialog.getByRole('button', { name: 'Apply to image' }).click()
  return applied
}

test.describe('§AM Apply to image', () => {
  test('TC-AP-01: Apply on a stale draft confirms, clears the badge, stamps verified and adds a revision', async ({ page }) => {
    if (!MOCKED() || !dbAvailable) { test.skip(); return }
    const draft = await generate(topicOf('apply'))
    const old = draft.headline
    await setHeadline(draft.id, NEW_HEADLINE)
    const before = await revisionCount(draft.id)

    await openDraft(page, draft.id)
    const badge = page.getByTestId('headline-image-notice')
    await expect(badge).toHaveAttribute('data-state', 'stale')
    await badge.getByRole('button', { name: 'Apply the new headline to the image' }).click()
    const dialog = page.getByRole('dialog', { name: 'Apply to image' })
    await expect(dialog).toContainText(
      `Replace “${old}” with “${NEW_HEADLINE}” in the image. Styling inside the headline (for example a colored word or a line break) becomes plain text. Undo brings the old version back.`,
    )
    const applied = page.waitForResponse(
      (r) => r.url().includes(`/api/drafts/${draft.id}/apply-text`) && r.request().method() === 'POST',
    )
    await dialog.getByRole('button', { name: 'Apply to image' }).click()
    expect((await applied).status()).toBe(202)

    await expect(page.getByTestId('headline-image-notice')).toHaveCount(0, { timeout: 20_000 })
    const done = await waitForAction(api, draft.id)
    expect(done.pendingActionError ?? null).toBeNull()
    expect((done.headlineImage as { state: string }).state).toBe('fresh')
    expect(done.htmlContent).toContain(NEW_HEADLINE)
    expect(done.htmlContent).not.toContain(old)
    expect(await revisionCount(draft.id)).toBe(before + 1)
    expect(done.currentRevisionNumber).toBe(draft.currentRevisionNumber + 1)

    const row = await prisma!.draft.findUnique({ where: { id: draft.id }, select: { renderedText: true } })
    expect(row?.renderedText).toEqual({ headline: { text: NEW_HEADLINE, verified: true } })
  })

  test('TC-AP-02: Undo after Apply restores the previous HTML byte for byte', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await generate(topicOf('undo'))
    await setHeadline(draft.id, NEW_HEADLINE)
    const original = (await getDraft(draft.id)).htmlContent

    await openDraft(page, draft.id)
    expect((await (await applyFromBadge(page, draft.id)).status())).toBe(202)
    await expect(page.getByTestId('headline-image-notice')).toHaveCount(0, { timeout: 20_000 })
    await waitForAction(api, draft.id)
    expect((await getDraft(draft.id)).htmlContent).not.toBe(original)

    const restored = page.waitForResponse(
      (r) => /\/api\/drafts\/[^/]+\/revisions\/\d+\/restore/.test(r.url()) && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Undo' }).click()
    expect((await restored).status()).toBe(200)
    await expect.poll(async () => (await getDraft(draft.id)).htmlContent).toBe(original)
    // The image is stale again: the badge comes back.
    expect((await getDraft(draft.id)).headlineImage.state).toBe('stale')
  })

  for (const [id, sentinel, code] of [
    ['TC-AP-03', '__MOCK_APPLY_NOT_PAINTED__', 'not-painted'],
    ['TC-AP-04', '__MOCK_APPLY_OLD_PAINTED__', 'old-still-painted'],
    ['TC-AP-05', '__MOCK_APPLY_RENDER_FAIL__', 'render-failed'],
  ] as const) {
    test(`${id}: ${sentinel} fails with "${code}", shows the sentence, and adds no revision`, async ({ page }) => {
      if (!MOCKED()) { test.skip(); return }
      const draft = await generate(topicOf(code))
      await setHeadline(draft.id, `New ${sentinel}`)
      const before = await getDraft(draft.id)
      const revisions = await revisionCount(draft.id)

      await openDraft(page, draft.id)
      expect((await applyFromBadge(page, draft.id)).status()).toBe(202)
      const done = (await waitForAction(api, draft.id)) as Draft
      expect(done.pendingActionError).toBe(applyFailureNotice(code))
      await expect(page.getByText(applyFailureNotice(code)).first()).toBeVisible({ timeout: 20_000 })
      expect(await revisionCount(draft.id)).toBe(revisions)
      expect(done.htmlContent).toBe(before.htmlContent)
      expect(done.headlineImage.state).toBe('stale')
    })
  }

  test('TC-AP-06: no Apply button on a fresh, an unconfirmed or an unknown draft', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    // fresh: no badge at all
    const fresh = await generate(topicOf('fresh'))
    await openDraft(page, fresh.id)
    await expect(page.getByTestId('headline-image-notice')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Apply the new headline to the image' })).toHaveCount(0)

    // unconfirmed: badge, but no Apply
    const hidden = await generate(`${topicOf('hidden')} __MOCK_HEADLINE_HIDDEN__`)
    await setHeadline(hidden.id, NEW_HEADLINE)
    await page.goto(`/drafts/${hidden.id}`)
    await expect(page.getByTestId('headline-image-notice')).toHaveAttribute('data-state', 'unconfirmed')
    await expect(page.getByRole('button', { name: 'Apply the new headline to the image' })).toHaveCount(0)

    // unknown (a draft from before 030): no badge
    const old = await generate(topicOf('unknown'))
    expect((await api.post('/api/test/draft-rendered-text', { draftId: old.id })).status()).toBe(200)
    await setHeadline(old.id, NEW_HEADLINE)
    await page.goto(`/drafts/${old.id}`)
    await expect(page.getByRole('button', { name: /^publish$/i })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('headline-image-notice')).toHaveCount(0)

    // The server agrees: an unconfirmed or unknown draft is refused with not-stale.
    for (const id of [hidden.id, old.id]) {
      const res = await api.post(`/api/drafts/${id}/apply-text`, { field: 'headline' })
      expect(res.status()).toBe(422)
      expect((await res.json()).code).toBe('not-stale')
    }
  })

  test('TC-AP-07: a second action during Apply gets 409, and the page shows the overlay', async ({ page }) => {
    if (!MOCKED() || !dbAvailable) { test.skip(); return }
    const draft = await generate(topicOf('busy'))
    await setHeadline(draft.id, NEW_HEADLINE)
    // Hold the claim the way a running Apply does.
    await prisma!.draft.update({
      where: { id: draft.id },
      data: { pendingAction: 'APPLY_TEXT', pendingActionClaimId: 'e2e-held-claim' },
    })
    try {
      const res = await api.post(`/api/drafts/${draft.id}/apply-text`, { field: 'headline' })
      expect(res.status()).toBe(409)
      const regen = await api.post(`/api/drafts/${draft.id}/regenerate-design`, {})
      expect(regen.status()).toBe(409)

      await openDraft(page, draft.id)
      await expect(page.getByRole('status', { name: 'Applying headline' })).toBeVisible()
      await expect(
        page.getByTestId('headline-image-notice').getByRole('button', { name: 'Apply the new headline to the image' }),
      ).toBeDisabled()
    } finally {
      await prisma!.draft.update({
        where: { id: draft.id },
        data: { pendingAction: null, pendingActionClaimId: null },
      })
    }
  })

  test('TC-AP-08: a headline shown twice is refused with ambiguous: toast, no claim, no revision', async ({ page }) => {
    if (!MOCKED() || !dbAvailable) { test.skip(); return }
    const draft = await generate(topicOf('ambiguous'))
    const old = draft.headline
    await prisma!.draft.update({
      where: { id: draft.id },
      data: { htmlContent: draft.htmlContent.replace('</body>', `<h2>${old}</h2></body>`) },
    })
    await setHeadline(draft.id, NEW_HEADLINE)
    const revisions = await revisionCount(draft.id)

    await openDraft(page, draft.id)
    expect((await applyFromBadge(page, draft.id)).status()).toBe(422)
    await expect(page.getByText(applyFailureNotice('ambiguous')).first()).toBeVisible()
    const after = await getDraft(draft.id)
    expect(after.pendingActionError ?? null).toBeNull()
    expect(await revisionCount(draft.id)).toBe(revisions)
    expect(after.headlineImage.state).toBe('stale')
    // The badge is still there, with Apply still offered.
    await expect(page.getByTestId('headline-image-notice')).toBeVisible()
  })

  test('TC-AP-09: the events: one text_applied per verdict, headline_edited via apply, no text', async ({ page }) => {
    if (!MOCKED() || !dbAvailable) { test.skip(); return }
    await clearEvents()
    const draft = await generate(topicOf('events'))
    await setHeadline(draft.id, NEW_HEADLINE)
    await openDraft(page, draft.id)
    expect((await applyFromBadge(page, draft.id)).status()).toBe(202)
    await expect(page.getByTestId('headline-image-notice')).toHaveCount(0, { timeout: 20_000 })

    const ok = await waitEvents(draft.id, 'draft.text_applied', 1)
    expect(ok).toHaveLength(1)
    expect(ok[0].outcome).toBe('ok')
    expect(ok[0].payload).toEqual({ field: 'headline', method: 'splice' })
    const edited = (await waitEvents(draft.id, 'draft.headline_edited', 2)).filter((e) => e.payload.via === 'apply')
    expect(edited).toHaveLength(1)
    expect(edited[0].payload.state).toBe('fresh')

    // A refusal also reaches a verdict: one failed event, the code only.
    const twice = await generate(topicOf('events-refuse'))
    await prisma!.draft.update({
      where: { id: twice.id },
      data: { htmlContent: twice.htmlContent.replace('</body>', `<h2>${twice.headline}</h2></body>`) },
    })
    await setHeadline(twice.id, NEW_HEADLINE)
    expect((await api.post(`/api/drafts/${twice.id}/apply-text`, { field: 'headline' })).status()).toBe(422)
    const refused = await waitEvents(twice.id, 'draft.text_applied', 1)
    expect(refused).toHaveLength(1)
    expect(refused[0].outcome).toBe('failed')
    expect(refused[0].payload).toEqual({ field: 'headline', method: 'splice', failure: 'ambiguous' })

    const all = JSON.stringify([...ok, ...edited, ...refused])
    expect(all).not.toContain(NEW_HEADLINE)
    expect(all).not.toContain(draft.headline)
  })

  test('TC-AP-10: no Beta chip while the measured rate is at or above 80%', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await generate(topicOf('beta'))
    await setHeadline(draft.id, NEW_HEADLINE)
    await openDraft(page, draft.id)
    const badge = page.getByTestId('headline-image-notice')
    await expect(badge.getByRole('button', { name: 'Apply the new headline to the image' })).toBeVisible()
    await expect(page.getByTestId('apply-beta-chip')).toHaveCount(0)
  })
})
