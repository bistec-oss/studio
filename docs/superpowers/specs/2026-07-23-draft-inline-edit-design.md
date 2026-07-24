# Manual inline-edit mode for drafts — design

**Date:** 2026-07-23
**Status:** approved (brainstorm), pending implementation plan
**Branch:** `feat/draft-inline-edit`

## Problem

After a draft is generated, the only way to change it is **AI "Refine design"** — a natural-language instruction that re-runs the model. For small, precise edits ("fix this typo", "swap this photo") that's heavy, slow, non-deterministic, and can drift the whole design. Users want **direct, manual refinement**: edit the text and images in place and re-export, with no model call.

`!spotlight.html` demonstrates the target UX: opening it makes selected text `contenteditable` and gives each image a "Replace photo" control. We want that inside the app.

## Goals

- An **"Edit inline"** action on an EXPORTED draft, beside/below Refine.
- Edit **text in place** and **replace images**, then **Save & re-export** → a new revision + re-rendered PNG. No AI call.
- Result is a normal `DraftRevision`, so version switch/restore works.

## Non-goals

- Editing colors/layout/structure (text + image swap only this pass).
- Changing the AI Refine flow.
- Offline download/re-upload of the HTML (rejected in favor of in-app editing).
- Rich-text formatting (edits are plain text).

## Approach

In-app editing in a **sandboxed iframe**, parent-driven, committing through the existing revision/render path.

### UI (`src/components/drafts/*` + draft page)

- Add an **"Edit inline"** button below the `RefinementPanel`. Disabled while any `pendingAction` is in flight (same rule as the other actions) and only for EXPORTED/PUBLISHED drafts.
- Clicking opens an overlay (reuse `Modal`) containing:
  - A sticky banner: "✎ Click any text to edit · hover an image and click Replace photo to swap it".
  - A **sandboxed iframe** rendering the draft's current `htmlSnapshot` at true canvas size, scaled to fit the viewport (CSS transform scale on a fixed-size wrapper).
  - **Save & re-export** and **Cancel** buttons. Save shows progress while the server renders.

### Editing mechanism (secure, parent-driven)

- iframe attributes: `sandbox="allow-same-origin"` **without** `allow-scripts`. Consequence: any `<script>` inside the generated HTML **does not run** (keeps us on the "never execute model HTML" boundary from the 2026-07-22 security review), while the same-origin parent can still read/mutate `iframe.contentDocument`.
- The parent, on iframe load:
  - Marks **text-leaf elements** `contenteditable=true` — elements whose child nodes are all text (generic; no dependency on generated class names). Applies a subtle outline-on-focus style injected by the parent.
  - Enforces **plain-text paste** (`beforepaste`/`paste` → insert `text/plain`) and prevents removing whole blocks (guard Enter/Backspace at block boundaries to avoid structural breakage).
  - Wraps each `<img>` with a **"Replace photo"** file input: on select, upload via `POST /api/briefs/images` → receive a storage URL → set `img.src` to that URL. (Upload-to-URL, never a data-URI — keeps snapshots small and satisfies `isAllowedAssetUrl`.)

### Save (backend)

- New route **`POST /api/drafts/[id]/inline-edit`** (`withTeamAuth`, same visibility/ownership rules as refine). Body: `{ html: string }` (the edited HTML).
- Guards (return **409**, matching refine): the draft must be `EXPORTED`/`PUBLISHED`, and no `pendingAction` may be in flight.
- The parent, before POST, **strips the editing chrome**: removes injected `contenteditable`/style attrs, the banner, and the "Replace photo" wrappers, returning HTML structurally equal to a normal snapshot.
- Server **sanitizes** the HTML defense-in-depth: drop `<script>` elements and `on*` event-handler attributes (a pure, unit-tested function). SSRF is already bounded by the renderer's egress allowlist.
- Render HTML→PNG via the existing `renderHtmlToPng` + `exportKey`/`BUCKET_EXPORTS` path, then commit a new `DraftRevision` (label "Manual inline edit") advancing `currentRevisionNumber` — reusing a shared helper **extracted from the refine route's `commitRevision`** into `src/lib/drafts/revisions.ts` (which already owns `withNextRevisionNumber`). Both refine and inline-edit call it.
- **Synchronous**: no AI, a single render (fast). Returns the new revision; the client refreshes the draft. (Async 202+poll was considered but adds needless machinery for a sub-second render.)

### Data / compatibility

- No schema change, no new env var, no prompt change (`PROMPT_VERSION` unaffected).
- The new revision is indistinguishable from a refine revision to version-switch/restore.
- Depends on the renderer being available (same dependency as refine/export; see prod blocker B3).

## Components / boundaries

- `InlineEditModal.tsx` (new client component): owns the iframe, contenteditable wiring, image-replace upload, chrome-strip, and the Save POST. Clear inputs (draft id, current html, dimensions) and one output (onSaved → refresh).
- `sanitizeInlineHtml(html)` (new, pure): server-side sanitizer. Unit-tested.
- `stripEditingChrome(doc)` (client, pure over a DOM/string): removes editor-injected attributes/nodes. Unit-testable over a string.
- `commitRevision(...)` moved to `src/lib/drafts/revisions.ts` and imported by both refine and inline-edit routes (targeted refactor; no behavior change to refine).

## Testing (TDD)

- **Unit:**
  - `sanitizeInlineHtml`: strips `<script>` and `on*` handlers; preserves text and `img src`/normal markup.
  - `stripEditingChrome`: removes `contenteditable`, editor style hooks, banner, and replace-wrappers; leaves the underlying content.
  - Guard logic: 409 when draft not EXPORTED/PUBLISHED or a `pendingAction` is set.
- **E2E (mock, `MOCK_PUPPETEER`):** open an EXPORTED draft → `POST /inline-edit` with edited HTML → a new revision is created, `currentRevisionNumber` advances, render is invoked, `exportUrl` set; restore to the prior revision still works; a second action while one is pending → 409.

## Risks / notes

- `contenteditable` structural edits can produce messy DOM; the plain-text-paste + block-guard rules and the server sanitizer contain this. Worst case, the edited HTML still renders to a PNG server-side and is never served as HTML to other users.
- Very large drafts (data-URI images already embedded) render fine but are heavier in the iframe; scaling handles display. Image _replacement_ always goes to a URL, so it doesn't grow the snapshot.
