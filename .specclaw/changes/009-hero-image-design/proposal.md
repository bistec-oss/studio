# Proposal: Hero imagery and product-showcase design

**Created:** 2026-09-23
**Re-scoped:** 2026-10-21 (Phase 1, thin slice, after the party panel and the user's decisions of the same day)
**Status:** ✅ Approved (2026-10-21, architectural, thin-slice Phase 1). The writer's own calls stand as written: the layout half is recorded only, the success bar is 4 of 6, scheduler/MCP/ACP stay classic, and quality applies to styled posts only.

## Problem

**The product owner is dissatisfied with today's posts: they are flat.** On 2026-10-21 the user, who owns the product, said: "posts needs to be more flashy if required." That is the evidence for this change. It is one person's judgement, and it is a hypothesis about what would fix it, not a measured result. The change is therefore built to be checked by eye (see Success check).

"If required" is a per-post choice. Most posts are fine as they are today, and a few should be able to opt into a more striking look.

A side-by-side comparison on 2026-09-23 shows what "flashy" might mean (`evidence/`). It supports the Problem. It does not replace the user's statement.

- `bistec-studio-launch-v2.png`: a Bistec Studio post, hand-polished, with HTML/CSS cards over an AI background.
- `chatgpt-product-showcase.png`: ChatGPT, from a short prompt. A photoreal laptop shows the product UI, with a 3-step row, a call-to-action pill, depth and lighting.
- `chatgpt-glow-cards.png`: ChatGPT's generic glow style. 3D icons, neon, glassy feature cards.

The ChatGPT images have a hero subject with depth and lighting. Ours cannot, because of how the pipeline divides the work. Code facts, re-derived at HEAD (2026-10-21):

1. **The image step is constrained to backgrounds.** `src/lib/agent/prompts/background.ts` (`IMAGE_PROMPT_RULES`) asks for a "full-bleed BACKGROUND image" with "NO text, NO logos" and "calm/negative space". `src/lib/agent/prompts/pathB.ts` (`backgroundLine`) tells the design model to use it "as the full-bleed background layer" with "a subtle scrim". Nothing asks for a subject.
2. **The image and the layout are decided blind to each other.** `runPathBDesign` (`src/lib/agent/pathB.ts`) generates the background first, then the design model fits text over whatever came back. Nothing says where the image must be empty.
3. **There is no composition vocabulary.** Path B re-invents the layout on every generation. Proven structures such as the IRP "Editorial Split" exist only as prose in one kit's voice prompt.
4. **Image quality is never set.** `OpenAIImageProvider.generateImage` (`src/providers/implementations/image/openai.ts`) passes no `quality`, so every image runs at the provider default.
5. **The image model gets no reference images.** `generateImage(prompt, brandKitId, size)` ignores the kit and calls `images.generate` only. **This change does not close cause 5.** It needs Phase 2 (references, product screenshots), so a device screen showing the real product UI stays out of reach here. What this slice can change is subject, depth and layout. It cannot change what the screen shows.

## Proposed Solution

Give a brief a per-post **image style**. A non-classic style asks the image model for a hero subject, tells it exactly which part of the frame to leave empty, **checks the returned image against that contract**, and tells the design step to put the text and logo only in the empty part. Everything else stays HTML: the logo, the exact copy, inline edit, refine and version history.

**This slice is thin on purpose.** Two archetypes, one brief-level choice, one fallback, one env value.

### 1. The two archetypes, as keyed data

- `product-showcase`: a device or object as the subject, with a calm area for the text.
- `editorial-split`: a photographic scene confined to its own band, fading softly into a flat calm area for the text. This is the IRP rule, made measurable.
- **`classic`** is today's behaviour, unchanged: the full-bleed background and scrim path. It is the implicit default and has no entry in the dataset.

There is no kit allow-list and no kit default.

### 2. The design-data module

This change **founds** the module. It is `src/lib/designData/`, with an `index.ts` that exports the dataset. The top-level shape is:

```
designData = {
  composition: { archetypes: { <key>: Archetype } },
  // 007 adds its own sections beside `composition`: typography, kit rules.
}
```

**007 extends this module. It does not introduce a second one.** Neither section knows about the other's contents.

An `Archetype` entry holds:

- `key` (a string), `label`, `status: 'active' | 'retired'`;
- `current`: the current contract version number;
- `versions`: an immutable map from version number to a contract. A contract holds `role` (`'hero'`), `textTone` (`'light' | 'dark'`), and `sizes`, a map from post size (`SQUARE`, `PORTRAIT`, `STORY`) to `{ regions: Region[] }`.

A `Region` is `{ rect: { x, y, w, h } in canvas percent (0 to 100), purpose: 'text' | 'clear', minAreaPct }`.

- `text` is where the headline, body and logo go. It must be calm and must hold contrast against the declared `textTone`.
- `clear` is a region the image must leave calm, with no text placed on it.
- A later `composite` purpose (Phase 2, a blank device screen) is a new value of `purpose`, with no schema change.
- **`minAreaPct` is set per region** (starting value: 20% of the canvas for a text region). A unit test asserts every dataset region meets its minimum.

**Sizes.** An archetype declares only the sizes it supports. In this slice both support `SQUARE` and `PORTRAIT`, and **neither supports `STORY`**. An unsupported size resolves to classic and is recorded (fallback table, row 5). A test fails if a size is added to `ASPECT_DIMENSIONS` and an archetype is neither given a contract for it nor declared unsupported.

Starting values, to be fixed at plan and then tuned against fixtures:

- `product-showcase`, `SQUARE`: text region `{x:0, y:0, w:45, h:100}`, tone `light` (a dark calm area), subject in the right 55%.
- `editorial-split`, `SQUARE`: text region `{x:0, y:0, w:50, h:100}`, image band in the right 40%, with the fade inside the 50-60% strip.
- The `PORTRAIT` contracts are written separately. They are not scaled copies of the square ones.

**Safe-area regions come only from this dataset.** The prompts, the check and the stamp all read the one lookup. No model output supplies, widens or moves a region.

**Key lifecycle.**

- Keys are stored as plain strings, so a retired key needs no migration.
- A retired or unknown key resolves to classic and is recorded (fallback table, row 4).
- **A change to a contract bumps `contractVersion` and adds a new immutable version.** It never edits an existing version, so a stamped draft can always be resolved to the exact contract it was made under. Retiring an archetype stops new selection. It does not remove its versions.

### 3. The brief-level choice

One new field in the brief wizard: **`Image style: Classic (default) | Product showcase | Editorial split`**.

- It lives in the Size & Design step and is shown for Path B only. A Path A template brief has no image step.
- The `STORY` size shows the two non-classic options as disabled, with a line saying why.
- It is stored on the brief as `Brief.imageStyle`, plain TEXT, default `classic` (a migration). The brief autosave payload gains the same optional field.
- **There is no "auto".** The brief picks a style or it is classic. The art-director never chooses an archetype.
- **This keeps a small picker against party-po's cut** (party-po wanted the picker removed and "auto" only). The user chose it on 2026-10-21, and "auto" has no one to decide it: the owner's ask is "flashy if required", so the person who requires it picks it. Scheduled, MCP and ACP callers have no picker in this slice and are always classic.
- The API treats an explicit unknown or retired key on brief creation as a 400. A stored key that is later retired resolves to classic and is recorded.

### 4. The art-director, and what the prompts say

For a non-classic style, the Haiku art-director step (`INTERNAL_BACKGROUND`, unchanged and fixed) writes the image prompt for the chosen archetype.

- **The decision's schema is closed.** It returns `{ needed, prompt }` and nothing else is read. Any `archetype`, `safeArea`, `regions` or `role` field in the reply is ignored and discarded. The brief's key is the only archetype source. For a non-classic style, `needed: false` is also ignored: the user asked for an image. An empty prompt is the "no image" exit.
- **The image prompt** replaces the "full-bleed BACKGROUND" rules with hero rules. It names the subject type, states each region in measurements generated from the dataset ("the left 45% of the frame must be an empty, calm, dark area"), and keeps "no text, no logos, no numbers".
- **The design prompt** states that the image is the full-canvas background with `background-size: cover` and `background-position: center`. This is the same fit the check assumes. It states that text and logo go only inside the `text` regions, and that the scrim is for the `classic` path only.
- **Precedence.** The prompt says: when an image style is chosen, **its layout contract outranks any layout instruction in the brand voice prompt or the campaign briefing.** The kit's colours, fonts, logo and wording rules still apply. Classic leaves that prose untouched.
- `PROMPT_VERSION` is bumped. The region and tone text is generated from the dataset, so it cannot drift from the check.

### 5. The check, and what it does on failure

Two parts, so the decision logic is testable without a browser or a model.

**A pure function** `evaluateRegions(samples, regions, textTone) → verdict`, in `src/lib/designData/` beside the dataset.

- Input: for each region, an array of luminance samples (0 to 1) already taken from the image.
- Output: `{ ok: true }` or `{ ok: false, reason: 'busy' | 'contrast' | 'region-invalid', region }`.
- **Thresholds**, as named constants. They are starting values, to be tuned on the committed fixtures:
  - **Busy.** The standard deviation of a region's luminance samples is above 0.12. A `clear` region and a `text` region use the same rule.
  - **Contrast.** For a `text` region, the WCAG contrast ratio (relative luminance, `(L1 + 0.05) / (L2 + 0.05)`) between the archetype's declared text tone (`light` = white, `dark` = near-black) and each sample. The region fails when fewer than 95% of the samples reach 4.5:1.
  - **Region invalid.** A region whose area, after the mapping below, is under its `minAreaPct`, or that cannot be resolved. This counts as a failed check.

**A sampling step** in `src/lib/renderer/puppeteer.ts`, beside `sampleImageColors`. It loads the hero image on a page, draws it to a canvas, and returns the luminance samples for each region (a grid capped at about 4,000 points per region). It has a fixed timeout.

- **Coordinate mapping.** Regions are canvas percentages. The step maps them onto the image through the same fit the design uses: scale by `max(canvasW / imgW, canvasH / imgH)`, centre, and clip to the image. The mapping is a pure function, unit-tested on both sizes. The 1024x1536 image on a 1080x1350 canvas is the case that matters.

**The check fails closed.** Only an explicit, completed pass keeps the archetype. Every other exit takes the classic fallback:

| Exit                                                         | Resolved archetype | Image used                                                       | Recorded `fallbackReason` |
| ------------------------------------------------------------ | ------------------ | ---------------------------------------------------------------- | ------------------------- |
| Check completes and fails the busy rule                      | classic            | the hero image, reused as the classic background                 | `busy`                    |
| Check completes and fails the contrast rule                  | classic            | the hero image, reused                                           | `contrast`                |
| A region is invalid (below its minimum area, unresolved)     | classic            | the hero image, reused                                           | `region-invalid`          |
| The check errors or times out (sampler or page error)        | classic            | the hero image, reused                                           | `check-error`             |
| No image returned (no provider, a provider error, no prompt) | classic            | none (today's CSS/SVG path, plus the existing background notice) | `no-image`                |
| Unknown or retired key                                       | classic            | the normal classic image, from the classic prompt                | `unknown-archetype`       |
| Unsupported size for the archetype                           | classic            | the normal classic image                                         | `unsupported-size`        |

- **The fallback reuses the hero image. It makes no second paid image call.** The classic design prompt (full-bleed background, scrim) is used with it. A busy subject under a scrim is a worse post than a clean classic one, and that cost is accepted so that a fallback never doubles the image spend. The user's side-by-side comparison will show whether it is acceptable (Open Questions).
- The last two rows are decided before any image is requested, so the image call, if any, is the classic one.
- **Refine.** When a refine instruction generates a new background (today's `generateBackgroundForRefine`), no check runs on it, and the draft is re-stamped `appliedArchetype: classic`, `fallbackReason: 'refine-replaced-image'`.

### 6. The layout half: a stamped observation, not a fallback

After the final render, the page's DOM is read in Puppeteer: the bounding rects of the text elements and the logo `<img>` are compared with the stamped `text` regions, with a 2% tolerance. A rect outside the regions records `layout-violation` in the stamp's `observations`. The draft page shows the notice.

**This slice records the violation. It does not fall back.** The reasons:

- A fallback here would need a second full design call (the slowest step in the pipeline, up to several minutes), on a rule with no real-render data behind it. The pixel check runs before the design call and costs seconds. This one would cost minutes.
- Bounding rects of decorative elements, shadows and wrapped lines are not yet a trusted signal. A false positive would throw away a good post.
- The stamp gives the evidence to promote it to a fallback in a later change, if the observation proves reliable on real renders.

**This is my decision, not the user's** (flagged in the summary).

### 7. The stamp

Every draft and every revision stores a **composition stamp**, next to `promptVersion` (`Draft.composition` and `DraftRevision.composition`, nullable JSON; null means "made before this existed"):

```
{
  requestedArchetype: 'classic' | <key>,
  appliedArchetype:   'classic' | <key>,
  contractVersion:    <n> | null,
  fallbackReason?:    'busy' | 'contrast' | 'region-invalid' | 'check-error'
                    | 'no-image' | 'unknown-archetype' | 'unsupported-size'
                    | 'refine-replaced-image',
  observations?:      ['layout-violation'],
  imageQuality:       'default' | 'standard' | 'high'
}
```

The stamp is written by the same writer that stamps `promptVersion` and the model (`src/lib/drafts/revisions.ts`), so a restore or "Use anyway" copies it back, as it does the other stamps.

**These stamps are the evidence that "proven" refers to.** Whoever proposes flipping a default, or Phase 2, starts from the count of non-classic requests and their applied archetypes and fallback reasons.

**Same-change co-changes** (they read the stamp, and are part of this change, not follow-ups):

- **Refine** (`src/app/api/drafts/[id]/refine/route.ts` and its prompt builder): when the current revision's stamp has `appliedArchetype` other than classic, the refine prompt states the stamped contract's `text` and `clear` regions (resolved at the stamped `contractVersion`) and that edits keep text and logo inside them.
- **Regenerate design** (`src/app/api/drafts/[id]/regenerate-design/route.ts`, through `runPathBDesign`): it re-resolves from `Brief.imageStyle`, runs the new image and the check, and writes a new stamp. A retired key, or a newer `contractVersion`, is the expected, recorded outcome.
- **Inline edit and restore** keep the stamp of the revision they show.

### 8. A visible notice

The draft page shows a notice when the stamp has a `fallbackReason` or a `layout-violation`, next to the existing background notice (`src/lib/drafts/backgroundNotice.ts`). It is a pure function of the stamp, so it is unit-tested. Plain wording, for example: "Product showcase could not be used for this post (the image was too busy where the text goes), so the classic style was used."

### 9. Quality

**The default is the provider's, unchanged.** A new env value `IMAGE_QUALITY` takes a neutral tier, `standard` or `high`, or is unset. An unknown value is treated as unset. There is no per-team storage and no UI.

- The OpenAI implementation maps `standard` to its `medium` and `high` to its `high`. The Gemini implementation ignores the tier.
- **The ImageProvider change: an optional `options.quality` on `generateImage`** (the chosen route; the alternative, a construction-time setting, would also change `tools.ts` and the legacy `/api/generate/image` route's images, which this change should not touch). The method becomes `generateImage(prompt, brandKitId?, size?, options?: { quality?: 'standard' | 'high' })` and returns `{ url, quality? }`, where `quality` is the tier the provider actually applied.
- **Every implementation and call site that changes:**
  - `src/providers/interfaces/ImageProvider.ts`: the signature and return type;
  - `src/providers/implementations/image/openai.ts`: maps the tier to its `quality` parameter and returns the tier it applied;
  - `src/providers/implementations/image/gemini.ts`: accepts the option, ignores it, returns no tier;
  - `src/lib/agent/background.ts` (`runBackgroundStep`): the **only** caller that passes `options`, and only when the resolved archetype is not classic, so classic images stay exactly as today;
  - `src/lib/testHooks.ts` (`mockImageProvider`): its wrapper keeps the signature and ignores the option;
  - `src/lib/env.ts` and `.env.example`: the `IMAGE_QUALITY` value;
  - **unchanged:** `src/lib/agent/tools.ts` and `src/app/api/generate/image/route.ts` pass no options.
- **The quality used is stamped** (`imageQuality`: `default` when no tier was applied).

### 10. Test seams

- **Unit.** `evaluateRegions` with synthetic samples (pass, busy, contrast, region-invalid, the threshold edges); the canvas-to-image mapping on both sizes; the dataset invariants (minimum areas, every size accounted for, immutable versions); the decision parser (extra fields ignored); the notice and stamp writers.
- **Real render.** `npm run test:render` (004's harness) on committed fixture images: one calm, one busy, one low-contrast. This proves the sampler on real pixels, which the mock suite cannot see (`MOCK_PUPPETEER` never rasterizes).
- **Mock suite.** New sentinels read from the same text the existing `__MOCK_BG__` seam reads (the brief topic, `backgroundSeamText`): they drive a chosen decision and a chosen fixture image. They cover pass, busy, check-error and no-image, so both the kept archetype and every fallback row run in E2E. They are dormant outside `MOCK_AI`, like the existing seams. The sampler's mock returns synthetic samples under `MOCK_PUPPETEER`.

## Success check

The hypothesis is that a non-classic style makes a post flashier and still on brand and legible. It is checked by eye, by the user, against a fixed set of briefs.

1. Fix **six briefs** (three per size, `SQUARE` and `PORTRAIT`, covering announcement, event and product content).
2. Render each under classic, `product-showcase` and `editorial-split`, with real models, in one operator session. The build makes no real model calls, so this is the verify step's manual part.
3. The user compares each non-classic render with its classic one and records "better", "same" or "worse".
4. **The hypothesis holds if the user prefers a non-classic render on at least four of the six briefs.** The number is my starting proposal, to be confirmed at plan.
5. The stamps for those runs record how often the check kept the archetype and why it did not.

If the hypothesis fails, the change stays opt-in and nothing flips. A failed check is a result, not a defect.

## Do nothing

Posts stay as they are, and the product owner stays dissatisfied. Nothing else gets worse: classic keeps working, and no cost changes. The price of waiting is that the one concrete request on the table, "more flashy if required", goes unanswered, and the evidence needed to judge a hero look is never collected.

## Scope

### In Scope

- the design-data module `src/lib/designData/` with the `composition` section, the two archetypes, region types, per-size contracts and contract versions;
- `Brief.imageStyle`, and the wizard choice (Path B only), the review row, the brief create validation and the autosave payload;
- the art-director and design prompt builders for a non-classic style (`PROMPT_VERSION` bump), and the precedence line;
- the pure `evaluateRegions` and mapping functions, and the Puppeteer sampling step;
- the fail-closed fallback table, reusing the hero image;
- the layout observation (`layout-violation`);
- the stamp on `Draft` and `DraftRevision` (one additive migration, with a down script), written by the revision stamp writer;
- the refine and regenerate-design co-changes;
- the draft-page notice;
- `IMAGE_QUALITY`, the optional `options.quality` on `generateImage`, and the stamp of the quality used;
- tests: unit, `test:render` fixtures, the mock seam and E2E;
- docs: `.env.example`, `docs/handoff.md`, `CLAUDE.md`.

### Out of Scope

- **Phase 2:** reference images for the image model, the OpenAI edit endpoint, product screenshots on device screens, and a `composite` region in use (a later change).
- **Phase 3:** the experimental full AI render (a later change).
- "Auto" archetype selection, by the art-director or by a kit default.
- A kit allow-list, a kit default and any kit-admin UI.
- Regenerate-once on a failed check (the user chose a direct fallback).
- A per-team quality setting, its storage and its UI. `IMAGE_QUALITY` is a system value.
- A layout-violation fallback. The slice only records it.
- The `STORY` size for non-classic styles.
- The picker for scheduled, MCP and ACP callers.
- New image providers, and the `isDefault` resolution fix (**005**, already shipped).
- Converting kit prose into measurable rules and the typography dataset (**007**; it extends the module this change founds).
- Video, motion, and the app's own UI (**011**).

## Dependencies

- **005 item 3 (image provider resolution) is satisfied.** The oldest enabled provider is now the fallback, so a teammate without a personal OpenAI key still gets an image.
- **004's rasterizing harness (`npm run test:render`)** exists and is needed for the sampler fixtures.
- **008**: the art-director stays on the fixed internal model (`INTERNAL_BACKGROUND`). No model surface is added.
- **007** is soft: this change founds `src/lib/designData/`, and 007 adds its sections beside `composition`.

## Impact

- **Size:** architectural (spike / bounded / architectural). A new design-data module, an additive migration on three tables' worth of fields, a provider interface change, and changes to the prompts and to refine and regenerate.
- **Files affected:** about 28 to 34 (estimated): the schema, migration and down script (3); the design-data module and its tests (3 to 4); the prompt builders (2); `background.ts`, `pathB.ts`, `generateDraft.ts` (3); the sampler and layout measurement in `puppeteer.ts` (1); the provider interface and two implementations (3); `testHooks.ts` and `env.ts` (2); the wizard and review row, the brief create route and the autosave payload (about 6); the stamp writer, the draft GET route and its types (3); the notice and its component (2); the refine and regenerate-design routes (2); fixtures, E2E and docs (about 4).
- **Complexity:** large.
- **Posts that change under the default: none.** Classic is the default and is unchanged. Only a brief that picks a non-classic style takes the new path.
- **Added latency, non-classic only:** one sampling pass of roughly 1 to 3 seconds before the design call, and one layout measurement of roughly 1 to 2 seconds after it. The image call and the design call are unchanged. Classic adds nothing.
- **Added tokens, non-classic only:** the art-director prompt gains the archetype's image contract (roughly 300 to 500 tokens, Haiku). The design prompt gains the contract (roughly 250 to 400 tokens). Refine gains the region text (about 150 tokens). No new model call is added.
- **Image spend lost on a fallback: none.** The hero image is reused as the classic background, and no second image call is made. A `high` tier raises the cost of every non-classic image, and only those, while `IMAGE_QUALITY` is set.
- **Risk:** medium. The default path is untouched, so the risk sits in the opt-in path: a threshold set too tight makes the fallback fire on every post, which looks like the feature working. The stamp and the visible notice exist so that is visible, and the thresholds are tuned on fixtures. The change is revertible before any brief picks a style. After that, the stored `imageStyle` values and stamps remain as inert data.

## Open Questions

- **Threshold tuning.** The busy and contrast numbers are starting values. They are tuned on the committed fixtures at plan, and the real-model comparison shows the fallback rate. **Default: the values above.**
- **The reused hero image under a classic scrim.** Is a busy hero subject under a scrim acceptable on a fallback, or is a plain CSS/SVG design better? **Default: reuse (no second spend), and the user's comparison decides.**
- **OpenAI tier mapping.** Confirm against the current gpt-image-2 docs at plan that `medium` and `high` are the accepted `quality` values. **Default: `standard` is `medium`, `high` is `high`.**
- **Scheduled and MCP/ACP briefs.** They are always classic in this slice. **Default: no picker, no parameter.**

## Party panel (2026-10-21, deep, CHANGES_REQUESTED): the upheld findings

- (party-architect, BLOCK) The safe area has two sources of truth: the archetype dataset and the model's decision — see party-report.md
- (party-architect, BLOCK) The per-team quality setting has no named storage or route to the provider, and the Impact list does not match the Phase 1 decisions — see party-report.md
- (party-architect, BLOCK) The archetype that actually rendered is never recorded, and refine and regenerate are unnamed co-changes — see party-report.md
- (party-architect, WARN) Nobody owns the design-data module: this change creates it, but 007 is said to own it — see party-report.md
- (party-architect, WARN) The rules for picking an archetype (auto, kit default, allow-list) are not specified — see party-report.md
- (party-architect, WARN) The safe-area check has no thresholds, no coordinate space, and no text colour to measure contrast against — see party-report.md
- (party-architect, WARN) It is not defined what the fallback to `classic-background` renders, or what happens when no image comes back — see party-report.md
- (party-architect, WARN) The only named test seam is a real-render test; the decision and fallback logic has no stub seam — see party-report.md
- (party-architect, NOTE) Rebuttal to party-visionary: an emptiness check on the final render is not the same check, so it cannot cover both halves — see party-report.md
- (party-ba, BLOCK) The central evidence is one informal comparison against a different product, with no baseline showing users see "flat" posts as a problem — see party-report.md
- (party-ba, WARN) The proposal's Phase 1 contradicts its own evidence: the ChatGPT look depends on a photoreal hero subject and real product UI, which are excluded — see party-report.md
- (party-ba, WARN) No acceptance criteria, so the main claim (posts look less flat) has nothing to fail against — see party-report.md
- (party-ba, WARN) The proposal's own text still asserts the decided-against behaviour and the per-team Phase 3 and quality scope, so the stated scope is inconsistent — see party-report.md
- (party-ba, WARN) "Auto" archetype selection has no stated chooser or behaviour, and "safe area" and "measurable" are undefined — see party-report.md
- (party-ba, NOTE) The assumption that a safe-area luminance and variance check detects a usable text region is unverified — see party-report.md
- (party-po, BLOCK) Phase 1 ships a new look with zero default exposure and no stated value for what it builds — see party-report.md
- (party-po, WARN) Per-kit allow-list, kit default, and brief-level picker are optionality nobody asked for — see party-report.md
- (party-po, WARN) Running cost is unstated and the Impact section contradicts the decisions — see party-report.md
- (party-po, NOTE) Quality setting could be an env or config value instead of a per-team setting — see party-report.md
- (party-po, NOTE) The safe-area check is a separable cut line, and 005 item 3 should ship first — see party-report.md
- (party-security, BLOCK) The verifier's region comes from the model it is checking — see party-report.md
- (party-security, WARN) The check reads the image and never where the text actually landed — see party-report.md
- (party-security, WARN) An archetype from the brief or from auto is not stated to be checked against the kit allow-list — see party-report.md
- (party-security, WARN) The fallback to classic-background is silent and leaves no record — see party-report.md
- (party-security, WARN) The fallback only fires on a measured failure, so a check that cannot run passes — see party-report.md
- (party-security, WARN) The per-team quality setting spends money but names no permission gate — see party-report.md
- (party-security, NOTE) Rebuttal to party-po: shipping archetype prompts before the verifier ships the unchecked failure mode as the live state — see party-report.md
- (party-visionary, WARN) The layout decision is used once and thrown away, so every later edit of the draft works blind to it — see party-report.md
- (party-visionary, WARN) "Until proven" is the gate for the default flip and for Phase 2, and nothing records the evidence — see party-report.md
- (party-visionary, WARN) Archetype keys become persisted references with no rule for retiring or revising them, which breaks the "independently revertible" claim — see party-report.md
- (party-visionary, WARN) Layout now has two sources of truth: the archetype contract and the kit and briefing prose that already state layout rules — see party-report.md
- (party-visionary, WARN) The layout contract allows one region, but the starting set already needs two and Phase 2 needs a third kind — see party-report.md
- (party-visionary, WARN) The archetype contracts are percentages with no post size, so every future size change must re-audit every archetype — see party-report.md
- (party-visionary, WARN) The per-team `quality` setting stores one provider's parameter in a provider-neutral place — see party-report.md
- (party-visionary, WARN) Rebuttal of party-po's prompt-only variant: cheap to build, but it leaves layout as prose in the prompt builders, the pattern this proposal names as the cause — see party-report.md

**Resolution (2026-10-21).** Each BLOCK maps to the section that answers it:

- party-architect, two sources of truth for the safe area: **Proposed Solution 2** (regions only from the dataset) and **4** (the decision schema is closed, model-supplied regions are ignored).
- party-architect, quality setting storage and the Impact list: **Proposed Solution 9** (the env value, the optional `options.quality`, every changed file) and **Impact**.
- party-architect, the rendered archetype never recorded: **Proposed Solution 7** (the stamp on the draft and each revision, and the refine and regenerate-design co-changes).
- party-ba, no evidence for "flat": **Problem** (the product owner's statement, restated as a hypothesis) and **Success check**.
- party-po, a new look with no default exposure and no stated value: **Problem** (the owner's request), **Proposed Solution 3** (a per-post opt-in, with the picker kept on the user's word against the cut), **Do nothing** and **Impact**.
- party-security, the verifier's region from the model: **Proposed Solution 2 and 4** (dataset-only regions, a minimum area per region, a closed decision) and **5** (fail closed, region-invalid is a failed check).

The WARNs and NOTEs are answered in the same sections, plus **5** (thresholds, mapping, the fallback table, test seams), **6** (the layout half) and **8** (the visible notice).
