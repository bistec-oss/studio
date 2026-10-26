# Proposal: v2 final polish before the merge to main

**Created:** 2026-10-26
**Status:** 🟡 Draft

## Problem

The agreed roadmap order (027a → 028 → 029 → 025 → 030) is complete. Before `v2` merges to `main`, the user wants the remaining candidates and the known leftovers finished in **one final change** (the user, 2026-10-26: "Do these changes as one final specclaw change … we can finish the v2 branch and verify to work on the merge to main").

They are a mix of features and debts:

- **The edited headline cannot be applied to the image without a model.** 030 shows the badge; the only remedies are Edit inline and Regenerate design. The 030 measurement (35 real Path B drafts) found one innermost element holding the headline in 32 of 35.
- **The font picker is a fixed list of 100.** Instrument Serif is missing, and `googleFontsUrl` always asks for weights 400 to 700, which Google refuses for single-weight families such as Instrument Serif. No Sinhala family is offered, although posts are written in Sinhala (the image only ships `font-noto-sinhala` as an OS fallback).
- **The personal key is OpenAI-only and says so,** while the team side also supports Gemini for images. The user asked for an "image generation key" and for a scan for mismatches like this one.
- **The wording scan** (2026-10-26, read-only, about 20 MEDIUM findings and a long LOW tail) found UI text that misleads or is stale. Examples:
  - the raw `COPY` / `IMAGE` slot names on `/team`;
  - "copy provider" errors;
  - the team-token card hides that scheduled, MCP and ACP runs depend on it;
  - "Create accounts and manage roles" on a page with no role controls;
  - the headline hint tells Path A users to use a button they do not have;
  - the briefing assistant's schedule still shows and saves "goal", which 027 replaced;
  - the brand-kit assistant shows font guesses it never applies;
  - five spellings of "brand kit";
  - stale docs (PRD.md describes Canva and an OpenAI orchestrator; "3:4 portrait").
- **Spotlight failed OP-028 on SQUARE** (`busy` twice), so Promotion and Milestone stay classic.
- **007 follow-ups:** no typography rules in the brand-kit design dataset, and the review panel has one host.
- **Leftovers:**
  - 005: AC-17 not rechecked under node:22; unit runs leave empty `bistec-cli-*` temp dirs; the setup guide path is plain text, not a link.
  - 019: a Regenerate design that loses its claim orphans the PNG it uploaded.
  - 020: `docs/ui-reference/screen-light.png` and `screen-dark.png` still show the old Create post button.

## Proposed Solution

One change, built in groups, each group with its own tasks and gates. The user's answers are under "User Decisions".

**A. Apply to image (no model).** A new claimed draft action, `POST /api/drafts/[id]/apply-headline`. It parses the stored HTML with a real parser that keeps source offsets (`parse5`), finds the one innermost element whose visible text is the stamped old headline (the 030 normaliser), and splices in the new headline, HTML-escaped. Every other byte stays unchanged.

The 030 panel's Apply findings become requirements:

- the check runs **inside the render, before the write**, so a failed check writes nothing;
- one closed failure vocabulary shared by the route, the badge and the event;
- refuse elements that hold `img`, `svg`, `[data-composite]` or a reserved token (`__COMPOSITE_0__`, `__INLINE_ASSET_n__`), and refuse a new headline that contains one;
- re-parse after the splice and check that nothing outside the element changed;
- an event with a `method` field;
- the match rate re-measured under the final rule (the sample called non-representative), plus the seeded Path A templates measured.

Styling inside the element (an accent span, line breaks) flattens to plain text; the confirm step says so. On success the stamp is the check's result, so the badge clears only when the image really shows the new headline.

**B. Fonts for posts.**

- The full Google Fonts catalogue, as a committed metadata snapshot (family, category, real weights and styles, scripts) with a refresh script. The brand-kit font picker becomes searchable.
- `googleFontsUrl` asks only for the weights a family has.
- A **Sinhala font slot** per brand kit (for example Noto Sans Sinhala, Noto Serif Sinhala, Abhaya Libre, Yaldevi, Gemunu Libre). The design prompts get it as a CSS variable, used for Sinhala text. Without one, today's OS fallback stays.
- Posts only: the app's own typography (Graphite) does not change.

