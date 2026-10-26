# Spec: v2 final polish before the merge to main

**Change:** 031-v2-final-polish · **Size:** architectural
**Created:** 2026-10-26
**Governed by:** `proposal.md` → "User Decisions (2026-10-26, asked before drafting)" and "User Decisions after the panel (2026-10-26)". Where the Proposed Solution and the decisions differ, the decisions win. Group G is scoped by `wording-scan.md` (W-01 to W-41).

## Overview

The last change on `v2` before the merge to `main`. It finishes every remaining candidate and leftover, in eight groups:

- **A:** Apply the edited headline to the image with no model call.
- **B:** The full Google Fonts catalogue for posts, and script fonts (Sinhala).
- **C:** The personal image generation key (OpenAI or Gemini).
- **D:** Spotlight SQUARE v2, with the real-image check OP-031.
- **E:** Typography rules, and a second host for the review panel.
- **F:** The assistants (post styles in the schedule; fonts applied).
- **G:** UI wording.
- **H:** The leftovers.

**The cut line (P1): nothing slips.** Every group passes before the merge. A real check that returns `fail` (OP-031) is a result, not a broken group, and does not hold the merge.

**Build order (OQ5):** H, G, C, then B, E, F, then A, then D. The full mock E2E suite also runs right after G, before the feature groups.

## Approach

- **A** is one pure module (`src/lib/applyText/`): parse5 for candidates by source position only, an offset splice, and a re-parse check. One claimed action (`APPLY_TEXT`) commits only through `commitDraftRevision`, so Undo restores the styled HTML. A new hook on the commit rejects the render before anything is uploaded or written. Apply is named by field (`field: 'headline'`).
- **B** replaces the list of 100 with a committed catalogue snapshot behind one lookup (`src/lib/fonts/`). The snapshot has a date and a refresh contract. Code, not the model, injects the font request and the script-font stacks into the design HTML. The render reports fonts that did not load.
- **C** adds a `provider` column to the existing `UserOpenAiKey` table and one shared prefix detector. The resolver's personal tier serves either provider and falls back once to the team.
- **D** adds `spotlight` v2 to the dataset without moving `current`. OP-031 reaches v2 through the super-admin probe route. Only a pass moves `current`.
- **E** adds a `typography` category to the 007 authoring dataset, plus two code-checked kit rules. The upgrade runner is generalised over its host, and the campaign briefing gets its own route.
- **F** changes the two assistant block grammars. The schedule's style list is built from the post-style dataset, and the brand-kit Apply is one all-or-nothing server route.
- **G** fixes W-01 to W-41. The glossary lives in `DESIGN_SYSTEM.md`, and a deny-list test stops the drift.
- **H** fixes three leftovers: temp-dir cleanup by exact path, one shared lost-claim cleanup, and the AC-17 recheck.

## Requirements

### Functional Requirements

#### Group H: Leftovers

- **FR-01 — No leftover temp dirs.**
  - `spawnCwd` in `src/lib/agent/claudeCli.ts` keeps the exact path it created with `mkdtemp`.
  - It removes that path in a `process.once('exit')` handler with `rmSync(path, { recursive: true, force: true })`.
  - Nothing sweeps by the `bistec-cli-` prefix or a glob.
  - The three spawning unit tests (`claudeCliArgs`, `lookCheck`, `visionCli`) leave no new `bistec-cli-*` directory in `os.tmpdir()`.
- **FR-02 — One lost-claim cleanup.**
  - Extract `discardOnLostClaim(err, uploadedKey, why)` in `src/lib/drafts/revisions.ts`. It deletes only the object key this run uploaded, never the draft's current `exportUrl`.
  - It is used by `commitDraftRevision`, `recordRejectedRender` and `regenerate-design/route.ts`. The latter wraps its revision transaction and deletes `result.exportUrl` (the key `runPathBDesign` uploaded in this run) when the guarded write throws `DraftClaimLostError`.
  - The 019 orphaned-PNG leftover is closed.
- **FR-03 — AC-17 recheck.**
  - Build the image locally (the runner is `node:22-alpine`).
  - `docker run --rm --entrypoint claude <image> --version` prints `2.1.287 (Claude Code)` with no `EBADENGINE` warning in the build log.
  - Record the output in the task report and the 005 verify-report follow-up line.
- **FR-04 — UI reference screenshots.** Recapture `docs/ui-reference/screen-light.png` and `screen-dark.png` with 011 T13's method: the draft review page at 1440 x 1120, `nextjs-portal` hidden, light and dark, newest EXPORTED draft on a mock server. This is done last (T19), after every UI change.

#### Group G: Wording

- **FR-05 — The glossary.** A new `DESIGN_SYSTEM.md` §12 "Words" holds the glossary as rules, each with an applies list and a does-not-apply list:

  | Rule                                                       | Applies to                                                                                                                                                                                | Does not apply to                                                                                                                                                                    |
  | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | **post**, not "brief"                                      | page titles, buttons, lists, toasts, empty states and errors for the thing a user creates (`/brief` page title "New post"; "Create post"); the Content step's text field is "Description" | routes (`/brief`), API fields, Prisma models (`Brief`, `Post`), analytics names, code, docs about code. The publish record is "published post" in the UI where it must be told apart |
  | **Template** / **Freeform**, not "Path A" / "Path B"       | every UI label, column and badge                                                                                                                                                          | `designMode` values, code, docs about code, E2E test names                                                                                                                           |
  | **Brand kit** (sentence case; "brand kits" plural)         | all UI text, the nav item, model-catalogue labels shown in the UI                                                                                                                         | route segments (`/admin/brandkits`), code identifiers                                                                                                                                |
  | **Team settings**                                          | the `/team` page title, nav and every pointer to it ("Team settings > AI providers")                                                                                                      | the route `/team`                                                                                                                                                                    |
  | **Captions** / **Images** for the `COPY` / `IMAGE` slots   | `/team` toggles, tags, headings and server messages shown to users. Helper text: "Captions: writes captions and headlines."                                                               | the enum values `COPY` and `IMAGE`                                                                                                                                                   |
  | **Image generation key**                                   | the personal key card and every pointer to it                                                                                                                                             | the route `/api/me/openai-key`, the table `UserOpenAiKey`                                                                                                                            |
  | **Sentence case** for labels, headings, buttons and titles | all UI                                                                                                                                                                                    | proper nouns and product names (Instagram, LinkedIn, OpenAI, Gemini, Claude)                                                                                                         |
  | **US spelling** (color, organize)                          | all UI text and user-facing messages                                                                                                                                                      | code identifiers already in use, Prisma fields                                                                                                                                       |

- **FR-06 — The deny-list test.**
  - Add `tests/unit/uiWordingGuard.test.ts`. It scans only string literals and JSX text in `src/app/(app)/**` and `src/components/**`; comments are excluded.
  - It fails on: `Path A`, `Path B`, `Brand Kit`, `Brandkits`, `Brand-kit`, `copy provider` (any case), `COPY provider`, `colour`, `Organise` and `New Brief`. `OpenAI key` joins the list in group C, once the card is renamed (T5).
  - A line opts out only with `// wording-exception: <reason>`.
  - The test has self-tests: it flags each pattern, honours the exception, and ignores comments. It follows `uiTokenGuard.test.ts`'s structure.
