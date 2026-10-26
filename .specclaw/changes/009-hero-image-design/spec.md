# Spec: Hero imagery and product-showcase design (Phase 1, thin slice)

**Change:** 009-hero-image-design · **Size:** architectural · **Proposal:** [proposal.md](proposal.md) (approved 2026-10-21; its Decisions, fallback table, thresholds, stamp shape and file list are binding) · **Panel:** [party-report.md](party-report.md)
**Created:** 2026-10-21
**Status:** 🟡 Draft

## Overview

The product owner finds today's posts flat ("posts needs to be more flashy if required", 2026-10-21). That is one person's judgement, so this change is built to be checked by eye, not assumed. It lets a brief opt into a per-post **image style**. A non-classic style does five things:

1. it asks the image model for a hero subject, and tells it which part of the frame to leave empty;
2. it **checks the returned image against that contract**, on real pixels, and fails closed;
3. it tells the design step to put the text and logo only in the empty part;
4. it **records what was asked, what was applied and why** on every draft and revision (the composition stamp);
5. it observes, after the final render, whether the text and logo really stayed inside (recorded only, never a fallback).

Everything else stays HTML: the logo, the exact copy, inline edit, refine and version history. `classic` is today's behaviour, unchanged, and is the default. Scheduled, MCP and ACP briefs are always classic.

**What this closes.** Of the proposal's five causes, this closes 1 (the image step asks only for backgrounds), 2 (image and layout are decided blind to each other), 3 (no composition vocabulary) and 4 (quality is never set, behind an env value). It does **not** close cause 5 (no reference images, so a device screen cannot show the real product UI): that is Phase 2. What can change is subject, depth and layout, not what a screen shows.

**This slice is thin on purpose.** Two archetypes (`product-showcase`, `editorial-split`), `SQUARE` and `PORTRAIT` only, one brief-level choice, one fallback, one env value, one new module (`src/lib/designData/`) that change 007 will extend.

**The hypothesis is checked by eye (OP-1).** The build makes no real model calls. The success bar (the user prefers a non-classic render on at least 4 of 6 fixed briefs) is a named operator step, not an acceptance criterion the build can claim.

The design is in [design.md](design.md); the tasks are in [tasks.md](tasks.md).

## Requirements

### Functional Requirements

- **FR-01 — The columns, the migration and the down script.**
  - **Schema** (`prisma/schema.prisma`):
    - `Brief.imageStyle String @default("classic")`, plain TEXT (not an enum, so a retired key needs no migration);
    - `Draft.composition Json?` and `DraftRevision.composition Json?`: the composition stamp. Null means "made before this existed".
  - **Migration** `20261022120000_hero_composition`, sorting after the head `20261021120000_worker_heartbeat`. Three `ALTER TABLE ... ADD COLUMN` statements, hand-written, additive only. Its header says, as 008's and 019's did, that the previous image keeps working against the migrated schema: it never reads the new columns, and its `brief.create` omits `imageStyle`, so the default applies.
  - **Down script** `prisma/rollback/009-hero-image-design.down.sql`, the 016 shape: a manual header, `DROP COLUMN IF EXISTS` for all three, and the L24 `DELETE FROM "_prisma_migrations"` for its own row. It names what a rollback loses (every stored `imageStyle` choice and every stamp).
  - `npm run test:upgrade` migrates through the new migration and diffs the schema.
