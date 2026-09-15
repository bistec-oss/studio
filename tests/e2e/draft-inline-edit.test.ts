import { test, expect } from '@playwright/test'
import { loginAs, waitForDraft, type ApiClient } from '../helpers/api'

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const MOCKED = () => process.env.MOCK_PUPPETEER === 'true'

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

// Put a KNOWN document on the draft, using the whole-document inline-edit mode
// that TC-INLINE-01 already proves. The element cases below need a deterministic
// address, and the generated mock design is not one. It also doubles as the
// stand-in for "a refine rewrote the markup" in TC-INLINE-10 — the element mode
// cannot tell who rewrote the HTML, only that it moved.
async function seedHtml(api: ApiClient, draftId: string, bodyHtml: string) {
  const res = await api.post(`/api/drafts/${draftId}/inline-edit`, {
    html: `<!doctype html><html><body style="width:1080px;height:1080px">${bodyHtml}</body></html>`,
  })
  expect(res.status()).toBe(200)
}

async function getDraft(api: ApiClient, draftId: string) {
  return (await (await api.get(`/api/drafts/${draftId}`)).json()) as {
    htmlContent: string
    currentRevisionNumber: number
  }
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

  // ─────────────────────────────────────────────────────────────────────────
  // Element-scoped mode (FR-15…FR-19 / AC-21…AC-26). The same route, a second
  // and strictly NARROWER body: `{ element: { tag, text, kind, value } }`. The
  // cases are API-level on purpose — the contract under test is the server's
  // addressing and grammar, and every one of these outcomes is observable in
  // the response status and the stored `htmlContent`. The click-to-select UI
  // that produces the payload is browser work and belongs in §L, which is where
  // this suite's `request`-only convention sends it.
  // ─────────────────────────────────────────────────────────────────────────

  // TC-INLINE-05 (AC-21) — a text edit carrying markup is committed as TEXT.
  test('element text edit escapes markup instead of parsing it', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline El Text ${Date.now()}`)
    await seedHtml(api, draft.id as string, '<h1>Old headline</h1><p>Body copy</p>')

    const res = await api.post(`/api/drafts/${draft.id}/inline-edit`, {
      element: {
        tag: 'h1',
        text: 'Old headline',
        kind: 'text',
        value: '<script>alert(1)</script>',
      },
    })
    expect(res.status()).toBe(200)

    const after = await getDraft(api, draft.id as string)
    // Escaped into the text position, so it is a visible string in the render
    // rather than an element. The document we seeded had no <script> of its
    // own, so this assertion is exact.
    expect(after.htmlContent).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(after.htmlContent).not.toContain('<script>')
    // Confined to the clicked node (FR-17): the sibling is untouched.
    expect(after.htmlContent).toContain('<p>Body copy</p>')
  })

  // TC-INLINE-06 (AC-22) — a colour that tries to break out of the declaration
  // is rejected outright; nothing is written and no revision is created.
  test('element colour edit rejects a declaration break-out with 400', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline El Colour ${Date.now()}`)
    await seedHtml(api, draft.id as string, '<h1>Colour target</h1>')
    const before = await getDraft(api, draft.id as string)

    const res = await api.post(`/api/drafts/${draft.id}/inline-edit`, {
      element: {
        tag: 'h1',
        text: 'Colour target',
        kind: 'color',
        value: 'red; background: url(http://evil.test/x)',
      },
    })
    expect(res.status()).toBe(400)

    const after = await getDraft(api, draft.id as string)
    expect(after.htmlContent).toBe(before.htmlContent)
    expect(after.currentRevisionNumber).toBe(before.currentRevisionNumber)
    expect(after.htmlContent).not.toContain('evil.test')
  })

  // TC-INLINE-07 (AC-23) — a size outside the closed grammar is rejected.
  test('element size edit rejects a bad unit and a non-numeric value with 400', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline El Size ${Date.now()}`)
    await seedHtml(api, draft.id as string, '<h1>Size target</h1>')
    const before = await getDraft(api, draft.id as string)

    // A disallowed unit, a non-numeric value, and a bare number with no unit.
    for (const value of ['24pt', 'huge', '24']) {
      const res = await api.post(`/api/drafts/${draft.id}/inline-edit`, {
        element: { tag: 'h1', text: 'Size target', kind: 'fontSize', value },
      })
      expect(res.status()).toBe(400)
    }

    const after = await getDraft(api, draft.id as string)
    expect(after.htmlContent).toBe(before.htmlContent)
    expect(after.currentRevisionNumber).toBe(before.currentRevisionNumber)
  })

  // TC-INLINE-08 (AC-24) — an accepted element edit commits through the SAME
  // writer as the whole-document mode: exactly one new revision, one pointer
  // advance, and the closed-literal instruction (no address in it).
  test('an element edit produces exactly one new revision through the shared writer', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline El Revision ${Date.now()}`)
    await seedHtml(api, draft.id as string, '<h1>Revision target</h1>')
    const before = await getDraft(api, draft.id as string)
    const revsBefore = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()

    const res = await api.post(`/api/drafts/${draft.id}/inline-edit`, {
      element: { tag: 'h1', text: 'Revision target', kind: 'color', value: '#FF0000' },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.revisionId).toBeTruthy()
    expect(body.exportUrl).toMatch(/^https?:\/\//)

    const after = await getDraft(api, draft.id as string)
    expect(after.currentRevisionNumber).toBe(before.currentRevisionNumber + 1)
    // Re-serialized from the closed grammar, not echoed: `#FF0000` lands
    // lower-cased.
    expect(after.htmlContent).toContain('style="color: #ff0000"')

    const revsAfter = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()
    expect(revsAfter.length).toBe(revsBefore.length + 1)
    const newest = revsAfter.find(
      (r: { id: string }) => r.id === body.revisionId,
    ) as { instruction: string }
    // A closed literal — the clicked text and the typed value are never
    // persisted as an address (FR-18).
    expect(newest.instruction).toBe('Manual element edit (colour)')
  })

  // TC-INLINE-09 (AC-26) — a selector/xpath in the payload cannot steer the
  // write. The request type has no such field, so the write still lands on the
  // content-addressed node and the node the selector names is untouched.
  test('a client-supplied selector does not choose the write target', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline El Selector ${Date.now()}`)
    await seedHtml(api, draft.id as string, '<h1>Addressed node</h1><p>Selector bait</p>')

    const res = await api.post(`/api/drafts/${draft.id}/inline-edit`, {
      element: {
        tag: 'h1',
        text: 'Addressed node',
        kind: 'text',
        value: 'Rewritten node',
        // Both point at the OTHER node on purpose.
        selector: 'p',
        xpath: '/html/body/p',
      },
      selector: 'p',
    })
    expect(res.status()).toBe(200)

    const after = await getDraft(api, draft.id as string)
    expect(after.htmlContent).toContain('<h1>Rewritten node</h1>')
    expect(after.htmlContent).toContain('<p>Selector bait</p>')
  })

  // TC-INLINE-10 (AC-25) — the address is re-resolved against the CURRENT html,
  // so a rewrite between selecting and saving makes the save REFUSE rather than
  // land on whatever is there now.
  test('a stale element address refuses with 409 instead of mis-landing', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline El Stale ${Date.now()}`)
    await seedHtml(api, draft.id as string, '<h1>Alpha headline</h1>')
    // Stands in for a refine (or another editor) rewriting the markup while the
    // user still has "Alpha headline" selected in their open editor.
    await seedHtml(api, draft.id as string, '<h1>Beta headline</h1>')
    const before = await getDraft(api, draft.id as string)

    const res = await api.post(`/api/drafts/${draft.id}/inline-edit`, {
      element: { tag: 'h1', text: 'Alpha headline', kind: 'text', value: 'Should not land' },
    })
    expect(res.status()).toBe(409)
    expect((await res.json()).error).toContain('no longer in the design')

    const after = await getDraft(api, draft.id as string)
    expect(after.htmlContent).toBe(before.htmlContent)
    expect(after.htmlContent).toContain('Beta headline')
    expect(after.htmlContent).not.toContain('Should not land')
  })

  // TC-INLINE-11 — two nodes with identical visible text are indistinguishable
  // to a content address, by construction. That is a 409 with its own message,
  // not a guess between them.
  test('an ambiguous element address refuses with 409', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline El Ambiguous ${Date.now()}`)
    await seedHtml(api, draft.id as string, '<p>Same text</p><p>Same text</p>')
    const before = await getDraft(api, draft.id as string)

    const res = await api.post(`/api/drafts/${draft.id}/inline-edit`, {
      element: { tag: 'p', text: 'Same text', kind: 'text', value: 'Changed' },
    })
    expect(res.status()).toBe(409)
    expect((await res.json()).error).toContain('could not be identified uniquely')

    const after = await getDraft(api, draft.id as string)
    expect(after.htmlContent).toBe(before.htmlContent)
    expect(after.htmlContent).not.toContain('Changed')
  })

  // TC-INLINE-12 — the tag and kind allow-lists are closed: a tag outside
  // ELEMENT_EDITABLE_TAGS and an unknown kind are both 400, and neither writes.
  test('a tag or kind outside the closed allow-lists is 400', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline El Closed ${Date.now()}`)
    await seedHtml(api, draft.id as string, '<h1>Closed list</h1>')
    const before = await getDraft(api, draft.id as string)

    const badTag = await api.post(`/api/drafts/${draft.id}/inline-edit`, {
      element: { tag: 'script', text: 'Closed list', kind: 'text', value: 'x' },
    })
    expect(badTag.status()).toBe(400)

    const badKind = await api.post(`/api/drafts/${draft.id}/inline-edit`, {
      element: { tag: 'h1', text: 'Closed list', kind: 'background', value: 'red' },
    })
    expect(badKind.status()).toBe(400)

    const after = await getDraft(api, draft.id as string)
    expect(after.htmlContent).toBe(before.htmlContent)
    expect(after.currentRevisionNumber).toBe(before.currentRevisionNumber)
  })
})