- **FR-07 — The scan items.**
  - Each of W-01 to W-41 is either fixed or recorded as dropped, with a reason, in a table in `reports/T3.md` ("W-nn | fixed in <file> | <commit>" or "W-nn | dropped | <reason>").
  - W-01, W-02 are fixed by group C, W-13 by group F, W-16 by group F and W-19's Apply mention by group A. Their rows name that task.
  - The MEDIUM items use the scan's suggested text unless the glossary changes it.
  - W-25 inlines the missing facts and drops the repo path. The facts are: a Pro, Max, Team or Enterprise plan is needed, and the free plan does not work.
  - W-39 to W-41 fix the docs, the seed script comment and the `schema.prisma` comment.
- **FR-08 — Early E2E.** After group G, the full clean mock E2E suite runs. Any locator that matched changed text is adapted in the same task (listed in the report), never deleted.

#### Group C: Personal image generation key

- **FR-09 — One prefix detector.**
  - `detectKeyProvider(key): 'anthropic' | 'openai' | 'gemini' | null` in `src/providers/keyPrefix.ts` (pure, client-safe).
  - The order is: `sk-ant-` gives anthropic, `sk-` gives openai, `AIza` gives gemini, anything else gives null.
  - `src/app/(app)/team/page.tsx` and `src/app/api/admin/providers/route.ts` call it; both local `detectProvider` copies are deleted.
  - The labels map from the result in one place: "Claude (Anthropic)", "OpenAI" (W-03), "Gemini (Google)".
- **FR-10 — Data shape (P4).**
  - Add `provider TEXT NOT NULL DEFAULT 'openai'` to the existing `UserOpenAiKey` table. The table, the route `/api/me/openai-key` and its existing response fields keep their names.
  - The existing rows become `openai` through the default; no row is rewritten.
  - The down script deletes rows whose `provider <> 'openai'`, then drops the column. The release note says those users must re-enter their key after a rollback.
- **FR-11 — Save.** `PUT /api/me/openai-key` detects the provider:
  - `openai` must match `^sk-(?!ant-)[A-Za-z0-9_-]{20,}$`;
  - `gemini` must match `^AIza[0-9A-Za-z_-]{30,}$`;
  - anything else (null, `anthropic`, or a malformed key) is a 400: "Paste an OpenAI key (starts with sk-) or a Gemini key (starts with AIza)."
  - It never defaults. It stores the detected provider.
  - GET and PUT responses gain `provider: 'openai' | 'gemini'` when connected (`OpenAiKeyInfo` in `api-types.ts`).
- **FR-12 — Resolve.**
  - `resolveImageProviderWithSource(ctx, providerKey?)` returns `{ provider, tier: 'personal' | 'team', providerName } | null`. `resolveImageProvider` becomes a thin wrapper over it.
  - The personal tier instantiates `row.provider`.
  - **Precedence:** an ACTIVE personal key always comes first, whatever its provider, then the team tiers as today.
  - Scheduled runs (`userId: null`) never reach the personal tier.
- **FR-13 — Fall back once, with a notice (P4).** In `src/lib/agent/background.ts`, when the personal-tier provider throws during `generateImage`:
  1. it retries once with the team tiers (`userId: null`). The hero image and the background both follow this rule;
  2. an HTTP 401 or 403 from the provider also marks the personal row INVALID (`markUserOpenAiKeyInvalid`, now wired);
  3. the draft records `Draft.imageSource = { tier, provider, personalFailed?: true }` for the image that ran, or `{ tier: 'personal', provider, personalFailed: true }` with the existing `PROVIDER_ERROR` skip when the team has no provider.
- **FR-14 — The notice.**
  - `GET /api/drafts/[id]` returns `imageSourceNotice: { message } | null`, which is set only when `personalFailed`. The text is: "Your image generation key ({OpenAI|Gemini}) failed, so the team's image provider made this image." When no team provider was available, the existing skip notice says instead: "Your image generation key ({provider}) failed and the team has no image provider, so this post has no AI image."
  - The draft page shows it in the existing `Notice` pattern.
- **FR-15 — The card (W-01, W-02).**
  - `OpenAiKeyCard` becomes "Image generation key": "Your own OpenAI or Gemini key. When connected, it makes every image you generate, before the team's provider."
  - It shows the detected provider next to the masked suffix ("Gemini …a1b2"). The placeholder is `sk-… or AIza…`.
  - `/team` reads "Teammates without a personal image key …".
  - `backgroundNotice.ts` `NO_PROVIDER` reads "Add an image generation key in Settings …".

#### Group B: Fonts for posts

- **FR-16 — The snapshot (P2).**
  - `src/lib/fonts/catalogue.json` is generated, never hand-edited. It holds `{ snapshotDate, source, families: [{ family, category, weights: number[], italics: boolean, scripts: string[], delisted?: true }] }`.
  - `category` is Google's category (`sans-serif`, `serif`, `display`, `handwriting`, `monospace`). `scripts` are Google's subset ids (`latin`, `sinhala`, …).
  - It is built by `scripts/refresh-google-fonts.mjs` from Google's public metadata, `https://fonts.google.com/metadata/fonts` (no key). This is an operator script, never run in CI.
- **FR-17 — The refresh contract.**
  - A refresh never removes a family. A family that is in the previous snapshot and missing from the new data is kept with `delisted: true`. A delisted family that reappears loses the flag.
  - It writes the new `snapshotDate`.
  - The refresh logic is a pure function, `mergeCatalogue(previous, fetched, date)`, and is unit-tested.
- **FR-18 — One lookup.**
  - `src/lib/fonts/catalogue.ts` is server-only: `findFamily(name)` matches exactly, case-sensitive, `searchFamilies(query, limit)`, `familiesForScript(script)` and `CATALOGUE_DATE`.
  - Every font reader and writer goes through it.
  - `src/components/admin/brandkits/googleFonts.ts` (the list of 100) is deleted, and `uiTokenGuard.test.ts`'s exemption for that path is removed with it.
