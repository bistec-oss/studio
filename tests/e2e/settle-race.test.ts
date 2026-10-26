import { test, expect, type Page } from '@playwright/test'
import { loginAs, type ApiClient } from '../helpers/api'
import { ADMIN_EMAIL, ADMIN_PASSWORD, mintExportedDraft, pageLogin } from '../helpers/ui'

// Change 015 — the draft-page settle race (the red fork CI).
//   AC-01: a refine whose background run finishes before the post-202 draft
//          refetch is served still resolves its row to "Applied", re-enables
//          the input and lists v2.
//   AC-02: the same race on Regenerate design still lists the new revision.
// The race is forced: the first draft GET after the action POST is held for
// 3 s, so the in-process mock action always finishes first — the order the
// slower CI runner produces on its own.
//
// Change 018 (the 015 tail):
//   AC-05: a caption (or headline) regenerate that leaves the text identical
//          and finishes before the post-202 refetch ends with no Undo — the
//          panel settles on state once armed, not on an observed edge.
//          The mock caption reply is deterministic (`Mock Instagram caption
//          [<topic>]`), so regenerating a freshly minted draft writes the
//          same text again.
//   AC-06: a failed /revisions fetch after a design regenerate is retried,
//          so the new version is listed without a reload.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)

// Holds the first GET /api/drafts/<id> (the exact path, not /revisions) sent
// after a POST to `actionPath`. Returns a getter for whether the hold happened.
async function holdFirstRefetchAfter(page: Page, draftId: string, actionPath: string) {
  let actionSent = false
  let held = false
  await page.route(`**/api/drafts/${draftId}/${actionPath}`, async (route) => {
    if (route.request().method() === 'POST') actionSent = true
    await route.continue()
  })
  await page.route(`**/api/drafts/${draftId}`, async (route) => {
    if (actionSent && !held && route.request().method() === 'GET') {
      held = true
      await new Promise((r) => setTimeout(r, 3000))
    }
    await route.continue()
  })
  return () => held
}

const currentVersion = (page: Page) => page.getByRole('listitem').filter({ hasText: 'Current' })