**C. Personal image generation key.** `/settings` "OpenAI key" becomes "Image generation key". It accepts an OpenAI or a Gemini key, detected from the prefix as `/team` does, and generates with that provider. Existing personal OpenAI keys keep working with no re-entry (a data migration carries them). The resolver's personal tier serves either provider.

**D. Spotlight SQUARE v2.** A new `spotlight` SQUARE contract (v2) aimed at the `busy` failure, its three fixtures, and an operator real-image check OP-031: the `run-look-check.mjs` runner and ledger, a cap of **4** image calls, and 2 accepted renders to pass. If it passes, Promotion and Milestone move to `spotlight` (a new post-style version and `POST_STYLES_REVISION` bump, interactive only). If it fails, they stay classic and the contract is recorded as failed.

**E. 007 follow-ups.**

- A **typography** part of the brand-kit design dataset: font pairing and type scale rules, measurable, with the detector and Improve/Upgrade covering them.
- The review panel in a **second host**, the campaign briefing editor, reusing `useRuleReview`.

**F. The assistants.**

- The campaign briefing assistant proposes a **post style** per planned post (one of the eight). The plan shows it and the queue entries save it. Its prompt changes; generation prompts do not.
- The brand-kit assistant **applies** its proposed heading, body and Sinhala fonts (each checked against the catalogue) with the voice and colors, in one Apply, each part shown before you accept. Style stays advisory.

**G. Wording.**

- Fix every MEDIUM finding of the 2026-10-26 scan and its LOW naming drift, using the user's glossary:
  - "post", not "brief", in the UI;
  - "Template" / "Freeform", not "Path A" / "Path B";
  - "Brand kit", "Team settings";
  - sentence case for labels;
  - US spelling (color, organize).
- Show the slot names as "Captions" / "Images".
- Make the team-token card and its disconnect dialog name what depends on it.
- Link the setup guide instead of showing a repo path.
- Fix the stale docs: PRD.md, the "3:4 portrait" mentions, the mcp-acp guide's `goal`.
- Routes, API fields and DB names do not change (`/brief`, `Brief` stay).

**H. Leftovers.**

- Recheck 005 AC-17 under node:22 (build the image locally; `claude --version` prints the pinned 2.1.287).
- Unit runs leave no `bistec-cli-*` temp dirs.
- The 019 regenerate-design lost-claim path removes the PNG it uploaded, as `commitDraftRevision` already does.
- Recapture `screen-light.png` and `screen-dark.png` with `scripts/capture-ui.mjs`.

## Scope

### In Scope

- Groups A to H above, each with unit tests, render fixtures where a check runs in Chromium, and E2E on the mock seams.
- Three expected migrations (additive, each with a manual down script): the Sinhala font slot on `BrandKit`; the personal image key's provider (generalising `UserOpenAiKey`, with the data carried); any stamp or field Apply needs (expected none beyond 030's `renderedText`).
- One new npm dependency, `parse5` (030 Open Question 3, option a).
- OP-031: up to 4 real image calls on the local scratch database `bistec_studio_op1`, run by the operator on the user's go. This is the only real model or image spend.
- A `PROMPT_VERSION` bump for the Sinhala font variable, and a post-styles revision bump if D passes.

### Out of Scope

- **009 Phase 3** (full AI render). The user left it out; it can be proposed later on its own.
- **A live Gemini call** (005 follow-up). The user skipped it; Gemini stays mock-verified only, a known limit.
- **The app's own typography.** Fonts are for posts only.
- **A model-based Apply** (the scoped Haiku rewrite). The user chose the no-model replace.
- **Renaming routes, API fields or DB models** for the glossary: UI text only.
- **The `v2` → `main` merge itself.** It follows this change's verify, on the user's go-ahead, after the pre-merge checklist.
- **Other on-image text** (CTA, kicker) in Apply.

## Impact