- **FR-19 — The font request.** `googleFontsUrl(families)` in `src/lib/fonts/url.ts`, a pure function, builds one `css2` URL:
  - a known family with one weight and no italics gets `family=Name` with no axis;
  - a known family with several weights gets `:wght@` with its real weights, at most 400 to 700 when present, and otherwise its own list;
  - a family with italics gets `:ital,wght@`;
  - an unknown family gets `family=Name` (Google's default) and is logged once per process as `[fonts] unknown family`;
  - `display=swap`.

  A stored `{ name, url }` keeps its shape, but every reader recomputes the URL from `name`. The stored `url` of a Google entry is never sent to a prompt or a page.

- **FR-20 — Save validation.** The kit POST and PATCH routes and MCP `create_brand_kit` validate `fonts` as follows:
  - each entry whose `{ name, url }` is identical to an entry already stored on the kit is kept as is. This covers FONT artifact uploads and families missing from the snapshot;
  - every other entry must be `findFamily(name)` (delisted allowed), and its `url` is replaced by `googleFontsUrl([name])`;
  - otherwise the request is a 400: "Unknown font: {name}".
  - At most 6 entries.
- **FR-21 — Script fonts (P3).**
  - `BrandKit.scriptFonts Json?` is `{ [script: string]: family }`, keyed by the catalogue's script id.
  - `OFFERED_SCRIPTS = ['sinhala']` is the only list of offered scripts. A save accepts a key only when it is in `OFFERED_SCRIPTS`, the value is `findFamily(value)` and that family's `scripts` include the key. Otherwise it is a 400.
  - Null is the default on every kit (OQ3). The kit PATCH takes `scriptFonts`, and null or `{}` clears it.
- **FR-22 — Code injects fonts (P3).** `applyPostFonts(html, plan)` in `src/lib/fonts/inject.ts` is pure and idempotent, keyed on a `data-post-fonts` marker. `plan = { families: string[], scriptFamilies: string[] }` comes from `postFontPlan(kit)`. It:
  1. inserts one `<link rel="stylesheet" data-post-fonts href="{googleFontsUrl(families ∪ scriptFamilies)}">` at the start of `<head>` (creating `<head>` when missing), replacing an earlier marked link;
  2. appends each script family to every `font-family` declaration, and to every custom property whose name contains `font` (for example `--font-heading`), in `<style>` blocks and `style` attributes. It goes before a trailing generic keyword (`serif`, `sans-serif`, `monospace`, `cursive`, `system-ui`) or at the end, unless it is already in that declaration. A value that is only `var(...)` is left unchanged, because the property it names is extended instead.

  It is called where model output becomes stored design HTML:
  - Path A (`src/lib/agent/pathA.ts`);
  - Path B (`src/lib/agent/pathB.ts`, which also serves regenerate design);
  - refine (`src/app/api/drafts/[id]/refine/route.ts`, before the commit).

  Inline edit, Apply, restore and export keep the stored CSS. A guard test lists these three call sites.

- **FR-23 — Prompts.**
  - `buildBrandKitSystemContext` lists fonts with the recomputed URL, and lists script fonts as "Sinhala text: {family} (loaded for you)".
  - `SCRIPT_SUPPORT_NOTE` says the script font is added to font stacks by the app.
  - `PROMPT_VERSION_BASE` is bumped, with a history line.
  - Correctness never depends on the model naming the script font (AC-22).
- **FR-24 — Render note (P2).**
  - After `setContent`, `renderPost` checks `document.fonts.check('16px "{family}"')` for each family in the `data-post-fonts` link, bounded like the headline check.
  - It returns `fontsMissing: string[]`.
  - Under `MOCK_PUPPETEER`, a family whose name contains `__MOCK_FONT_MISSING__` is reported missing.
  - The result becomes the stamp `renderNotes = { fontsMissing }` on `Draft` and `DraftRevision` (null means no check or none missing). It travels through `RenderStamp` and `currentRenderStamp`, whose new argument is required, as 030's `renderedText` does. A writer guard covers it.
  - The draft GET returns `fontNotice: { message } | null`, with the text "The image used a fallback font: {family} did not load." The draft page shows it as a warning `Notice`.
- **FR-25 — The picker.**
  - `GET /api/fonts?q=&script=` (team auth) returns at most 20 `{ family, category, delisted }` from `searchFamilies` or `familiesForScript`.
  - `FontEditor` searches through it, with a 200 ms debounce, and shows each result's category. Saved entries show "Heading" for the first and "Body" for the second (the role order `roles.ts` already uses).
  - A "Sinhala font" picker lists `familiesForScript('sinhala')` and has a "None (system font)" option.
  - The kit page shows the snapshot date ("Font list from {date}").

#### Group E: Typography and the second review host

- **FR-26 — Typography entries.** The 007 authoring dataset gains the category `typography` and three entries. Each names fonts only by role, so `containsForbidden` holds:

  | Key                   | Form   | Template                                                       | Range                                 | Source                                                                                                                                                                             |
  | --------------------- | ------ | -------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `type-scale`          | insert | "The headline is {ratio}× the body text size."                 | ratio 1.5 to 4, default 2.5, unit `×` | modular-scale practice (Tim Brown, "More Meaningful Typography", A List Apart, 2011): headline-to-body steps of about 1.5 to 4 at social-post sizes; recorded as a team convention |
  | `body-min-size`       | insert | "Body text is at least {px} px on the {width} px wide canvas." | px 24 to 40, default 28, unit `px`    | team convention (031): readable at phone feed size; every current canvas is 1080 px wide                                                                                           |
  | `heading-line-height` | insert | "Headline line height is {lh}× its size."                      | lh 0.95 to 1.3, default 1.1, unit `×` | common display-type practice; a team convention                                                                                                                                    |

  The triggers catch vague type phrases ("big headline", "readable text", "tight headline"), using the existing `near()` helper.

- **FR-27 — Coded kit rules (party-visionary NOTE).** `checkKitTypography(kit, lookup)` in `src/lib/designData/authoring/typography.ts` is pure and returns findings:
  - `too-many-families`: more than 2 Latin families in `fonts`, plus at most one per key in `scriptFonts`;
  - `same-category`: the heading and body fonts are different families of the same catalogue category;
  - `unknown-family`: not in the snapshot.

  The kit editor's fonts section shows them as non-blocking warnings. A completeness test fails when an `AspectRatio` has a canvas width with no `body-min-size` value (`MIN_BODY_PX_BY_WIDTH`).

- **FR-28 — One upgrade runner.**
  - `runKitUpgrade` becomes `runRuleUpgrade({ roleKit, text, teamId, userId, surface, label })` in `src/lib/kitUpgrade/upgrade.ts`.
  - The kit route passes `ASSISTANT_BRANDKIT` and `kit-upgrade`, so its behaviour is unchanged.
  - One prompt builder (`buildUpgradePrompt`) serves both hosts.
- **FR-29 — The briefing host.**
  - `POST /api/campaigns/[id]/briefing/upgrade` is `withTeamAdmin`, with the campaign team-checked (404 otherwise). The body is `{ text (1..20000), baseVersion (int ≥ 0) }`; a mismatch with the active briefing version returns 409 `STALE_BASE`.
  - `roleKit` comes from the campaign's resolved brand kit (`resolveBrandKit(campaignId)`).
  - It uses surface `ASSISTANT_BRIEFING` and label `briefing-upgrade`, and returns `UpgradeResponse`.
  - `CampaignBriefingSection` mounts `useRuleReview` and `RuleReviewPanel` in the "new version" view, below the textarea. It calls `review.reset()` wherever the draft text is replaced from outside: accept enhance, assistant apply, cancel and save.
  - The MOCK_AI sentinels of 007 apply unchanged.
  - Improve with `lostRules` is not added to the briefing (no Improve there today).

#### Group F: The assistants

- **FR-30 — The schedule grammar.**
  - Each item in the ` ```schedule ` block is `{ topic, postStyle?, tone?, daysFromNow, postAction }`.
  - A `goal` from an old chat is still accepted and ignored when `postStyle` is present; otherwise it maps through `legacyGoalStyle`.
  - The parser checks `postStyle` against `activeStyles()`. A missing, unknown or retired key is replaced by the campaign's `defaultPostStyle`, or `general`, and the row carries `styleReplaced: { proposed }`.
  - The plan shows each replaced row with "Suggested style {proposed} is not available; using {label}" before the user schedules.
- **FR-31 — The prompt list.** `runBriefingChat`'s system prompt lists the styles from `activeStyles()` at call time (key, label, summary). It is never a literal list. A unit test adds a fake active style through the source argument and finds it in the prompt.
- **FR-32 — The plan and the save (W-13).**
  - `BriefingAssistantPanel` rows show a post-style select (`postStyleOptions`) instead of `goal`.
  - `scheduleAll()` sends `postStyle` and no `goal`.
  - The batch route resolves it with `resolveEntryStyle`, as the single queue POST does, so the route needs no change.
- **FR-33 — The brand-kit block grammar.**
  - `fonts` becomes `{ heading?: string, body?: string }`, and an optional `scriptFonts: { [script]: family }` is added.
  - The old `fonts: string[]` is still parsed: the first entry is the heading and the second the body.
  - Each proposed name is looked up through `/api/fonts`. The accept view shows, per font, "Current: {x} → Proposed: {y}", or "{y} is not in the font list and won't be applied" with that row's checkbox off.
- **FR-34 — One Apply (W-16).**
  - `POST /api/admin/brandkits/[id]/assistant/apply` (`withTeamAdmin`) takes `{ voice?, colors?, fonts?: { heading?, body? }, scriptFonts? }`.
  - It validates everything first with the FR-20 and FR-21 rules. Any invalid part is a 400 and nothing is written: all or nothing.
  - In one transaction it writes:
    - the voice as a new active `BrandKitPrompt` version (when given or when fonts change), with `previousFonts = { fonts, scriptFonts }` set when fonts change. This is a new nullable JSON column;
    - the kit's `colors`, `fonts` (heading and body replace positions 0 and 1; the rest are kept) and `scriptFonts`.
  - The panel's `apply()` calls only this route.
  - The prompt History shows "Fonts before this version: {heading}, {body}{, Sinhala: x}" for versions that carry `previousFonts`.

#### Group A: Apply to image

- **FR-35 — The gate (P5).**
  - The first group-A task re-measures with the final candidate finder (FR-37). It is read-only, makes no model call and uses the local scratch database `bistec_studio_op1`.
  - It covers the 35 Path B drafts that 030 measured and the seeded Path A templates (`scripts/seed-*.mjs` and the kits' stored templates, each filled with its own sample text).
  - It records:
    - the share with exactly one safe candidate;
    - the share whose element holds child elements (styling that flattens);
    - the reasons for the rest.
  - The threshold is 80%. Apply is built either way. Below 80%, `APPLY_TEXT_BETA = true` (a constant in `src/lib/applyText/vocab.ts`) and the badge labels Apply "Beta"; the handoff says so.
  - The 35-draft sample is described as non-representative wherever its rate is cited (party-ba).
- **FR-36 — The vocabulary (append-only).** `src/lib/applyText/vocab.ts` exports:
  - `APPLY_FIELDS = ['headline']` (the keys of the 030 stamp);
  - `APPLY_METHODS = ['splice']`;
  - `APPLY_FAILURES = ['not-stale', 'not-found', 'ambiguous', 'unsafe-element', 'unsafe-text', 'new-text-present', 'splice-mismatch', 'not-painted', 'old-still-painted', 'render-failed', 'conflict']`.

  **The key rule:** a failure is never renamed or reused, and a new one is appended; a retired one stays readable. The route, the badge and the event import these lists, and the event catalogue imports them. A coverage test fails if a value has no event field that can carry it.

- **FR-37 — Candidates (party-architect).** `findTextCandidates(html, oldText)` is pure and parses with parse5 (`sourceCodeLocationInfo: true`).
  - It looks only inside `<body>`, skipping `head`, `title`, `script`, `style`, `template`, `noscript` and `svg` subtrees.
  - A candidate is an element whose text content, with `<br>` read as a space and normalised by `normaliseHeadline`, equals the normalised `oldText`, and none of whose child elements also matches (the innermost).
  - Visibility is not judged here; the render is the only judge.
- **FR-38 — Refusals before any render.** Each of these is a named failure, and nothing is written:
  - the 030 state is not `stale` → `not-stale` (OQ1);
  - zero candidates → `not-found`;
  - more than one → `ambiguous`;
  - the candidate's source range holds `<img`, `<svg`, `data-composite`, `__COMPOSITE_` or `__INLINE_ASSET_` → `unsafe-element`;
  - the new text contains `__COMPOSITE_` or `__INLINE_ASSET_` → `unsafe-text`;
  - the normalised new text already appears as a candidate anywhere in the document → `new-text-present`. This makes the spliced element the only element that can show the new text, so the in-render check confirms that element without a marker.
- **FR-39 — The splice.**
  - `spliceText(html, candidate, newText)` replaces the bytes between the candidate's start-tag end and end-tag start with `escapeHtmlText(newText)` (`htmlLocator.ts`). Every byte outside that range stays unchanged.
  - It re-parses the result and checks that:
    1. the bytes before and after the range are identical;
    2. one element now sits at the same start offset with the same tag name and normalised text equal to the new text;
    3. the element count equals the old count minus the candidate's removed descendants.

    A failure is `splice-mismatch`.
- **FR-40 — The in-render check (P5).**
  - `commitDraftRevision` gains `acceptRender?: (rendered) => ApplyFailure | null`. It runs after the render and before the upload; a non-null result throws `RenderRejectedError(code)`, and nothing is uploaded or written.
  - Apply's check runs in the same page. It uses the 030 collector twice: once for the new text and once for the old text.
  - It accepts only when the new text has exactly one painted candidate and the old text has none. Otherwise the result is `not-painted` or `old-still-painted`.
  - A render that throws is `render-failed`.
  - On success, the stamp is the check's own result (`{ text: newHeadline, verified: true }`), so the badge clears.
  - Under `MOCK_PUPPETEER`, the 030 stand-in serves. A new headline containing one of these sentinels forces the matching code: `__MOCK_APPLY_NOT_PAINTED__`, `__MOCK_APPLY_OLD_PAINTED__` or `__MOCK_APPLY_RENDER_FAIL__`.
- **FR-41 — The action.**
  - `POST /api/drafts/[id]/apply-text` takes `{ field: 'headline' }` (`z.enum(APPLY_FIELDS)`). It is `withTeamAuth` with `canAccessContent`, and requires the draft to be ready (`EXPORTED` or `PUBLISHED`) with `htmlContent`.
  - It runs FR-38 synchronously, so a refusal returns 422 `{ code }` and claims nothing.
  - It then claims `APPLY_TEXT` (409 when another action runs), returns 202, and runs the splice and `commitDraftRevision({ claim, acceptRender, instruction: 'Apply headline to image' })` in `startDraftAction`.
  - A claimed failure releases with `pendingActionError` set to the code's sentence. A lost claim or revision conflict is `conflict`.
- **FR-42 — Claim co-changes.**
  - A new `DraftAction` enum value `APPLY_TEXT`, added by its own migration (`ALTER TYPE … ADD VALUE`). Postgres cannot drop an enum value, so the down script leaves it and says so.
  - The `api-types.ts` union.
  - The draft page:
    - `designActionPending` includes it;
    - the overlay label is "Applying headline";
    - Undo capture runs before the call, as for regenerate.
  - The stale sweep, `draft_action.settled` and `draft_action.swept` carry it with no change (`z.nativeEnum`).
- **FR-43 — The event.**
  - `draft.text_applied` (one emitter, `trackTextApplied`, source `web`) has the payload `{ field, method, failure? }` (imported enums), and the outcomes `ok` and `failed`. It is emitted once per request that reached a verdict, including the synchronous refusals.
  - `draft.headline_edited.via` gains `'apply'`. This is additive; the schemaVersion stays.
  - No text is in any payload.
- **FR-44 — The UI.**
  - `HeadlineImageNotice` shows a third button, **Apply to image**, only for `stale` and only on Path A or Path B drafts with HTML. A "Beta" chip shows when `APPLY_TEXT_BETA`.
  - The confirm dialog says: "Replace “{old}” with “{new}” in the image. Styling inside the headline (for example a colored word or a line break) becomes plain text. Undo brings the old version back."
  - A refusal shows the code's sentence in a toast. The sentences live in `src/lib/applyText/noticeText.ts`, one per failure.
  - W-19: the headline hint names Edit inline, and also Regenerate design on Path B and Apply to image when stale.
- **FR-45 — Recovery (P5, party-security BLOCK).** Apply appends a revision and moves the pointer through `commitDraftRevision`. Undo, or a version switch to the previous revision, restores the styled HTML byte for byte.

#### Group D: Spotlight SQUARE v2 and OP-031

- **FR-46 — Evidence first (party-ba).**
  - Extend `scripts/look-check/recheck.ts` with `--regions`. It prints, per region, the luminance std dev against `BUSY_STDDEV_MAX` (0.12) and the contrast fraction.
  - Run it on the two OP-028 renders `spotlight_SQUARE_1.png` and `spotlight_SQUARE_2.png`. They are local, in `.specclaw/changes/028-image-looks/look-check/renders/`. This is no spend.
  - Record which region was busy and by how much in `reports/T16.md` and in `look-check-031/evidence.md`. The v2 geometry is chosen from that evidence.
- **FR-47 — The contract.**
  - `spotlight` gains `versions[2]`: PORTRAIT and STORY are copied unchanged from v1, and SQUARE is changed only where the evidence points.
  - **Default if the evidence shows the bands are busy at their inner edge:** headline band `band(0,0,100,20)`, call-to-action band `band(0,80,100,20)`, and the subject text "centred in the middle 50%; the top 22% and bottom 22% are a flat, plain, dark backdrop with no texture or detail".
  - `current` stays 1. `lookDataset.test.ts` pins v2's hash.
  - Three candidate fixtures (pass, busy, contrast) for `spotlight@2:SQUARE` live in a `CANDIDATE_FIXTURES` table that the render suite runs. The completeness test is unchanged while `current` is 1.
- **FR-48 — The probe (P6).**
  - The super-admin probe route `POST /api/admin/look-probe` accepts an optional `version` (a positive int ≤ the look's latest version). It plans with that contract version instead of `current`, and only this route can do so.
  - `run-look-check.mjs --probe --slot-set op031` uses the slot `spotlight@2:SQUARE`, with `--out .specclaw/changes/031-v2-final-polish/look-check` (its own ledger) and a cap of 4.
- **FR-49 — The pass rule (P6, the 028 rule).**
  - The first two counted attempts must both keep the look (`styleKept`) and both be accepted by the user. Any fallback fails it.
  - An attempt is not counted only when it returned no image (an HTTP or infrastructure error before the image call returned). Such an attempt still uses a ledger line, so the cap of 4 holds.
  - The verdict is computed by a pure `op031Verdict(results)`.
- **FR-50 — Apply the result.**
  - **On pass:**
    - `spotlight.current` becomes 2 and the candidate fixtures join the completeness table;
    - Promotion and Milestone gain `versions[2]`: copies of v1 with `defaultImageStyle: 'spotlight'`;
    - `POST_STYLES_REVISION` becomes 12, so the prompt versions end in `+ps12`;
    - `lookCheckResults.test.ts` reads both results files (028 and 031) and asserts spotlight passed.
  - **On fail:**
    - `current` stays 1;
    - `look-check/results.json` records v2 as failed;
    - a test pins `spotlight.current === 1` and that nothing outside the probe route can plan v2;
    - Promotion and Milestone stay classic.
  - Either way, the post-style change is interactive only (`unattended-classic` unchanged).

### Non-Functional Requirements

- **NFR-01 — Spend.** The only real model or image calls are OP-031's: at most 4, on the user's go, on `bistec_studio_op1`. Every other test runs on the mock seams or real Chromium with local fixtures. The FR-16 metadata fetch and the FR-35 re-measure are not model calls.
- **NFR-02 — Additive schema.** Three migrations:
  - `20261028120000_personal_image_key_provider` (C): `UserOpenAiKey.provider`, `Draft.imageSource`;
  - `20261029120000_post_fonts` (B): `BrandKit.scriptFonts`, `Draft.renderNotes`, `DraftRevision.renderNotes`, `BrandKitPrompt.previousFonts`;
  - `20261030120000_apply_text_action` (A): the `DraftAction` value.

  One manual down script, `prisma/rollback/031-v2-final-polish.down.sql`, covers them in reverse order. `npm run test:upgrade` gains a scenario in which a pre-existing personal key row resolves after the migrations. Each migration gets a "Check before the merge" line in the handoff checklist.

- **NFR-03 — Generation prompts change only as listed.**
  - `PROMPT_VERSION_BASE` is bumped once, by B (FR-23).
  - The post-style revision goes to 12 only on a D pass.
  - `CAPTION_PROMPT_VERSION` changes only through that revision.
  - No other file under `src/lib/agent/prompts/` changes.
- **NFR-04 — The unattended surfaces change only as listed:**
  - MCP `create_brand_kit` font validation (FR-20);
  - the font injection reached through Path A and Path B (FR-22), which the scheduler and MCP also use;
  - the stamp writes (FR-24).

  Scheduled runs never use the personal key, Apply or the probe.

- **NFR-05 — No text in events** (006). No new or changed payload holds a headline, a font name, a key or a prompt.
- **NFR-06 — Never fail a render.** The font check is bounded and never fails a render; a throw yields `fontsMissing: []` and a log line. Apply's check fails only the Apply.
- **NFR-07 — Secrets.** A personal key is sent only to the provider its prefix names. An unknown prefix is never stored (FR-11). `cleanSkipDetail` redaction stays on every provider error text.
- **NFR-08 — Deletes by exact identity** (party-security): temp dirs by the exact path created; export objects by the exact key this run uploaded.
- **NFR-09 — Snapshot weight.** `catalogue.json` holds only the FR-16 fields (target under 250 KB). It is imported only by server code; the browser reads it through `/api/fonts`.

## Acceptance Criteria

**H**

- [ ] **AC-01** — After `npm run test:unit`, `os.tmpdir()` holds no `bistec-cli-*` directory that was not there before the run (a before/after listing in the report); a unit test shows the exit handler removes exactly the created path. (FR-01, NFR-08)
- [ ] **AC-02** — Unit: regenerate design whose guarded write loses the claim deletes the export key from that run and not the draft's `exportUrl`; `commitDraftRevision` and `recordRejectedRender` keep their behaviour through the shared helper. (FR-02)
- [ ] **AC-03** — The locally built image prints `2.1.287 (Claude Code)`; the build log has no `EBADENGINE`; the output is in the report. (FR-03)

**G**

- [ ] **AC-04** — `uiWordingGuard.test.ts` passes on the tree, and its self-tests show each pattern fails and the exception passes. (FR-06)
- [ ] **AC-05** — `reports/T3.md` has one row for each of W-01 to W-41, each fixed (with file) or dropped (with reason), and none missing. (FR-07)
- [ ] **AC-06** — `DESIGN_SYSTEM.md` §12 holds every FR-05 rule with its applies and does-not-apply lists. (FR-05)
- [ ] **AC-07** — The full clean mock E2E run after group G passes with no lowered count (baseline 559/3/0/0), and adapted locators are listed. (FR-08)

**C**

- [ ] **AC-08** — `detectKeyProvider` returns anthropic, openai, gemini and null for the four prefix classes, and both team call sites use it (no other `startsWith('sk-')` key detection in `src`; grep in the report). (FR-09)
- [ ] **AC-09** — `PUT /api/me/openai-key` stores `openai` for an `sk-` key and `gemini` for an `AIza` key, returns the provider, and refuses an `sk-ant-` key, a random string and a malformed `AIza` key with 400 and nothing stored. (FR-11, NFR-07)
- [ ] **AC-10** — `test:upgrade`: a `UserOpenAiKey` row written before the migration has `provider = 'openai'` after it, and `resolveImageProviderWithSource` returns tier personal, provider openai for its user. (FR-10, FR-12)
- [ ] **AC-11** — Unit: a personal provider that throws leads to one team-tier call and `imageSource = { tier: 'team', provider, personalFailed: true }`; a 401 also marks the row INVALID; with no team provider, the skip is `PROVIDER_ERROR` with the personal-key message; a scheduled run (`userId: null`) never reads the personal row. (FR-12, FR-13)
- [ ] **AC-12** — E2E: with a personal Gemini key and `__MOCK_BG__` the draft records tier personal, provider gemini; with `__MOCK_BG_FAIL__` on the personal provider only, the draft shows the fallback notice naming Gemini; the settings card shows "Gemini" next to the suffix. (FR-13 to FR-15)
- [ ] **AC-13** — The down script deletes non-OpenAI rows and drops the column; applied after a Gemini row exists, the previous schema reads the remaining rows (run in the test database, recorded in the report). (FR-10, NFR-02)

**B**

- [ ] **AC-14** — `mergeCatalogue` keeps a family missing from the fetch with `delisted: true`, clears the flag when it returns, and sets the date; the committed snapshot has a `snapshotDate` and includes Instrument Serif, JetBrains Mono, Noto Sans Sinhala, Noto Serif Sinhala, Abhaya Libre, Yaldevi and Gemunu Libre with `sinhala` in their scripts where Google lists it. (FR-16, FR-17)
- [ ] **AC-15** — `googleFontsUrl` gives exact URLs for: a one-weight family (Instrument Serif: no axis, or `ital` only if it has italics), a variable family (JetBrains Mono with its weights in 400 to 700), Noto Sans Sinhala, two families in one URL, and an unknown family (no axis, one log line). (FR-19)
- [ ] **AC-16** — Evidence in the report: the old URL for Instrument Serif and Google's HTTP status for it, and the new URL's status (one manual fetch each, not in CI). (FR-19, party-ba)
- [ ] **AC-17** — The kit PATCH keeps an unchanged stored entry (including a FONT artifact URL and a family missing from the snapshot), replaces a submitted Google `url` with the computed one, and refuses an unknown new family, more than 6 entries, a non-offered script key, and a Sinhala value whose family lacks `sinhala` (400, nothing written); MCP `create_brand_kit` refuses the same. (FR-20, FR-21)
- [ ] **AC-18** — `src/components/admin/brandkits/googleFonts.ts` is gone and no file imports a font list other than `src/lib/fonts/catalogue.ts` (grep in the report). (FR-18)
- [ ] **AC-19** — `applyPostFonts` unit: inserts one marked link (replacing an earlier one), appends the Sinhala family before a generic keyword in a `<style>` rule and an inline `style`, leaves a declaration that already has it and a `var()` value unchanged, is idempotent, and handles a document with no `<head>`. (FR-22)
- [ ] **AC-20** — A guard test fails if Path A, Path B or refine stops calling `applyPostFonts` before the write. (FR-22)
- [ ] **AC-21** — Render suite (real Chromium, local font file served through the allowed request path or a `data:` font): a Sinhala string in an element whose stack was extended by `applyPostFonts` renders in the script font (`document.fonts` reports the face used), and without it falls back. (FR-22)
- [ ] **AC-22** — E2E: a kit with a Sinhala font set generates a draft whose stored HTML has the marked link and the stack entry, although the mock design HTML never names the font. (FR-22, P3)
- [ ] **AC-23** — `renderPost` returns `fontsMissing` for a family that cannot load (render suite, a blocked family), and `[]` when the check throws; E2E with `__MOCK_FONT_MISSING__` shows the fallback-font notice; the writer guard covers `renderNotes`. (FR-24, NFR-06)
- [ ] **AC-24** — E2E: the font picker finds "Instrument Serif" by typing "instr", saves it, and the Sinhala picker lists only Sinhala-capable families and saves one; the snapshot date shows. (FR-25)

**E**

- [ ] **AC-25** — `designAuthoring.test.ts` pins ten keys and the five categories; each new entry's default and `mockReplacement` are measurable and inside its ranges; the detector flags "make the headline big" with `type-scale`. (FR-26)
- [ ] **AC-26** — `checkKitTypography` returns each finding for its case and none for a sans heading with a serif body; the completeness test covers every `AspectRatio` width. (FR-27)
- [ ] **AC-27** — The kit upgrade route's existing unit and E2E tests (§AC) pass unchanged through `runRuleUpgrade`. (FR-28)
- [ ] **AC-28** — E2E: in the campaign briefing editor a vague phrase is flagged, Upgrade proposes a measurable edit, accepting it edits the textarea, and Save makes a new version; an editor (not admin) gets 403 from the route; a stale base gets 409; the model-calls record shows `briefing-upgrade` on the briefing surface. (FR-29)

**F**

- [ ] **AC-29** — Unit: the schedule parser keeps an active key, replaces an unknown key and a retired key with the campaign default (or `general`) and sets `styleReplaced`, and maps a legacy `goal`; the prompt lists the styles of the source it is given. (FR-30, FR-31)
- [ ] **AC-30** — E2E: the assistant's mock plan shows a post-style select per row and a replaced-style line for a bad key; Schedule creates queue entries whose `postStyle` is the shown value. (FR-32)
- [ ] **AC-31** — Unit: the brand-kit block parses the new and the old `fonts` shapes; the apply route writes voice, colors, fonts and scriptFonts in one transaction with `previousFonts` set, and with one invalid font writes nothing (400). (FR-33, FR-34)
- [ ] **AC-32** — E2E: the accept view shows current versus proposed fonts; Apply changes the kit's heading and body fonts; the History shows the previous fonts on the new version. (FR-33, FR-34)

**A**

- [ ] **AC-33** — The re-measure report gives the rate, the styled-element share and the reasons for the rest, for the 35 drafts and the Path A templates, and states whether `APPLY_TEXT_BETA` is set. (FR-35)
- [ ] **AC-34** — Unit: `findTextCandidates` finds the one innermost element for: a plain `<h1>`; a headline split by an accent `<span>` and `<br>`; and an entity-encoded headline. It ignores `<title>`, `<script>` and `<svg>` copies, and returns two for a repeated headline. (FR-37)
- [ ] **AC-35** — Unit: each FR-38 refusal returns its code, and the HTML is unchanged. (FR-38)
- [ ] **AC-36** — Unit: `spliceText` leaves every byte outside the range identical (byte compare), escapes `<`, `&` and `>`, and returns `splice-mismatch` for a forced bad offset with the input unchanged. (FR-39)
- [ ] **AC-37** — Render suite: after a splice the check accepts; a fixture where the old headline is also painted elsewhere (a CSS `::after` copy) gives `old-still-painted`; a fixture where the target is hidden gives `not-painted`; the `acceptRender` rejection uploads nothing and writes nothing (unit, storage mocked). (FR-40)
- [ ] **AC-38** — E2E: on a stale draft, Apply to image shows the confirm text, then the badge is gone, the GET stamp is `verified: true` with the new headline, and a new revision exists; Undo brings back the previous `htmlContent` byte for byte (P5). (FR-41, FR-44, FR-45)
- [ ] **AC-39** — E2E: each in-render sentinel gives its toast and no new revision; a fresh draft and an `unconfirmed` draft show no Apply button; a second action during Apply gets 409. (FR-38, FR-40 to FR-42, FR-44)
- [ ] **AC-40** — `draft.text_applied` is written once per verdict with `field`, `method` and `failure` (and no text); the coverage test fails if an `APPLY_FAILURES` value cannot be carried; `draft.headline_edited` accepts `via: 'apply'`. (FR-36, FR-43, NFR-05)

**D**

- [ ] **AC-41** — The evidence file names the busy region(s) and their std dev for both OP-028 SQUARE renders. (FR-46)
- [ ] **AC-42** — `spotlight` has `versions[2]` with PORTRAIT and STORY deep-equal to v1, a pinned hash, and `current` per the result; the v1 hashes are unchanged; the three candidate fixtures give pass, busy and contrast in the render suite. (FR-47)
- [ ] **AC-43** — The probe route plans with `version: 2` for a super admin and refuses a non-super-admin, a version over the latest and a non-integer; no other caller can plan a non-current version (unit). (FR-48)
- [ ] **AC-44** — `op031Verdict` unit: pass on two kept and accepted; fail on any fallback or reject among the first two counted; an infra attempt is not counted but uses a ledger line; the cap refuses a fifth line. (FR-49)
- [ ] **AC-45** — OP-031 ran at most 4 calls (ledger), and its results and verdict are committed; the dataset, post styles and `lookCheckResults.test.ts` match the verdict as FR-50 states. (FR-50, NFR-01)

**The gate**

- [ ] **AC-46** — tsc clean; lint 0 errors and no new warning (baseline 7); unit, render and the full clean mock E2E pass with no lowered count against the baseline (unit 4253, render 134, E2E 559/3/0/0); `test:upgrade` passes; CI green on `v2`; `PROMPT_VERSION_BASE` bumped exactly once; `git diff --name-only 0f42017 -- src/lib/scheduler src/mcp src/acp src/app/api/acp` lists only the NFR-04 files; the screenshots are recaptured (FR-04). (NFR-01 to NFR-09)

## Mock E2E plan

New sections in `docs/e2e-test-plan.md`:

- **§AI** personal image key, `tests/e2e/image-key.test.ts`, TC-IK-01 to TC-IK-06.
- **§AJ** post fonts, `tests/e2e/post-fonts.test.ts`, TC-PF-01 to TC-PF-08.
- **§AK** briefing review host, `tests/e2e/briefing-upgrade.test.ts`, TC-BU-01 to TC-BU-05.
- **§AL** assistants, `tests/e2e/assistants-031.test.ts`, TC-AS-01 to TC-AS-06.
- **§AM** Apply to image, `tests/e2e/apply-text.test.ts`, TC-AP-01 to TC-AP-10.

They are driven by `__MOCK_BG__` / `__MOCK_BG_FAIL__`, `__MOCK_FONT_MISSING__`, the three `__MOCK_APPLY_*__` sentinels, the 007 upgrade sentinels and the mock assistant replies, which gain a `postStyle` and the new `fonts` shape. Every `page.waitForResponse` is created before its trigger.

## Panel findings → where addressed

| Finding (party-report.md)                                              | Where                                                                                                      |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| architect BLOCK: Sinhala depends on the model                          | FR-21, FR-22 (code injects stacks and the request), AC-21, AC-22                                           |
| architect WARN: parse5 has no layout; two judges                       | FR-37 (source position only, named exclusions), FR-38 `new-text-present`, FR-40 (render is the only judge) |
| architect WARN: Apply's write path unnamed; co-changes; migration      | FR-40, FR-41 (only `commitDraftRevision`), FR-42, NFR-02                                                   |
| architect WARN: regenerate cleanup copies commit's                     | FR-02 (one helper), AC-02                                                                                  |
| architect WARN: snapshot beside the list of 100                        | FR-18 (list deleted, one lookup), FR-20, AC-18                                                             |
| architect WARN: key detector and data shape unspecified                | FR-09, FR-10 (column on the existing table; route and fields keep names)                                   |
| architect WARN: which spotlight contract after a fail; which ledger    | FR-47, FR-48, FR-50                                                                                        |
| architect WARN: assistant block grammars unspecified                   | FR-30, FR-33, FR-34                                                                                        |
| architect WARN: briefing host names no route                           | FR-28, FR-29                                                                                               |
| architect NOTE: vocabulary has no mock driver                          | FR-36, FR-40 sentinels, AC-39                                                                              |
| architect NOTE (rebuttal): B, E, F are coupled                         | Order B → E → F; nothing slips (P1)                                                                        |
| ba BLOCK: wording scan not evidenced                                   | `wording-scan.md`; FR-07, AC-05                                                                            |
| ba WARN: font bug not shown; catalogue is a proxy                      | AC-14, AC-15, AC-16 (named fonts, observed URL status); P2 kept the catalogue                              |
| ba WARN: 32/35 rate called non-representative                          | FR-35 (re-measure first, 80% gate, beta), AC-33                                                            |
| ba WARN: no acceptance criteria                                        | AC-01 to AC-46                                                                                             |
| ba WARN: busy attributed without evidence; thin pass bar               | FR-46 (measured first), FR-49 (2 of 2, 028 rule), AC-41                                                    |
| ba WARN: load-bearing terms with two readings                          | FR-05 applies / does-not-apply; FR-12 precedence                                                           |
| ba NOTE: users will read the confirm step                              | FR-35 records the styled share; FR-45 recovery                                                             |
| po BLOCK: eight deliverables, no cut line                              | P1 (nothing slips; OP-031 fail is a result)                                                                |
| po BLOCK: full catalogue vs curated list                               | P2 (the user kept the catalogue); refresh contract FR-17                                                   |
| po WARN: Apply rests on an unmeasured rate                             | FR-35 is the first group-A task                                                                            |
| po WARN: OP-031 return                                                 | P6 (028 rule; cap 4); FR-50 sizes the outcome                                                              |
| po WARN: wording sweep and locator cost                                | FR-08 (full E2E right after G)                                                                             |
| po WARN: migration for a mock-only provider                            | P4 (user kept it); additive column, fallback, notice                                                       |
| po NOTE: E and F low-demand                                            | P1 (kept); F fixes W-13 and W-16                                                                           |
| security BLOCK: Apply overwrites with no way back                      | FR-45, AC-38                                                                                               |
| security WARN: old headline may still be painted                       | FR-38 `ambiguous`, FR-40 `old-still-painted`, AC-37                                                        |
| security WARN: unknown prefix goes to the wrong vendor                 | FR-11, AC-09, NFR-07                                                                                       |
| security WARN: untested personal Gemini beats the team; silent failure | FR-13, FR-14, AC-11, AC-12                                                                                 |
| security WARN: rollback of Gemini rows                                 | FR-10, AC-13                                                                                               |
| security WARN: Sinhala value unchecked                                 | FR-21, AC-17; FR-22 uses the stored catalogue name                                                         |
| security WARN: unknown or rejected font fails silently                 | FR-19 (default request, log), FR-24 (render note)                                                          |
| security NOTE: validate the model's post style                         | FR-30                                                                                                      |
| security NOTE: scope deletes to this run                               | FR-01, FR-02, NFR-08                                                                                       |
| security NOTE: font Apply has no record of previous values             | FR-34 `previousFonts`, AC-32                                                                               |
| visionary WARN: one column per script                                  | FR-21 (keyed by script id), FR-27 ("plus one per script")                                                  |
| visionary WARN: assistant prompt copies the style list                 | FR-31                                                                                                      |
| visionary WARN: snapshot with no owner or refresh rule                 | FR-16, FR-17; the handoff names the operator step                                                          |
| visionary WARN: glossary enforced once                                 | FR-05, FR-06                                                                                               |
| visionary WARN: failure vocabulary not append-only                     | FR-36                                                                                                      |
| visionary NOTE: Apply named for the headline only                      | FR-36, FR-41 (`apply-text`, `field`)                                                                       |
| visionary NOTE: pairing rule checkable in code                         | FR-27                                                                                                      |
| visionary NOTE (rebuttal): curated list costs more later               | P2 (catalogue kept)                                                                                        |

## Edge Cases

- **A kit font missing from the snapshot** (for example the renamed "Fredoka One"): it is kept on save (FR-20). The request uses Google's default (FR-19), and the render notes it if it does not load (FR-24).
- **A FONT artifact (an uploaded file):** its entry is kept as stored. `applyPostFonts` requests only catalogue families, and the model still sees the artifact URL in the system context as today.
- **A design whose CSS uses `font-family: var(--font-heading)`:** the custom property's definition carries the script family (FR-22 step 2). A custom property for fonts whose name does not contain `font`, or a design with no `font-family` at all, relies on the OS fallback, as today (known limit L3).
- **A personal key that works but the team has none:** no change from today.
- **A personal key failure in a refine background:** the same fallback rule applies (FR-13), and `imageSource` is written by the refine write.
- **Apply on a revision restored from before 030:** the state is `unknown`, so no button shows.
- **Apply when the headline was edited during the claimed run:** the commit re-reads nothing; the stamp holds the new text that was checked. A later edit makes it stale again, which is correct.
- **Apply on a 025 composite draft:** the composite element is never a candidate (`unsafe-element`), and the re-render places the screenshot as any commit does.
- **The briefing upgrade with no brand kit resolved:** `roleKit` has no colors or fonts. Role names still work, and the detector still runs.
- **The assistant proposes the same font for heading and body:** it is allowed; `checkKitTypography` then has nothing to flag for category.
- **OP-031 crashes mid-run:** the ledger line is written before the call, so the cap holds (028 behaviour).

## Assumptions

- **A1.** `fonts.google.com/metadata/fonts` is reachable from the build machine once, to make the snapshot. If not, the implementer stops and reports; there is no hand-written fallback.
- **A2.** Gemini key format: `AIza` followed by 35 characters in practice; the check accepts 30 or more to avoid refusing a valid key.
- **A3.** The COPY slot's "Captions" helper text names captions and headlines. The task checks what else reads the COPY row, and if brand-voice drafting does, the helper says so.
- **A4.** `exportKey(...)` keys are unique per run (they include a timestamp or random part); the task confirms this before relying on it in FR-02.
- **A5.** The seeded Path A templates fill with their own sample text, so their headline is the sample headline (FR-35).

## Known limits

- **L1.** Gemini is mock-verified only (out of scope by the user's decision).
- **L2.** Apply flattens styling inside the headline element; Undo restores it (FR-45).
- **L3.** Script fonts reach only declarations that exist. A design with no `font-family` uses the OS fallback (the Noto Sans Sinhala package in the image).
- **L4.** The snapshot ages; the refresh is an operator step (handoff).
- **L5.** The typography prose rules are checked as text, like the other 007 entries; only FR-27's two rules are checked against the kit's fonts.
- **L6.** The Apply in-render check reads innerText, so an old headline painted only through CSS ::before/::after content is not detected (031 T14; AC-37's ::after fixture became a second DOM element).

## Dependencies

- 030 (stamp, check, normaliser, badge), 019 (claims), 025 (probe route, composite), 028 (look runner, fixtures, results), 027 (post styles, resolver), 007 (authoring dataset, review hook), 005 (image resolver, skip notice), 006 (events).
- New npm dependency: `parse5`.

## Out of scope

- 009 Phase 3, the live Gemini call, the app's own typography (Graphite), a model-based Apply, other on-image text (CTA, kicker), renaming routes, API fields or models, and the `v2` → `main` merge itself.