test.describe('§X — draft-page settle race (015)', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    test.skip(!MOCKED(), 'needs MOCK_AI + MOCK_PUPPETEER to mint and act on a draft')
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => {
    await api?.dispose()
  })

  // TC-RACE-01 — AC-01.
  test('a refine that finishes before the post-202 refetch still resolves to Applied', async ({ page }) => {
    const draft = await mintExportedDraft(api, `settle-race-refine-${Date.now()}`)
    await pageLogin(page)
    const held = await holdFirstRefetchAfter(page, draft.id, 'refine')
    await page.goto(`/drafts/${draft.id}`)
    await expect(page.getByRole('button', { name: 'View full screen', exact: true })).toBeVisible({ timeout: 20_000 })

    const ask = page.getByPlaceholder('e.g. Make the logo larger…')
    await ask.fill('Make the background darker')
    await ask.press('Enter')

    const log = page.getByRole('region', { name: 'Refine requests' })
    await expect(log.getByText('Applied', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(ask).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Switch to v1' })).toBeVisible()
    await expect(currentVersion(page)).toContainText('v2')
    expect(held()).toBe(true)
  })

  // TC-RACE-02 — AC-02.
  test('a design regenerate that finishes before the post-202 refetch still lists the new revision', async ({ page }) => {
    const draft = await mintExportedDraft(api, `settle-race-regen-${Date.now()}`)
    await pageLogin(page)
    const held = await holdFirstRefetchAfter(page, draft.id, 'regenerate-design')
    await page.goto(`/drafts/${draft.id}`)
    await expect(page.getByRole('button', { name: 'View full screen', exact: true })).toBeVisible({ timeout: 20_000 })

    const regen = page.getByRole('button', { name: 'Regenerate design', exact: true })
    await regen.click()

    await expect(currentVersion(page)).toContainText('v2', { timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Switch to v1' })).toBeVisible()
    await expect(regen).toBeEnabled()
    expect(held()).toBe(true)
  })

  // TC-RACE-03 — AC-05 (FR-05): the caption panel.
  test('a caption regenerate that leaves the text identical and finishes before the refetch ends with no Undo', async ({ page }) => {
    const draft = await mintExportedDraft(api, `settle-race-caption-${Date.now()}`)
    await pageLogin(page)
    const held = await holdFirstRefetchAfter(page, draft.id, 'regenerate-copy')
    await page.goto(`/drafts/${draft.id}`)
    const field = page.getByRole('textbox', { name: 'Instagram', exact: true })
    const text = `Mock Instagram caption [${draft.topic}]`
    await expect(field).toHaveValue(text, { timeout: 20_000 })

    const regen = page.getByRole('button', { name: 'Regenerate Instagram caption', exact: true })
    const accepted = page.waitForResponse(
      (r) => r.url().endsWith(`/api/drafts/${draft.id}/regenerate-copy`) && r.request().method() === 'POST'
    )
    await regen.click()
    expect((await accepted).status()).toBe(202)
    // The Undo is captured before firing, and stays while the refetch is held.
    const undo = page.getByRole('button', { name: 'Undo Instagram caption', exact: true })
    await expect(undo).toBeVisible()

    // Once the refetch lands the regenerate has already settled with the same
    // text, so there is nothing to undo.
    await expect(undo).toHaveCount(0, { timeout: 15_000 })
    await expect(regen).toBeEnabled()
    await expect(field).toHaveValue(text)
    expect(held()).toBe(true)
  })

  // TC-RACE-04 — AC-05 (FR-05): the headline panel, the same race.
  test('a headline regenerate that leaves the headline identical and finishes before the refetch ends with no Undo', async ({ page }) => {
    const draft = await mintExportedDraft(api, `settle-race-headline-${Date.now()}`)
    await pageLogin(page)
    const held = await holdFirstRefetchAfter(page, draft.id, 'regenerate-copy')
    await page.goto(`/drafts/${draft.id}`)
    const field = page.getByRole('textbox', { name: 'Headline', exact: true })
    const headline = `Mock headline ${draft.topic}`.slice(0, 100)
    await expect(field).toHaveValue(headline, { timeout: 20_000 })

    const regen = page.getByRole('button', { name: 'Regenerate headline', exact: true })
    const accepted = page.waitForResponse(
      (r) => r.url().endsWith(`/api/drafts/${draft.id}/regenerate-copy`) && r.request().method() === 'POST'
    )
    await regen.click()
    expect((await accepted).status()).toBe(202)
    const undo = page.getByRole('button', { name: 'Undo headline', exact: true })
    await expect(undo).toBeVisible()

    await expect(undo).toHaveCount(0, { timeout: 15_000 })
    await expect(regen).toBeEnabled()
    await expect(field).toHaveValue(headline)
    expect(held()).toBe(true)
  })

  // TC-RACE-05 — AC-06 (FR-06): the revision list retries a failed fetch.
  test('a design regenerate whose first revision-list fetch fails still lists the new version without a reload', async ({ page }) => {
    const draft = await mintExportedDraft(api, `settle-race-revisions-${Date.now()}`)
    await pageLogin(page)
    let actionSent = false
    let failed = false
    let afterFailure = 0
    await page.route(`**/api/drafts/${draft.id}/regenerate-design`, async (route) => {
      if (route.request().method() === 'POST') actionSent = true
      await route.continue()
    })
    await page.route(`**/api/drafts/${draft.id}/revisions`, async (route) => {
      if (actionSent && route.request().method() === 'GET') {
        if (!failed) {
          failed = true
          await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"forced failure"}' })
          return
        }
        afterFailure++
      }
      await route.continue()
    })
    await page.goto(`/drafts/${draft.id}`)
    await expect(page.getByRole('button', { name: 'View full screen', exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(currentVersion(page)).toContainText('v1')

    const regen = page.getByRole('button', { name: 'Regenerate design', exact: true })
    await regen.click()

    await expect(currentVersion(page)).toContainText('v2', { timeout: 25_000 })
    await expect(page.getByRole('button', { name: 'Switch to v1' })).toBeVisible()
    expect(failed).toBe(true)
    expect(afterFailure).toBeGreaterThanOrEqual(1)
  })
})
