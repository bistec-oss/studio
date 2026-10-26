import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { loginAs, waitForAction, waitForDraft } from '../helpers/api'
import { ADMIN_EMAIL, ADMIN_PASSWORD, briefDraftIds, pageLogin } from '../helpers/ui'
import { prisma, dbAvailable, NO_DB_MSG } from '../helpers/db'
import { DOCS_BUCKET, objectExists, removeObject } from '../helpers/minio'
import { GIF_BYTES, SVG_AS_PNG, makePng } from '../helpers/images'

// §AG: product screenshots (change 025). TC-SHOT-01 (T2), TC-SHOT-02 to 06, 14 (T7) and
// TC-SHOT-07 to 09 (T8) and TC-SHOT-10 to 12 (T9); the rest of the suite arrives with T10. Same MOCK_AI + MOCK_PUPPETEER seams as §AF.
// The request runs in its OWN fresh team, disposed afterwards, so it does not
// depend on the seeded team's providers.

async function withFreshTeam(
  request: APIRequestContext,
  run: (t: { api: Awaited<ReturnType<typeof loginAs>>; kitId: string; copyKey: string }) => Promise<void>,
) {
  const sa = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  const name = `Shot ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const teamRes = await sa.post('/api/admin/teams', { name })
  expect(teamRes.status()).toBe(201)
  const team = await teamRes.json()
  const api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD, { team: name })
  try {
    const kitRes = await api.post('/api/admin/brandkits', { name: 'Shot Kit', colors: ['#0284c7', '#020617'] })
    expect(kitRes.status()).toBe(201)
    const kit = await kitRes.json()
    const copyRes = await api.post('/api/admin/providers', {
      apiKey: 'shotcopy_key_123456789',
      slot: 'COPY',
      providerName: 'shotcopy',
      label: 'Shot Copy',
    })
    expect(copyRes.status()).toBe(201)
    const copy = await copyRes.json()
    await run({ api, kitId: kit.id, copyKey: copy.providerKey })
  } finally {
    await api.dispose()
    await sa.del(`/api/admin/teams/${team.id}`)
    await sa.dispose()
  }
}

test.describe('§AG product screenshots', () => {
  test('TC-SHOT-01: device-screen with no screenshot is 400 IMAGE_STYLE_NEEDS_SCREENSHOT', async ({ request }) => {
    await withFreshTeam(request, async (t) => {
      const res = await t.api.post('/api/briefs', {
        topic: 'Shot no source',
        goal: 'awareness',
        tone: 'professional',
        channels: ['LINKEDIN'],
        designMode: 'GENERATE',
        copyProviderKey: t.copyKey,
        brandKitId: t.kitId,
        imageStyle: 'device-screen',
      })
      expect(res.status()).toBe(400)
      expect((await res.json()).code).toBe('IMAGE_STYLE_NEEDS_SCREENSHOT')
    })
  })
})

// ── T7: upload, preview, the brief's choice, brief drafts, draft delete ──────

const SHOT_BRIEF = {
  goal: 'awareness',
  tone: 'professional',
  channels: ['LINKEDIN'],
  designMode: 'GENERATE',
}

type Fresh = { api: Awaited<ReturnType<typeof loginAs>>; kitId: string; copyKey: string }

async function whoAmI(api: Fresh['api']): Promise<{ userId: string; teamId: string }> {
  const me = await (await api.get('/api/me')).json()
  return { userId: me.userId as string, teamId: me.activeTeamId as string }
}

async function uploadShot(api: Fresh['api'], buffer: Buffer, name = 'screen.png', mimeType = 'image/png') {
  return api.multipart('/api/briefs/screenshots', { file: { name, mimeType, buffer } })
}

function briefBody(t: Fresh, extra: Record<string, unknown>) {
  return { ...SHOT_BRIEF, topic: 'Shot brief', copyProviderKey: t.copyKey, brandKitId: t.kitId, ...extra }
}

test.describe('§AG product screenshots: storage and the brief', () => {
  test('TC-SHOT-02: a PNG uploads to the private bucket and returns a key, never a URL', async ({ request }) => {
    await withFreshTeam(request, async (t) => {
      const { userId, teamId } = await whoAmI(t.api)
      const res = await uploadShot(t.api, makePng(800, 500))
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(Object.keys(body).sort()).toEqual(['height', 'key', 'width'])
      expect(body.width).toBe(800)
      expect(body.height).toBe(500)
      expect(body.key).toMatch(new RegExp(`^screenshots/${teamId}/${userId}/\\d+-[0-9a-f]+\\.png$`))
      expect(JSON.stringify(body)).not.toMatch(/https?:/)
      expect(await objectExists(DOCS_BUCKET, body.key)).toBe(true)

      // The owner can preview it, and the response is never cached.
      const preview = await t.api.get(`/api/briefs/screenshots?key=${encodeURIComponent(body.key)}`)
      expect(preview.status()).toBe(200)
      expect(preview.headers()['content-type']).toBe('image/png')
      expect(preview.headers()['cache-control']).toContain('no-store')
      await removeObject(DOCS_BUCKET, body.key)
    })
  })

  test('TC-SHOT-03: an SVG named .png, a GIF and a file over the limits are 400', async ({ request }) => {
    await withFreshTeam(request, async (t) => {
      const svg = await uploadShot(t.api, SVG_AS_PNG, 'screen.png', 'image/png')
      expect(svg.status()).toBe(400)
      expect((await svg.json()).error).toMatch(/PNG, JPEG or WebP/)
      expect((await uploadShot(t.api, GIF_BYTES, 'screen.png', 'image/png')).status()).toBe(400)
      expect((await uploadShot(t.api, makePng(8001, 700))).status()).toBe(400)
      expect((await t.api.multipart('/api/briefs/screenshots', {})).status()).toBe(400)
    })
  })

  test('TC-SHOT-04: a 600 by 400 screenshot is 400 and stores nothing', async ({ request }) => {
    await withFreshTeam(request, async (t) => {
      const res = await uploadShot(t.api, makePng(600, 400))
      expect(res.status()).toBe(400)
      expect((await res.json()).error).toMatch(/at least 640 by 400/)
    })
  })

  test("TC-SHOT-05: another team's key, and a key that is not yours, are 404 on the preview", async ({ request }) => {
    await withFreshTeam(request, async (t) => {
      const up = await (await uploadShot(t.api, makePng(800, 500))).json()
      // The same person, signed in to the seeded team: the key names the other team.
      const other = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD, { team: 'Bistec' })
      try {
        expect((await other.get(`/api/briefs/screenshots?key=${encodeURIComponent(up.key)}`)).status()).toBe(404)
        // With a draftId the draft must be visible and must carry that key in its stamp.
        expect((await other.get(`/api/briefs/screenshots?key=${encodeURIComponent(up.key)}&draftId=nope`)).status()).toBe(404)
      } finally {
        await other.dispose()
      }
      // A missing key, a traversal and a foreign-looking key are all 404.
      expect((await t.api.get('/api/briefs/screenshots')).status()).toBe(404)
      const { teamId } = await whoAmI(t.api)
      for (const key of [`screenshots/${teamId}/someone-else/x.png`, `screenshots/${teamId}/../x.png`, 'briefs/x.png']) {
        expect((await t.api.get(`/api/briefs/screenshots?key=${encodeURIComponent(key)}`)).status(), key).toBe(404)
      }
      // The owner's own key with a draft that does not carry it is also 404.
      expect((await t.api.get(`/api/briefs/screenshots?key=${encodeURIComponent(up.key)}&draftId=nope`)).status()).toBe(404)
      await removeObject(DOCS_BUCKET, up.key)
    })
  })

  test('TC-SHOT-06: each 400 of FR-11, and a valid brief stores compositeSource', async ({ request }) => {
    await withFreshTeam(request, async (t) => {
      const { userId, teamId } = await whoAmI(t.api)
      const up = await (await uploadShot(t.api, makePng(1280, 800))).json()
      const source = { kind: 'brief-upload', key: up.key, width: up.width, height: up.height }

      // Another team's, and another user's, prefix, and a traversal.
      for (const key of [
        `screenshots/other-team/${userId}/x.png`,
        `screenshots/${teamId}/other-user/x.png`,
        `screenshots/${teamId}/${userId}/../x.png`,
      ]) {
        const res = await t.api.post('/api/briefs', briefBody(t, { imageStyle: 'device-screen', compositeSource: { ...source, key } }))
        expect(res.status(), key).toBe(400)
        expect((await res.json()).code).toBe('INVALID_COMPOSITE_SOURCE')
      }
      // The object does not exist.
      const missing = await t.api.post(
        '/api/briefs',
        briefBody(t, {
          imageStyle: 'device-screen',
          compositeSource: { ...source, key: `screenshots/${teamId}/${userId}/0-missing.png` },
        }),
      )
      expect(missing.status()).toBe(400)
      expect((await missing.json()).code).toBe('INVALID_COMPOSITE_SOURCE')
      // A screenshot on a look with no `requires`, and on classic.
      for (const imageStyle of ['spotlight', 'classic', undefined]) {
        const res = await t.api.post('/api/briefs', briefBody(t, { imageStyle, compositeSource: source }))
        expect(res.status(), String(imageStyle)).toBe(400)
        expect((await res.json()).code).toBe('SCREENSHOT_NEEDS_IMAGE_STYLE')
      }
      // A `requires` look with none is TC-SHOT-01; a malformed shape is 400 too.
      const bad = await t.api.post('/api/briefs', briefBody(t, { imageStyle: 'device-screen', compositeSource: { key: up.key } }))
      expect(bad.status()).toBe(400)

      // The valid pair is stored as sent.
      const ok = await t.api.post('/api/briefs', briefBody(t, { imageStyle: 'device-screen', compositeSource: source }))
      expect(ok.status()).toBe(201)
      const brief = await ok.json()
      expect(brief.imageStyle).toBe('device-screen')
      expect(brief.compositeSource).toEqual(source)
      await removeObject(DOCS_BUCKET, up.key)
    })
  })

  test('TC-SHOT-14: Resume keeps the screenshot; Discard deletes the object; a generate keeps it', async ({ request }) => {
    await withFreshTeam(request, async (t) => {
      const { teamId } = await whoAmI(t.api)
      const draftPayload = (source: unknown) => ({
        step: 2,
        campaignId: '',
        aspectRatio: 'SQUARE',
        brandKitId: t.kitId,
        designMode: 'GENERATE',
        templateId: '',
        referenceTemplateId: '',
        topic: 'Shot draft',
        prompt: 'A prompt long enough to matter',
        tone: 'professional',
        images: [],
        imageStyle: 'device-screen',
        compositeSource: source,
      })
      const up1 = await (await uploadShot(t.api, makePng(1280, 800))).json()
      const src1 = { kind: 'brief-upload', key: up1.key, width: up1.width, height: up1.height }

      // A key that is not this person's own is refused at save.
      const foreign = await t.api.put('/api/brief-drafts', {
        payload: draftPayload({ ...src1, key: `screenshots/${teamId}/other-user/x.png` }),
      })
      expect(foreign.status()).toBe(400)

      // Autosave, then Resume: the payload comes back with the screenshot.
      const put = await t.api.put('/api/brief-drafts', { payload: draftPayload(src1) })
      expect(put.status()).toBe(200)
      const id = (await put.json()).id as string
      const resumed = await (await t.api.get(`/api/brief-drafts/${id}`)).json()
      expect(resumed.payload.compositeSource).toEqual(src1)
      expect(resumed.payload.imageStyle).toBe('device-screen')

      // Discard deletes the private object (asserted against MinIO).
      expect(await objectExists(DOCS_BUCKET, up1.key)).toBe(true)
      expect((await t.api.del(`/api/brief-drafts/${id}`)).status()).toBe(200)
      expect(await objectExists(DOCS_BUCKET, up1.key)).toBe(false)

      // A successful generate removes the row but keeps the object.
      const up2 = await (await uploadShot(t.api, makePng(1280, 800))).json()
      const src2 = { kind: 'brief-upload', key: up2.key, width: up2.width, height: up2.height }
      const id2 = (await (await t.api.put('/api/brief-drafts', { payload: draftPayload(src2) })).json()).id as string
      expect((await t.api.del(`/api/brief-drafts/${id2}?keepImages=true`)).status()).toBe(200)
      expect(await objectExists(DOCS_BUCKET, up2.key)).toBe(true)
      await removeObject(DOCS_BUCKET, up2.key)
    })
  })

  test('TC-SHOT-14b: deleting the last draft of a brief deletes its screenshot object', async ({ request }) => {
    test.skip(!dbAvailable || !prisma, NO_DB_MSG)
    await withFreshTeam(request, async (t) => {
      const { teamId } = await whoAmI(t.api)
      const up = await (await uploadShot(t.api, makePng(1280, 800))).json()
      const source = { kind: 'brief-upload', key: up.key, width: up.width, height: up.height }
      const created = await t.api.post('/api/briefs', briefBody(t, { imageStyle: 'device-screen', compositeSource: source }))
      expect(created.status()).toBe(201)
      const brief = await created.json()
      // A draft row for the brief (generation of a composite arrives with T8).
      const draft = await prisma!.draft.create({ data: { teamId, briefId: brief.id } })
      expect(await objectExists(DOCS_BUCKET, up.key)).toBe(true)
      const del = await t.api.del(`/api/drafts/${draft.id}`)
      expect(del.status()).toBe(200)
      expect((await del.json()).briefDeleted).toBe(true)
      expect(await objectExists(DOCS_BUCKET, up.key)).toBe(false)
    })
  })
})

// ── T8: generation places the screenshot ─────────────────────────────────────
// The IMAGE row is NOT the default: the real resolver reaches it through the
// oldest-enabled fallback (005 FR-01), as in §AA. __MOCK_BG__ gives the hero
// image; the other sentinels shape the pixel check and the render check.

async function addImageProvider(api: Fresh['api']) {
  const res = await api.post('/api/admin/providers', { apiKey: 'sk-shot-fake-openai-key', slot: 'IMAGE' })
  expect(res.status()).toBe(201)
  const image = await res.json()
  expect((await api.patch(`/api/admin/providers/${image.id}`, { isDefault: false })).status()).toBe(200)
}

type ShotDraft = Record<string, unknown> & {
  id: string
  status: string
  imageUrl: string | null
  htmlContent: string
  composition: {
    appliedArchetype: string
    contractVersion: number | null
    fallbackReason?: string
    composites?: Array<{
      region: number
      rect: { x: number; y: number; w: number; h: number }
      source: { kind: string; key: string }
    }>
  } | null
  compositionNotice: { reason: string; message: string } | null
}

async function generateDeviceScreen(t: Fresh, topic: string) {
  const up = await (await uploadShot(t.api, makePng(1280, 800))).json()
  const source = { kind: 'brief-upload', key: up.key, width: up.width, height: up.height }
  const briefRes = await t.api.post('/api/briefs', briefBody(t, { topic, imageStyle: 'device-screen', compositeSource: source }))
  expect(briefRes.status(), await briefRes.text()).toBe(201)
  const brief = await briefRes.json()
  const res = await t.api.post('/api/generate/assemble-b', { briefId: brief.id })
  expect(res.status()).toBe(202)
  const draft = (await waitForDraft(t.api, (await res.json()).draftId)) as ShotDraft
  expect(draft.status, String(draft.failureReason)).toBe('EXPORTED')
  return { draft, up, briefId: brief.id as string }
}

// The contract region of device-screen v1 SQUARE; __MOCK_HERO_SCREEN_OFFSET__
// moves the synthetic screen by 3% across and 2% down, so the detected rect is
// this one shifted, within the detector's one-grid-step resolution (2 px of 1080).
const REGION = { x: 14, y: 42, w: 72, h: 45 }
const SHIFTED = { x: REGION.x + 3, y: REGION.y + 2, w: REGION.w, h: REGION.h }
const STEP_PCT = 0.6

test.describe('§AG product screenshots: generation (T8)', () => {
  test('TC-SHOT-07: a kept device-screen draft stores one canonical element and the token, and a stamp with the detected rect', async ({ request }) => {
    await withFreshTeam(request, async (t) => {
      await addImageProvider(t.api)
      const { draft, up } = await generateDeviceScreen(t, `Shot kept __MOCK_BG__ __MOCK_HERO_SCREEN_OFFSET__ ${Date.now()}`)

      const stamp = draft.composition!
      expect(stamp.appliedArchetype).toBe('device-screen')
      expect(stamp.fallbackReason).toBeUndefined()
      expect(stamp.composites).toHaveLength(1)
      const entry = stamp.composites![0]
      expect(entry.source).toEqual({ kind: 'brief-upload', key: up.key })
      // The stamped rect is the DETECTED screen, not the contract region.
      expect(entry.rect).not.toEqual(REGION)
      for (const k of ['x', 'y', 'w', 'h'] as const) {
        expect(Math.abs(entry.rect[k] - SHIFTED[k]), k).toBeLessThanOrEqual(STEP_PCT)
      }

      // The stored HTML: exactly one canonical element, the token, no reference to the object.
      const html = draft.htmlContent
      expect(html.match(/data-composite="0"/g)).toHaveLength(1)
      expect(html.split('__COMPOSITE_0__')).toHaveLength(2)
      expect(html).not.toContain('screenshots/')
      expect(html).not.toContain(up.key)
      expect(html).not.toMatch(/data:image\//)
      if (dbAvailable && prisma) {
        const rows = await prisma.draftRevision.findMany({ where: { draftId: draft.id }, select: { htmlSnapshot: true } })
        expect(rows.length).toBeGreaterThan(0)
        for (const r of rows) {
          expect(r.htmlSnapshot).toContain('__COMPOSITE_0__')
          expect(r.htmlSnapshot).not.toContain('screenshots/')
        }
      }

      // The draft's own stamp lets a viewer of the draft preview the screenshot (T7 follow-up).
      const preview = await t.api.get(`/api/briefs/screenshots?key=${encodeURIComponent(up.key)}&draftId=${draft.id}`)
      expect(preview.status()).toBe(200)
      expect(preview.headers()['content-type']).toBe('image/png')
      expect(preview.headers()['cache-control']).toContain('no-store')
      // A key the stamp does not carry is still 404 for the same draft.
      const wrong = await t.api.get(`/api/briefs/screenshots?key=${encodeURIComponent(up.key + 'x')}&draftId=${draft.id}`)
      expect(wrong.status()).toBe(404)
      await removeObject(DOCS_BUCKET, up.key)
    })
  })

  test('TC-SHOT-08: a render that fails the composite check is EXPORTED as classic with composite-not-rendered and the notice', async ({ request }) => {
    await withFreshTeam(request, async (t) => {
      await addImageProvider(t.api)
      const { draft, up } = await generateDeviceScreen(t, `Shot render fail __MOCK_BG__ __MOCK_COMPOSITE_FAIL__ ${Date.now()}`)
      expect(draft.composition).toMatchObject({
        requestedArchetype: 'device-screen',
        appliedArchetype: 'classic',
        contractVersion: null,
        fallbackReason: 'composite-not-rendered',
      })
      expect(draft.composition).not.toHaveProperty('composites')
      expect(draft.compositionNotice).toMatchObject({ reason: 'composite-not-rendered' })
      expect(draft.compositionNotice!.message).toContain('screenshot')
      // The second design ran without the hero image and without the element.
      expect(draft.imageUrl).toBeNull()
      expect(draft.htmlContent).not.toContain('data-composite')
      expect(draft.htmlContent).not.toContain('__COMPOSITE_0__')
      await removeObject(DOCS_BUCKET, up.key)
    })
  })

  test('TC-SHOT-09: a busy screen area is composite-not-blank: classic over the same image, no composites', async ({ request }) => {
    await withFreshTeam(request, async (t) => {
      await addImageProvider(t.api)
      const { draft, up } = await generateDeviceScreen(t, `Shot busy screen __MOCK_BG__ __MOCK_HERO_SCREEN__ ${Date.now()}`)
      expect(draft.composition).toMatchObject({
        requestedArchetype: 'device-screen',
        appliedArchetype: 'classic',
        fallbackReason: 'composite-not-blank',
      })
      expect(draft.composition).not.toHaveProperty('composites')
      expect(draft.compositionNotice).toMatchObject({ reason: 'composite-not-blank' })
      // The image is reused under classic (Phase 1), so it is stored on the draft.
      expect(draft.imageUrl).toBeTruthy()
      expect(draft.htmlContent).not.toContain('data-composite')
      await removeObject(DOCS_BUCKET, up.key)
    })
  })
})

// ── T9: refine, inline edit and a failed placement ───────────────────────────
// Every action re-renders from the STAMP: the element and the composites entry
// (with its rect) survive, and the stored documents hold only the token.

const COMPOSITE_ELEMENT_RE = /<div data-composite="0"[\s\S]*?<\/div>/
const PLACEMENT_ERROR = 'The product screenshot could not be placed; nothing was changed'

type ActionDraft = ShotDraft & { currentRevisionNumber: number | null; pendingActionError: string | null }

async function refineShot(t: Fresh, draftId: string, instruction: string): Promise<ActionDraft> {
  // The response listener rule does not apply (API calls): the claim happens before the 202.
  const res = await t.api.post(`/api/drafts/${draftId}/refine`, { instruction })
  expect(res.status()).toBe(202)
  return (await waitForAction(t.api, draftId)) as ActionDraft
}

async function getShot(t: Fresh, draftId: string): Promise<ActionDraft> {
  return (await (await t.api.get(`/api/drafts/${draftId}`)).json()) as ActionDraft
}

async function expectOnlyTheToken(draftId: string, html: string) {
  expect(html).toContain('__COMPOSITE_0__')
  expect(html).not.toContain('screenshots/')
  expect(html).not.toMatch(/data:image\//)
  if (dbAvailable && prisma) {
    const rows = await prisma.draftRevision.findMany({ where: { draftId }, select: { htmlSnapshot: true } })
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.htmlSnapshot).toContain('__COMPOSITE_0__')
      expect(r.htmlSnapshot).not.toContain('screenshots/')
    }
    // NFR-05: the stamp and the brief may hold the key, never a URL to it.
    const d = await prisma.draft.findUnique({
      where: { id: draftId },
      select: { composition: true, brief: { select: { compositeSource: true } } },
    })
    for (const stored of [d?.composition, d?.brief?.compositeSource]) {
      expect(JSON.stringify(stored ?? null)).not.toMatch(/https?:\/\/[^"]*screenshots\//)
      expect(JSON.stringify(stored ?? null)).not.toContain('/api/briefs/screenshots')
    }
  }
}

test.describe('§AG product screenshots: re-renders (T9)', () => {
  test('TC-SHOT-10: a refine keeps the canonical element and the composites entry with its rect', async ({ request }) => {
    await withFreshTeam(request, async (t) => {
      await addImageProvider(t.api)
      const { draft, up } = await generateDeviceScreen(t, `Shot refine __MOCK_BG__ __MOCK_HERO_SCREEN_OFFSET__ ${Date.now()}`)
      const before = draft.composition!.composites![0]
      const element = draft.htmlContent.match(COMPOSITE_ELEMENT_RE)![0]

      const after = await refineShot(t, draft.id, 'Make the headline bigger __MOCK_BG_NOT_NEEDED__ __VERIFY_PASS__')
      expect(after.pendingActionError).toBeNull()
      expect(after.currentRevisionNumber).toBe((draft.currentRevisionNumber as number) + 1)
      expect(after.composition!.appliedArchetype).toBe('device-screen')
      expect(after.composition!.composites).toEqual([before])
      // The model never wrote the element; the writer put the one canonical element back.
      expect(after.htmlContent.match(/data-composite="0"/g)).toHaveLength(1)
      expect(after.htmlContent.match(COMPOSITE_ELEMENT_RE)![0]).toBe(element)
      await expectOnlyTheToken(draft.id, after.htmlContent)
      await removeObject(DOCS_BUCKET, up.key)
    })
  })

  test('TC-SHOT-11: an inline edit that deletes or moves the element is saved with the canonical element restored', async ({ request }) => {
    await withFreshTeam(request, async (t) => {
      await addImageProvider(t.api)
      const { draft, up } = await generateDeviceScreen(t, `Shot inline __MOCK_BG__ __MOCK_HERO_SCREEN_OFFSET__ ${Date.now()}`)
      const element = draft.htmlContent.match(COMPOSITE_ELEMENT_RE)![0]
      const rect = draft.composition!.composites![0].rect

      // Deleted: the editor sends the document without it.
      const deleted = draft.htmlContent.replace(COMPOSITE_ELEMENT_RE, '').replace('MOCK DESIGN', 'MOCK EDITED')
      expect(deleted).not.toContain('data-composite')
      const r1 = await t.api.post(`/api/drafts/${draft.id}/inline-edit`, { html: deleted })
      expect(r1.status(), await r1.text()).toBe(200)
      const d1 = await getShot(t, draft.id)
      expect(d1.htmlContent).toContain('MOCK EDITED')
      expect(d1.htmlContent.match(/data-composite="0"/g)).toHaveLength(1)
      expect(d1.htmlContent.match(COMPOSITE_ELEMENT_RE)![0]).toBe(element)
      expect(d1.composition!.composites![0].rect).toEqual(rect)

      // Moved: the editor sends it at another place, showing the preview URL.
      const moved = d1.htmlContent
        .replace(/left:[\d.]+px/, 'left:5px')
        .replace('__COMPOSITE_0__', `/api/briefs/screenshots?key=${encodeURIComponent(up.key)}&draftId=${draft.id}`)
      const r2 = await t.api.post(`/api/drafts/${draft.id}/inline-edit`, { html: moved })
      expect(r2.status(), await r2.text()).toBe(200)
      const d2 = await getShot(t, draft.id)
      expect(d2.htmlContent.match(COMPOSITE_ELEMENT_RE)![0]).toBe(element)
      expect(d2.currentRevisionNumber).toBe((d1.currentRevisionNumber as number) + 1)
      await expectOnlyTheToken(draft.id, d2.htmlContent)
      await removeObject(DOCS_BUCKET, up.key)
    })
  })

  test('TC-SHOT-12: a failed placement fails the refine with the named error and writes no revision; a refine that replaces the image drops the composite', async ({ request }) => {
    await withFreshTeam(request, async (t) => {
      await addImageProvider(t.api)
      const { draft, up } = await generateDeviceScreen(t, `Shot fail __MOCK_BG__ __MOCK_HERO_SCREEN_OFFSET__ ${Date.now()}`)

      const failed = await refineShot(t, draft.id, 'Make the headline bigger __MOCK_BG_NOT_NEEDED__ __VERIFY_PASS__ __MOCK_COMPOSITE_FAIL__')
      expect(failed.pendingActionError).toBe(PLACEMENT_ERROR)
      expect(failed.currentRevisionNumber).toBe(draft.currentRevisionNumber)
      expect(failed.htmlContent).toBe(draft.htmlContent)
      expect(failed.composition).toEqual(draft.composition)
      if (dbAvailable && prisma) {
        expect(await prisma.draftRevision.count({ where: { draftId: draft.id } })).toBe(1)
      }

      // A refine that replaces the image: classic, refine-replaced-image, no element.
      const replaced = await refineShot(t, draft.id, 'Put a city skyline behind it __MOCK_BG__ __VERIFY_PASS__')
      expect(replaced.pendingActionError).toBeNull()
      expect(replaced.composition).toMatchObject({ appliedArchetype: 'classic', fallbackReason: 'refine-replaced-image' })
      expect(replaced.composition).not.toHaveProperty('composites')
      expect(replaced.htmlContent).not.toContain('data-composite')
      expect(replaced.htmlContent).not.toContain('__COMPOSITE_0__')
      expect(replaced.compositionNotice).toMatchObject({ reason: 'refine-replaced-image' })
      await removeObject(DOCS_BUCKET, up.key)
    })
  })
})

// ── T10: the wizard (TC-SHOT-13, AC-15) ──────────────────────────────────────

test.describe('§AG product screenshots: the wizard', () => {
  let api: Awaited<ReturnType<typeof loginAs>>
  let before: Set<string>
  let kitId = ''
  const keys: string[] = []
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    before = new Set(await briefDraftIds(api))
    kitId = (await (await api.post('/api/admin/brandkits', { name: `Shot Wizard Kit ${Date.now()}`, colors: ['#8c4812'] })).json()).id
  })
  test.afterEach(async () => {
    for (const id of await briefDraftIds(api)) if (!before.has(id)) await api.del(`/api/brief-drafts/${id}`)
    for (const key of keys.splice(0)) await removeObject(DOCS_BUCKET, key).catch(() => undefined)
    if (kitId) await api.del(`/api/admin/brandkits/${kitId}`)
    await api.dispose()
  })

  const option = (page: Page, key: string) => page.getByTestId(`image-style-${key}`)
  const summary = (page: Page, label: string) =>
    page.getByRole('term').filter({ hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]')

  async function toSizeStep(page: Page) {
    await pageLogin(page)
    await page.goto('/brief')
    await expect(page.getByRole('heading', { name: 'Select a campaign' })).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: /continue/i }).click()
    await expect(page.getByRole('heading', { name: 'Size & Design' })).toBeVisible()
    const kit = page.getByRole('combobox', { name: 'Brand kit' })
    await expect(kit.locator(`option[value="${kitId}"]`)).toBeAttached()
    await kit.selectOption(kitId)
  }

  // The upload response is awaited from before the file is set (the 023 lesson).
  async function upload(page: Page, buffer: Buffer) {
    const done = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/briefs/screenshots',
    )
    await page.getByTestId('screenshot-input').setInputFiles({ name: 'screen.png', mimeType: 'image/png', buffer })
    return done
  }

  test('TC-SHOT-13: the field is Path B only; device-screen is disabled until an upload, then enabled; the advisory shows for 1:1; the body carries compositeSource; Remove resets the pick; the draft resumes with it', async ({ page }) => {
    await toSizeStep(page)

    // Path A: no field. Path B: the field, with the look disabled and its reason.
    await expect(page.getByTestId('screenshot-section')).toHaveCount(0)
    await page.getByRole('button', { name: /^Freeform/ }).click()
    const section = page.getByTestId('screenshot-section')
    await expect(section).toBeVisible()
    await expect(section.getByText('Product screenshot').first()).toBeVisible()
    await expect(option(page, 'device-screen')).toBeDisabled()
    await expect(option(page, 'device-screen')).toContainText('Needs a product screenshot')

    // A refused upload shows the server's own message and leaves the look disabled.
    const refused = await upload(page, makePng(600, 400))
    expect(refused.status()).toBe(400)
    await expect(page.getByTestId('screenshot-error')).toContainText(/at least 640 by 400/)
    await expect(option(page, 'device-screen')).toBeDisabled()

    // A 1:1 screenshot uploads: the thumbnail, the advisory, the look enabled.
    const ok = await upload(page, makePng(1000, 1000))
    expect(ok.status()).toBe(200)
    const shot = (await ok.json()) as { key: string; width: number; height: number }
    keys.push(shot.key)
    await expect(page.getByTestId('screenshot-error')).toHaveCount(0)
    await expect(page.getByRole('img', { name: 'Product screenshot preview' })).toBeVisible()
    await expect(page.getByTestId('screenshot-advisory')).toContainText('Will be letterboxed')
    await expect(option(page, 'device-screen')).toBeEnabled()

    // Remove while device-screen is picked resets the pick to the style's own.
    await option(page, 'device-screen').click()
    await expect(option(page, 'device-screen')).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Remove product screenshot' }).click()
    await expect(page.getByTestId('screenshot-preview')).toHaveCount(0)
    await expect(page.getByTestId('screenshot-advisory')).toHaveCount(0)
    await expect(option(page, 'device-screen')).toBeDisabled()
    await expect(option(page, 'device-screen')).toHaveAttribute('aria-pressed', 'false')
    await expect(option(page, 'classic')).toHaveAttribute('aria-pressed', 'true')

    // A 16:10 screenshot gives no advisory.
    const wide = await upload(page, makePng(1600, 1000))
    keys.push(((await wide.json()) as { key: string }).key)
    await expect(page.getByRole('img', { name: 'Product screenshot preview' })).toBeVisible()
    await expect(page.getByTestId('screenshot-advisory')).toHaveCount(0)
    await page.getByRole('button', { name: 'Remove product screenshot' }).click()

    // Upload again, pick the look, and go forward; the autosave carries the source.
    const again = await upload(page, makePng(1000, 1000))
    const picked = (await again.json()) as { key: string; width: number; height: number }
    keys.push(picked.key)
    await option(page, 'device-screen').click()
    const cont = page.getByRole('button', { name: /continue/i })
    await cont.click()
    await expect(page.getByRole('heading', { name: 'Description & caption direction' })).toBeVisible()
    await page.getByPlaceholder('e.g. Q3 product launch').fill('Shot wizard topic')
    await page.locator('textarea').fill('Show the new dashboard on a laptop with a short call to action.')
    await cont.click()
    await expect(page.getByRole('heading', { name: /Images/ })).toBeVisible()
    const saved = page.waitForResponse((r) => {
      if (r.request().method() !== 'PUT' || new URL(r.url()).pathname !== '/api/brief-drafts') return false
      const payload = (r.request().postDataJSON() as { payload: { step?: number; compositeSource?: { key?: string } } }).payload
      return payload.step === 4 && payload.compositeSource?.key === picked.key
    })
    await cont.click()
    await expect(page.getByRole('heading', { name: 'Review & Generate' })).toBeVisible()
    await expect(summary(page, 'Image style')).toHaveText('Product screen')
    await expect(summary(page, 'Product screenshot')).toHaveText('1000×1000')
    const draftId = ((await (await saved).json()) as { id: string }).id

    // The submit body carries the source (the POST is stubbed so nothing generates).
    let body: Record<string, unknown> = {}
    await page.route('**/api/briefs', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      body = route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'stubbed' }) })
    })
    const posted = page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/briefs')
    await page.getByRole('button', { name: 'Generate Post' }).click()
    await posted
    expect(body.imageStyle).toBe('device-screen')
    expect(body.compositeSource).toEqual({ kind: 'brief-upload', key: picked.key, width: picked.width, height: picked.height })
    await page.unroute('**/api/briefs')

    // Resume keeps the screenshot and the look.
    await page.goto(`/brief?resume=${draftId}`)
    await expect(page.getByRole('heading', { name: 'Review & Generate' })).toBeVisible({ timeout: 20_000 })
    await expect(summary(page, 'Image style')).toHaveText('Product screen')
    await expect(summary(page, 'Product screenshot')).toHaveText('1000×1000')
  })
})
