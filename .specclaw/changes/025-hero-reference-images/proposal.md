# Proposal: Hero product screenshots (009 Phase 2)

**Created:** 2026-10-22
**Revised:** 2026-10-25 (OP-1 passed; 007, 027a and 028 landed; the party panel ran; the user's decisions applied)
**Status:** 🟡 Draft

## Problem

009 Phase 1 lets a Path B post use a hero look: the image model draws a subject and leaves the declared regions empty. 028 added two more looks, so there are four (`product-showcase`, `editorial-split`, `full-bleed-scene`, `spotlight`), each at SQUARE, PORTRAIT and STORY.

Phase 1 left "cause 5" open on purpose: the image model gets no reference image (`009/spec.md:19`; `generateImage` takes no input image, `src/providers/interfaces/ImageProvider.ts:14`). So a device in the hero cannot show the real product UI. The model invents a screen, or leaves a vague glow.

**Demand (the user, 2026-10-25):** marketing wants a post with a real product screen often, several a month, and **the post author** has the screenshot. That decides the home: the screenshot is uploaded on the brief, not kept in a kit library.

**The gate is open.** OP-1 passed 6 of 6 (2026-10-23) and OP-028 passed `full-bleed-scene` (2026-10-25). One unknown remains: can `gpt-image-2` draw a front-facing device with a blank, evenly lit screen in a declared rect? OP-1 and OP-028 never asked for that. OP-025 answers it before any surface is built.

## Decisions (the user, 2026-10-25)

1. Adopt every panel fix (the "Panel resolution" table below).
2. Screenshots are **per post**, uploaded by the post author on the brief. No kit artifact type, no kit admin UI. A kit library can follow if reuse shows up.
3. **All three sizes**, each only if it passes OP-025.
4. Demand: often, supplied by the post author.

## Proposed Solution

A Path B hero post can show the author's own product screenshot on a device screen. The screenshot stays pixel-exact. **Code places it, not a model.**

### How a post is made

1. **Image step.** The image model draws a device scene for the new look `device-screen`. The prompt is generated from the dataset and asks for a front-facing device whose screen fills the `composite` rect, blank and evenly lit.
2. **Image check.** The existing real-pixel check runs, plus a **blank** check on the `composite` rect. "Blank" is a number fixed in the dataset before OP-025 (the existing region metrics at a stricter threshold). A failure falls back to classic, reusing the image under the classic prompt, as Phase 1 does, with the reason `composite-not-blank`. The screenshot is then dropped.
3. **Design step.** The design model is told that the `composite` rect is off-limits, the same discipline as a `clear` region. It never sees or writes the screenshot URL. `embed` brief images are kept out of that rect by the same rule.
4. **Composite step (code).** After the model returns, code inserts one absolutely positioned element sized from the contract rect, with the contract's fit and corner radius. The stored HTML keeps only a placeholder token. Just before render, code swaps in a short-lived signed URL (the `__INLINE_ASSET_n__` / `resolveExportUrl` pattern). The signed URL is never saved.
5. **Render check.** Before the screenshot is taken, the renderer confirms that the element loaded (`naturalWidth > 0`), that its box matches the rect within a stated tolerance, and that it is the topmost element in the rect. On any failure the post falls back to classic with `composite-not-rendered`. That costs one more design call, and no second image call.
6. **Stamp.** The composition stamp records the composite only after step 5 passes. The code step in 4 is its only writer, so the stamp and the HTML cannot disagree.

### Where the screenshot lives

- **Upload:** a screenshot field in the brief wizard, separate from `briefImages`. The upload route allows PNG, JPEG and WebP only, checked by magic bytes. It caps the byte size and the pixel count (width × height). Aspect is **not** checked at upload.
- **Storage:** a **private** bucket under a `screenshots/<teamId>/<userId>/` prefix, reusing the existing private `campaign-docs` bucket (`BUCKET_DOCS`, `src/lib/storage/minio.ts:31`) so there is no new env var (open question 2). Brief uploads today go to the public IMAGES bucket (`minio.ts:38`), so this is a deliberate departure: the screenshot may show unreleased UI.
- **The brief's choice:** a new nullable column `Brief.compositeSource` (JSONB `{ kind: 'brief-upload', key }`, zod-parsed). It is not a third meaning on `briefImages`. Regenerate and refine read it. The brief-draft autosave carries it, so Resume keeps the pick. The 002 cleanup rules extend to the private prefix: discard and expiry delete the object, and generate keeps it.
- **Fit:** checked at pick time against the current contract's rect, so the dataset is the only copy of the geometry. The fit rule (cover or contain) is set by the contract.

### The look

- A fifth look key, **`device-screen`**, version 1, with a `composite` region per size. It is not `product-showcase` v3: 028's version rule forbids editing a released version, and Launch defaults to `product-showcase` (`src/lib/postStyles/styles.ts:73`).
- **One device for all sizes:** a laptop or monitor with a landscape screen, so a desktop dashboard screenshot is shown as it is. This answers what "our actual dashboard" means. A phone device for STORY is a later version.
- **The look declares its input:** `requires: 'composite-source'` on the archetype in `composition.ts`. The picker, `POST /api/briefs` and `resolvePostStyle` all read that one field. `POST /api/briefs` returns 400 for `device-screen` with no source, and for a source with any other look. `resolve.ts` gains the note `missing-input-classic`.
- **Validation:** a contract may have at most one `composite` region. A look with `requires: 'composite-source'` must have exactly one in every size.

### Names (permanent once released)

Named after the slot, not the asset, so a later per-kit screenshot or an exact logo lockup reuses them:

- Fallback reasons: `composite-not-blank`, `composite-not-rendered` and `composite-source-missing` (the object is gone at a regenerate or refine).
- Stamp field: `composites: [{ region, source: { kind, key } }]`, at most one entry while one screenshot per post is the scope. It is present only when the composite rendered, and absent on every classic stamp, including a fallback.

### Refine and regenerate

- Refine never sees the composite. Code strips the element to its placeholder before the refine prompt, then reinserts and re-checks it after.
- A refine that replaces the image falls back to classic, as today (`refine-replaced-image`), and the composite is dropped.
- Regenerate design re-runs steps 1 to 6 from `Brief.compositeSource`. If the object is gone, the reason is `composite-source-missing`.
- When the screenshot is dropped, the existing composition notice (`src/components/drafts/CompositionNotice.tsx`) tells the author why, and that the post uses the classic style.

### OP-025: the real-model check, after the pure code lands

The build is ordered so that OP-025 tests what ships:

- **Group A (pure, no model calls):** the `composite` purpose, the `device-screen` dataset entry (all three sizes), the generated prompt text, the blank threshold as a number, validation, `requires`, and the fixtures: pass, busy, contrast and "composite not blank" per contract, enforced by `lookFixtureCompleteness.test.ts`.
- **OP-025:** `scripts/look-check/run-look-check.mjs` gains `device-screen` slots, with its own `--out` directory and ledger. No second runner. It calls the shipped prompt builder and threshold, and records the threshold and a prompt hash in each ledger line. **Pass rule:** 2 of 2 calls blank at a size. **Cap:** 9 calls (6 plus 3 retries). It needs only image calls, with no Claude call. On OP-1 timing, each takes 11 to 22 s at the default quality. A size that fails is removed from the contract before release (still allowed, because the version is unreleased until VERIFIED PASS). If every size fails, the change stops.
- **Group B (after a go):** the composite step, the render check, the stamp, the upload route and private storage, `Brief.compositeSource` with its migration, the wizard, regenerate and refine, the notice and E2E. The design step and the stamp land together with the brief storage, as the panel's cut line requires.

## Panel resolution

| Finding                                                           | How this revision answers it                                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| BLOCK: placement handed to the design model (architect)           | Code inserts the element (step 4)                                                                 |
| BLOCK: a failed render still makes a green post (security)        | Render check, `composite-not-rendered`, stamp written only after a pass (steps 5 and 6)           |
| BLOCK: kit delete breaks drafts (security)                        | No kit artifact. A missing object at regenerate or refine is `composite-source-missing`           |
| BLOCK: brief choice has no storage (architect)                    | `Brief.compositeSource`, with its migration, readers and autosave                                 |
| feedToAI gap; type visibility in one place (architect, visionary) | No new artifact type, so not in scope. Noted for any future kit screenshot type                   |
| OP-025 tests a stand-in (architect)                               | Group A lands first, and OP-025 extends `run-look-check.mjs`                                      |
| Lifecycle, stamp invariants, cardinality (architect)              | Server 400s, the stamp rules and at most one entry                                                |
| embed vs composite rect (architect)                               | The rect is off-limits to the design model, and the render check confirms the element is topmost  |
| "Exactly one composite per contract" (architect)                  | At most one per contract; exactly one when the look requires it                                   |
| No safe default bucket; one-way door (security, visionary)        | Private bucket, a placeholder in the HTML, signed at render                                       |
| Upload formats and decode cost (security)                         | Magic bytes, byte cap, pixel-count cap                                                            |
| Screen-only names (visionary)                                     | `composite-*` reasons and a `composites` field                                                    |
| Input declared in UI only (visionary)                             | `requires` on the archetype, and `missing-input-classic`                                          |
| Stamp and HTML recorded twice (visionary)                         | One writer (step 4), and refine never sees the composite                                          |
| Aspect checked at upload (visionary)                              | Checked at pick time from the contract                                                            |
| No demand evidence (BA, PO)                                       | The user: often, the post author supplies it                                                      |
| No pixel-exact criteria (BA)                                      | Render check: loaded, box within tolerance, topmost                                               |
| "Blank" undefined; pass rule (BA)                                 | A number in the dataset before OP-025; 2 of 2 per size                                            |
| Device reading (BA)                                               | One landscape device for all sizes                                                                |
| Smallest slice; three sizes (PO)                                  | Per post, with no kit type. All three sizes are kept by the user's decision, each gated by OP-025 |
| OP-025 spend; what the user sees (PO)                             | A cap of 9 image calls, the timing above, and the composition notice                              |
| Cut line (PO, architect)                                          | Group A, then OP-025, then Group B                                                                |

## Scope

### In Scope

- Group A, OP-025 and Group B as above, at the sizes OP-025 passes.
- One new look, `device-screen` v1, with one landscape device.
- A per-brief screenshot upload, stored privately, one per post, interactive Path B only.
- `Brief.compositeSource` (one additive nullable column, with a manual down script).
- The three `composite-*` fallback reasons and the `composites` stamp field, plus 006 events if `analyticsCoverage.test.ts` requires them.
- Mock seams (a `__MOCK_HERO_*__`-style sentinel), render fixtures, unit tests and an E2E section. No real model calls in the build, except the capped OP-025.

### Out of Scope

- A kit library of screenshots (`PRODUCT_SCREENSHOT` artifact type), a later change if reuse shows up.
- A phone device, or tilted, perspective or multi-device screens; more than one screenshot per post.
- Screenshots as an image-model reference input (approach (a)); no provider change.
- Unattended surfaces. Queue, MCP and ACP stay classic (`unattended-classic`).
- Changing any post style's default look, and editing the four released looks.
- 009 Phase 3, and Spotlight's SQUARE failure.

## Impact

- **Size:** architectural. It adds a new region purpose and look to the shared dataset, a new code-owned composite step in the render pipeline, private per-brief storage, and new stamp fields that other code reads.
- **Files affected:** about 30 (estimated): `src/lib/designData/*`, `src/lib/postStyles/resolve.ts`, `background.ts`, `pathB.ts` and the refine path, `inlineAssets.ts` or a sibling, `puppeteer.ts`, `minio.ts`, a screenshot upload route, `POST /api/briefs`, brief drafts, the wizard, `CompositionNotice`, `testHooks.ts`, `scripts/look-check/`, fixtures, tests and docs.
- **Migration:** one, `Brief.compositeSource` (JSONB, nullable), with its down script. No env var.
- **Complexity:** large.
- **Risk:** medium.
  - The model may not draw a blank screen; OP-025 measures this before Group B.
  - A signed URL must outlive the render. It is generated per render, so it never sits in stored HTML.
  - The inline editor or any HTML preview that loads stored HTML will see the placeholder. The plan must resolve it there too, or show the exported PNG.

## Open Questions

1. The tolerance for the render check's box match (proposed: 2 CSS px), and the blank threshold's exact value. The plan fixes both before OP-025.
2. Reuse `BUCKET_DOCS` with a prefix (no env var), or add a dedicated private bucket (one env var, cleaner)?
3. Which surfaces show stored HTML directly (the inline editor, a preview iframe), and how do they resolve the placeholder?

Party panel, 2026-10-25 (verdict CHANGES_REQUESTED; upheld findings; see `party-report.md`):

- (party-architect, BLOCK) Pixel-exact placement is handed to the design model, which can only be asked. Make placement a code step that inserts the element into the rect after the model returns, and name the fallback reason when the check fails.
- (party-architect, BLOCK) Where does the brief store its screenshot choice? A `Brief` column is a second migration; `briefImages` would gain a third meaning. Readers and writers must be listed.
- (party-security, BLOCK) A screenshot that fails to render still produces a green, screenshot-stamped post. Check the rect after render and fail closed with a named reason; stamp only after the check passes.
- (party-security, BLOCK) Deleting a kit screenshot silently breaks every draft and revision that references it. Soft delete, a reference count in the confirm, and a named failure; say that exports and published posts are not changed.
- (party-architect) A new artifact type does not by itself keep screenshots out of `feedToAI` prompts. State the rule for the flag, the route's type lists and the dimension limits.
- (party-architect) OP-025 gates on a hand-written prompt and rect, not on the data contract the build ships. Land the pure dataset, prompt builder and threshold first, or re-run it later; say whether it extends `run-look-check.mjs`.
- (party-architect) The screenshot's lifecycle across brief, stamp and kit delete is unspecified: a server-side `imageStyle` rule, a named exit for a missing artifact, the stamp invariants and the field's cardinality.
- (party-architect) The precedence between an `embed` brief image and the composite rect is undefined.
- (party-architect, NOTE) "Exactly one `composite` region per contract" would fail the four released looks; scope it to `device-screen`.
- (party-architect, NOTE) If the work is split, draw the line after item 4. The design step and stamp must land with the artifact type, brief storage and migration.
- (party-security) Unreleased UI has no safe default bucket. Default to private, store only a key in HTML and the stamp, and sign at render.
- (party-security, NOTE) Upload validation must name the formats (PNG, JPEG, WebP by magic bytes) and cap the pixel count.
- (party-visionary) `screen-not-blank` and `screenshots` are permanent, screen-only names on a generic slot. Prefer `composite-*` reasons and `composites: [{ region, source: { kind, id } }]`.
- (party-visionary) Make generation visibility a property of the type, defined in one place with a guard test, so the next asset type cannot repeat the `feedToAI` gap.
- (party-visionary) Declare a look's required input on the archetype (`requires:`), read by the picker, the brief route and `resolve.ts` (a `missing-input-classic` note).
- (party-visionary) The bucket choice is a one-way door once URLs sit in stored HTML; decide it before plan and store a key or placeholder, not a URL.
- (party-visionary) The screenshot is recorded twice, in the stamp and the HTML; make one derived from the other, and say which.
- (party-visionary) Check aspect fit at pick time from the current contract's rect, not at upload, so the dataset stays the only copy of the geometry.
- (party-ba) No evidence of demand, and no word on who uploads or how often. Decide kit versus per-brief from that behaviour.
- (party-ba) No acceptance criteria for "pixel-exact" and "exactly there": state a tolerance or a fail-closed check.
- (party-ba) "Blank enough" has no number, and OP-025's pass rule and sample size are open. Define blank and the pass rate that makes a size shippable.
- (party-ba, NOTE) Say which device and fit reading "our actual dashboard" assumes, and check it holds.
- (party-po) No smallest slice is priced: one size, a per-brief embed, no kit artifact type and no migration.
- (party-po) The do-nothing option and demand are not priced: how many screenshot posts a month, and how they are made today.
- (party-po) Three sizes and the 006 event have no stated value. SQUARE first; PORTRAIT and STORY each after their own OP-025 pass.
- (party-po) OP-025 spend and running cost are not priced; state the per-call time and cost, a pass-rate bar, and what the user sees when the screenshot is dropped.
- (party-po, NOTE) Name a cut line with a go/no-go after the engine's real check.

---

**To proceed:** approve this proposal. Then `/specclaw:plan`, with Group A, OP-025 and Group B as the task order.