- **Size:** architectural. It adds a new draft action with an HTML splice, a font catalogue and a new brand-kit field read by the design prompts, a generalised credential with a data migration, a new look contract with a real-image gate, a dataset extension, and app-wide wording.
- **Files affected:** about 80 to 120 (estimated; the wording group touches many components).
- **Complexity:** large.
- **Risk:** medium.
  - The splice must never corrupt HTML: it is pure, offset-based and fixture-tested, and refuses unsafe elements.
  - The personal key migration must not lose a key: data carried in the migration, tested by `test:upgrade`.
  - The wording sweep could break E2E locators that match on text: the full suite runs at the end.
  - The font catalogue snapshot adds weight to the repo: trimmed to the fields the picker and URL builder need.
- **Spend:** at most 4 real image calls (OP-031), on the user's go.

## User Decisions (2026-10-26, asked before drafting)

- **One change** for all remaining candidates and leftovers.
- **Apply to image:** the no-model replace (the recommendation), with the 030 panel's fixes.
- **009 Phase 3:** left out.
- **Spotlight SQUARE v2:** yes, with a cap of 4 calls; if it passes, Promotion and Milestone move to Spotlight.
- **007 follow-ups:** both, the typography dataset and the briefing editor review. The user added: more Google Fonts, including Sinhala fonts, so that fonts like Instrument Serif and JetBrains Mono can be used.
- **Font list:** the full catalogue (metadata snapshot, searchable, real weights).
- **Sinhala:** a Sinhala font slot per brand kit.
- **Where fonts apply:** posts only.
- **The personal key:** any image provider, renamed "Image generation key"; existing OpenAI keys keep working. The user also asked for a scan for mismatches like this one; its findings became group G.
- **Live Gemini check:** skipped.
- **Wording:** every MEDIUM and LOW finding plus the stale docs.
- **Glossary:** the plain set: post not brief, Template/Freeform not Path A/B, Brand kit, Team settings, sentence case, US spelling.
- **Briefing assistant schedule:** use post styles.
- **Brand-kit assistant:** apply fonts too.
- **Open Question 1 (answered):** Apply is offered only when the 030 state is `stale`; `unconfirmed` keeps Edit inline and Regenerate design.
- **Open Question 3 (answered):** the Sinhala slot starts empty (null) on every kit; the OS fallback keeps applying.
- **Open Question 5 (answered):** the no-spend groups first (H, G, C), then B, E, F, then A, and D with OP-031 last.
- **Review panel:** the user chose to run the deep panel (2026-10-26).

## User Decisions after the panel (2026-10-26)

The deep panel returned CHANGES_REQUESTED (43 upheld: 5 BLOCK, 28 WARN, 10 NOTE; 1 withdrawn). The user answered the BLOCK-level points; these govern the spec together with the decisions above.

- **P1, the cut line (party-po BLOCK): one change, nothing slips.** Every group must pass before the merge. A real check that returns `fail` (OP-031) is a result, not a broken group, and does not hold the merge. The full E2E suite also runs right after the wording group, before the feature groups, so a broken locator is found early.
- **P2, fonts (party-po BLOCK, party-visionary rebuttal): the full catalogue, with refresh rules.**
  - The snapshot holds family, category, weights, styles, scripts and its date.
  - One lookup serves every reader and writer, and the list of 100 is deleted.
  - A refresh never removes a family a kit uses; it marks it delisted.
  - An unknown family gets Google's default request, and a family that fails to load in the render leaves a visible render note on the draft.
- **P3, script fonts (party-architect BLOCK, party-visionary): keyed by script.**
  - One field, script fonts keyed by the catalogue's script id. Sinhala is the only one offered now, so the UI shows a "Sinhala font" picker.
  - Code puts each script font into the emitted font stacks and the font request, for Path A, Path B, refine and regenerate. The prompt may mention it, but correctness never depends on the model.
- **P4, a failing personal image key (party-security): fall back once and show a notice.**
  - On a personal-tier provider error, retry once with the team's image provider, and show a notice on the draft naming the personal key.
  - The draft records which tier and provider ran.
  - A key whose prefix matches no known provider is refused at save, never defaulted. One prefix detector serves the personal and team sides.
  - The migration is an additive `provider` column defaulting to `OPENAI`; the down script deletes non-OpenAI rows, and the release note says so.