- **FR-02 — The design-data module** `src/lib/designData/`.
  - **Founding.** This change creates the module with an `index.ts` that exports `designData = { composition: { archetypes } }`. **007 extends it** with its own sections beside `composition` (typography, kit rules). Neither section knows the other's contents.
  - **Archetype entry.** `key`, `label`, `summary` (one line for the wizard card; a small addition to the proposal's shape), `status: 'active' | 'retired'`, `current` (the current contract version) and `versions` (an immutable map from version number to a contract).
  - **Contract.** `role: 'hero'`, `textTone: 'light' | 'dark'` and `sizes`: a map from post size to `{ regions: Region[] }`. An archetype declares only the sizes it supports.
  - **Region.** `{ rect: {x, y, w, h} in canvas percent (0 to 100), purpose: 'text' | 'clear', minAreaPct }`. A later `composite` purpose (Phase 2) is a new value of `purpose`, with no schema change.
  - **The two archetypes at contract version 1.** `product-showcase` (tone `light`: a dark calm area for light text; subject in the right 55%) and `editorial-split` (tone `light`: the photographic band in the right 40%, fading in the 50 to 60% strip). Both support `SQUARE` and `PORTRAIT`; neither supports `STORY`. The `PORTRAIT` contracts are written separately, not scaled copies. The exact rects are fixed in design.md section 4 and tuned on the T3 fixtures.
  - **`classic`** has no dataset entry. It is the implicit default.
  - **Lifecycle.**
    - A change to a contract adds a new immutable version and bumps `current`. It never edits an existing version, so a stamped draft always resolves to the exact contract it was made under.
    - Retiring an archetype stops new selection and never removes its versions.
    - A retired or unknown key resolves to classic and is recorded (`unknown-archetype`).
  - **Single source.** Safe-area regions come only from this dataset. The prompts, the check, the layout observation and the stamp all read the one lookup. No model output supplies, widens or moves a region.
  - **Purity.** `src/lib/designData/**` imports no server module (no prisma, minio, env, fs, puppeteer), so the wizard can import it.
- **FR-03 — The brief-level choice.**
  - **Field.** `Image style: Classic (default) | Product showcase | Editorial split`, in the Size & Design step, shown for Path B only. A Path A brief has no image step.
  - **STORY.** With the `STORY` size the two non-classic options are disabled, with a line saying why. Choosing `STORY` while a non-classic style is selected resets it to classic. Switching to Path A resets it to classic.
  - **Review row.** The Review step shows the style for a Path B brief with a non-classic choice.
  - **Autosave.** The brief-draft payload gains `imageStyle` (optional string). A resumed brief with an unknown or retired key falls back to classic.
  - **API (`POST /api/briefs`).**
    - An absent value is `classic`.
    - A non-string, an unknown key or a retired key is a 400.
    - A non-classic style with `designMode: 'TEMPLATE'` is a 400.
    - A non-classic style with `STORY` is **accepted**: the pipeline records `unsupported-size` (the table's row). The wizard prevents it, so the row is reachable only by API and by regenerate.
  - **Out.** There is no "auto", no kit allow-list, no kit default. The art-director never picks an archetype. The picker is kept on the user's word of 2026-10-21, against party-po's cut. Scheduled, MCP and ACP briefs never set the field.
- **FR-04 — Composition planning, and the fallback table.**
  - `planComposition({ imageStyle, aspectRatio })` is pure. It returns a **hero plan** (archetype, contract version, the size's contract) only for an active key whose contract supports the size; otherwise a **classic plan** carrying `fallbackReason: 'unknown-archetype'` (unknown or retired key) or `'unsupported-size'`. `imageStyle: 'classic'` is a classic plan with no reason.
  - A classic plan is decided **before any image is requested**, so the image call, if any, is today's classic one.
  - `settleComposition(plan, background)` is pure. It turns the plan and the background step's outcome into the stamp. **Only an explicit, completed pass keeps the archetype.** Every other exit takes the fallback table below:

  | Exit                                                       | Resolved archetype | Image used                                                       | `fallbackReason`    |
  | ---------------------------------------------------------- | ------------------ | ---------------------------------------------------------------- | ------------------- |
  | The check completes and fails the busy rule                | classic            | the hero image, reused as the classic background                 | `busy`              |
  | The check completes and fails the contrast rule            | classic            | the hero image, reused                                           | `contrast`          |
  | A region is invalid (below its minimum area, unresolved)   | classic            | the hero image, reused                                           | `region-invalid`    |
  | The check errors or times out                              | classic            | the hero image, reused                                           | `check-error`       |
  | No image returned (no provider, provider error, no prompt) | classic            | none (today's CSS/SVG path, plus the existing background notice) | `no-image`          |
  | Unknown or retired key                                     | classic            | the normal classic image, from the classic prompt                | `unknown-archetype` |
  | Unsupported size for the archetype                         | classic            | the normal classic image                                         | `unsupported-size`  |

- **FR-05 — The art-director and the image prompt, for a non-classic style.**
  - The art-director stays on the fixed internal model (`INTERNAL_BACKGROUND`); no model surface is added.
  - **The decision schema is closed.** The parser reads `{ needed, prompt }` and nothing else. Any `archetype`, `safeArea`, `regions` or `role` in the reply is discarded. The brief's key is the only archetype source. For a hero plan, `needed: false` is ignored (the user asked for an image); an empty `prompt` is the "no image" exit (`no-image`).
  - **The prompt.** For a hero plan the "full-bleed BACKGROUND" rules are replaced by hero rules: the subject type, each region as a measurement **generated from the dataset** ("the left 45% of the frame, full height, must be an empty, calm, dark area"), and "no text, no logos, no numbers". The brand voice's layout prose does not apply to the image (see FR-06's precedence). Classic prompts are untouched.
- **FR-06 — The design prompt, and the precedence rule.**
  - **Applied hero.** When the archetype is kept, the design prompt states that the image is the full-canvas background with `background-size: cover` and `background-position: center` (the same fit the check assumes), that text and logo go only inside the `text` regions (in percent and in canvas pixels), that the text colour is the contract's tone, and that the scrim is for the `classic` path only.
  - **Precedence.** The prompt says that when an image style is chosen **its layout contract outranks any layout instruction in the brand voice prompt or the campaign briefing**. The kit's colours, fonts, logo and wording rules still apply. The same line is in the art-director prompt, and the user message's campaign-briefing header carries it.
  - **Fallback.** A fallback to classic with the hero image uses the **unchanged** classic design prompt (full-bleed background, scrim).
  - **Classic is byte-identical.** The classic output of `buildBackgroundDecisionPrompt`, `buildRefineBackgroundDecisionPrompt`, `buildPathBSystemPrompt`, `buildPathBUserMessage` and `buildRefineSystemPrompt` equals its output at HEAD `2ad7431`, for the same inputs.
  - **`PROMPT_VERSION`** is bumped (a new `YYYY-MM-DD.1` string, with its comment line). Tests import the constant, never a literal. The bump also marks classic drafts made after it, whose prompt text is unchanged.
- **FR-07 — The region mapping (pure).** Canvas-percent regions map onto the image through the same fit the design uses: `scale = max(canvasW / imgW, canvasH / imgH)`, centred, clipped to the image. The function returns the image-pixel rect and the clipped area as a percent of the canvas, or `null` when the image dimensions or the rect are degenerate. It is unit-tested on both sizes; the `1024x1536` image on a `1080x1350` canvas is the case that matters.
- **FR-08 — `evaluateRegions` (pure).** `evaluateRegions(sampled, regions, textTone) → { ok: true } | { ok: false, reason: 'busy' | 'contrast' | 'region-invalid', region }`.
  - Each sampled entry is `{ luminance: number[], areaPct }` (WCAG relative luminance, 0 to 1) or `null` (unresolved).
  - **Thresholds,** named constants, starting values tuned on the T3 fixtures:
    - **Busy:** the standard deviation of the region's CIE lightness (`L*/100`, derived from the relative luminance) is above `0.12`. A `text` and a `clear` region use the same rule.
    - **Contrast:** for a `text` region, the WCAG ratio `(L1 + 0.05) / (L2 + 0.05)` between the tone (light = white, dark = `#111111`) and each sample; the region fails when fewer than `95%` of the samples reach `4.5:1`.
    - **Region invalid:** an unresolved region, a mapped area under the region's `minAreaPct`, or fewer than 64 usable samples.
  - Regions are evaluated in dataset order; the first failure is returned (busy before contrast within a region).
- **FR-09 — The sampler, and it fails closed.**
  - `sampleRegionLuminance` in `src/lib/renderer/puppeteer.ts`, beside `sampleImageColors`. It loads the hero image (a `data:` URL: both providers return one) on a network-blocked page, reads the natural dimensions, maps the regions in Node (FR-07), then draws each region with smoothing off and returns point samples (a grid capped at about 4,000 points per region). It has a fixed timeout and goes through the renderer's concurrency cap.
  - **Fail closed.** A page error, a decode failure, a timeout, a non-`data:` URL or any exception is `check-error`. Nothing in the sampler path can keep the archetype except an explicit `{ ok: true }` from `evaluateRegions`.
- **FR-10 — The fallback reuses the hero image and spends nothing more.** Each of the four check rows persists the hero image as the draft's `imageUrl` and designs with the classic prompt over it. **A fallback makes no second image call.** A busy subject under a scrim is a worse post than a clean classic one, and that cost is accepted so that a fallback never doubles the image spend (the user's comparison, OP-1, decides whether it is acceptable).
- **FR-11 — The layout observation (recorded, never a fallback).** After the final render of an applied non-classic design, the page's DOM is read in Puppeteer: the tight boxes of the visible text (text-node ranges) and of the kit's logo `<img>` elements are compared with the stamped `text` regions, with a 2% tolerance. A box outside the regions records `layout-violation` in the stamp's `observations`. A measurement that errors records nothing and is logged. **This slice does not fall back on it** (a second design call would cost minutes, on a rule with no real-render data behind it). The pure comparison is unit-tested; the in-page extraction is tested on real pixels. This is a geometry check on the DOM, not the pixel check run a second time.
- **FR-12 — The composition stamp.** Every draft and every revision stores it, next to `promptVersion`. Shape (binding, from the proposal):
  `{ requestedArchetype, appliedArchetype, contractVersion: n | null, fallbackReason?, observations?: ['layout-violation'], imageQuality: 'default' | 'standard' | 'high' }`.
  - It is a field of `RenderStamp` (`src/lib/drafts/revisions.ts`), so the one writer that stamps `promptVersion` and the model stamps it too. Draft and revision writes use `draftStampFields` and a new `revisionStampFields`, which maps a null stamp to SQL NULL.
  - **A Path A draft** stamps classic (requested classic, applied classic, `contractVersion: null`, `imageQuality: 'default'`), so the evidence has a denominator. Null means "before this change".
  - **A restore and "Use anyway"** copy the revision's own stamp back, as they do the other stamps. **Inline edit and Override** carry the draft's current stamp.
  - **Validated.** A zod schema with invariants (a non-classic applied archetype has a `contractVersion` and no `fallbackReason`; `layout-violation` only on a non-classic applied archetype). A stored value that fails to parse reads as null.
  - **These stamps are the evidence "proven" refers to.** Whoever proposes flipping a default, or Phase 2, starts from the count of non-classic requests, their applied archetypes and fallback reasons (the query is in design.md section 9 and the handoff).
- **FR-13 — Refine co-change.** `buildRefineSystemPrompt` takes the stamped contract. When the draft's current stamp has an applied archetype other than classic, the refine prompt states the `text` and `clear` regions (resolved at the stamped `contractVersion` and the brief's size) and that edits keep text and logo inside them. When a refine generates a new background (`generateBackgroundForRefine` returns a URL), no check runs on it, and a draft whose applied archetype is non-classic is re-stamped `appliedArchetype: 'classic'`, `contractVersion: null`, `fallbackReason: 'refine-replaced-image'`. A draft already classic keeps its stamp. Classic refine output is byte-identical (FR-06).
- **FR-14 — Regenerate design co-change.** `runPathBDesign` re-resolves from `Brief.imageStyle`, runs the new image and the check, and returns the new stamp; the regenerate-design route writes it to the draft and the new revision. A retired key, or a newer `contractVersion`, is the expected, recorded outcome. Initial generation (`produceDesign`) uses the same result.
- **FR-15 — The visible notice.** `GET /api/drafts/[id]` gains `composition` (the parsed stamp or null) and `compositionNotice` (`{ reason, message } | null`). The notice is a pure function of the stamp (`src/lib/drafts/compositionNotice.ts`) with plain wording per reason. The draft page shows it beside the existing background notice (`BackgroundNotice`), amber, `role="status"`, non-blocking, on the existing `Notice` atom and Graphite tokens. No notice for a classic request with no reason.
- **FR-16 — Quality.**
  - **Env.** `IMAGE_QUALITY` takes a neutral tier, `standard` or `high`, or is unset. An unknown value is treated as unset. It is parsed in `src/lib/env.ts` through a pure parser beside the provider capabilities. There is no per-team storage and no UI: the operator's env is the only gate.
  - **Provider option.** `generateImage(prompt, brandKitId?, size?, options?: { quality?: 'standard' | 'high' })` returns `{ url, quality? }` (the tier actually applied). The OpenAI implementation maps `standard` to its `medium` and `high` to `high`; the Gemini implementation accepts the option, ignores it and returns no tier.
  - **Only non-classic images.** `runBackgroundStep` is the only caller that passes `options`, and only for a hero plan, so classic images stay exactly as today. `tools.ts` and `/api/generate/image` pass none.
  - **Stamped.** `imageQuality` is the applied tier, or `default` when none was applied.
- **FR-17 — Mock seams (dormant outside `MOCK_AI`).** New topic sentinels, read from the text the `__MOCK_BG__` seam reads (`backgroundSeamText`): `__MOCK_HERO_BUSY__`, `__MOCK_HERO_CONTRAST__`, `__MOCK_HERO_CHECK_ERROR__` and `__MOCK_HERO_LAYOUT__`. They require `__MOCK_BG__` (the seam runs only then), and feed synthetic samples or boxes **through the real `evaluateRegions` and the real layout comparison**. Under `MOCK_PUPPETEER` the sampler and the layout measurement return calm, in-region results. `mockImageProvider` keeps its signature and ignores the option.
- **FR-18 — The action budget.** The sampler and the layout measurement are new steps in the generation and Regenerate design liveness segments (`src/lib/models/budget.ts`). They are named bounds, imported from where they are enforced, and `tests/unit/actionBudget.test.ts` stays green with no violation. The scheduler and MCP segments are unchanged (their briefs are always classic).
- **FR-19 — Docs.** `.env.example` (`IMAGE_QUALITY`), `docs/e2e-test-plan.md` (the new §AA suite, its seams and AC map), `docs/handoff.md` (the 009 section: the evidence query, the pre-merge note and OP-1), `CLAUDE.md` (the top entry's status) and the ROADMAP row.

### Non-Functional Requirements

- **NFR-01: classic is unchanged.** A classic brief takes today's path: the same prompts byte for byte, the same single image call with no `options`, no sampling, no layout measurement, no added latency, no added tokens, and the same stored fields except the new stamp.
- **NFR-02: no model-supplied region.** No region, safe area, archetype or contract is read from model output anywhere in `src/`. Regions are read only from `src/lib/designData/`.
- **NFR-03: no real model calls, and the databases are shared.** The build makes no real model call and no real provider call. Never run a prisma or DB command without an explicit `DATABASE_URL` pointing at `bistec_studio_test` or a named scratch database; `bistec_studio` is never touched.
- **NFR-04: applied migrations are never edited.** `git diff --name-only 2ad7431 -- prisma/migrations` lists only the new directory. The previous image keeps working against the migrated schema.
- **NFR-05: the UI follows Graphite.** New UI uses the design-system atoms and tokens; `tests/unit/uiTokenGuard.test.ts` passes with no new `// ui-exception`.
- **NFR-06: no new model surface.** The art-director stays on `INTERNAL_BACKGROUND`. `src/lib/models/` changes only if `budget.ts` needs the new step bounds.
- **NFR-07: existing tests are adapted, never deleted,** and the gate baselines do not fall: unit 2706, lint 0 errors and no more than 7 warnings, full clean mock E2E 405 passed / 3 skipped / 0 failed / 0 flaky, render 15/15.
- **NFR-08: a prompt rule is not an invariant (the 2026-08-03 lesson).** Every contract the prompts state (empty region, tone) is checked on the output or observed on the render; the stamp records what the check did.

## Acceptance Criteria

Each criterion must pass for the change to be considered complete. No bypassed dependency applies, so there are no `[stub]` labels; criteria that need real Chromium are marked `[real]` and run under `npm run test:render`.

- **AC-01 (FR-01, NFR-04): the migration and the down script.**
  - `npx prisma validate` passes.
  - **On a scratch database `bistec_studio_009_scratch`,** with an explicit `DATABASE_URL`, dropped afterwards:
    1. `migrate deploy` adds the three columns, and a pre-existing `Brief` row reads `imageStyle = 'classic'`;
    2. the down script drops them and deletes the migration row (`DELETE 1`);
    3. `migrate deploy` re-applies the migration;
    4. `prisma migrate diff --from-url <scratch> --to-schema-datamodel prisma/schema.prisma --exit-code` exits 0.
  - `npm run test:upgrade` prints PASS for every scenario.
  - `git diff --name-only 2ad7431 -- prisma/migrations` lists only the new directory.
  - All of it is recorded in `reports/T1.md`.
- **AC-02 (FR-02): the dataset invariants** (`tests/unit/designData.test.ts`).
  - Every region meets its own `minAreaPct`; every rect lies in `0..100`; every `text` region of a contract has the contract's tone.
  - Every key of `ASPECT_DIMENSIONS` is either given a contract by each active archetype or declared unsupported (a test fails when a size is added and an archetype is neither).
  - `current` names an existing version; versions are frozen (a mutation attempt throws or is a type error and a deep-freeze check passes); retiring is a `status` change only.
  - `src/lib/designData/**` imports nothing from `@/lib/prisma`, `@/lib/env`, `fs`, `puppeteer*` or `@prisma/client` runtime values (a guard test).
- **AC-03 (FR-02, FR-04): resolution** (`tests/unit/compositionPlan.test.ts`). A known active key at a supported size gives a hero plan with `contractVersion = current`; `classic` gives a classic plan with no reason; an unknown key and a `retired` key give `unknown-archetype`; `STORY` gives `unsupported-size`. A stamped `(key, version, size)` resolves to the exact contract even after `current` moves on, and for a retired key.
- **AC-04 (FR-03): the API** (`tests/unit/briefImageStyle.test.ts` for the validator, and E2E TC-HERO-12). A Path B brief with each valid key is created with that value; an absent value stores `classic`; an unknown key, a retired key, a non-string and a non-classic style with `designMode: 'TEMPLATE'` are 400; a non-classic style with `STORY` is accepted.
- **AC-05 (FR-03): the wizard** (E2E TC-HERO-13, and the autosave unit cases). The picker appears for Path B only; the two non-classic options are disabled for `STORY` with the reason; switching to `STORY` or to Path A resets to classic; the Review row shows the choice; the creation request carries it; an autosaved payload round-trips it and an unknown stored value resumes as classic. `tests/unit/briefDraftPayload.test.ts` still passes.
- **AC-06 (FR-04, FR-10): every row of the fallback table** (`compositionPlan.test.ts`, `settleComposition` cases). For each of the seven rows, the plan and the background outcome give the stated resolved archetype, `fallbackReason` and image use; a hero plan with a URL but no check result is `check-error`.
- **AC-07 (FR-05, NFR-02): the art-director** (`tests/unit/heroPrompts.test.ts`, extended `background.test.ts`).
  - The hero decision prompt contains each region's measurement generated from the dataset (golden strings for both archetypes and both sizes), "no text, no logos, no numbers", and the precedence line; it does not contain the "full-bleed BACKGROUND" rule or the "default to needed: true" paragraph.
  - A reply carrying `archetype`, `safeArea`, `regions` or `role` parses to `{ needed, prompt }` only.
  - For a hero plan, `needed: false` with a non-empty prompt still generates; an empty prompt is `no-image`.
- **AC-08 (FR-06, NFR-01): the design prompt.**
  - The applied-hero system prompt contains `background-size: cover`, `background-position: center`, the `text` regions in percent and in pixels, the tone, "scrim ... classic only" and the precedence line; the user message's briefing header carries the precedence line.
  - **Golden test:** the classic output of the five builders equals the strings captured at HEAD for fixed inputs (including a kit with a layout-bearing voice prompt and a campaign briefing).
  - `PROMPT_VERSION` differs from `'2026-10-11.1'` and is the value the stamp writers record.
- **AC-09 (FR-07): the mapping** (`tests/unit/designRegions.test.ts`). Square image on the square canvas; the `1024x1536` image on `1080x1350` (scale `1.0547`, offset `-135` canvas px, so the top and bottom 128 image px are outside the canvas, and the left 45% text region maps to image `x 0..460.8, y 128..1408`); a Gemini-shaped `1024x1280` image; clipping; and `null` for a zero or `NaN` dimension.
- **AC-10 (FR-08): `evaluateRegions`** (`tests/unit/evaluateRegions.test.ts`). A pass; busy at and either side of the threshold; contrast at exactly `95%` and `94%` of samples at `4.5:1`, for both tones; a `clear` region is not contrast-tested; an unresolved region, an area under the minimum and fewer than 64 samples are `region-invalid`; the first failing region in dataset order is returned. The constants are exported and the tests reference them by name.
- **AC-11 (FR-09, FR-07) `[real]`: the sampler on real pixels** (`tests/render/hero-sampler.test.ts`). Fixtures rasterized through the real renderer: a calm dark image passes; a busy image fails `busy`; a mid-grey low-contrast image fails `contrast`; on the `1024x1536` fixture, busy content **only inside the rows the cover fit crops off the canvas** does not fail the check, while the same content inside the visible text region does. This proves the mapping and the point sampling on real Chromium, which the mock suite cannot see.
- **AC-12 (FR-09, FR-04): fail closed** (`compositionPlan.test.ts` and `tests/render/hero-sampler.test.ts`). A thrown sampler, a timeout, a non-`data:` URL and an undecodable image each settle to `classic` with `check-error`; no code path returns the hero archetype without `{ ok: true }`.
- **AC-13 (FR-10): no second image call** (extended `background.test.ts`, and TC-HERO-04). For each of the four check-failure exits, `generateImage` is called exactly once, the returned URL is the draft's `imageUrl`, and the design prompt is the classic one. For a hero plan the call carries `options.quality` only when `IMAGE_QUALITY` is set; for a classic plan the call has no fourth argument.
- **AC-14 (FR-11): the layout observation.**
  - Unit (`tests/unit/layoutObservation.test.ts`): a box inside a text region, inside the 2% tolerance, just outside it, partly outside, and an empty list.
  - `[real]` (`tests/render/hero-layout.test.ts`): the in-page extraction reports the tight text box (not the block's width), ignores the background image, full-bleed decoration and brief images, reports the kit logo `<img>`, and skips hidden elements.
  - A measurement error records nothing.
- **AC-15 (FR-12): the stamp, on every writer** (`tests/unit/compositionStamp.test.ts`, extended `renderStamps.test.ts` and `draftRevisions.test.ts`). The schema accepts every documented shape and rejects the invariants' violations; a stored invalid value parses to null; generation (both lifecycles, Path A and B), regenerate-design, the refine commit, a rejected render, inline edit, Override, adopt and restore each write a composition to the draft and its revision row (a null maps to SQL NULL, not JSON null).
- **AC-16 (FR-12, FR-14): carried stamps** (extended `draftRevisions.test.ts`, E2E TC-HERO-14). Restore copies the revision's own stamp to the draft; "Use anyway" copies the rejected row's; an inline edit and an Override keep the draft's current stamp; a legacy null stays null.
- **AC-17 (FR-13): refine** (extended `refinePrompt.test.ts`, E2E TC-HERO-11). A draft stamped with an applied archetype gets the contract's `text` and `clear` regions (at the stamped version) in the refine system prompt, in both modes; a classic draft gets none and its prompt is byte-identical. A refine that replaces the background re-stamps a non-classic draft `classic` with `refine-replaced-image`, and leaves a classic draft's stamp as it is.
- **AC-18 (FR-14): regenerate design** (E2E TC-HERO-10, unit in `draftActionModels.test.ts`). Regenerate re-resolves from `Brief.imageStyle`, writes a new stamp to the new revision and the draft, and a retired key gives classic with `unknown-archetype`.
- **AC-19 (FR-15): the notice** (`tests/unit/compositionNotice.test.ts`, E2E, and the a11y suite). The pure function gives a plain message per `fallbackReason` and for `layout-violation`, names the style by its label, and gives null for a classic request with no reason and for a null stamp. The draft page shows it with `data-testid="composition-notice"` beside the background notice; an axe pass of `/drafts/[id]` with the notice shown has no violation. `uiTokenGuard.test.ts` passes.
- **AC-20 (FR-16): quality** (`tests/unit/imageQuality.test.ts`, extended `geminiImage.test.ts`, `toolGenerateImage.test.ts`). The parser accepts `standard` and `high` (any case, trimmed), and treats unset, blank and unknown as unset; the OpenAI implementation sends `quality: 'medium'` for `standard` and `'high'` for `high`, and sends no `quality` when no option is passed; it returns the applied tier; the Gemini implementation ignores the option; `tools.ts` and the legacy route pass no options.
- **AC-21 (FR-17): E2E §AA** (`tests/e2e/hero-image.test.ts`, TC-HERO-01 to TC-HERO-16, see design.md section 12). The suite drives the kept archetype for both styles and both sizes, every fallback row (`busy`, `contrast`, `check-error`, `no-image`, `unknown-archetype`, `unsupported-size`), `layout-violation`, the refine re-stamp, regenerate, restore, the API validation, the wizard and the notice. The sentinels are dormant without `MOCK_AI` (a unit test on `testHooks`).
- **AC-22 (FR-18): the budget.** `tests/unit/actionBudget.test.ts` passes with the new steps in the segments, and a planted slow sampler bound is caught in exactly the generation and Regenerate design segments.
- **AC-23 (NFR-01, NFR-02): scope, by grep.**
  - `grep -rnE "safeArea|regions" src/lib/agent/background.ts src/lib/agent/pathB.ts` shows no read of a model reply's field; the decision schema in `background.ts` is still `{ needed, prompt }`.
  - `grep -rln "designData" src` lists only the files in design.md's map.
  - `git diff --name-only 2ad7431` shows no change under `src/scheduler/`, `src/mcp/`, `src/app/api/acp/`, `src/lib/scheduler/` or `src/lib/models/` (except `budget.ts`), and no file under `src/components/` other than the three named in design.md.
- **AC-24 (FR-19): docs.** A review confirms `.env.example`, the §AA section, the handoff 009 section (with the evidence query and the OP-1 steps) and the `CLAUDE.md` line.
- **AC-25: the gate.**
  - tsc is clean, and `npm run lint` gives 0 errors and no more than 7 warnings.
  - `npm run test:unit` passes in full, at least the 2706 baseline plus the new cases.
  - `npm run test:render` passes (15 baseline plus the new cases, 0 failed).
  - `npm run build` passes, and `npm run test:upgrade` passes.
  - A full clean mock E2E gives 0 failed and 0 flaky against the 405/3/0/0 baseline, plus the new §AA cases.
  - `gh run list --branch v2` shows CI green at the change's last commit.

### Operator step OP-1 (not an acceptance criterion)

**Real-look validation is the user's, on prod, after the merge decision.** The build cannot make real model calls, so it cannot claim this. It records the procedure and the bar:

1. Fix **six briefs**: three per size (`SQUARE`, `PORTRAIT`), covering announcement, event and product content.
2. Render each under classic, `product-showcase` and `editorial-split` with real models, in one session.
3. The user compares each non-classic render with its classic one and records "better", "same" or "worse".
4. **The hypothesis holds if the user prefers a non-classic render on at least 4 of the 6 briefs.**
5. Read the stamps for those runs (the evidence query): how often the check kept the archetype, and why it did not. A fallback on nearly every run means the thresholds are too tight, not that the feature works.
6. Confirm at that session that `IMAGE_QUALITY` `medium` and `high` are accepted by the deployed `gpt-image-2` model (see Notes, correction 9), and whether `high` finishes inside the 120 s image bound.

If the bar is not met, the change stays opt-in and nothing flips. A failed bar is a result, not a defect.

## Edge Cases

- **A retired key stored on a brief.** Resolves to classic with `unknown-archetype`, on generation and on regenerate. The stored value is left as it is (history).
- **A contract bumped after a draft was made.** The draft's stamp names its `contractVersion`; refine resolves that exact version. Regenerate uses the current one, and records it.
- **The image is not what the CSS fit assumes.** The design prompt states cover and centre, but nothing verifies the model followed it. The layout observation measures text and logo, not the image's placement. A known limit; the stamp and the notice make a miss visible after the fact.
- **A provider returns an `http(s)` URL.** Neither shipped provider does. The sampler accepts only `data:` URLs, so this is `check-error` (fail closed), and the image is still persisted and reused.
- **`high` quality exceeds the 120 s image bound.** The call fails, the step records `PROVIDER_ERROR`, and the draft takes `no-image` with the existing background notice. The OpenAI guide says complex prompts may take up to two minutes.
- **`needed: false` for a hero plan.** Ignored. With a non-empty prompt it still generates; with an empty prompt it is `no-image`.
- **No provider, or a provider error.** `no-image`: today's CSS/SVG path plus the existing background notice, so both notices can show. The composition notice says no image was made; the background notice says why.
- **A refine on a classic-by-fallback draft** (requested hero, applied classic, reason `busy`): no contract block (applied is classic). A refine that replaces the image leaves the stamp unchanged (the reason stays the true history).
- **A transparent or partly transparent image.** Samples with alpha under 128 are dropped; too few left is `region-invalid`.
- **The sampler waits behind renders.** The renderer concurrency queue is not bounded (as in `budget.ts`); the margin absorbs a short wait, and the sampler's own timeout starts when it runs.
- **A rolling deploy.** The previous image ignores the new columns; its drafts have a null stamp, which reads as "before".
- **Inline edit of a non-classic draft.** The edit can move text outside the regions. Inline edit keeps the stamp and runs no observation (it is not a generation); the notice shows only what the last generation recorded.
- **Scheduled, MCP and ACP.** Their briefs omit the field and get `classic`. The scheduler's Path B runs through `runPathBDesign` with a classic plan.

## Dependencies

- **005 item 3 (image provider resolution) is satisfied:** the oldest enabled provider is the fallback.
- **004's `npm run test:render` harness** (`tests/render/rasterize.ts`) exists and is extended.
- **008:** the art-director stays on `INTERNAL_BACKGROUND` (a fixed internal surface); `budget.ts` gains two step bounds.
- **012 / 019 / 023:** the draft columns and the revision writers they touched are re-read at HEAD; no overlap.
- **007 is soft:** it extends `src/lib/designData/`. It lands before or after this change without a rewrite.
- Merging to `main` is out of scope.

## Assumptions

- **A1:** both shipped image providers return `data:` URLs for the generated image (verified in `openai.ts` and `gemini.ts`); `persistDataUrlImage` stores them. The sampler works on the same bytes before or after persisting.
- **A2:** Prisma 5 writes SQL NULL for a nullable `Json` column through `Prisma.DbNull`, and reads it back as `null`.
- **A3:** `ctx.drawImage` with `imageSmoothingEnabled = false` gives point samples in the bundled Chromium. T3 proves it on a one-pixel-grid fixture.
- **A4:** the draft's `htmlContent` is the full final document, so a second page load for the layout observation sees what the export shows.
- **A5:** the E2E suites seed drafts without a stamp, so a null `composition` is the legacy shape and needs no edit.
- **A6:** `scripts/test-upgrade-path.mjs` migrates through every directory in `prisma/migrations`, so the new migration is covered without a script edit (T1 confirms).

## Notes

### Corrections to the proposal (re-derived at HEAD `2ad7431`, 2026-10-21)

1. **The busy rule is measured on CIE lightness, not linear luminance.** The proposal says "standard deviation of the luminance samples above 0.12". On WCAG relative luminance (linear light) a dark text region (the contrast rule needs `L <= 0.183` for light text) cannot reach a standard deviation of `0.12` at all (its maximum is about `0.09`), so the busy rule could never fire where it matters. The samples stay relative luminance (the contrast rule needs them); `evaluateRegions` derives `L*/100` for the busy rule. The `0.12` value is kept as the starting value and tuned on the fixtures.
2. **`evaluateRegions`' signature folds the mapped area into the samples** (`{ luminance, areaPct } | null`), because `region-invalid` needs the area after the mapping.
3. **`region-invalid` is nearly a degenerate case under a cover fit.** `max(canvasW/imgW, canvasH/imgH)` always covers the canvas, so a region inside the canvas is always inside the image. The `minAreaPct` and the sample-count rule still guard a degenerate or non-opaque image and a dataset mistake; the check stays fail closed.
4. **The mapping example, worked.** `1024x1536` on `1080x1350`: scale `1.0547`, scaled image `1080x1620`, offset `-135`; the visible part of the image is `y 128..1408`, so 128 image px at the top and the bottom never reach the canvas. That is the fixture T3 uses.
5. **Fixtures are committed as HTML sources, rasterized through the real renderer at test time,** not as binary PNGs. The pixels are exactly specified, there is no blob in git, and the real Chromium path is still the one under test. A limit: synthetic fixtures prove the mechanism, not the real-model thresholds. The real fallback rate is OP-1's evidence.
6. **A refine's `refine-replaced-image` applies only to a draft whose applied archetype is non-classic.** The proposal says "the draft is re-stamped"; for a draft that is already classic the notice would read nonsense.
7. **`RenderStamp`'s writers spread the stamp in five places** (`revisions.ts` twice, `generateDraft.ts` twice, `regenerate-design/route.ts`), and a nullable `Json` column cannot take a plain `null`. A `revisionStampFields` helper (mapping null to `Prisma.DbNull`) replaces the `...stamp` spreads. The proposal's "the same writer" holds.
8. **The budget module is a changed file the proposal omits.** The sampler (fixed bound) and the layout measurement (a page load, bounded by `SET_CONTENT_TIMEOUT_MS`) are new steps inside the generation and Regenerate design liveness segments, which `actionBudget.test.ts` gates. The proposal's "about 1 to 3 s and 1 to 2 s" is the typical time; the budget models the bound.
9. **Open question 3 (OpenAI tier mapping), checked 2026-10-21** against `developers.openai.com/api/docs/guides/image-generation`: `quality` accepts `low`, `medium`, `high` and `auto` (plus `xhigh` and `max` on two newer models). The page does not name `gpt-image-2`, so the mapping `standard` to `medium`, `high` to `high` is kept and confirmed at OP-1. The page says complex prompts may take up to two minutes, against our 120 s image bound (a `high` risk, recorded under Edge Cases).
10. **The layout observation uses text-node ranges, not element boxes.** A block element spans its container's width, so `getBoundingClientRect` on a heading would flag a correct post. "Logo" means the kit's logo `<img>` (`kit.logoUrl` and its LOGO artifacts); an inline-SVG logo is not covered (a known limit).
11. **A non-classic style on a `STORY` brief is accepted by the API** and recorded as `unsupported-size`, so the fallback row is reachable and tested; the wizard prevents it.
12. **The E2E suite letter is §AA.** §Z is change 023's scheduler-heartbeat suite; §AA is the next free letter in `docs/e2e-test-plan.md`.
13. **`PROMPT_VERSION` is at `'2026-10-11.1'` at HEAD** (`src/lib/agent/prompts/shared.ts:18`). The bump marks classic drafts too, with unchanged text (the golden test, AC-08).
14. **Line pointers at HEAD.** The proposal's code facts all re-check: `IMAGE_PROMPT_RULES` (`prompts/background.ts`), `backgroundLine` (`prompts/pathB.ts`), `runPathBDesign` (`agent/pathB.ts`), `OpenAIImageProvider.generateImage` (`providers/implementations/image/openai.ts`, no `quality`), `backgroundNotice.ts`, `sampleImageColors` (`renderer/puppeteer.ts`), `mockImageProvider` (`testHooks.ts:308`). Scheduler and MCP create briefs at `src/lib/scheduler/generationRunner.ts:73` and `src/mcp/tools/generate.ts:57` without the field, so they get `classic`. The image sizes are `1024x1024` and `1024x1536` for `SQUARE` and `PORTRAIT` (`imageCapabilities.ts`).
15. **The file estimate** (28 to 34) is re-counted in design.md: about 31 source and schema files, 5 new test files under `tests/unit`, 3 render and E2E files, and 5 docs.
16. **Image-step duration is not stamped.** party-visionary asked for it; the stamp shape is binding and has no such field. The step already logs `background ready in N s`. A later change can add a field.

### Party findings: all 35 upheld, each answered

| Finding                                                                           | Where it is answered                                                                                           |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| architect BLOCK: two sources of truth for the safe area                           | FR-02 (single source), FR-05 (closed decision), NFR-02, AC-07, AC-23                                           |
| architect BLOCK: quality storage, stale Impact list                               | FR-16 (env, `options.quality`, every changed file), AC-20, correction 15                                       |
| architect BLOCK: the rendered archetype never recorded, refine/regenerate unnamed | FR-12, FR-13, FR-14, AC-15 to AC-18                                                                            |
| architect WARN: nobody owns the module                                            | FR-02 (founding, 007 extends)                                                                                  |
| architect WARN: picking rules unspecified                                         | FR-03 (no auto, no kit list, API 400, server resolution at call time)                                          |
| architect WARN: no thresholds, coordinate space, tone                             | FR-07, FR-08, AC-09, AC-10, correction 1                                                                       |
| architect WARN: fallback undefined                                                | FR-04 table, FR-10, AC-06, AC-13                                                                               |
| architect WARN: no stub seam                                                      | FR-17, AC-21, AC-10 (pure function)                                                                            |
| architect NOTE: emptiness check on the final render is not the same check         | FR-11 (a DOM geometry check, separate)                                                                         |
| ba BLOCK: central evidence is one informal comparison                             | Overview (a hypothesis), OP-1 (the success bar)                                                                |
| ba WARN: Phase 1 contradicts its evidence                                         | Overview ("What this closes": causes 1 to 4, not 5)                                                            |
| ba WARN: no acceptance criteria                                                   | AC-01 to AC-25, OP-1                                                                                           |
| ba WARN: stale text asserts decided-against behaviour                             | proposal rewritten 2026-10-21; this spec follows it (no regenerate-once, no per-team quality, no Phase 3 flag) |
| ba WARN: "auto", "safe area" undefined                                            | FR-03 (no auto), FR-02 and FR-07 (region shape, units, mapping)                                                |
| ba NOTE: luminance and variance as a predictor is unverified                      | FR-08 (the WCAG pass rule), correction 5, OP-1                                                                 |
| po BLOCK: new look with zero default exposure, no stated value                    | Overview, FR-03 (per-post opt-in), OP-1; the do-nothing option is priced in the proposal                       |
| po WARN: allow-list, kit default, picker                                          | FR-03 (allow-list and kit default cut; picker kept on the user's word)                                         |
| po WARN: running cost unstated                                                    | FR-10 (no second image call), NFR-01, FR-16, design.md section 14                                              |
| po NOTE: quality as an env value                                                  | FR-16                                                                                                          |
| po NOTE: cut line, 005 first                                                      | Dependencies (005 satisfied); T4 ships the prompts, the check and the stamp together                           |
| security BLOCK: verifier region from the model                                    | FR-02, FR-05, NFR-02, AC-07, AC-23                                                                             |
| security WARN: check reads the image, not where text landed                       | FR-11, AC-14                                                                                                   |
| security WARN: archetype vs allow-list on every caller path                       | FR-03, FR-04 (the key is resolved against the dataset at call time, on every path that runs `runPathBDesign`)  |
| security WARN: the fallback is silent                                             | FR-12, FR-15                                                                                                   |
| security WARN: fires only on a measured failure                                   | FR-04, FR-09, AC-12                                                                                            |
| security WARN: quality spends money, no gate                                      | FR-16 (operator env only, closed enum, stamped)                                                                |
| security NOTE: prompts before the verifier ship the unchecked state               | T4 delivers the prompts, the check and the stamp in one task; nothing ships the prompts alone                  |
| visionary WARN: the decision is used once and thrown away                         | FR-12, FR-13                                                                                                   |
| visionary WARN: "until proven" with no recorded evidence                          | FR-12, design.md section 9 (the evidence query), correction 16                                                 |
| visionary WARN: key lifecycle                                                     | FR-02 (lifecycle), AC-03                                                                                       |
| visionary WARN: two sources of layout truth (kit prose)                           | FR-06 (precedence), AC-08                                                                                      |
| visionary WARN: one region, needs a list of typed regions                         | FR-02 (`Region[]` with `purpose`)                                                                              |
| visionary WARN: contracts with no post size                                       | FR-02 (per-size contracts, declared sizes), AC-02                                                              |
| visionary WARN: quality stores a provider's word                                  | FR-16 (a neutral tier each implementation maps)                                                                |
| visionary WARN: prompt-only variant leaves layout as prose                        | FR-02 (keyed data), FR-12 (the stamp)                                                                          |
