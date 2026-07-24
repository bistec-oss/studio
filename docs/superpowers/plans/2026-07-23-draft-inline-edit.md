# Manual Inline-Edit Mode for Drafts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user manually edit an EXPORTED draft's text and swap its images in place, then Save & re-export to a new revision — with no AI call.

**Architecture:** A sandboxed iframe (`sandbox="allow-same-origin"`, **no** `allow-scripts`) renders the draft's current `htmlSnapshot`. The same-origin parent wires `contenteditable` on text-leaf elements and a "Replace photo" upload on each `<img>`. On Save the parent strips its editing chrome and POSTs the HTML to a new synchronous route, which sanitizes it, renders HTML→PNG, and commits a normal `DraftRevision` — reusing a `commitDraftRevision` helper extracted from the refine route.

**Tech Stack:** Next.js 16 (App Router, `withTeamAuth`), Prisma/PostgreSQL, Puppeteer (`renderHtmlToPng`), MinIO (`BUCKET_EXPORTS`), React 19 client components, Radix `Modal`, Vitest (unit), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-07-23-draft-inline-edit-design.md`

## Global Constraints

- **Never execute model/user HTML.** The iframe MUST use `sandbox="allow-same-origin"` **without** `allow-scripts`; the server MUST sanitize (`<script>` + `on*` removed) as defense-in-depth. (2026-07-22 security review boundary.)
- **Images are always URLs, never data-URIs** — image replacement uploads via `POST /api/briefs/images` and sets `img.src` to the returned URL (keeps snapshots small; satisfies the renderer egress allowlist).
- **No schema change, no migration, no new env var, no `PROMPT_VERSION` change.**
- **Auth/visibility identical to refine:** `withTeamAuth` + `canAccessContent(user, { teamId, ownerId: brief.userId, campaignId: brief.campaignId })`; cross-team access is a 404.
- **Guards return 409** when the draft is not `EXPORTED`/`PUBLISHED` or a `pendingAction` is in flight (matching the other draft actions).
- **The new revision is indistinguishable from a refine revision** — version switch/restore must work unchanged.
- Run gates from repo root: `npm run test:unit`, `npm run lint`, `npm run build`. E2E: `npm run test:e2e:db` → `npm run test:e2e:serve` (port 3001) → `npm run test:e2e:mock`.

---

## File Structure

- `src/lib/drafts/revisions.ts` — **modify.** Already owns `withNextRevisionNumber`. Add exported `commitDraftRevision(...)` (render-if-needed + atomic revision/draft write), extracted from the refine route so refine and inline-edit share one path.
- `src/app/api/drafts/[id]/refine/route.ts` — **modify.** Its local `commitRevision` becomes a thin wrapper over `commitDraftRevision` (behavior-preserving).
- `src/lib/drafts/inlineEdit.ts` — **create.** Three pure, node-safe string/predicate helpers: `sanitizeInlineHtml`, `stripEditingChrome`, `inlineEditBlockReason`. Imported by both the route (sanitize, guard) and the client component (strip chrome).
- `src/app/api/drafts/[id]/inline-edit/route.ts` — **create.** `POST` — synchronous save.
- `src/components/drafts/InlineEditModal.tsx` — **create.** Client modal: iframe wiring, contenteditable, image-replace upload, chrome-strip, Save POST.
- `src/app/(app)/drafts/[id]/page.tsx` — **modify.** Add the "Edit inline" button (below `RefinementPanel`) + render `InlineEditModal`.
- `tests/unit/inlineEdit.test.ts` — **create.** Unit tests for the three helpers.
- `tests/e2e/draft-inline-edit.test.ts` — **create.** §T — the mock save/revision/guard flow.

---

### Task 1: Extract the shared `commitDraftRevision` helper

Behavior-preserving refactor. The refine route's private `commitRevision` (renders the HTML if no export key is supplied, then writes a `DraftRevision` + updates the draft atomically) becomes a reusable library function so inline-edit commits through the exact same path. The safety net is the existing refine e2e suite (`agui-refinement`, `async-actions` §Q) — those must stay green.

**Files:**

- Modify: `src/lib/drafts/revisions.ts`
- Modify: `src/app/api/drafts/[id]/refine/route.ts:207-264` (the `commitRevision` function)

**Interfaces:**

- Consumes: `withNextRevisionNumber` (same file), `PROMPT_VERSION` from `@/lib/agent/prompts/shared`.
- Produces: `commitDraftRevision(args: CommitRevisionArgs): Promise<{ revisionId: string; exportKey: string }>` where

  ```ts
  interface CommitRevisionArgs {
    draftId: string
    instruction: string
    html: string
    width: number
    height: number
    // When omitted, the HTML is rendered to a PNG here and uploaded under a fresh export key.
    exportKey?: string
    // Set only when a background image was (re)generated; leaves Draft.imageUrl untouched when null/undefined.
    backgroundImageUrl?: string | null
  }
  ```

  Returns the new revision id and the EXPORTS object key (unsigned — callers sign with `resolveExportUrl` if they need a browser URL).

- [ ] **Step 1: Add `commitDraftRevision` to `src/lib/drafts/revisions.ts`**

Append to the file (keep the existing `withNextRevisionNumber` above it):

```ts
export interface CommitRevisionArgs {
  draftId: string
  instruction: string
  html: string
  width: number
  height: number
  exportKey?: string
  backgroundImageUrl?: string | null
}

