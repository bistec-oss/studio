import { test, expect } from '@playwright/test'
import { loginAs } from '../helpers/api'

// §N — Campaign briefing assistant: source documents + AI chat + enhance.
//
// Contract notes:
//   - Documents: POST /api/campaigns/[id]/documents (withAdmin, multipart,
//     PDF/DOCX/TXT/MD, 10MB cap via validateUpload, max 5 per campaign);
//     GET lists metadata (withAuth); DELETE removes (withAdmin).
//   - Chat: POST .../briefing/chat (withAdmin) — stateless transcript in,
//     { reply, briefingDraft } out. Under MOCK_AI the reply is deterministic
//     (buildMockBriefingReply) and always carries a ```briefing block.
//   - Enhance: POST .../briefing/enhance (withAdmin) — { draft } out; under
//     MOCK_AI the draft is `Enhanced: <content>`.

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const EDITOR_EMAIL = 'editor@bisteccare.lk'
const PASSWORD = 'BistecStudio2026!'

const txt = (name: string, body: string) => ({
  file: { name, mimeType: 'text/plain', buffer: Buffer.from(body) },
})

test.describe('Briefing assistant', () => {
  let campaignId: string

  test.beforeAll(async ({ request }) => {
    const admin = await loginAs(request, ADMIN_EMAIL, PASSWORD)
    const camp = await (await admin.post('/api/campaigns', { name: 'Briefing Assistant E2E' })).json()
    campaignId = camp.id
    await admin.dispose()
  })

  test('document lifecycle: upload, list, type gate, 5-doc cap, delete', async ({ request }) => {
    const admin = await loginAs(request, ADMIN_EMAIL, PASSWORD)
    const base = `/api/campaigns/${campaignId}/documents`

    // Upload a txt document.
    const up = await admin.multipart(base, txt('strategy.txt', 'Target SMB owners in Colombo.'))
    expect(up.status()).toBe(201)
    const doc = await up.json()
    expect(doc.name).toBe('strategy.txt')
    expect(doc.truncated).toBe(false)

    // Listed (metadata only).
    const list = await (await admin.get(base)).json()
    expect(list.map((d: { id: string }) => d.id)).toContain(doc.id)
    expect(list[0].parsedText).toBeUndefined()

    // Unsupported type → 400.
    const bad = await admin.multipart(base, {
      file: { name: 'run.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('x') },
    })
    expect(bad.status()).toBe(400)

    // Fill to the cap (already 1 present) then the 6th is rejected.
    for (let i = 0; i < 4; i++) {
      expect(
        (await admin.multipart(base, txt(`extra-${i}.txt`, `doc body ${i}`))).status(),
      ).toBe(201)
    }
    const sixth = await admin.multipart(base, txt('sixth.txt', 'one too many'))
    expect(sixth.status()).toBe(400)
    expect((await sixth.json()).error).toContain('at most 5')

    // Delete frees a slot.
    expect((await admin.del(`${base}/${doc.id}`)).status()).toBe(200)
    expect((await admin.multipart(base, txt('replacement.txt', 'fits again'))).status()).toBe(201)

    await admin.dispose()
  })

  test('chat returns the mock reply with an extractable briefing draft', async ({ request }) => {
    const admin = await loginAs(request, ADMIN_EMAIL, PASSWORD)
    const res = await admin.post(`/api/campaigns/${campaignId}/briefing/chat`, {
      messages: [{ role: 'user', content: 'Promote the July webinar to SMBs' }],
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.reply).toContain('[Promote the July webinar to SMBs]')
    expect(body.briefingDraft).toContain('Promote the July webinar to SMBs')
    await admin.dispose()
  })

  test('chat validates the transcript shape', async ({ request }) => {
    const admin = await loginAs(request, ADMIN_EMAIL, PASSWORD)
    const base = `/api/campaigns/${campaignId}/briefing/chat`
    // Last message must be from the user.
    expect(
      (
        await admin.post(base, {
          messages: [
            { role: 'user', content: 'hi' },
            { role: 'assistant', content: 'hello' },
          ],
        })
      ).status(),
    ).toBe(400)
    // Empty transcript.
    expect((await admin.post(base, { messages: [] })).status()).toBe(400)
    await admin.dispose()
  })

  test('enhance returns the deterministic mock rewrite (and drafts from empty)', async ({ request }) => {
    const admin = await loginAs(request, ADMIN_EMAIL, PASSWORD)
    const base = `/api/campaigns/${campaignId}/briefing/enhance`

    const withText = await (await admin.post(base, { content: 'my rough briefing' })).json()
    expect(withText.draft).toBe('Enhanced: my rough briefing')

    const fromEmpty = await (await admin.post(base, { content: '' })).json()
    expect(fromEmpty.draft).toBe('Enhanced: Mock briefing drafted from campaign context.')

    await admin.dispose()
  })

  test('unknown campaign 404s on chat and enhance', async ({ request }) => {
    const admin = await loginAs(request, ADMIN_EMAIL, PASSWORD)
    expect(
      (
        await admin.post('/api/campaigns/nonexistent/briefing/chat', {
          messages: [{ role: 'user', content: 'hi' }],
        })
      ).status(),
    ).toBe(404)
    expect(
      (await admin.post('/api/campaigns/nonexistent/briefing/enhance', { content: 'x' })).status(),
    ).toBe(404)
    await admin.dispose()
  })

  test('post-brief enhance: editor-accessible, mock rewrite, drafts from topic, input guards', async ({ request }) => {
    // POST /api/briefs/enhance is withAuth (not withAdmin) — editors write briefs.
    const editor = await loginAs(request, EDITOR_EMAIL, PASSWORD)
    const base = '/api/briefs/enhance'

    const withText = await editor.post(base, {
      topic: 'Q3 launch',
      content: 'my rough post brief',
      goal: 'awareness',
      tone: 'professional',
      campaignId,
    })
    expect(withText.status()).toBe(200)
    expect((await withText.json()).draft).toBe('Enhanced: my rough post brief')

    // Topic-only drafts from context (empty content).
    const fromTopic = await editor.post(base, { topic: 'Q3 launch', content: '' })
    expect(fromTopic.status()).toBe(200)
    expect((await fromTopic.json()).draft).toBe(
      'Enhanced: Mock briefing drafted from campaign context.',
    )

    // Nothing to work with → 400; unknown campaign → 404.
    expect((await editor.post(base, { topic: '', content: '  ' })).status()).toBe(400)
    expect(
      (await editor.post(base, { topic: 'x', content: 'y', campaignId: 'nonexistent' })).status(),
    ).toBe(404)

    await editor.dispose()
  })

  test('editors are forbidden from upload, delete, chat, and enhance (list is readable)', async ({ request }) => {
    const editor = await loginAs(request, EDITOR_EMAIL, PASSWORD)
    const base = `/api/campaigns/${campaignId}`

    expect((await editor.get(`${base}/documents`)).status()).toBe(200)
    expect(
      (await editor.multipart(`${base}/documents`, txt('nope.txt', 'forbidden'))).status(),
    ).toBe(403)
    expect((await editor.del(`${base}/documents/any-id`)).status()).toBe(403)
    expect(
      (
        await editor.post(`${base}/briefing/chat`, {
          messages: [{ role: 'user', content: 'hi' }],
        })
      ).status(),
    ).toBe(403)
    expect((await editor.post(`${base}/briefing/enhance`, { content: 'x' })).status()).toBe(403)

    await editor.dispose()
  })
})
