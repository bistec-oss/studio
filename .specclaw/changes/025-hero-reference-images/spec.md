# Spec: Hero product screenshots (009 Phase 2)

**Change:** 025-hero-reference-images · **Size:** architectural · **Proposal:** [proposal.md](proposal.md) · **Party:** [party-report.md](party-report.md)
**Created:** 2026-10-25
**Status:** 🟡 Draft

All facts below were read at HEAD `45fae1a` on 2026-10-25.

## Overview

A Path B hero post can show the post author's own product screenshot on a device screen. The image model draws a laptop with a blank screen in a declared rect (`composite` region). Code, not a model, places the screenshot in that rect. Stored HTML holds only a placeholder token, and the screenshot itself is resolved at render time from a private bucket. Each render checks that the screenshot is really there before the PNG is taken.

**The user's decisions (2026-10-25)** and where each lands:

| Decision                                                              | Lands in                   |
| --------------------------------------------------------------------- | -------------------------- |
| Adopt every upheld panel finding                                      | The "Panel findings" table |
| Screenshots are per post, uploaded by the post author; no kit library | FR-10, FR-11; Out of scope |
| All three sizes, each gated by OP-025                                 | FR-02, FR-09               |
| Demand: often, from the post author                                   | Overview                   |

**Two refinements of the proposal's wording, made here and stated once:**

1. **The render resolves the token to an inline `data:` URI, not a signed URL.** The proposal said "a short-lived signed URL". A `data:` URI built server-side from the private object meets every stated goal (private object, nothing expiring or revocable in stored HTML) with no egress host, no expiry window and no URL in Chromium's request log. Hero renders already set multi-megabyte `data:` content (Path A inline assets, `src/lib/agent/inlineAssets.ts`).
2. **OP-025 runs through the app, through `run-look-check.mjs`, by a new `--probe` mode.** It calls a super-admin probe route that generates one hero image with the shipped prompt and runs the shipped check. That is one image call and one Haiku decision call per attempt, and no design call. This is how "no second runner" (proposal) and "OP-025 tests what ships" (architect) are both met before Group B exists.

## Approach

**Group A (pure plus the probe), then OP-025, then Group B.**