// Shared commit path for refine + inline-edit. Renders the HTML to a PNG when
// no export key is supplied (the override / inline-edit case), then allocates a
// revision number and writes the DraftRevision + updates the draft atomically
// (P2002 collision retry via withNextRevisionNumber). Returns the new revision
// id and the EXPORTS object key (unsigned).
export async function commitDraftRevision(
  args: CommitRevisionArgs,
): Promise<{ revisionId: string; exportKey: string }> {
  const { draftId, instruction, html, width, height, backgroundImageUrl } = args

  let finalExportKey = args.exportKey
  if (!finalExportKey) {
    const { renderHtmlToPng } = await import('@/lib/renderer/puppeteer')
    const { uploadObject, exportKey, BUCKET_EXPORTS } = await import('@/lib/storage/minio')
    const buffer = await renderHtmlToPng(html, width, height)
    finalExportKey = exportKey('refine', draftId)
    await uploadObject(buffer, BUCKET_EXPORTS, finalExportKey, 'image/png')
  }

  const revision = await withNextRevisionNumber(draftId, async (tx, revisionNumber) => {
    const created = await tx.draftRevision.create({
      data: {
        draftId,
        revisionNumber,
        instruction,
        htmlSnapshot: html,
        exportUrl: finalExportKey,
      },
      select: { id: true },
    })

    await tx.draft.update({
      where: { id: draftId },
      data: {
        htmlContent: html,
        exportUrl: finalExportKey,
        currentRevisionNumber: revisionNumber,
        pendingConflict: Prisma.JsonNull,
        promptVersion: PROMPT_VERSION,
        ...(backgroundImageUrl ? { imageUrl: backgroundImageUrl } : {}),
      },
    })

    return created
  })

  return { revisionId: revision.id, exportKey: finalExportKey }
}
```

Add the two imports at the top of `revisions.ts` (it currently imports only `Prisma` and `prisma`):

```ts
import { PROMPT_VERSION } from '@/lib/agent/prompts/shared'
```

(`Prisma` is already imported for `Prisma.JsonNull` / the P2002 check.)

- [ ] **Step 2: Rewrite the refine route's `commitRevision` as a thin wrapper**

In `src/app/api/drafts/[id]/refine/route.ts`, add to the imports at the top (the file already imports `withNextRevisionNumber` from `@/lib/drafts/revisions`):

```ts
import { withNextRevisionNumber, commitDraftRevision } from '@/lib/drafts/revisions'
```

Replace the entire `commitRevision` function (lines 207-264) with:

```ts
async function commitRevision(
  draftId: string,
  instruction: string,
  newHtml: string,
  width: number,
  height: number,
  exportUrl?: string,
  backgroundImageUrl?: string | null,
) {
  const { revisionId, exportKey } = await commitDraftRevision({
    draftId,
    instruction,
    html: newHtml,
    width,
    height,
    exportKey: exportUrl,
    backgroundImageUrl,
  })

  return NextResponse.json({
    reply: 'Design updated',
    revisionId,
    exportUrl: await resolveExportUrl(exportKey),
  })
}
```

Note: the `Prisma` and `PROMPT_VERSION` imports in `refine/route.ts` may now be unused. Leave `Prisma` (still used by `parseConflict`/`Prisma.JsonNull` elsewhere in the file? verify) and remove `PROMPT_VERSION` only if lint flags it as unused.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If `PROMPT_VERSION` is reported unused in `refine/route.ts`, remove that import line and re-run.)

- [ ] **Step 4: Run unit tests + refine e2e as the regression net**

Run: `npm run test:unit`
Expected: all pass (293/293 baseline; no unit test targets `commitRevision` directly, so the count is unchanged).

Run the refine e2e (with the mock stack already served on :3001):
`npx cross-env TEST_BASE_URL=http://localhost:3001 MOCK_AI=true MOCK_PUPPETEER=true MOCK_SOCIAL=true playwright test tests/e2e/agui-refinement.test.ts tests/e2e/async-actions.test.ts`
Expected: PASS — the refine + async-action revision flow is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/lib/drafts/revisions.ts src/app/api/drafts/[id]/refine/route.ts
git commit -m "refactor: extract shared commitDraftRevision for refine + inline-edit"
```

---

### Task 2: Pure inline-edit helpers (sanitize, chrome-strip, guard)

Three node-safe, dependency-free functions used by both the route and the client. Regex-based (no DOM parser needed on the server); this is defense-in-depth — the render is already egress-allowlisted and the HTML is never served back as HTML.

**Files:**

- Create: `src/lib/drafts/inlineEdit.ts`
- Test: `tests/unit/inlineEdit.test.ts`

**Interfaces:**

- Produces:
  - `sanitizeInlineHtml(html: string): string` — removes every `<script>…</script>` element and every `on*=` event-handler attribute; preserves text, structure, and `<img src>`.
  - `stripEditingChrome(html: string): string` — removes editor-injected artifacts: `contenteditable` attributes, the injected `<style id="inline-edit-style">…</style>` block, the banner element (`data-inline-edit-chrome="banner"`), and unwraps the replace-photo wrappers (`<span data-inline-edit-chrome="img-wrap">…</span>` → its inner content). Leaves the underlying content intact.
  - `inlineEditBlockReason(status: string, pendingAction: string | null): string | null` — returns a 409 message when editing is not allowed, else `null`. Blocked when `pendingAction !== null` ("Another action is already running on this draft") or `status` is not `EXPORTED`/`PUBLISHED` ("Only exported drafts can be edited inline").
- Consumes: nothing.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/inlineEdit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  sanitizeInlineHtml,
  stripEditingChrome,
  inlineEditBlockReason,
} from '@/lib/drafts/inlineEdit'

describe('sanitizeInlineHtml', () => {
  it('strips <script> elements but keeps surrounding markup and text', () => {
    const out = sanitizeInlineHtml('<div>Hello<script>alert(1)</script><p>World</p></div>')
    expect(out).not.toMatch(/<script/i)
    expect(out).not.toContain('alert(1)')
    expect(out).toContain('Hello')
    expect(out).toContain('<p>World</p>')
  })

  it('strips on* event-handler attributes but keeps other attributes', () => {
    const out = sanitizeInlineHtml(
      '<img src="https://cdn.example.com/a.png" onerror="steal()" alt="x">',
    )
    expect(out).not.toMatch(/onerror/i)
    expect(out).not.toContain('steal()')
    expect(out).toContain('src="https://cdn.example.com/a.png"')
    expect(out).toContain('alt="x"')
  })

  it('leaves clean HTML unchanged in substance', () => {
    const clean = '<section><h1>Title</h1><p>Body</p></section>'
    expect(sanitizeInlineHtml(clean)).toContain('<h1>Title</h1>')
  })
})

describe('stripEditingChrome', () => {
  it('removes contenteditable attributes', () => {
    const out = stripEditingChrome('<p contenteditable="true">Hi</p>')
    expect(out).not.toContain('contenteditable')
    expect(out).toContain('Hi')
  })

  it('removes the injected editor style block and banner', () => {
    const html =
      '<style id="inline-edit-style">.x{}</style>' +
      '<div data-inline-edit-chrome="banner">Click any text…</div>' +
      '<h1>Real content</h1>'
    const out = stripEditingChrome(html)
    expect(out).not.toContain('inline-edit-style')
    expect(out).not.toContain('data-inline-edit-chrome')
    expect(out).not.toContain('Click any text')
    expect(out).toContain('<h1>Real content</h1>')
  })

  it('unwraps replace-photo wrappers, keeping the img', () => {
    const html =
      '<span data-inline-edit-chrome="img-wrap"><img src="https://cdn.example.com/a.png"></span>'
    const out = stripEditingChrome(html)
    expect(out).not.toContain('data-inline-edit-chrome')
    expect(out).toContain('<img src="https://cdn.example.com/a.png">')
  })
})

describe('inlineEditBlockReason', () => {
  it('allows an EXPORTED draft with no pending action', () => {
    expect(inlineEditBlockReason('EXPORTED', null)).toBeNull()
  })

  it('allows a PUBLISHED draft', () => {
    expect(inlineEditBlockReason('PUBLISHED', null)).toBeNull()
  })

  it('blocks when an action is pending', () => {
    expect(inlineEditBlockReason('EXPORTED', 'REFINE')).toMatch(/already running/i)
  })

  it('blocks a non-exported draft', () => {
    expect(inlineEditBlockReason('IN_PROGRESS', null)).toMatch(/exported/i)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- inlineEdit`