- **P5, Apply (party-security BLOCK and the Apply WARNs):**
  - It writes only through `commitDraftRevision`, so the styled revision is kept and Undo or a version switch restores it byte for byte.
  - It refuses `ambiguous` when more than one candidate matches, and the in-render check also requires that the old headline is no longer painted.
  - parse5 picks candidates by source position only. The render is the only judge of visibility.
  - **The gate:** re-measure first (the 35 Path B drafts and the seeded Path A templates), with a threshold of 80%. Apply is built either way and refuses safely below it. If the rate is under 80%, the handoff says so and the badge labels Apply "beta".
- **P6, Spotlight SQUARE v2: the 028 rule, 2 of 2.**
  - The first two attempts must both keep the look, and the user must accept both. Any fallback fails it.
  - The other two calls are for an infra retry only.
  - OP-031 uses its own `--out` directory and ledger.
  - **If it fails:** v2 is recorded as failed and never served. The resolver keeps serving v1 at square, as today, and Promotion and Milestone stay classic.
- **The wording scan (party-ba BLOCK)** is committed as [`wording-scan.md`](wording-scan.md), one numbered finding per line. Group G is scoped to that list. Each item is fixed, or recorded as dropped with a reason.

## Open Questions

1. **Apply when the 030 stamp is `unconfirmed`.** The old headline is not known to be on the image, so there is nothing safe to replace. Recommend: Apply is offered only when the state is `stale` (the stamp is verified); `unconfirmed` keeps Edit inline and Regenerate design.
2. **Typography rules.** Recommend measurable entries for: a heading-to-body size ratio (type scale), a maximum of two families plus the Sinhala slot, a minimum body size at each canvas size, and a pairing rule (heading and body contrast in category). The exact ranges come from the plan, cited.
3. **The Sinhala slot and existing kits.** Recommend null by default (today's OS fallback). Do not pre-fill Noto Sans Sinhala, so no existing post changes.
4. **OP-031 database.** Recommend `bistec_studio_op1` with the user's OpenAI key, as OP-028 did, after the `v2` migrations of this change are applied to it.
5. **Order inside the change.** Recommend the groups with no spend and no prompt change first (H, G, C), then B, E, F, then A, then D with OP-031 last, so a failed real check delays nothing else.

**Party panel (2026-10-26, deep, CHANGES_REQUESTED; upheld findings, one line each; see [party-report.md](party-report.md)):**

- (party-architect, BLOCK) The Sinhala slot depends on the model to pick out Sinhala text, but per-glyph font fallback belongs in code — see party-report.md
- (party-architect, WARN) Apply finds "visible text" with a parser that has no layout, while the 030 check decides visibility in the page — see party-report.md
- (party-architect, WARN) Apply's write path is unnamed, although the proposal names the revision writer that does lost-claim cleanup — see party-report.md
- (party-architect, WARN) The regenerate-design cleanup copies what `commitDraftRevision` does instead of going through it — see party-report.md
- (party-architect, WARN) The new font catalogue snapshot sits next to the fixed list of 100 with no statement that it replaces it — see party-report.md
- (party-architect, WARN) The personal key's provider detection and data shape are unspecified, and C contradicts the scope line on DB names — see party-report.md
- (party-architect, WARN) The proposal does not say which spotlight SQUARE contract new generations get when OP-031 fails, or which ledger the cap of 4 counts against — see party-report.md
- (party-architect, WARN) The two assistant block grammars change shape, but the new fields and the parsers' failure handling are not specified — see party-report.md
- (party-architect, WARN) The second review host reuses the hook but names no server route for a campaign briefing — see party-report.md
- (party-architect, NOTE) Apply's closed failure vocabulary has no stated way to drive each code under the mock seams — see party-report.md
- (party-architect, NOTE) Rebuttal to party-po's bundling BLOCK: the groups are not independent, so any cut line has to keep B with E's category rule and F's font Apply — see party-report.md
- (party-ba, BLOCK) The wording scan that drives group G is asserted, not evidenced — see party-report.md
- (party-ba, WARN) The font problem is partly stated as a bug that is not shown, and the catalogue is a proxy for the user's need — see party-report.md
- (party-ba, WARN) "Apply to image" claims a 32-of-35 match rate, but the proposal's own text calls the sample non-representative — see party-report.md
- (party-ba, WARN) Acceptance criteria are not stated, and several stated goals have no way to fail — see party-report.md
- (party-ba, WARN) The Spotlight "busy" failure is attributed to the contract without evidence, and the pass bar is thin — see party-report.md
- (party-ba, WARN) "Brief"/"post", "Captions"/"Images" and "image generation key" are load-bearing terms with two readings — see party-report.md
- (party-ba, NOTE) Assumed user behavior: operators will read the confirm step — see party-report.md
- (party-po, BLOCK) Eight unrelated deliverables in one change, with no cut line and no do-nothing price for most — see party-report.md
- (party-po, BLOCK) Group B builds the whole Google Fonts catalogue when most of the stated value is a few families and a weights bug — see party-report.md
- (party-po, WARN) Apply-to-image is the largest build in the change and its value rests on a match rate the proposal has not yet measured — see party-report.md
- (party-po, WARN) Real-spend OP-031 has a poor expected return, and the "move defaults" outcome has no stated size — see party-report.md
- (party-po, WARN) The wording sweep touches an unbounded number of files and its recurring cost (E2E locator breakage) is unpriced — see party-report.md
- (party-po, WARN) The personal key change spends a data migration and a resolver change to generalise a provider that is mock-verified only — see party-report.md
- (party-po, NOTE) Typography rules, a second review host, and the assistants' post-style proposals are low-demand scope with no stated value — see party-report.md
- (party-security, BLOCK) Apply overwrites styled HTML with no stated way back — see party-report.md
- (party-security, WARN) Apply's success check proves the new headline is painted, not that the old one is gone — see party-report.md
- (party-security, WARN) Prefix detection with no rule for an unknown prefix can send a secret to the wrong vendor — see party-report.md
- (party-security, WARN) A never-live-tested personal Gemini key takes precedence over a working team key, and a failure is silent — see party-report.md
- (party-security, WARN) The rollback of the personal-key migration has no stated handling for Gemini rows — see party-report.md
- (party-security, WARN) The manually set Sinhala slot reaches the design prompt and the font URL with no stated check — see party-report.md
- (party-security, WARN) A font the snapshot does not know, or that Google rejects, fails silently into a fallback face — see party-report.md
- (party-security, NOTE) Validate the model-proposed post style before it is shown or saved — see party-report.md
- (party-security, NOTE) Scope both new delete paths to objects this run created — see party-report.md
- (party-security, NOTE) The assistant's font Apply overwrites kit fonts with no record of the previous values — see party-report.md
- (party-visionary, WARN) The Sinhala slot sets a one-column-per-script precedent that the next script copies into four places — see party-report.md
- (party-visionary, WARN) The briefing assistant's prompt becomes another copy of the post-style list, and nothing fails when the dataset changes — see party-report.md
- (party-visionary, WARN) The committed font snapshot is a second copy of Google's catalogue with no owner and no rule for what a refresh may remove — see party-report.md
- (party-visionary, WARN) The glossary is enforced once by a manual sweep, with nowhere for it to live and nothing to stop the drift coming back — see party-report.md
- (party-visionary, WARN) The Apply failure vocabulary is stored in analytics events, but the artifact never says it is append-only — see party-report.md
- (party-visionary, NOTE) Apply is named and built for the headline only, though the stamp it reads is keyed by field — see party-report.md
- (party-visionary, NOTE) The catalogue makes the pairing rule checkable in code, but the proposal leaves it as a text rule — see party-report.md
- (party-visionary, NOTE) Rebuttal of party-po's catalogue BLOCK: the curated-list variant is cheaper at merge and costlier to live with — see party-report.md