- **Group A** adds the `composite` purpose, the `device-screen` look and its `requires` field, the blank check, the three fallback reasons, the `composites` stamp field, the prompt text, the notice messages and the fixtures. The look can't be picked yet: every surface treats a look whose `requires` input is missing as unavailable. Group A also adds the probe route and `--probe` mode.
- **OP-025:** the operator runs `--probe` against a local server (the user's decision to spend).
- **Group B** is built only after a go: the composite engine (insert, resolve, check), private storage and the upload route, `Brief.compositeSource`, the wizard, regenerate, refine and the re-render paths, E2E and docs.

File map (details in [design.md](design.md)):

- **New:** `src/lib/composite/{insert,assets,imageHeader}.ts`; `src/app/api/briefs/screenshots/route.ts` (POST upload, GET preview); `src/app/api/admin/look-probe/route.ts`; `prisma/migrations/20261026120000_composite_source/`; `prisma/rollback/025-hero-product-screenshots.down.sql`; `tests/unit/{composite*,imageHeader,lookProbe}.test.ts`; `tests/render/composite.test.ts`; `tests/e2e/product-screenshots.test.ts`; `.specclaw/changes/025-hero-reference-images/look-check/` (written by the runner).
- **Modified:** `src/lib/designData/{composition,evaluate,validate,stamp,promptText,plan}.ts`; `src/lib/postStyles/{resolve,types}.ts`; `src/lib/brief/{imageStyle,briefDraftPayload}.ts`, `src/lib/brief/briefDrafts.ts`; `src/lib/drafts/{compositionNotice,revisions}.ts`; `src/lib/renderer/{puppeteer,layoutFacts,domFacts}.ts`, `src/lib/agent/{pathB,designAgentCli,designAgent,tools,background,refineAttempt}.ts`; `src/lib/storage/minio.ts` (`getObjectBytes`); `src/app/api/briefs/route.ts`; `src/app/api/drafts/[id]/{route,regenerate-design/route,refine/route,inline-edit/route,revisions/*/restore/route}.ts`; `src/app/api/generate/export/route.ts`; `src/components/brief/*` (picker, screenshot field, review); `src/components/drafts/InlineEditModal.tsx`; `src/lib/testHooks.ts`; `prisma/schema.prisma`; `scripts/look-check/{lookCheck,run-look-check}.mjs`; `tests/render/{lookFixtureTable,lookFixtures}.ts`; the existing tests that enumerate looks or reasons (listed in tasks).
- **Docs:** `docs/handoff.md`, `docs/e2e-test-plan.md` (section AG), `CLAUDE.md`, `.specclaw/ROADMAP.md`.

## Requirements

### Functional Requirements

**Group A: the dataset, the check and the probe**

- **FR-01: the `composite` purpose and `requires`.** `Purpose` gains `'composite'`. `Archetype` gains an optional `requires?: 'composite-source'`. A `composite` region is the only kind of region a look with `requires` may add beyond its `text` regions. The `composition.ts` header records that `composite`, `requires` and the three new fallback reasons are permanent names.
- **FR-02: the `device-screen` look, version 1.** Key `device-screen`, label "Product screen", summary "A laptop showing your own product screenshot, with the text above it.", `status: 'active'`, `current: 1`, `requires: 'composite-source'`, `textTone: 'light'`. One landscape laptop at every size. Every screen rect is 16:10 in canvas pixels. `minAreaPct` is 20 for every region.

  | Size (px)          | `text` region (x, y, w, h %) | `composite` region (x, y, w, h %) | Screen in px  |
  | ------------------ | ---------------------------- | --------------------------------- | ------------- |
  | SQUARE 1080×1080   | 0, 0, 100, 34                | 14, 42, 72, 45                    | 777.6 × 486   |
  | PORTRAIT 1080×1350 | 0, 0, 100, 36                | 10, 45, 80, 40                    | 864 × 540     |
  | STORY 1080×1920    | 0, 0, 100, 34                | 8, 44, 84, 29.5                   | 907.2 × 566.4 |

  Subject per size: "a modern laptop seen straight on, centred, its screen exactly filling the screen area, on a plain dark surface with soft light". Rows may be tuned in Group A before OP-025 (NFR-04). After OP-025, a size that failed is removed from v1 before release.

- **FR-03: validation.** `lookDatasetProblems` adds the following rules, each with its own message:
  - at most one `composite` region per contract;
  - a look with `requires: 'composite-source'` has exactly one `composite` region at every declared size;
  - a look without `requires` has no `composite` region;
  - a `composite` region does not overlap any `text` region.

  The four released looks pass unchanged.

- **FR-04: the blank check.** _(Amended by A1, below.)_ `evaluateRegions` treats a `composite` region as follows: invalid first, then **blank**. Blank means the standard deviation of L\*/100 is at most `BLANK_STDDEV_MAX = 0.04`, a third of the busy bar. There is no contrast test. A failure returns `{ ok: false, reason: 'composite-not-blank', region }`. Text regions are unchanged. `HeroCheckResult` and `settleComposition` carry the new reason through to the stamp.
- **FR-05: fallback reasons.** `FALLBACK_REASONS` gains `composite-not-blank`, `composite-not-rendered` and `composite-source-missing`, appended after the existing eight. Each has its own `compositionNoticeFor` message naming the screenshot. For the last two, the message says the post uses the classic style without the hero image.
- **FR-06: the `composites` stamp field.** _(Amended by A1, below.)_ `compositionStampSchema` gains `composites?: Array<{ region: number; source: { kind: 'brief-upload'; key: string } }>`, with invariants:
  - present (length exactly 1) only when the applied archetype is a look with `requires`;
  - absent on every classic stamp, a fallback included;
  - `key` matches `^screenshots/[^/]+/[^/]+/[^/]+$`.

  `refineReplacedStamp` drops it.

- **FR-07: prompt text from the data.**
  - **Image prompt:** one line per `composite` region: "<area> must be the laptop's screen: flat, facing the viewer, blank and evenly lit, filling exactly this area, with the bezel just outside it."
  - **Design prompt:** "Leave <area> (<px>) completely empty: no text, shape, image, overlay or scrim. The product screenshot is placed there automatically."
  - **Refine prompt:** the same sentence. `clear` regions are untouched.
- **FR-08: availability by `requires`.** The input is "available" only when the brief carries a `compositeSource`. In Group A, nothing can supply one, so:
  - **Picker:** `imageStyleOptions` takes `{ hasCompositeSource }` and marks a `requires` look unsupported without it, with the reason "Needs a product screenshot".
  - **Resolver:** `resolvePostStyle` gives `missing-input-classic`, a new `ResolveNote` checked after `retired-classic`.
  - **API:** `POST /api/briefs` returns 400 `IMAGE_STYLE_NEEDS_SCREENSHOT` for a `requires` look with no `compositeSource`.
  - **Plan:** `planComposition` returns classic with `composite-source-missing` when the plan's look requires an input the caller did not supply.
  - **Unattended:** queue, MCP and ACP are unchanged (`unattended-classic` comes first).
- **FR-09: OP-025, the probe.**
  - **Route:** `POST /api/admin/look-probe` (`withTeamAuth` plus a super-admin check, since the image provider resolves per team; 404 when `NODE_ENV === 'production'`) takes `{ key, size }`. It plans the look, then runs the hero background step with the shipped prompt and the team's image provider: one Haiku decision call and one image call. It runs the shipped check and returns `{ verdict, fallbackReason?, promptHash, threshold, image }`, where `image` is the hero image `data:` URL. It writes no draft or brief.
  - **Runner:** `scripts/look-check/run-look-check.mjs --probe` drives `device-screen` slots at the three sizes. It uses the existing ledger, cap and `planNext` logic (`lookCheck.mjs`), with its own `--out` directory (`.specclaw/changes/025-hero-reference-images/look-check/`) and a cap of 9. The ledger line carries the keys `threshold` and `promptHash`, both null, because it is written before the request; the real values are recorded per attempt in `results.json`. It saves each image to `renders/`. (amended at T5 after the T4 review) `--verdict` records the user's accept or reject.
  - **Pass rule:** a size passes when 2 attempts kept the look (check ok) and the user accepted both. The change stops if no size passes.

**Group B: the composite (built only after an OP-025 go)**

- **FR-10: upload.**
  - **Route:** `POST /api/briefs/screenshots` (`withTeamAuth`). It accepts PNG, JPEG or WebP, decided by magic bytes, never by the client MIME type. Limits: at most 10 MB, at least 640×400 px, at most 25 000 000 px (width × height), each side at most 8 000 px.
  - **Storage:** private `BUCKET_DOCS`, key `screenshots/<teamId>/<userId>/<timestamp>-<random>.<ext>`.
  - **Response:** `{ key, width, height }`, never a URL.
  - **Preview:** `GET /api/briefs/screenshots?key=` streams the object only when the key's team and user segments match the session; otherwise 404.
- **FR-11: the brief's choice.**
  - **Column:** a new nullable column `Brief.compositeSource` (JSONB `{ kind: 'brief-upload', key, width, height }`, zod-parsed; one migration with a manual down script).
  - **Validation:** `POST /api/briefs` accepts `compositeSource` and returns 400 when:
    - the key is not under `screenshots/<teamId>/<userId>/`;
    - the object does not exist;
    - it is sent with a look that has no `requires`;
    - a `requires` look is sent without it.
  - **Readers:** regenerate-design and refine read it through the brief.
  - **Autosave:** the brief-draft payload carries it, so Resume keeps the pick. Discard, eviction and expiry delete the object, and a successful generate keeps it (002 rules, extended to the private prefix).
  - **Draft delete:** an admin draft delete that removes the orphaned brief also deletes the object.
- **FR-12: insertion (code-owned).** _(Amended by A1, below.)_ `insertComposite(html, region, canvas)` is pure and idempotent:
  - it removes every element carrying `data-composite`;
  - it inserts one canonical element as the last child of `<body>`: `<div data-composite="0">` positioned `fixed` at the rect in canvas pixels, `z-index: 2147483647`, background `#0b0b0b`, `overflow: hidden`;
  - inside it goes `<img src="__COMPOSITE_0__">` with `object-fit: contain`, so the whole screenshot shows, letterboxed in black.

  `stripComposite(html)` removes the element. The token is the only reference ever stored.

- **FR-13: resolution at render.** `renderHtmlToPng` and `evaluateInRenderedPage` take a **required** `composites: CompositeRender | null` argument. When it is set, the renderer replaces the token with a `data:` URI built from the object's bytes (`getObjectBytes`, new in `minio.ts`) just before `setContent`; the stored string is never changed. `compositeRenderFor(stamp, teamId)` builds the argument from a stamp's `composites`, and refuses a key outside `screenshots/<teamId>/` with `composite-source-missing`.
- **FR-14: the render check.** _(Amended by A1, below.)_ When `composites` is set, the renderer measures in the page, before the screenshot:
  - the `<img>` is complete and has `naturalWidth > 0`;
  - the element's box is within `COMPOSITE_TOLERANCE_PX = 2` CSS px of the rect on every edge;
  - `elementFromPoint` at the centre and at four points inset 10% from the corners returns the composite element or its child.

  The pure verdict is `evaluateCompositeFacts` in `designData`. A failure throws `CompositeRenderError` with reason `composite-not-rendered`, or `composite-source-missing` when the bytes could not be read. Under `MOCK_PUPPETEER` the in-page part is skipped. The pure HTML check (exactly one canonical element, at the contract rect) always runs, and the sentinel `__MOCK_COMPOSITE_FAIL__` makes it fail.

- **FR-15: generation and regenerate design.** For a kept `device-screen` plan, the design agents (CLI and API) apply `insertComposite` to the model's HTML after `extractHtmlDocument` or restore and before every render, and they render with the `composites` argument. The stored HTML is the inserted HTML with the token.
  - **Render failure:** `CompositeRenderError` makes `runPathBDesign` delete the uploaded export and run the design once more as classic **without** the hero image (no second image call). The stamp is classic with the error's reason.
  - **Blank failure:** `composite-not-blank` (pre-design) reuses the image under classic, as Phase 1 does. Its screen is not blank, so it is not an empty laptop.
  - **Stamp:** `composites` is written only from a render that passed.
- **FR-16: refine, override, inline edit, restore, export and the verifiers.**
  - **Refine:** sees `stripComposite(html)`. After the model returns, code calls `insertComposite` and renders with the stamp's composites.
  - **Re-render callers:** `commitDraftRevision`, `recordRejectedRender`, revision restore (legacy re-render), the export route, `extractDomFacts` and `observeLayout` all pass `compositeRenderFor(stamp, teamId)`.
  - **Failed re-render:** a `CompositeRenderError` in a refine, override or inline edit fails the action with the named error "The product screenshot could not be placed; nothing was changed". No revision is written.
  - **Inline edit:** the save route canonicalizes the HTML with `insertComposite` (or `stripComposite` on a classic stamp). In the editor iframe the composite element is shown from the preview route, is not editable, and carries the label "Product screenshot (placed automatically)".
  - **Refine that replaces the image:** keeps `refine-replaced-image`, and `stripComposite` removes the element.
  - **The layout observation** excludes `[data-composite]` from the measured boxes.
- **FR-17: the wizard.**
  - **Upload:** a "Product screenshot" field appears in step 1 under the image-style cards when the brief is Path B. Picking `device-screen` without a screenshot shows the field as required.
  - **After upload:** a thumbnail from the preview route, a Remove button, and an advisory line "Will be letterboxed" when the screenshot's aspect differs from the size's screen rect by more than 10%. It is never refused for aspect.
  - **Review:** the Review step names the screenshot.
  - **Body:** the submit body carries `compositeSource`.
  - **Resume:** keeps it.

### Non-Functional Requirements

- **NFR-01: no new call kinds, no real call in the build.** No new `createMessage`, `runClaudeCli` or `generateImage` call site outside the probe route (`git grep -c` against `45fae1a`). No task runs the runner against a server; only unit tests and `--dry-run` do.
- **NFR-02: regions in the dataset only.** No file outside `src/lib/designData/` declares a rect for a look. `src/lib/composite/` reads the rect from the contract. The purity guards pass; `src/lib/composite/` may import `designData` but not the reverse.
- **NFR-03: one migration.** `20261026120000_composite_source` adds one nullable JSONB column and nothing else. Its manual down script is `prisma/rollback/025-hero-product-screenshots.down.sql`. No env var.
- **NFR-04: the version rule.** The released hashes of the four looks are unchanged. `device-screen@1` gets a committed hash when it is final, which is after OP-025 and before verify.
- **NFR-05: the token is the only stored reference.** No stored `htmlContent`, `htmlSnapshot`, stamp or brief holds a URL to the screenshot; a key is allowed. A unit test (`git grep`) and an E2E assertion check it.
- **NFR-06: tenancy.** A screenshot key belongs to one team and user. Upload, preview, `POST /api/briefs` and `compositeRenderFor` each refuse a foreign key: 404 or 400 on routes, `composite-source-missing` at render.
- **NFR-07: render cost.** The `data:` URI is built once per render call. The 10 MB and 25 MP caps bound decode memory in the shared browser (`PUPPETEER_MAX_CONCURRENCY` 2).
- **NFR-08: fail closed.** No path stores a draft or revision whose stamp lists a composite that was not checked in that render.
- **NFR-09: design system.** The new wizard field and the editor label use existing primitives; `uiTokenGuard.test.ts` passes with no new `// ui-exception`.
- **NFR-10: unattended surfaces untouched.** `git diff --name-only 45fae1a -- src/lib/scheduler src/mcp src/acp src/app/api/acp src/lib/campaign` lists nothing.

## Acceptance Criteria

Group A (verified at the Group A gate, re-run at final verify):

- **AC-01 (FR-01, FR-02, NFR-04): the dataset.** Unit: five active looks; `device-screen` rows equal the FR-02 table; every screen rect is 16:10 in canvas px within 0.5%; the four released hashes are unchanged; `device-screen@1` matches its committed hash.
- **AC-02 (FR-03): validation.** `lookDatasetProblems(archetypes)` is `[]`. Each FR-03 rule fails on its own fixture dataset with its own message.
- **AC-03 (FR-04): the blank check.** _(Amended by A1, below.)_ Unit: a `composite` region with L\* standard deviation 0.039 passes and 0.041 fails as `composite-not-blank`; a text region keeps its old behaviour. Render: one pass fixture and one "screen not blank" fixture per `device-screen` size, with the real sampler and the real `evaluateRegions`.
- **AC-04 (FR-05, FR-06): reasons and the stamp.** Unit: `FALLBACK_REASONS` is the 11-item list; each reason has a unique notice message of at least 20 characters; each FR-06 invariant fails on its own bad stamp; a classic fallback stamp with `composites` fails to parse.
- **AC-05 (FR-07): prompts.** Golden text for the image, design and refine prompts of all three sizes; every existing golden is unchanged.
- **AC-06 (FR-08): unavailable without a source.** Unit: the picker marks `device-screen` unsupported without a source, with the reason; `resolvePostStyle` gives `missing-input-classic` on wizard and briefs-api; `planComposition` gives `composite-source-missing`. E2E: `POST /api/briefs` with `device-screen` and no source is 400 `IMAGE_STYLE_NEEDS_SCREENSHOT`.
- **AC-07 (FR-09): the probe.** Unit (`lookProbe.test.ts`, `lookCheck.test.ts`): the probe route is 404 in production and 403 for a non-super-admin; under `MOCK_AI` it returns a verdict and writes no row; the runner's `--probe --dry-run` lists three slots, a cap of 9, and a ledger line shape with the keys `threshold` and `promptHash` as null (written before the request; the real values are recorded per attempt in `results.json`) (amended at T5 after the T4 review); the 028 slots and cap are unchanged.
- **AC-08 (fixtures).** _(Amended by A1, below.)_ `lookFixtureCompleteness.test.ts` passes with 36 + 12 rows (pass, busy, contrast and screen-blank-fail for each `device-screen` size).

Group B:

- **AC-09 (FR-10, NFR-06): upload.** Unit: the header parser reads PNG, JPEG and WebP (VP8, VP8L, VP8X) dimensions and refuses a renamed SVG, a GIF and a truncated file. E2E: a PNG uploads and returns a key, not a URL; an SVG named `.png` is 400; 600×400 is 400; another team's key on the preview route is 404.
- **AC-10 (FR-11): the brief.** E2E: each 400 of FR-11; a valid brief stores `compositeSource`; Resume of an autosaved brief keeps it; Discard deletes the object (asserted against MinIO, as §P does).
- **AC-11 (FR-12): insertion.** _(Amended by A1, below.)_ Unit: idempotent (insert twice equals once); removes a model-written `data-composite`; the element's px box equals the rect at each size; `stripComposite` then `insertComposite` round-trips.
- **AC-12 (FR-13, FR-14): pixel-exact.** _(Amended by A1, below.)_ Render harness (real Chromium): a 16:10 test pattern (four coloured quadrants and a 1 px grid) is rendered through the composite at each size. The sampled colour at each quadrant centre in the PNG matches the source within ΔE 3, and the element's box is within 2 px. A missing object, a covering element and a moved element each throw `CompositeRenderError` with the right reason.
- **AC-13 (FR-15): generation.** E2E (`MOCK_AI`, `__MOCK_BG__`): a kept `device-screen` draft stores HTML with exactly one canonical element and the token, no URL to the object, and a stamp with `composites` of length 1. With `__MOCK_COMPOSITE_FAIL__` the draft is EXPORTED, classic, `composite-not-rendered`, with the notice and no `composites`. With `__MOCK_HERO_SCREEN__` (new: only the screen region is busy) it is `composite-not-blank`.
- **AC-14 (FR-16): re-renders.** E2E: a refine on a `device-screen` draft keeps the canonical element and `composites`; an inline edit that deletes or moves the element is saved with the canonical element restored; a refine with `__MOCK_COMPOSITE_FAIL__` fails with the named error and writes no revision; a refine that replaces the image gives `refine-replaced-image` and no element.
- **AC-15 (FR-17, NFR-09): the wizard.** E2E: the field appears for Path B, `device-screen` is disabled until a screenshot is uploaded, the advisory line shows for a 1:1 screenshot, and the submit body carries `compositeSource`. Screenshots at 390 px and 1440 px, light and dark.
- **AC-16 (NFR-05, NFR-08): nothing stored but the token.** Unit guard: no writer stores an `http` URL with the screenshot prefix. E2E: after generation, refine and inline edit, `htmlContent` and every `htmlSnapshot` contain `__COMPOSITE_0__` and not `screenshots/`.
- **AC-17 (NFR-01, NFR-03, NFR-10): the boundaries.** The `git grep -c` and `git diff` checks in NFR-01 and NFR-10 are recorded. `npm run test:upgrade` passes with the new migration, and the down script restores the schema.
- **AC-18: the gate.** Unit, render, lint (0 errors, at most 7 warnings), tsc, build, full clean mock E2E (0 failed, 0 flaky, at least 529 passed plus §AG) and CI green on `v2`.

## Mock E2E plan (section AG, `tests/e2e/product-screenshots.test.ts`)

TC-SHOT-01 to TC-SHOT-14 cover AC-06, AC-09, AC-10, AC-13, AC-14, AC-15 and AC-16. The sentinels are `__MOCK_BG__` (a hero image), `__MOCK_HERO_SCREEN__` (new; only the screen region is busy) and `__MOCK_COMPOSITE_FAIL__` (new; the pure HTML check fails).

## Panel findings → where addressed

Every upheld finding is mapped in the proposal's "Panel resolution" table. In this spec: placement in code (FR-12, FR-15); failed render fails closed (FR-14, FR-15, NFR-08); no kit delete (per post; FR-11 draft delete); brief storage (FR-11); bucket and one-way door (FR-10, FR-13, NFR-05); OP-025 tests what ships (FR-09); lifecycle and stamp invariants (FR-06, FR-08, FR-11); embed versus composite (FR-07, FR-14 topmost); validation scope (FR-03); upload formats and decode cost (FR-10, NFR-07); slot names (FR-05, FR-06); `requires` (FR-01, FR-08); one writer of the stamp (FR-15, FR-16); aspect at pick time (FR-17); pixel-exact criteria (AC-12); "blank" as a number (FR-04); device reading (FR-02); cut line (Approach).

## Edge Cases

- **The model draws the screen smaller than the rect.** The bezel enters the rect, so the blank check fails (`composite-not-blank`).
- **The model draws the screen larger than the rect.** A blank margin of screen shows around the black letterbox. This is accepted as a known limit, and OP-025 renders are judged by eye for it.
- **An `embed` brief image placed over the rect** by the design model is covered by the composite (z-index), and the topmost test passes. An embed image is never lost from the rest of the design.
- **A user reverts to an older revision.** The restore reuses the stored PNG. A legacy row without an export re-renders with the composite.
- **The object is deleted in MinIO by hand.** Regenerate gives `composite-source-missing` (classic, no hero image). Refine and inline edit fail with the named error.
- **Path A plus `device-screen`** is refused by the existing Path A rule. 9:16 is supported where OP-025 passed.
- **MCP returns stored HTML.** It carries the token, not a URL (NFR-05).
- **API-mode design with several `renderHtml` tool calls.** Each render inserts and resolves. `lastHtml` is the inserted, tokenized HTML.

## Assumptions

- A1. `BUCKET_DOCS` is reused with the `screenshots/` prefix (proposal open question 2), so there is no env var.
- A2. The FR-02 geometry and the subject wording are starting values, tunable in Group A before OP-025.
- A3. `BLANK_STDDEV_MAX = 0.04` is a starting value, tuned on fixtures in Group A and fixed before OP-025. Its value is recorded in every ledger line.
- A4. Fit is `contain` on black, so a dashboard is never cropped. The corner radius is 0.
- A5. OP-025 runs on the scratch database `bistec_studio_op1` at `:3002`, with the user's OpenAI key, as OP-1 and OP-028 did.

## Amendment A1 (2026-10-25, the user's decision after OP-025 attempts 1 to 4): screen detection

**Why.** OP-025 spent 4 of its 9 attempts. Every render drew a clean, blank, 16:10 laptop screen with room for text above it, but none placed the screen exactly on the contract rect: the screen was 2 to 7% of the canvas off on at least one edge, so the fixed rect always took in bezel or keyboard and `composite-not-blank` failed it. The first attempt also showed the art-director paraphrasing the region lines, which the geometry pin (`imageGeometryPin`, commit `264b313`) now fixes. A placed screenshot cannot use a rect the image model does not hit, so code **finds** the screen in the image and the screenshot goes where the screen is.

**What changes (supersedes the named parts; everything else stands):**

- **FR-04, the composite branch (superseded).** For a `composite` region the check runs `detectScreenRect` (pure, `designData/composite.ts`) on a luminance grid that the sampler reads over a search window: the region widened by `DETECT_MARGIN_PCT = 12` (percent of the canvas dimension) on each side, clipped to the canvas, sampled at one point per 2 canvas px.
  - **Seed:** the centre patch of the region (5% by 5% of the canvas). Its L\*/100 standard deviation must be at most `BLANK_STDDEV_MAX`; its median is the screen level `L0`.
  - **Edges:** from the centre, five lines per axis (at -30, -15, 0, 15 and 30% of the region's size) scan outward until |L\* - L0| > `SCREEN_EDGE_DELTA = 0.10`. Each side is the median of its five scans. A scan that reaches the window edge fails.
  - **Accept** only when all hold: the interior, inset 3%, has L\*/100 standard deviation at most `BLANK_STDDEV_MAX`; the aspect is 16:10 within 5%; the area is at least `MIN_SCREEN_AREA_RATIO = 0.6` of the region's area; the rect does not intersect any `text` region of the contract.
  - A pass returns the detected rect in canvas percent (two decimals). Any failure returns `{ ok: false, reason: 'composite-not-blank', region }`. The reason name is unchanged (permanent names, FR-05); its notice says no clear blank screen was found.
  - The contract's composite region stays the target the prompts name (FR-07 and the pin) and the seed of the search. It is no longer the insertion rect.
- **FR-06 (amended).** Each `composites` entry gains `rect: { x, y, w, h }`, the detected screen in canvas percent. The stamp invariants gain: `rect` is required, inside the canvas, 16:10 within 5%, and does not intersect a text region of the stamped contract.
- **FR-12, FR-14 (amended).** `insertComposite(html, rect, canvas)` and the render check use the stamped `rect`, not the contract region. Every re-render path (FR-16) reads the rect from the stamp; nothing re-detects.
- **AC-03 (amended).** Unit: `detectScreenRect` on synthetic grids finds an offset screen exactly (within one grid step), and fails on: a textured seed, a screen touching the window edge, a 4:3 screen, a screen under 60% of the region, a screen that intersects the text band, and a busy interior. The 0.039 / 0.041 blank boundary still holds on the seed and the interior.
- **AC-08 (amended).** The `device-screen` fixtures add, per size: a pass fixture with the screen offset from the region (within the margin), and fail fixtures for text-band overlap and for a small screen. The completeness rule covers the new kinds. The table is then 57 rows: 36 for the four released looks plus 21 for `device-screen` (seven kinds per size: pass, busy, contrast, screen, pass-offset, text-overlap and small), so the "36 + 12" in AC-08 above is superseded.
- **AC-11, AC-12 (amended).** Insertion and the pixel-exact render test use a stamped rect that differs from the contract region.
- **OP-025 (amended).**
  - The ledger and its cap of 9 stand. The 4 spent attempts stay in the ledger.
  - Their renders are re-judged offline with the shipped detector (`run-look-check.mjs --probe --recheck`, no image call). Each result gains `recheck: { styleKept, fallbackReason, rect }`, and for attempts 1 to 4 the pass rule reads `recheck.styleKept`.
  - The user then gives a verdict on each re-judged render that kept the look, looking at the detected rect drawn on it.
  - The remaining attempts run only as far as the pass rule still needs.
  - The probe response and `results.json` carry the detected rect.

**Measured offline on the 4 renders (prototype, 2026-10-25).** SQUARE 1 (before the pin): screen top at 27.5%, inside the text band: fail. SQUARE 2: x 18.6 to 81.3, y 39.6 to 77.5, aspect 1.655, interior 0.010: pass. PORTRAIT 1: x 9.1 to 90.7, y 39.0 to 80.1, aspect 1.586, interior 0.002: pass. STORY 1: x 6.2 to 92.5, y 42.0 to 72.8, aspect 1.577, interior 0.005: pass. The shipped detector must reproduce these verdicts.

## Known limits

- The pixel check proves a calm screen area, not a pretty laptop. The user's acceptance in OP-025 is the judgement.
- A screen drawn larger than the rect leaves a blank margin.
- The fallback for `composite-not-rendered` costs one more design call.

## Dependencies

009, 028 (the dataset, version rule, fixtures and runner), 002 (brief-draft cleanup), 006 (`FALLBACK_REASONS` flows into the catalogue unchanged). OP-025 needs a running local server with real providers.

## Out of scope

A kit screenshot library; a phone device; several screenshots per post; image-model reference inputs; unattended surfaces; changing any post style's default look; editing released looks; 009 Phase 3.