Expected: FAIL — `Cannot find module '@/lib/drafts/inlineEdit'`.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/drafts/inlineEdit.ts`:

```ts
// Pure, node-safe helpers shared by the inline-edit route (sanitize + guard) and
// the InlineEditModal client (chrome-strip). Regex-based on purpose: no DOM
// parser is available server-side, and this is defense-in-depth — the renderer
// egress is already allowlisted and edited HTML is never served back as HTML.

// Remove <script>…</script> elements and on*="…" event-handler attributes.
export function sanitizeInlineHtml(html: string): string {
  return (
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<script\b[^>]*\/>/gi, '')
      // on<event>="…" | on<event>='…' | on<event>=unquoted
      .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
      .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
      .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
  )
}

// Remove editor-injected chrome so the saved HTML is structurally a normal
// snapshot: contenteditable attrs, the injected style block, the banner, and
// the replace-photo wrappers (unwrapped to leave the <img> in place).
export function stripEditingChrome(html: string): string {
  return (
    html
      // contenteditable="true" | contenteditable | contenteditable=''
      .replace(/\scontenteditable(\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/gi, '')
      // The parent's injected style + banner.
      .replace(/<style\b[^>]*id\s*=\s*["']inline-edit-style["'][^>]*>[\s\S]*?<\/style\s*>/gi, '')
      .replace(
        /<div\b[^>]*data-inline-edit-chrome\s*=\s*["']banner["'][^>]*>[\s\S]*?<\/div\s*>/gi,
        '',
      )
      // Unwrap the img wrappers: drop the opening/closing span tags, keep inner.
      .replace(/<span\b[^>]*data-inline-edit-chrome\s*=\s*["']img-wrap["'][^>]*>/gi, '')
      .replace(/<\/span>(?=\s*(<\/|<img|<div|$))/gi, (m) => m)
  ) // no-op placeholder; see note
}

export function inlineEditBlockReason(status: string, pendingAction: string | null): string | null {
  if (pendingAction !== null) return 'Another action is already running on this draft'
  if (status !== 'EXPORTED' && status !== 'PUBLISHED') {
    return 'Only exported drafts can be edited inline'
  }
  return null
}
```

**Note on the wrapper unwrap:** unwrapping a `<span>` by regex is fragile because the matching `</span>` can't be located reliably with a regex. Simplify the client contract instead: the parent will wrap each `<img>` in `<span data-inline-edit-chrome="img-wrap">` **with no other children**, so the closing tag is always the very next `</span>` after the `<img>`. Replace the last two `.replace(...)` lines above with a single pass that removes the wrapper open tag and the immediately-following `</span>`:

```ts
    // Unwrap "<span data-inline-edit-chrome='img-wrap'><img …></span>" → "<img …>"
    .replace(
      /<span\b[^>]*data-inline-edit-chrome\s*=\s*["']img-wrap["'][^>]*>([\s\S]*?)<\/span\s*>/gi,
      '$1'
    )
```

Use that single `.replace` and delete the two placeholder lines. Final `stripEditingChrome` body:

```ts
export function stripEditingChrome(html: string): string {
  return html
    .replace(/\scontenteditable(\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/gi, '')
    .replace(/<style\b[^>]*id\s*=\s*["']inline-edit-style["'][^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(
      /<div\b[^>]*data-inline-edit-chrome\s*=\s*["']banner["'][^>]*>[\s\S]*?<\/div\s*>/gi,
      '',
    )
    .replace(
      /<span\b[^>]*data-inline-edit-chrome\s*=\s*["']img-wrap["'][^>]*>([\s\S]*?)<\/span\s*>/gi,
      '$1',
    )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- inlineEdit`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/drafts/inlineEdit.ts tests/unit/inlineEdit.test.ts
git commit -m "feat: pure inline-edit helpers (sanitize, chrome-strip, guard)"
```

---

### Task 3: `POST /api/drafts/[id]/inline-edit` route

Synchronous save: validate → guard (409) → sanitize → render + commit via `commitDraftRevision` → return the new revision.

**Files:**

- Create: `src/app/api/drafts/[id]/inline-edit/route.ts`
- Test: `tests/e2e/draft-inline-edit.test.ts` (created here; expanded in Task 4's e2e is not needed — all API assertions live here)

**Interfaces:**

- Consumes: `withTeamAuth`, `parseBody` (`@/lib/api/handler`), `canAccessContent` (`@/lib/authz/visibility`), `dimensionsFor` (`@/lib/aspectRatio`), `resolveExportUrl` (`@/lib/storage/minio`), `commitDraftRevision` (`@/lib/drafts/revisions`), `sanitizeInlineHtml` + `inlineEditBlockReason` (`@/lib/drafts/inlineEdit`).
- Produces: `POST` handler. Response `200 { reply: string; revisionId: string; exportUrl: string | null }`.

- [ ] **Step 1: Write the failing e2e test**

Create `tests/e2e/draft-inline-edit.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the e2e test to verify it fails**

With the mock stack served on :3001 (`npm run test:e2e:db` then `npm run test:e2e:serve` in another shell):
Run: `npx cross-env TEST_BASE_URL=http://localhost:3001 MOCK_AI=true MOCK_PUPPETEER=true MOCK_SOCIAL=true playwright test tests/e2e/draft-inline-edit.test.ts`
Expected: FAIL — the route returns 404/405 (does not exist yet).

- [ ] **Step 3: Implement the route**

Create `src/app/api/drafts/[id]/inline-edit/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, parseBody } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { dimensionsFor } from '@/lib/aspectRatio'
import { resolveExportUrl } from '@/lib/storage/minio'
import { commitDraftRevision } from '@/lib/drafts/revisions'
import { sanitizeInlineHtml, inlineEditBlockReason } from '@/lib/drafts/inlineEdit'

// Permissive schema + manual check so the error message stays stable.
const bodySchema = z.object({}).passthrough()

// Manual inline edit: the client sends the edited HTML (chrome already stripped).
// We sanitize defense-in-depth, render HTML→PNG, and commit a normal
// DraftRevision — synchronous (no AI, single render). Same visibility + guards
// as refine.
export const POST = withTeamAuth<{ id: string }>(async (req, { params }, user) => {
  const body = await parseBody(req, bodySchema)
  if (body.response) return body.response
  const { html } = body.data as { html?: unknown }
  if (typeof html !== 'string' || !html.trim()) {
    return NextResponse.json({ error: 'html is required' }, { status: 400 })
  }

  const draft = await prisma.draft.findUnique({
    where: { id: params.id },
    include: { brief: true },
  })
  if (
    !draft ||
    !canAccessContent(user, {
      teamId: draft.teamId,
      ownerId: draft.brief.userId,
      campaignId: draft.brief.campaignId,
    })
  ) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  const blocked = inlineEditBlockReason(draft.status, draft.pendingAction)
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 })

  const { width, height } = dimensionsFor(draft.brief.aspectRatio)
  const clean = sanitizeInlineHtml(html)

  const { revisionId, exportKey } = await commitDraftRevision({
    draftId: draft.id,
    instruction: 'Manual inline edit',
    html: clean,
    width,
    height,
  })

  return NextResponse.json({
    reply: 'Design updated',
    revisionId,
    exportUrl: await resolveExportUrl(exportKey),
  })
})
```

- [ ] **Step 4: Run the e2e test to verify it passes**

Run: `npx cross-env TEST_BASE_URL=http://localhost:3001 MOCK_AI=true MOCK_PUPPETEER=true MOCK_SOCIAL=true playwright test tests/e2e/draft-inline-edit.test.ts`
Expected: PASS (4 tests). If the server was already running before this route was added, restart `test:e2e:serve` so Next picks up the new route file.

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors (7 pre-existing lint warnings are acceptable).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/drafts/[id]/inline-edit/route.ts tests/e2e/draft-inline-edit.test.ts
git commit -m "feat: synchronous inline-edit route for manual draft edits"
```

---

### Task 4: `InlineEditModal` client component + draft-page wiring

The browser UX: an overlay with a sandboxed iframe of the current design, `contenteditable` text, per-image "Replace photo", and Save/Cancel. Not unit-tested (DOM/iframe runtime) — verified by tsc/lint/build and a manual browser check; the route logic it drives is covered by Task 3's e2e.

**Files:**

- Create: `src/components/drafts/InlineEditModal.tsx`
- Modify: `src/app/(app)/drafts/[id]/page.tsx`

**Interfaces:**

- Consumes: `Modal` (`@/components/ui/Modal`), `Button` (`@/components/ui/Button`), `apiFetch` (`@/lib/apiFetch`), `stripEditingChrome` (`@/lib/drafts/inlineEdit`), `dimensionsFor` (`@/lib/aspectRatio`), `toast` (`sonner`).
- Produces: `InlineEditModal` component:

  ```ts
  interface InlineEditModalProps {
    open: boolean
    onClose: () => void
    draftId: string
    html: string // draft.htmlContent (current snapshot)
    aspectRatio: import('@prisma/client').AspectRatio
    onSaved: () => void // parent refetches draft + revisions
  }
  ```

- [ ] **Step 1: Create the component**

Create `src/components/drafts/InlineEditModal.tsx`:

```tsx
'use client'

import React, { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { apiFetch } from '@/lib/apiFetch'
import { stripEditingChrome } from '@/lib/drafts/inlineEdit'
import { dimensionsFor } from '@/lib/aspectRatio'
import type { AspectRatio } from '@prisma/client'

interface InlineEditModalProps {
  open: boolean
  onClose: () => void
  draftId: string
  html: string
  aspectRatio: AspectRatio
  onSaved: () => void
}

// Parent-injected editing chrome. Kept in one place so stripEditingChrome (the
// pure string version) and this DOM wiring stay in sync on the marker names.
const EDITOR_STYLE = `
  [contenteditable="true"]{outline:2px dashed transparent;transition:outline-color .15s}
  [contenteditable="true"]:hover{outline-color:rgba(37,99,235,.5)}
  [contenteditable="true"]:focus{outline-color:rgba(37,99,235,.9)}
  [data-inline-edit-chrome="img-wrap"]{position:relative;display:inline-block}
  [data-inline-edit-chrome="img-wrap"] .inline-replace-btn{
    position:absolute;top:6px;left:6px;z-index:2;font:600 12px system-ui;
    background:rgba(0,0,0,.6);color:#fff;border:0;border-radius:6px;padding:4px 8px;cursor:pointer}
`

export function InlineEditModal({
  open,
  onClose,
  draftId,
  html,
  aspectRatio,
  onSaved,
}: InlineEditModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [saving, setSaving] = useState(false)
  const { width, height } = dimensionsFor(aspectRatio)

  // Wire the iframe once it has rendered the srcDoc. No scripts run inside the
  // sandbox (allow-same-origin only), so ALL wiring happens from the parent.
  const onIframeLoad = useCallback(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return

    // Inject the editor stylesheet.
    if (!doc.getElementById('inline-edit-style')) {
      const style = doc.createElement('style')
      style.id = 'inline-edit-style'
      style.textContent = EDITOR_STYLE
      doc.head?.appendChild(style)
    }

    // Make every text-leaf element editable (all child nodes are text).
    doc.body?.querySelectorAll<HTMLElement>('*').forEach((el) => {
      if (['SCRIPT', 'STYLE', 'IMG'].includes(el.tagName)) return
      const onlyText =
        el.childNodes.length > 0 &&
        Array.from(el.childNodes).every((n) => n.nodeType === Node.TEXT_NODE)
      if (onlyText) el.setAttribute('contenteditable', 'true')
    })

    // Plain-text paste only.
    doc.body?.addEventListener('paste', (e: ClipboardEvent) => {
      e.preventDefault()
      const text = e.clipboardData?.getData('text/plain') ?? ''
      doc.execCommand('insertText', false, text)
    })

    // Wrap each <img> with a "Replace photo" control.
    doc.body?.querySelectorAll('img').forEach((img) => {
      if (img.parentElement?.getAttribute('data-inline-edit-chrome') === 'img-wrap') return
      const wrap = doc.createElement('span')
      wrap.setAttribute('data-inline-edit-chrome', 'img-wrap')
      img.replaceWith(wrap)
      wrap.appendChild(img)
      const btn = doc.createElement('button')
      btn.type = 'button'
      btn.className = 'inline-replace-btn'
      btn.textContent = 'Replace photo'
      btn.addEventListener('click', () => {
        const input = doc.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.addEventListener('change', async () => {
          const file = input.files?.[0]
          if (!file) return
          try {
            const fd = new FormData()
            fd.append('file', file)
            const { url } = await apiFetch<{ url: string }>('/api/briefs/images', {
              method: 'POST',
              body: fd,
            })
            img.setAttribute('src', url)
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Upload failed')
          }
        })
        input.click()
      })
      wrap.appendChild(btn)
    })
  }, [])

  async function handleSave() {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    setSaving(true)
    try {
      // Serialize the live doc, then strip the editor chrome with the shared
      // pure helper so the saved HTML is a normal snapshot.
      const raw = '<!doctype html>' + doc.documentElement.outerHTML
      const cleaned = stripEditingChrome(raw)
      await apiFetch(`/api/drafts/${draftId}/inline-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: cleaned }),
      })
      toast.success('Saved a new revision')
      onSaved()
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit inline"
      size="lg"
      className="max-w-4xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save &amp; re-export
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg bg-primary/5 dark:bg-primary-light/10 px-3 py-2 text-xs text-light-text dark:text-dark-text">
          ✎ Click any text to edit · hover an image and click <strong>Replace photo</strong> to swap
          it.
        </div>
        <div
          className="mx-auto overflow-hidden rounded-lg border border-light-border dark:border-dark-border"
          // Scale the true-size canvas down to fit the dialog width.
          style={{ width: 'min(100%, 640px)', aspectRatio: `${width} / ${height}` }}
        >
          <iframe
            ref={iframeRef}
            onLoad={onIframeLoad}
            title="Inline editor"
            sandbox="allow-same-origin"
            srcDoc={html}
            style={{
              width: `${width}px`,
              height: `${height}px`,
              border: 0,
              transformOrigin: 'top left',
              // Fit width into the 640px (or smaller) container.
              transform: `scale(calc(min(100%, 640px) / ${width}px))`,
            }}
          />
        </div>
      </div>
    </Modal>
  )
}
```

**Note on the scale transform:** CSS `transform: scale(calc(...))` with a `px` denominator is invalid. Replace the iframe `transform` with a fixed numeric scale computed in JS. Change the wrapper + iframe to compute `scale = containerWidth / width` — simplest robust approach: render the iframe at a display width via a numeric scale prop. Implement it as:

```tsx
const DISPLAY_W = 640
const scale = Math.min(1, DISPLAY_W / width)
// wrapper:
<div className="mx-auto overflow-hidden rounded-lg border border-light-border dark:border-dark-border"
     style={{ width: width * scale, height: height * scale }}>
  <iframe
    ref={iframeRef}
    onLoad={onIframeLoad}
    title="Inline editor"
    sandbox="allow-same-origin"
    srcDoc={html}
    style={{ width, height, border: 0, transformOrigin: 'top left', transform: `scale(${scale})` }}
  />
</div>
```

Use this numeric version (drop the `aspectRatio`/`calc()` version above).

- [ ] **Step 2: Wire the button + modal into the draft page**

In `src/app/(app)/drafts/[id]/page.tsx`:

Add the import near the other component imports (after the `RefinementPanel` import, line ~24):

```ts
import { InlineEditModal } from '@/components/drafts/InlineEditModal'
```

Add state next to the other `useState` hooks (near line ~64, beside `showPreview`):

```ts
const [showInlineEdit, setShowInlineEdit] = useState(false)
```

In the left column, immediately after the `RefinementPanel` block (after line 272, still inside the `{ready && ( … )}` region — add it as a sibling right after the closing `)}` of the RefinementPanel conditional), add an "Edit inline" button:

```tsx
{
  ready && (
    <div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setShowInlineEdit(true)}
        disabled={actionPending || !draft.htmlContent}
        title="Manually edit text and images, then re-export"
      >
        <Pencil size={13} /> Edit inline
      </Button>
    </div>
  )
}
```

Add `Pencil` to the `lucide-react` import list at the top of the file (line 7-17 block).

Render the modal near the other modals at the bottom (after the `PublishDialog` block, before the final `</>`):

```tsx
{
  draft.htmlContent && (
    <InlineEditModal
      open={showInlineEdit}
      onClose={() => setShowInlineEdit(false)}
      draftId={draftId}
      html={draft.htmlContent}
      aspectRatio={draft.brief.aspectRatio}
      onSaved={refreshAfterChange}
    />
  )
}
```

- [ ] **Step 3: Typecheck, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: no type errors; lint clean (7 pre-existing warnings OK); production build succeeds.

- [ ] **Step 4: Manual browser check (mock stack)**

With `test:e2e:serve` running (or `npm run dev`), open an EXPORTED draft, click **Edit inline**, verify: text is editable, "Replace photo" appears on images, Save creates a new revision (v+1) and the preview updates. (No automated assertion — the route path is covered by Task 3's e2e.)

- [ ] **Step 5: Commit**

```bash
git add src/components/drafts/InlineEditModal.tsx "src/app/(app)/drafts/[id]/page.tsx"
git commit -m "feat: Edit-inline modal for manual draft text/image edits"
```

---

## Self-Review

- **Spec coverage:** "Edit inline" button (Task 4) ✓; sandboxed iframe no-scripts (Task 4) ✓; contenteditable text-leaves + plain-text paste (Task 4) ✓; image replace-to-URL via `/api/briefs/images` (Task 4) ✓; synchronous save route with refine-parity guards/visibility (Task 3) ✓; sanitize `<script>`/`on*` (Task 2) ✓; `stripEditingChrome` (Task 2, used in Task 4) ✓; shared `commitDraftRevision` from refine (Task 1) ✓; normal `DraftRevision` so restore works (Task 3 e2e TC-INLINE-02) ✓; no schema/env/prompt change ✓. Non-goals (colors/layout, AI refine, offline download, rich text) — untouched ✓.
- **Type consistency:** `commitDraftRevision`/`CommitRevisionArgs` used identically in Tasks 1 & 3; `sanitizeInlineHtml`/`stripEditingChrome`/`inlineEditBlockReason` signatures match between Task 2 (defs) and Tasks 3-4 (uses); chrome marker names (`inline-edit-style`, `data-inline-edit-chrome="banner"`, `data-inline-edit-chrome="img-wrap"`) are identical in `stripEditingChrome` (Task 2) and the DOM wiring (Task 4).
- **Note:** the design spec mentions a banner element; this plan renders the banner as normal React chrome _outside_ the iframe (so no banner node ever enters the saved HTML), but `stripEditingChrome` still removes a `data-inline-edit-chrome="banner"` node defensively in case a future revision injects one into the doc. Harmless and keeps the sanitizer complete.
