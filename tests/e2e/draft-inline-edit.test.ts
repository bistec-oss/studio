import { test, expect, type Locator, type Page, type Route } from '@playwright/test'
import { loginAs, waitForDraft, waitForAction, type ApiClient } from '../helpers/api'

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const MOCKED = () => process.env.MOCK_PUPPETEER === 'true'

// Browser sign-in for the UI case (TC-INLINE-15). This is the same flow as
// ui.test.ts pageLogin. A super admin with more than one team lands on
// /choose-team.
async function pageLogin(page: Page) {
  await page.goto('/login')
  await page.getByPlaceholder('Username').fill(ADMIN_EMAIL)
  await page.getByPlaceholder('Password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => url.pathname === '/' || url.pathname === '/choose-team')
  await page.goto('/')
  if (page.url().includes('/choose-team')) {
    await page.getByRole('button', { name: 'Bistec' }).click()
    await page.waitForURL((url) => url.pathname === '/')
  }
}

async function createExportedDraft(api: ApiClient, topic: string) {
  const kit = await (
    await api.post('/api/admin/brandkits', { name: `Inline Kit ${topic}`, colors: ['#0284c7'] })
  ).json()
  const camp = await (
    await api.post('/api/campaigns', { name: `Inline Camp ${topic}`, brandKitId: kit.id })
  ).json()
  const brief = await (
    await api.post('/api/briefs', {
      topic,
      goal: 'g',
      tone: 'professional',
      channels: ['INSTAGRAM'],
      designMode: 'GENERATE',
      copyProviderKey: 'cli',
      campaignId: camp.id,
    })
  ).json()
  const assembleRes = await api.post('/api/generate/assemble-b', { briefId: brief.id })
  expect(assembleRes.status()).toBe(202)
  const { draftId } = await assembleRes.json()
  const draft = await waitForDraft(api, draftId)
  expect(draft.status).toBe('EXPORTED')
  return draft
}

// §T — Manual inline edit (synchronous save → new revision).
test.describe('§T — draft inline edit', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => {
    await api.dispose()
  })

  // TC-INLINE-01 — save edited HTML → new revision, pointer advances, re-rendered.
  test('inline-edit saves a new revision and advances the pointer', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline Save ${Date.now()}`)
    expect(draft.currentRevisionNumber).toBe(1)

    const edited =
      '<!doctype html><html><body style="width:1080px;height:1080px">Edited headline</body></html>'
    const res = await api.post(`/api/drafts/${draft.id}/inline-edit`, { html: edited })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.revisionId).toBeTruthy()
    expect(body.exportUrl).toMatch(/^https?:\/\//)

    const after = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(after.currentRevisionNumber).toBe(2)
    expect(after.htmlContent).toContain('Edited headline')

    const revisions = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()
    expect(
      revisions.some((r: { instruction: string }) => r.instruction === 'Manual inline edit'),
    ).toBe(true)
  })

  // TC-INLINE-02 — restore to the prior revision still works after an inline edit.
  test('the prior revision is restorable after an inline edit', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline Restore ${Date.now()}`)
    await api.post(`/api/drafts/${draft.id}/inline-edit`, {
      html: '<!doctype html><html><body style="width:1080px;height:1080px">v2</body></html>',
    })

    const restore = await api.post(`/api/drafts/${draft.id}/revisions/1/restore`, {})
    expect(restore.status()).toBe(200)
    const after = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(after.currentRevisionNumber).toBe(1)
  })

  // TC-INLINE-03 — empty html → 400; missing html → 400.
  test('rejects a missing/empty html body with 400', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline Bad ${Date.now()}`)
    const res = await api.post(`/api/drafts/${draft.id}/inline-edit`, {})
    expect(res.status()).toBe(400)

    const emptyRes = await api.post(`/api/drafts/${draft.id}/inline-edit`, { html: '' })
    expect(emptyRes.status()).toBe(400)
  })

  // TC-INLINE-05 — element mode (change 004 T23 smoke): one element edit → 200
  // with exactly one new revision; the SAME locator afterwards is stale → 409
  // (its text fingerprint no longer matches the current HTML — AC-25).
  test('element mode edits one node, then a stale fingerprint is 409', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline Element ${Date.now()}`)
    // Pin a known document through the whole-document mode first (revision 2).
    const base =
      '<!doctype html><html><head></head><body style="width:1080px;height:1080px"><h1>Old headline</h1><p>Keep me</p></body></html>'
    expect((await api.post(`/api/drafts/${draft.id}/inline-edit`, { html: base })).status()).toBe(200)

    const locator = { path: [0], tag: 'H1', text: 'Old headline', baseRevisionNumber: 2 }
    const res = await api.post(`/api/drafts/${draft.id}/inline-edit`, {
      mode: 'element',
      locator,
      edit: { kind: 'text', value: '<script>alert(1)</script>' },
      selector: 'p', // AC-26: ignored — the server resolves the target itself
    })
    expect(res.status()).toBe(200)
    const ok = await res.json()
    expect(ok.revisionId).toBeTruthy()
    expect(ok.revisionNumber).toBe(3)

    const after = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(after.currentRevisionNumber).toBe(3)
    expect(after.htmlContent).toBe(
      base.replace('<h1>Old headline</h1>', '<h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1>'),
    )
    const revisions = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()
    expect(revisions).toHaveLength(3)
    expect(revisions[0].instruction).toBe('Element edit: text')

    const stale = await api.post(`/api/drafts/${draft.id}/inline-edit`, {
      mode: 'element',
      locator,
      edit: { kind: 'text', value: 'Second write' },
    })
    expect(stale.status()).toBe(409)
    expect((await stale.json()).code).toBe('element-stale')
    const unchanged = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(unchanged.currentRevisionNumber).toBe(3)
  })

  // TC-INLINE-06 — element mode grammar: a colour that tries to break out of
  // its declaration is 400 and writes nothing (AC-22).
  test('element mode rejects a colour outside the grammar with 400', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline Element Bad ${Date.now()}`)
    const before = await (await api.get(`/api/drafts/${draft.id}`)).json()
    const res = await api.post(`/api/drafts/${draft.id}/inline-edit`, {
      mode: 'element',
      locator: { path: [], tag: 'body', text: '', baseRevisionNumber: before.currentRevisionNumber },
      edit: { kind: 'color', value: 'red; background: url(http://evil.test/x)' },
    })
    expect(res.status()).toBe(400)
    expect((await res.json()).code).toBe('invalid-color')
    const after = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(after.currentRevisionNumber).toBe(before.currentRevisionNumber)
    expect(after.htmlContent).toBe(before.htmlContent)
  })

  // Fix round 1 (amended Ruling W5-B — review wave5-O Critical 1 / Important 1):
  // every element edit carries the revision it was computed against.
  const TWO =
    '<!doctype html><html><head></head><body style="width:1080px;height:1080px"><h1>Old headline</h1><p>Keep me</p></body></html>'

  async function pin(api: ApiClient, draftId: string, html: string) {
    expect((await api.post(`/api/drafts/${draftId}/inline-edit`, { html })).status()).toBe(200)
    return (await (await api.get(`/api/drafts/${draftId}`)).json()) as {
      currentRevisionNumber: number
      htmlContent: string
    }
  }

  // TC-INLINE-07 — two sequential element edits chained by the returned
  // revisionNumber both land.
  test('element edits chain on the returned revisionNumber', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline Chain ${Date.now()}`)
    const pinned = await pin(api, String(draft.id), TWO)
    expect(pinned.currentRevisionNumber).toBe(2)

    const first = await api.post(`/api/drafts/${draft.id}/inline-edit`, {
      mode: 'element',
      locator: { path: [0], tag: 'H1', text: 'Old headline', baseRevisionNumber: 2 },
      edit: { kind: 'text', value: 'New headline' },
    })
    expect(first.status()).toBe(200)
    const { revisionNumber } = await first.json()
    expect(revisionNumber).toBe(3)

    const second = await api.post(`/api/drafts/${draft.id}/inline-edit`, {
      mode: 'element',
      locator: { path: [1], tag: 'P', text: 'Keep me', baseRevisionNumber: revisionNumber },
      edit: { kind: 'color', value: '#FF0000' },
    })
    expect(second.status()).toBe(200)
    expect((await second.json()).revisionNumber).toBe(4)

    const after = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(after.currentRevisionNumber).toBe(4)
    expect(after.htmlContent).toBe(
      TWO.replace('<h1>Old headline</h1>', '<h1>New headline</h1>').replace(
        '<p>Keep me</p>',
        '<p style="color: #ff0000">Keep me</p>',
      ),
    )
    const revisions = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()
    expect(revisions).toHaveLength(4)
  })

  // TC-INLINE-08 — the review's Critical repro over HTTP: the editor loaded
  // revision 2; a later save removed shapeA, so the stale path [0] now names
  // shapeB, whose fingerprint (div, empty text) matches too. The stale
  // baseRevisionNumber is what refuses it — nothing is written.
  test('an element edit on a stale baseRevisionNumber is 409 and writes nothing', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline Stale Base ${Date.now()}`)
    const shapes =
      '<!doctype html><html><head></head><body style="width:1080px;height:1080px"><div class="shapeA"></div><div class="shapeB"></div><div class="content">Hi</div></body></html>'
    const loaded = await pin(api, String(draft.id), shapes)
    expect(loaded.currentRevisionNumber).toBe(2)
    // The "refine": revision 3 no longer has shapeA.
    const moved = await pin(api, String(draft.id), shapes.replace('<div class="shapeA"></div>', ''))
    expect(moved.currentRevisionNumber).toBe(3)

    const res = await api.post(`/api/drafts/${draft.id}/inline-edit`, {
      mode: 'element',
      locator: { path: [0], tag: 'DIV', text: '', baseRevisionNumber: 2 },
      edit: { kind: 'color', value: '#ff0000' },
    })
    expect(res.status()).toBe(409)
    expect((await res.json()).code).toBe('element-stale')

    const after = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(after.currentRevisionNumber).toBe(3)
    expect(after.htmlContent).toBe(moved.htmlContent)
    expect(after.htmlContent).not.toContain('#ff0000')
    const revisions = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()
    expect(revisions).toHaveLength(3)
  })

  // TC-INLINE-09 — two element edits fired in parallel on the same base: the
  // route check or the commit's compare-and-swap lets exactly one land.
  test('parallel element edits on one base: exactly one lands, the other is 409', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline Parallel ${Date.now()}`)
    const pinned = await pin(api, String(draft.id), TWO)
    const base = pinned.currentRevisionNumber

    const edits = [
      {
        locator: { path: [0], tag: 'H1', text: 'Old headline', baseRevisionNumber: base },
        edit: { kind: 'text', value: 'Parallel headline' },
        landed: '<h1>Parallel headline</h1>',
      },
      {
        locator: { path: [1], tag: 'P', text: 'Keep me', baseRevisionNumber: base },
        edit: { kind: 'color', value: '#00ff00' },
        landed: '<p style="color: #00ff00">Keep me</p>',
      },
    ]
    const responses = await Promise.all(
      edits.map((e) =>
        api.post(`/api/drafts/${draft.id}/inline-edit`, { mode: 'element', locator: e.locator, edit: e.edit }),
      ),
    )
    const statuses = responses.map((r) => r.status())
    // Never a 500; the lost update is gone: exactly one 200, one 409.
    expect(statuses.every((s) => s === 200 || s === 409)).toBe(true)
    expect([...statuses].sort()).toEqual([200, 409])
    const loser = responses[statuses.indexOf(409)]
    expect((await loser.json()).code).toBe('element-stale')

    const after = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(after.currentRevisionNumber).toBe(base + 1)
    const revisions = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()
    expect(revisions).toHaveLength(base + 1)
    // The winner's change is in the document; the loser's is not.
    const winner = statuses.indexOf(200)
    expect(after.htmlContent).toContain(edits[winner].landed)
    expect(after.htmlContent).not.toContain(edits[1 - winner].landed)
  })

  // TC-INLINE-10 — fix round 2 (lock order): an element edit racing a
  // whole-document save. The element CAS used to lock the draft row BEFORE
  // its revision insert while every other writer inserts first — an
  // inversion Postgres resolves by killing one side (40P01 → 500). Now every
  // response is 200 or 409, never 500, and the chain holds exactly one
  // revision per 200.
  test('an element edit racing a whole-document save never 500s; revisions == 200s', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline Race ${Date.now()}`)
    const id = String(draft.id)
    const start = (await pin(api, id, TWO)).currentRevisionNumber
    let landed = 0
    for (let round = 0; round < 15; round++) {
      const { currentRevisionNumber: base } = await (await api.get(`/api/drafts/${id}`)).json()
      const [element, whole] = await Promise.all([
        api.post(`/api/drafts/${id}/inline-edit`, {
          mode: 'element',
          locator: { path: [1], tag: 'P', text: 'Keep me', baseRevisionNumber: base },
          edit: { kind: 'color', value: round % 2 ? '#111111' : '#222222' },
        }),
        api.post(`/api/drafts/${id}/inline-edit`, {
          html: TWO.replace('Old headline', `Round ${round}`),
        }),
      ])
      expect([200, 409], `element round ${round}`).toContain(element.status())
      expect(whole.status(), `whole-document round ${round}`).toBe(200)
      if (element.status() === 409) {
        expect((await element.json()).code).toBe('element-stale')
      } else {
        landed++
      }
      landed++ // the whole-document save
    }
    const after = await (await api.get(`/api/drafts/${id}`)).json()
    const revisions = await (await api.get(`/api/drafts/${id}/revisions`)).json()
    expect(revisions).toHaveLength(start + landed)
    expect(after.currentRevisionNumber).toBe(start + landed)
  })

  // TC-INLINE-11 — fix round 2 (lock order, the adopt half): T19's "Use
  // anyway" had the same draft-row-first guard. An adopt racing a
  // whole-document save is 200 or 409 (the save superseded the outcome),
  // never 500, and revisions == 200s. The rejected render comes from the
  // mock seam "__REFINE_REDUCE_NOOP__" (see refine-not-applied.test.ts).
  test('a "Use anyway" adopt racing a whole-document save never 500s; revisions == 200s', async () => {
    if (!MOCKED() || !process.env.MOCK_AI) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline Adopt Race ${Date.now()}`)
    const id = String(draft.id)
    const start = (await pin(api, id, TWO)).currentRevisionNumber
    let landed = 0
    for (let round = 0; round < 10; round++) {
      expect((await api.post(`/api/drafts/${id}/refine`, { instruction: 'reduce it __REFINE_REDUCE_NOOP__' })).status()).toBe(202)
      const settled = await waitForAction(api, id)
      const notApplied = settled.notApplied as { revisionId: string } | null
      expect(notApplied, `round ${round} produced a rejected render`).toBeTruthy()
      const [adopt, whole] = await Promise.all([
        api.post(`/api/drafts/${id}/rejected/${notApplied!.revisionId}/adopt`),
        api.post(`/api/drafts/${id}/inline-edit`, { html: TWO.replace('Old headline', `Adopt round ${round}`) }),
      ])
      expect([200, 409], `adopt round ${round}`).toContain(adopt.status())
      expect(whole.status(), `whole-document round ${round}`).toBe(200)
      landed += adopt.status() === 200 ? 2 : 1
    }
    const revisions = await (await api.get(`/api/drafts/${id}/revisions`)).json()
    expect(revisions).toHaveLength(start + landed)
  })

  // ── T24 (change 004 Phase 3): the AC-21..26 cases TC-INLINE-05..11 don't
  // already cover, plus the editor UI. AC→TC map: docs/e2e-test-plan.md §T.

  // TC-INLINE-12 — AC-23 over HTTP: a size with a disallowed unit, and a
  // non-numeric size, are each 400 invalid-size, and nothing is written.
  test('element mode rejects a disallowed size unit and a non-numeric size with 400', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline Size ${Date.now()}`)
    const pinned = await pin(api, String(draft.id), TWO)
    for (const value of ['24vh', 'big', '12 px', '-5px', 'calc(1px + 2px)']) {
      const res = await api.post(`/api/drafts/${draft.id}/inline-edit`, {
        mode: 'element',
        locator: { path: [0], tag: 'H1', text: 'Old headline', baseRevisionNumber: pinned.currentRevisionNumber },
        edit: { kind: 'fontSize', value },
      })
      expect(res.status(), value).toBe(400)
      expect((await res.json()).code, value).toBe('invalid-size')
    }
    const after = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(after.currentRevisionNumber).toBe(pinned.currentRevisionNumber)
    expect(after.htmlContent).toBe(pinned.htmlContent)
    const revisions = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()
    expect(revisions).toHaveLength(pinned.currentRevisionNumber)
  })

  // TC-INLINE-13 — AC-25 through a REAL refine (default mock reply). The
  // before-document puts <div>MOCK DESIGN</div> at path [0]. The mock refine
  // rewrites the whole document into <div class="card">MOCK DESIGN</div>, so
  // the old locator's tag AND text fingerprint still match a node at [0].
  // Only the address's revision tells the old session apart. The old session
  // is 409 and writes nothing. A fresh session (new GET) edits the new node.
  test('a refine between two edit sessions: the old locator is 409, a fresh one lands', async () => {
    if (!MOCKED() || !process.env.MOCK_AI) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline Refine ${Date.now()}`)
    const id = String(draft.id)
    const before = await pin(
      api,
      id,
      '<!doctype html><html><head></head><body style="width:1080px;height:1080px"><div class="old">MOCK DESIGN</div><p>Keep me</p></body></html>',
    )
    const oldLocator = { path: [0], tag: 'DIV', text: 'MOCK DESIGN', baseRevisionNumber: before.currentRevisionNumber }

    expect((await api.post(`/api/drafts/${id}/refine`, { instruction: 'Make it bolder' })).status()).toBe(202)
    const refined = await waitForAction(api, id)
    expect(refined.pendingActionError).toBeNull()
    expect(refined.currentRevisionNumber).toBe(before.currentRevisionNumber + 1)
    const refinedHtml = refined.htmlContent as string
    expect(refinedHtml).not.toBe(before.htmlContent)
    expect(refinedHtml).toContain('<div class="card" data-mock="true">MOCK DESIGN</div>')

    const stale = await api.post(`/api/drafts/${id}/inline-edit`, {
      mode: 'element',
      locator: oldLocator,
      edit: { kind: 'color', value: '#ff0000' },
    })
    expect(stale.status()).toBe(409)
    expect((await stale.json()).code).toBe('element-stale')
    const untouched = await (await api.get(`/api/drafts/${id}`)).json()
    expect(untouched.currentRevisionNumber).toBe(refined.currentRevisionNumber)
    expect(untouched.htmlContent).toBe(refinedHtml)

    // A fresh session resolves against the refined document.
    const fresh = await api.post(`/api/drafts/${id}/inline-edit`, {
      mode: 'element',
      locator: { ...oldLocator, baseRevisionNumber: untouched.currentRevisionNumber },
      edit: { kind: 'color', value: '#ff0000' },
    })
    expect(fresh.status()).toBe(200)
    const after = await (await api.get(`/api/drafts/${id}`)).json()
    expect(after.htmlContent).toBe(
      refinedHtml.replace(
        '<div class="card" data-mock="true">',
        '<div style="color: #ff0000" class="card" data-mock="true">', // inserted right after the tag name
      ),
    )
  })

  // TC-INLINE-14 — AC-26: decoy selectors naming a DIFFERENT element (the <p>)
  // at every level of the body. The write still lands only on the
  // path-resolved <h1>, and the <p> is byte-identical.
  test('decoy selector / target fields naming another element are ignored at every level', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline Decoy ${Date.now()}`)
    const pinned = await pin(api, String(draft.id), TWO)
    const res = await api.post(`/api/drafts/${draft.id}/inline-edit`, {
      mode: 'element',
      selector: 'body > p',
      target: { path: [1], tag: 'P' },
      locator: {
        path: [0],
        tag: 'H1',
        text: 'Old headline',
        baseRevisionNumber: pinned.currentRevisionNumber,
        selector: 'p',
        target: 'p',
      },
      edit: { kind: 'backgroundColor', value: '#00ff00', selector: 'p', target: [1] },
    })
    expect(res.status()).toBe(200)
    const after = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(after.htmlContent).toBe(
      TWO.replace('<h1>Old headline</h1>', '<h1 style="background-color: #00ff00">Old headline</h1>'),
    )
    expect(after.htmlContent).toContain('<p>Keep me</p>')
  })

  // TC-INLINE-15 — the editor UI (T24). The test opens a draft, switches the
  // inline editor to "Single element", clicks the <h1> in the iframe and sets
  // its text to a <script> string. The text is stored escaped and shown as
  // literal visible text in the reloaded editor (AC-21), with exactly one new
  // revision (AC-24). A colour that breaks out of its declaration shows the
  // server's message and writes nothing (AC-22). Another writer then rewrites
  // the design behind the editor: the next apply reports the change, reloads
  // the latest version and writes nothing (AC-25). A fresh selection in the
  // reloaded document lands on the right node.
  test('the element editor edits through the UI: text as text, grammar errors inline, stale reload', async ({
    page,
  }) => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline UI ${Date.now()}`)
    const id = String(draft.id)
    const pinned = await pin(api, id, TWO)
    const current = async () => (await (await api.get(`/api/drafts/${id}`)).json()) as {
      currentRevisionNumber: number
      htmlContent: string
    }

    await pageLogin(page)
    await page.goto(`/drafts/${id}`)
    await page.getByRole('button', { name: 'Edit inline' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('tab', { name: 'Single element' }).click()
    const frame = page.frameLocator('iframe[title="Inline editor"]')
    const ready = () => expect(dialog.locator('[data-editor-ready="true"]')).toBeAttached()

    // AC-21 + AC-24.
    await ready()
    await expect(frame.locator('#inline-edit-select-style')).toBeAttached()
    await frame.locator('h1').click()
    await expect(dialog.getByTestId('element-tag')).toHaveText('<h1>')
    await dialog.getByLabel('Text', { exact: true }).fill('<script>alert(1)</script>')
    await dialog.getByRole('button', { name: 'Apply text', exact: true }).click()
    await expect.poll(async () => (await current()).currentRevisionNumber, { timeout: 15_000 }).toBe(
      pinned.currentRevisionNumber + 1,
    )
    const saved = await current()
    expect(saved.htmlContent).toBe(
      TWO.replace('<h1>Old headline</h1>', '<h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1>'),
    )
    await expect(frame.locator('h1')).toHaveText('<script>alert(1)</script>')
    await ready()
    await expect(frame.locator('body script')).toHaveCount(0)
    // The same element is re-selected in the reloaded document.
    await expect(dialog.getByTestId('element-tag')).toHaveText('<h1>')

    // AC-22: the server's grammar message, shown inline; nothing written.
    await dialog.getByLabel('Background', { exact: true }).fill('red; background: url(http://evil.test/x)')
    await dialog.getByRole('button', { name: 'Apply background', exact: true }).click()
    await expect(dialog.getByRole('alert').filter({ hasText: 'Colour must be a hex value' })).toBeVisible()
    const rejected = await current()
    expect(rejected.currentRevisionNumber).toBe(saved.currentRevisionNumber)
    expect(rejected.htmlContent).toBe(saved.htmlContent)

    // AC-25: another writer ("another tab") rewrites the design behind the editor.
    const moved = await pin(api, id, TWO.replace('<p>Keep me</p>', '<p>Moved in</p><p>Keep me</p>'))
    await dialog.getByLabel('Font size').fill('64px')
    await dialog.getByRole('button', { name: 'Apply font size', exact: true }).click()
    await expect(dialog.getByRole('alert').filter({ hasText: 'The design changed' })).toBeVisible()
    const refused = await current()
    expect(refused.currentRevisionNumber).toBe(moved.currentRevisionNumber)
    expect(refused.htmlContent).toBe(moved.htmlContent)
    // The editor reloaded the latest version; a fresh selection lands on the right node.
    await expect(frame.locator('p').first()).toHaveText('Moved in')
    await ready()
    await expect(frame.locator('#inline-edit-select-style')).toBeAttached()
    await frame.locator('p', { hasText: 'Keep me' }).click()
    await dialog.getByLabel('Text colour', { exact: true }).fill('#00ff00')
    await dialog.getByRole('button', { name: 'Apply text colour', exact: true }).click()
    await expect.poll(async () => (await current()).currentRevisionNumber, { timeout: 15_000 }).toBe(
      moved.currentRevisionNumber + 1,
    )
    expect((await current()).htmlContent).toBe(
      moved.htmlContent.replace('<p>Keep me</p>', '<p style="color: #00ff00">Keep me</p>'),
    )
  })

  // TC-INLINE-16 — fix round 1 (Critical). The editor never saves from the
  // caller's stale copy. The page read the draft at revision 2; a newer save
  // then landed (revision 3) and the page does not poll, so it still holds
  // revision 2. That is exactly the state of a reopen inside the page's
  // post-save refetch. Opening the editor re-reads the draft, and a
  // whole-document "Save & re-export" keeps the newer save instead of
  // reverting it.
  test('the editor re-reads the draft on open; a whole-document save never reverts a newer save', async ({
    page,
  }) => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline Reopen ${Date.now()}`)
    const id = String(draft.id)
    await pin(api, id, TWO)
    const current = async () => (await (await api.get(`/api/drafts/${id}`)).json()) as {
      currentRevisionNumber: number
      htmlContent: string
    }

    await pageLogin(page)
    await page.goto(`/drafts/${id}`)
    const edit = page.getByRole('button', { name: 'Edit inline' })
    await expect(edit).toBeEnabled()
    const newer = await pin(api, id, TWO.replace('Old headline', 'Newer headline'))

    await edit.click()
    const dialog = page.getByRole('dialog')
    // The click waits until Save is enabled, which is only after the editor's own read.
    await dialog.getByRole('button', { name: 'Save & re-export' }).click()
    await expect.poll(async () => (await current()).currentRevisionNumber, { timeout: 15_000 }).toBe(
      newer.currentRevisionNumber + 1,
    )
    const after = await current()
    expect(after.htmlContent).toContain('Newer headline')
    expect(after.htmlContent).not.toContain('Old headline')
  })

  // TC-INLINE-17 — fix round 1 (Important). Element mode works with the
  // keyboard alone: every control is focused and activated with Enter, and
  // there is no pointer input on the canvas. Focus returns to the control
  // that was used after a navigation, and after an Apply once the element
  // is re-selected in the reloaded document. When that control is now
  // disabled (an unchanged text disables Apply text) focus goes to its field
  // instead.
  test('element mode works with the keyboard alone, and focus returns to the control used', async ({
    page,
  }) => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const NESTED =
      '<!doctype html><html><head></head><body style="margin:0;width:1080px;height:1080px"><section><h1>Old headline</h1><p>Keep me</p></section><footer>Foot</footer></body></html>'
    const draft = await createExportedDraft(api, `Inline Keyboard ${Date.now()}`)
    const id = String(draft.id)
    const pinned = await pin(api, id, NESTED)
    const current = async () => (await (await api.get(`/api/drafts/${id}`)).json()) as {
      currentRevisionNumber: number
      htmlContent: string
    }
    const press = async (locator: Locator) => {
      await locator.focus()
      await page.keyboard.press('Enter')
    }

    await pageLogin(page)
    await page.goto(`/drafts/${id}`)
    const edit = page.getByRole('button', { name: 'Edit inline' })
    await expect(edit).toBeEnabled()
    await press(edit)
    const dialog = page.getByRole('dialog')
    await press(dialog.getByRole('tab', { name: 'Single element' }))
    await expect(dialog.locator('[data-editor-ready="true"]')).toBeAttached()

    const tag = dialog.getByTestId('element-tag')
    const heading = dialog.locator('[data-focus-id="heading"]')
    const child = dialog.getByRole('button', { name: 'Select first child element' })
    const next = dialog.getByRole('button', { name: 'Select next sibling element' })
    const previous = dialog.getByRole('button', { name: 'Select previous sibling element' })
    const parent = dialog.getByRole('button', { name: 'Select parent element' })

    await press(dialog.getByRole('button', { name: 'Select the whole design' }))
    await expect(tag).toHaveText('<body>')
    await expect(heading).toBeFocused()
    await expect(parent).toBeDisabled()

    await press(child)
    await expect(tag).toHaveText('<section>')
    await expect(child).toBeFocused() // section has children, so Child stays enabled
    await press(next)
    await expect(tag).toHaveText('<footer>')
    await expect(heading).toBeFocused() // footer is last, so Next is disabled; focus falls back
    await press(previous)
    await expect(tag).toHaveText('<section>')
    await press(child)
    await expect(tag).toHaveText('<h1>')

    const text = dialog.getByLabel('Text', { exact: true })
    await text.focus()
    await page.keyboard.press('Control+A')
    await page.keyboard.type('Keyboard headline')
    await press(dialog.getByRole('button', { name: 'Apply text', exact: true }))
    await expect.poll(async () => (await current()).currentRevisionNumber, { timeout: 15_000 }).toBe(
      pinned.currentRevisionNumber + 1,
    )
    // Re-selected in the reloaded document. Apply text is disabled for the
    // unchanged text, so focus is on the Text field.
    await expect(tag).toHaveText('<h1>')
    await expect(text).toBeFocused()

    const size = dialog.getByLabel('Font size')
    await size.focus()
    await page.keyboard.press('Control+A')
    await page.keyboard.type('40px')
    const applySize = dialog.getByRole('button', { name: 'Apply font size', exact: true })
    await press(applySize)
    await expect.poll(async () => (await current()).currentRevisionNumber, { timeout: 15_000 }).toBe(
      pinned.currentRevisionNumber + 2,
    )
    await expect(applySize).toBeFocused()
    expect((await current()).htmlContent).toBe(
      NESTED.replace('<h1>Old headline</h1>', '<h1 style="font-size: 40px">Keyboard headline</h1>'),
    )
  })

  // TC-INLINE-18 — fix round 2. A failed re-read fails closed, and whole-document
  // mode always starts from a fresh read.
  //
  // Phase 1: an element Apply succeeds, then the editor's re-read of the draft
  // fails. The user switches to Whole document and saves. The element edit
  // must survive. The switch re-reads, and until a read lands nothing can be
  // saved. (On 4f9477fe the failed read left the pre-edit document writable,
  // and this save reverted the element edit.)
  //
  // Phase 2: the switch's own re-read fails. Save stays disabled behind "Try
  // again", and becomes available only once a retry succeeds.
  //
  // Only the EDITOR's GET may fail. If the page's own refetch failed, the page
  // would swap to its error screen. After an Apply the page refetch is issued
  // first (onSaved) and the editor's re-read second, so phase 1 fails the 2nd
  // draft GET. The draft page issues no other GET of that URL here (it polls
  // only while an action runs). If that order ever changes, the page errors
  // and this test fails loudly; it cannot pass by accident.
  test('a failed re-read fails closed; switching to whole-document re-reads, so a save never reverts an element edit', async ({
    page,
  }) => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline Reread ${Date.now()}`)
    const id = String(draft.id)
    const pinned = await pin(api, id, TWO)
    const current = async () => (await (await api.get(`/api/drafts/${id}`)).json()) as {
      currentRevisionNumber: number
      htmlContent: string
    }
    // Fail the nth browser GET of exactly /api/drafts/<id> (not /inline-edit or
    // /revisions) from now on, once. `failed` resolves when it has failed. It is
    // wrapped in an object because an async function would unwrap a bare promise.
    const failDraftGet = async (nth: number) => {
      const url = new RegExp(`/api/drafts/${id}$`)
      let seen = 0
      let failed!: () => void
      const done = new Promise<void>((r) => (failed = r))
      let spent = false
      const handler = async (route: Route) => {
        if (spent || route.request().method() !== 'GET') return route.continue()
        seen += 1
        if (seen !== nth) return route.continue()
        spent = true
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Simulated read failure' }),
        })
        failed()
      }
      await page.route(url, handler)
      return { failed: done }
    }

    await pageLogin(page)
    await page.goto(`/drafts/${id}`)
    await page.getByRole('button', { name: 'Edit inline' }).click()
    const dialog = page.getByRole('dialog')
    const frame = page.frameLocator('iframe[title="Inline editor"]')
    const save = dialog.getByRole('button', { name: 'Save & re-export' })
    await dialog.getByRole('tab', { name: 'Single element' }).click()
    await expect(dialog.locator('[data-editor-ready="true"]')).toBeAttached()
    await expect(frame.locator('#inline-edit-select-style')).toBeAttached()

    // Phase 1.
    await frame.locator('h1').click()
    await dialog.getByLabel('Text', { exact: true }).fill('Element edit survives')
    const reread = (await failDraftGet(2)).failed // 1st = the page's refetch, 2nd = the editor's re-read
    await dialog.getByRole('button', { name: 'Apply text', exact: true }).click()
    await expect.poll(async () => (await current()).currentRevisionNumber, { timeout: 15_000 }).toBe(
      pinned.currentRevisionNumber + 1,
    )
    await reread
    await dialog.getByRole('tab', { name: 'Whole document' }).click()
    await save.click() // it waits until Save is enabled, i.e. a read has landed
    await expect.poll(async () => (await current()).currentRevisionNumber, { timeout: 15_000 }).toBe(
      pinned.currentRevisionNumber + 2,
    )
    const afterSave = await current()
    expect(afterSave.htmlContent).toContain('Element edit survives')
    expect(afterSave.htmlContent).not.toContain('Old headline')

    // Phase 2. The whole-document save closed the modal; reopen it (the page
    // has refetched), then fail the read that the switch back to Whole
    // document makes.
    await expect(dialog).toBeHidden()
    await page.getByRole('button', { name: 'Edit inline' }).click()
    await dialog.getByRole('tab', { name: 'Single element' }).click()
    await expect(dialog.locator('[data-editor-ready="true"]')).toBeAttached()
    const switchRead = (await failDraftGet(1)).failed
    await dialog.getByRole('tab', { name: 'Whole document' }).click()
    await switchRead
    const retry = dialog.getByRole('button', { name: 'Try again' })
    await expect(retry).toBeVisible()
    await expect(save).toBeDisabled()
    await retry.click()
    await expect(save).toBeEnabled()
    await expect(frame.locator('h1')).toHaveText('Element edit survives')
  })

  // TC-INLINE-19 — F2 (final-3 Important). The editor's plain-text paste and
  // unsaved-typing listeners used to be guarded by a marker attribute on <body>,
  // which was saved into the stored HTML; a document carrying it opened with NO
  // listeners, so typing was never "dirty" and a mode switch discarded it
  // silently. The guard is parent-side now. The seeded document carries the
  // old marker (an already-stored draft); typing must still be tracked, so the
  // switch to Single element asks first (which also drives the nested
  // useConfirm), and a rich paste lands as plain text.
  test('a stored paste-wired marker no longer disables dirty tracking or plain-text paste', async ({
    page,
  }) => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline Marker ${Date.now()}`)
    const id = String(draft.id)
    await pin(
      api,
      id,
      TWO.replace('<body ', '<body data-inline-edit-paste-wired="1" '),
    )

    await pageLogin(page)
    await page.goto(`/drafts/${id}`)
    await page.getByRole('button', { name: 'Edit inline' }).click()
    const dialog = page.getByRole('dialog')
    const frame = page.frameLocator('iframe[title="Inline editor"]')
    await expect(dialog.getByRole('button', { name: 'Save & re-export' })).toBeEnabled()
    const h1 = frame.locator('h1')
    await h1.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' typed')
    await expect(h1).toContainText('Old headline typed')

    // A rich paste (text/html + text/plain) lands as the plain text only.
    await h1.evaluate((el) => {
      const dt = new DataTransfer()
      dt.setData('text/html', '<b id="rich-paste">RICH</b>')
      dt.setData('text/plain', ' PLAIN')
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    })
    await expect(h1).toContainText('PLAIN')
    await expect(frame.locator('#rich-paste')).toHaveCount(0)

    await dialog.getByRole('tab', { name: 'Single element' }).click()
    await expect(page.getByText('Discard unsaved edits?')).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('Discard unsaved edits?')).toBeHidden()
    await expect(h1).toContainText('PLAIN')
  })

  // TC-INLINE-04 — a foreign draft id is a 404 (no existence leak).
  test('an unknown draft id is 404', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const res = await api.post('/api/drafts/does-not-exist/inline-edit', {
      html: '<!doctype html><html><body>x</body></html>',
    })
    expect(res.status()).toBe(404)
  })
})
