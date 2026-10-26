# Party Report: 031-v2-final-polish

**Reviewed:** 2026-10-26
**Tier:** deep (classifier) — Generalises the stored personal OpenAI key into a multi-provider image key with a data migration, adds an HTML splice that writes user-supplied headline text into stored design HTML, and adds a new BrandKit font field read by the design prompts, so a persisted-data-shape change and a credential and untrusted-input boundary both change.
**Panel:** party-po(sonnet), party-architect(opus), party-ba(sonnet), party-security(opus), party-visionary(opus)
**Verdict:** CHANGES_REQUESTED

## Summary

44 findings: 5 BLOCK, 28 WARN, 10 NOTE upheld — 1 withdrawn

## Findings

### [BLOCK] party-architect — The Sinhala slot depends on the model to pick out Sinhala text, but per-glyph font fallback belongs in code

**Quotes:** > - A **Sinhala font slot** per brand kit (for example Noto Sans Sinhala, Noto Serif Sinhala, Abhaya Libre, Yaldevi, Gemunu Libre). The design prompts get it as a CSS variable, used for Sinhala text. Without one, today's OS fallback stays.
**Quotes:** > - `googleFontsUrl` asks only for the weights a family has.
**Problem:** The proposal hands the kit's Sinhala family to the model as a CSS variable. It then relies on the model to find the Sinhala runs and apply the variable to them, so whether the configured font gets used is up to the model. The same proposal says the OS fallback already covers Sinhala automatically. That is per-codepoint font fallback, which a code-owned `font-family` stack (heading or body family, then the Sinhala family) does in the browser for every glyph, with no judgement involved. With the decision left to the prompt, the outcome cannot be tested under the mock model. Path A templates are stored HTML that the model only fills, so the slot only takes effect where the model chooses to write the variable. The proposal also never says that the Sinhala family is added to the font request that `googleFontsUrl` builds. Without that request the variable names a font the renderer never loaded, and the OS fallback paints the text anyway. That is a half-landed feature. Round 2: no seat argued against this. party-security's save-route validation finding and party-visionary's script-keyed storage finding are compatible with it and do not change the layering problem.
**Fix:** Have code append the Sinhala family to the font stacks it emits, and add it to the `googleFontsUrl` request whenever the slot is set. The prompt can mention the slot, but correctness must not depend on it. Name the code site that injects the stack for Path A, Path B, refine and regenerate.
**Status:** upheld

### [WARN] party-architect — Apply finds "visible text" with a parser that has no layout, while the 030 check decides visibility in the page

**Quotes:** > **A. Apply to image (no model).** A new claimed draft action, `POST /api/drafts/[id]/apply-headline`. It parses the stored HTML with a real parser that keeps source offsets (`parse5`), finds the one innermost element whose visible text is the stamped old headline (the 030 normaliser), and splices in the new headline, HTML-escaped. Every other byte stays unchanged.
**Quotes:** > - the check runs **inside the render, before the write**, so a failed check writes nothing;
**Problem:** parse5 only builds a source tree. It has no CSS and no layout, so it cannot tell whether text is visible. "Visible" is only knowable in the render, and the check is placed there. That gives two components, the Node-side finder and the in-page check, each with its own idea of which element holds the headline. The proposal does not say which one is authoritative. It also does not say that the in-render check must confirm the very element the parse5 finder spliced, rather than any element showing the new text. Two implementers would build different rules for "visible" in the finder (skip `<title>`/`<head>`? skip `display:none`?), and the two halves can disagree without anyone noticing. Round 2: party-security's ambiguity finding (more than one match, so the old headline is still painted) is a consequence of this same unassigned authority. The two findings complement each other and neither replaces the other.
**Fix:** State that parse5 picks candidates by source position only, with a named exclusion list such as `head`, `title`, `script`, `style` and `template`. State that the in-render check is the only judge of visibility and must confirm the spliced element by its source offset or a marker attribute removed before the write.
**Status:** upheld

### [WARN] party-architect — Apply's write path is unnamed, although the proposal names the revision writer that does lost-claim cleanup

**Quotes:** > - The 019 regenerate-design lost-claim path removes the PNG it uploaded, as `commitDraftRevision` already does.
**Quotes:** > Styling inside the element (an accent span, line breaks) flattens to plain text; the confirm step says so. On success the stamp is the check's result, so the badge clears only when the image really shows the new headline.
**Quotes:** > - Three expected migrations (additive, each with a manual down script): the Sinhala font slot on `BrandKit`; the personal image key's provider (generalising `UserOpenAiKey`, with the data carried); any stamp or field Apply needs (expected none beyond 030's `renderedText`).
**Problem:** Apply is a new claimed action that writes HTML, a new PNG, a stamp and a revision. The proposal never says that it commits through `commitDraftRevision`, which it names elsewhere as the writer that already cleans up on a lost claim. A bespoke write in the new route would be a second revision writer. It would also re-create the orphaned-PNG defect that group H is fixing for regenerate design, and it would have to carry every per-revision stamp by hand. The co-changes a new claimed action needs are not listed either: the claim's action value, the poll's display of the pending action, and the guards that block other actions while one runs. The scope line says Apply needs no new field, but it does not say whether the claim's action set is a stored type that must grow, and therefore needs a migration. Round 2: party-security's BLOCK reaches the same fix for a different reason (recovery of the flattened styling), and party-visionary's NOTE also raises the persisted action value. Both support this finding.
**Fix:** State that Apply commits through `commitDraftRevision`. List the claimed-action co-changes. Say whether adding the action value needs a migration, and count it in the migration list.
**Status:** upheld

### [WARN] party-architect — The regenerate-design cleanup copies what `commitDraftRevision` does instead of going through it

**Quotes:** > - The 019 regenerate-design lost-claim path removes the PNG it uploaded, as `commitDraftRevision` already does.
**Problem:** The proposal names an existing mechanism that already removes the uploaded PNG on a lost claim. It then gives regenerate design the same behaviour "as" that mechanism, without saying whether regenerate design will call it or re-implement it. A second cleanup branch is a second copy of the 019 claim-loss handling, and the two will drift the first time either one changes. Round 2: party-security's NOTE (delete only the unique object key this run uploaded) is a property the shared path should have once. That argues for one cleanup site, not two.
**Fix:** Route regenerate design's write through `commitDraftRevision`, or extract the cleanup into one helper that both call. If neither is possible, state in the artifact why.
**Status:** upheld

### [WARN] party-architect — The new font catalogue snapshot sits next to the fixed list of 100 with no statement that it replaces it

**Quotes:** > - **The font picker is a fixed list of 100.** Instrument Serif is missing, and `googleFontsUrl` always asks for weights 400 to 700, which Google refuses for single-weight families such as Instrument Serif. No Sinhala family is offered, although posts are written in Sinhala (the image only ships `font-noto-sinhala` as an OS fallback).
**Quotes:** > - The full Google Fonts catalogue, as a committed metadata snapshot (family, category, real weights and styles, scripts) with a refresh script. The brand-kit font picker becomes searchable.
**Quotes:** > - The brand-kit assistant **applies** its proposed heading, body and Sinhala fonts (each checked against the catalogue) with the voice and colors, in one Apply, each part shown before you accept. Style stays advisory.
**Problem:** The proposal adds a font source of truth but never says the existing list of 100 is deleted. Four consumers need font facts: the picker, `googleFontsUrl` (weights), the assistant's Apply check, and E's typography pairing rule (category). Only the assistant is explicitly tied to the snapshot. The kit save path is not named as a validator either. A font arriving from the editor, an API route or the assistant could be checked against three different lists, or not checked at all. The proposal also does not say what happens to an existing kit whose stored family is missing from the snapshot. Group E's category-based pairing rule depends on B's snapshot, so the two must land together. Round 2: this still applies if party-po's cheaper variant (extend the curated list) is chosen. Either way there must be one list, and every reader and writer must go through it.
**Fix:** State that the snapshot replaces the list of 100, and that every font reader and every kit font writer checks against the snapshot through one lookup. Specify what happens to a stored family that is not in the snapshot.
**Status:** upheld

### [WARN] party-architect — The personal key's provider detection and data shape are unspecified, and C contradicts the scope line on DB names

**Quotes:** > **C. Personal image generation key.** `/settings` "OpenAI key" becomes "Image generation key". It accepts an OpenAI or a Gemini key, detected from the prefix as `/team` does, and generates with that provider. Existing personal OpenAI keys keep working with no re-entry (a data migration carries them). The resolver's personal tier serves either provider.
**Quotes:** > - Routes, API fields and DB names do not change (`/brief`, `Brief` stay).
**Problem:** "Detected from the prefix as `/team` does" can mean calling the team side's detector or writing a second one. A second prefix detector is a second parser of the same key grammar, and the two will diverge on the next provider. "Generalising `UserOpenAiKey`" with "a data migration carries them" admits two shapes: add a provider column to the existing table, or create a new table and copy the rows across. Those imply different routes, response fields and down scripts. Group G says DB names do not change, but that line is scoped to the glossary, so it does not settle whether C renames the model or its `/api/me` route and fields. Round 2: party-security (an additive `provider` column, and a reject on an unknown prefix) and party-visionary (one shared detector) each name a concrete resolution. Neither changes the fact that the artifact leaves the contract open.
**Fix:** Name the single prefix detector both sides call. Pick one data shape, either a column on the existing table or a new table. State whether the personal-key route and its response fields keep their current names.
**Status:** upheld

### [WARN] party-architect — The proposal does not say which spotlight SQUARE contract new generations get when OP-031 fails, or which ledger the cap of 4 counts against

**Quotes:** > **D. Spotlight SQUARE v2.** A new `spotlight` SQUARE contract (v2) aimed at the `busy` failure, its three fixtures, and an operator real-image check OP-031: the `run-look-check.mjs` runner and ledger, a cap of **4** image calls, and 2 accepted renders to pass. If it passes, Promotion and Milestone move to `spotlight` (a new post-style version and `POST_STYLES_REVISION` bump, interactive only). If it fails, they stay classic and the contract is recorded as failed.
**Problem:** v2 has to be in the dataset, with fixtures, before OP-031 runs, so it is merged whatever the outcome. The proposal says only what happens to the post-style defaults on a fail. It does not say whether a user who picks spotlight at SQUARE afterwards gets v1, the failed v2, or a fallback to classic. Two implementers would ship different resolver behaviour. The runner also has an existing ledger. The proposal does not say whether OP-031 uses a fresh output directory with its own cap of 4, or appends to the existing ledger, where the old cap and the new one would conflict. Round 2: party-ba and party-po address the pass bar, which is theirs to judge. The resolver and ledger contract is still unspecified.
**Fix:** State which contract the resolver serves for spotlight at SQUARE after a fail and after a pass. State that OP-031 uses its own `--out` directory and ledger, with the cap of 4 enforced there.
**Status:** upheld

### [WARN] party-architect — The two assistant block grammars change shape, but the new fields and the parsers' failure handling are not specified

**Quotes:** > - The campaign briefing assistant proposes a **post style** per planned post (one of the eight). The plan shows it and the queue entries save it. Its prompt changes; generation prompts do not.
**Quotes:** > - the briefing assistant's schedule still shows and saves "goal", which 027 replaced;
**Quotes:** > - The brand-kit assistant **applies** its proposed heading, body and Sinhala fonts (each checked against the catalogue) with the voice and colors, in one Apply, each part shown before you accept. Style stays advisory.
**Problem:** Both assistants emit a fenced block that code parses, and in each case the prompt and the parser have to agree. For the schedule block, the proposal does not say:

- the field name for the post style;
- whether `goal` is removed from the grammar or still accepted from old chats;
- what happens when the model names a key that is not one of the eight (drop the row, default it, or reject the plan);
- whether the batch queue write takes the post style through the existing post-style resolution or stores the raw key.

For the brand-kit block, the proposal names neither the font fields nor what "one Apply" does when one font fails the catalogue check. Either the whole Apply is refused, or the other parts still apply. Round 2: party-security's NOTE and party-visionary's WARN both ask for a check against the current, non-retired keys. That answers one bullet of this finding, and the grammar is still unspecified.
**Fix:** Specify both block grammars: the field names, the handling of unknown values, and partial-failure behaviour. State that the queue batch write resolves the post style the way the other queue writes do.
**Status:** upheld

### [WARN] party-architect — The second review host reuses the hook but names no server route for a campaign briefing

**Quotes:** > - The review panel in a **second host**, the campaign briefing editor, reusing `useRuleReview`.
**Problem:** The proposal reuses only the client hook. The Improve/Upgrade suggestions come from a server call, and today that call has a single host, the brand-kit editor. The proposal does not say whether the briefing editor calls the kit's endpoint, a generalised endpoint, or a new campaign-scoped route, or under which authorisation. The merge needs a server-side co-change for this host, and the proposal leaves it out. Building a separate campaign route would also create a second prompt builder for the same dataset.
**Fix:** Name the endpoint the briefing host calls, whether it is the existing route generalised over the host or a new one sharing the same builder, and its auth gate.
**Status:** upheld

### [NOTE] party-architect — Apply's closed failure vocabulary has no stated way to drive each code under the mock seams

**Quotes:** > - one closed failure vocabulary shared by the route, the badge and the event;
**Quotes:** > - Groups A to H above, each with unit tests, render fixtures where a check runs in Chromium, and E2E on the mock seams.
**Problem:** The vocabulary is shared by three components but none of its members are listed. The in-render check is what produces several of the codes. Under the mock seams there is no real render, so E2E reaches those codes only if a sentinel or seam forces each one. The proposal names none.
**Fix:** List the vocabulary in the spec, and name the mock sentinel or seam that forces each in-render failure code in E2E.
**Status:** upheld

### [NOTE] party-architect — Rebuttal to party-po's bundling BLOCK: the groups are not independent, so any cut line has to keep B with E's category rule and F's font Apply

**Quotes:** > One change, built in groups, each group with its own tasks and gates.
**Quotes:** > 2. **Typography rules.** Recommend measurable entries for: a heading-to-body size ratio (type scale), a maximum of two families plus the Sinhala slot, a minimum body size at each canvas size, and a pairing rule (heading and body contrast in category). The exact ranges come from the plan, cited.
**Quotes:** > - The brand-kit assistant **applies** its proposed heading, body and Sinhala fonts (each checked against the catalogue) with the voice and colors, in one Apply, each part shown before you accept. Style stays advisory.
**Quotes:** > - the brand-kit assistant shows font guesses it never applies;
**Problem:** party-po's finding says groups A to H "share no dependency". The artifact's own text couples them:

- E's pairing rule reads a family's category and counts the Sinhala slot. Only B's snapshot records category, and only B adds the slot.
- F's font Apply checks against B's catalogue and writes B's Sinhala slot.
- The G wording item "font guesses it never applies" is fixed by F's behaviour change, not by a wording edit.

This rebuttal does not argue for or against bundling, or for any release order; that is party-po's call. It only says the "independent" premise is structurally wrong. A cut line that ships E or F's font half without B, or ships G's font-guess item without F, would half-land.
**Fix:** If party-po's cut line is adopted, keep B, E's category and family-count rules, F's font Apply and G's font-guess wording item on the same side of it.
**Status:** upheld

### [BLOCK] party-ba — The wording scan that drives group G is asserted, not evidenced

**Quotes:**

> The **wording scan** (2026-10-26, read-only, about 20 MEDIUM findings and a long LOW tail) found UI text that misleads or is stale.
> Fix every MEDIUM finding of the 2026-10-26 scan and its LOW naming drift, using the user's glossary:
> **Problem:** Group G is the widest group, and it is scoped to "every MEDIUM finding" and "a long LOW tail". The proposal does not list the findings, link the scan output, or give a count for LOW. "Every" has no checkable denominator, and "about 20" is approximate. The proposal's own text gives only a dozen examples. The proposal is unchanged since round 1, so the objection stands.
> **Fix:** Commit the scan as a file in the change directory, with one numbered line per finding and its file and string. Scope group G to that list. Add an acceptance criterion: "each listed finding is fixed or recorded as dropped with a reason".
> **Status:** upheld

### [WARN] party-ba — The font problem is partly stated as a bug that is not shown, and the catalogue is a proxy for the user's need

**Quotes:**

> The font picker is a fixed list of 100. Instrument Serif is missing, and `googleFontsUrl` always asks for weights 400 to 700, which Google refuses for single-weight families such as Instrument Serif.
> The full Google Fonts catalogue, as a committed metadata snapshot (family, category, real weights and styles, scripts) with a refresh script.
> **Problem:** The pain is that Instrument Serif and JetBrains Mono cannot be used, and that Sinhala is not covered. The fix is the whole catalogue, a larger answer than the pain. The "Google refuses" claim has no source. It is unclear which font is actually missing, because the repo notes say the Hearts Academy kit already uses JetBrains Mono. It is also not evidenced that Sinhala posts rendered wrongly, since the OS fallback font already covers Sinhala.
> **Fix:** Cite the observed failure: the font tried, the URL requested, and Google's response. State whether Sinhala posts have rendered wrongly. Add an acceptance criterion that names the specific fonts and checks that each renders.
> **Status:** upheld

### [WARN] party-ba — "Apply to image" claims a 32-of-35 match rate, but the proposal's own text calls the sample non-representative

**Quotes:**

> The 030 measurement (35 real Path B drafts) found one innermost element holding the headline in 32 of 35.
> the match rate re-measured under the final rule (the sample called non-representative), plus the seeded Path A templates measured.
> **Problem:** The case for Apply rests on a figure the proposal itself discredits. No threshold is stated for the feature to be worth shipping. The re-measure is a requirement inside the build, not a gate before it, so the premise is checked after the work is committed.
> **Fix:** Make the re-measurement the first task of group A, with a stated threshold and a stated fallback if the rate falls below it. Flag the sample's limits wherever 32 of 35 is cited.
> **Status:** upheld

### [WARN] party-ba — Acceptance criteria are not stated, and several stated goals have no way to fail

**Quotes:**

> Groups A to H above, each with unit tests, render fixtures where a check runs in Chromium, and E2E on the mock seams.
> Existing personal OpenAI keys keep working with no re-entry (a data migration carries them).
> A **typography** part of the brand-kit design dataset: font pairing and type scale rules, measurable, with the detector and Improve/Upgrade covering them.
> **Problem:** The proposal has no acceptance criteria, only "each with unit tests". "Keep working with no re-entry" has no observation that would show failure. "The badge clears only when the image really shows the new headline" has no named test. The typography ranges are deferred to a plan, so they do not exist yet.
> **Fix:** Add one falsifiable acceptance line per group. For example: "a pre-existing personal OpenAI key row resolves and generates after migration"; "after Apply the stamp is verified:true and the badge is absent; a corrupted splice leaves htmlContent byte-identical".
> **Status:** upheld

### [WARN] party-ba — The Spotlight "busy" failure is attributed to the contract without evidence, and the pass bar is thin

**Quotes:**

> **Spotlight failed OP-028 on SQUARE** (`busy` twice), so Promotion and Milestone stay classic.
> A new `spotlight` SQUARE contract (v2) aimed at the `busy` failure, its three fixtures, and an operator real-image check OP-031: the `run-look-check.mjs` runner and ledger, a cap of **4** image calls, and 2 accepted renders to pass.
> **Problem:** The failure is two `busy` results on one size. The cause could be the contract geometry, the pixel-check threshold, or the model's behavior, and the proposal does not rule out the last two. A contract change would not fix a threshold fault. "2 accepted renders" out of 4 calls is a thin bar for changing two post styles' default look. It is also not stated whether failed attempts count against the pass.
> **Fix:** Cite the OP-028 SQUARE busy evidence (which regions, by how much). Say why a contract change addresses it. State a falsifiable pass rule that counts the failed attempts.
> **Status:** upheld

### [WARN] party-ba — "Brief"/"post", "Captions"/"Images" and "image generation key" are load-bearing terms with two readings

**Quotes:**

> "post", not "brief", in the UI;
> Routes, API fields and DB names do not change (`/brief`, `Brief` stay).
> Show the slot names as "Captions" / "Images".
> It accepts an OpenAI or a Gemini key, detected from the prefix as `/team` does, and generates with that provider.
> **Problem:** The glossary rule "post, not brief" has no list of where it applies and where it does not, so a blanket replacement could mislabel the input form. "Captions" may misdescribe the COPY slot, because the repo notes say that slot also drives brand-voice drafting. The proposal gives no precedence when a user holds a personal Gemini key and the team has a default OpenAI image row, or the reverse. Two builds are possible.
> **Fix:** Give each glossary rule a short applies and does-not-apply list. State the precedence between a personal key's provider and the team image row.
> **Status:** upheld

### [NOTE] party-ba — Assumed user behavior: operators will read the confirm step

**Quotes:**

> Styling inside the element (an accent span, line breaks) flattens to plain text; the confirm step says so.
> each part shown before you accept.
> **Problem:** The proposal relies on a confirm message to make users accept that styling is lost. It does not establish how often styled headlines occur, and the 32-of-35 count says nothing about child elements inside the headline element. The assumption is probably safe, but losing an accent span is a visible design change.
> **Fix:** Report the share of the 35 drafts whose headline element contains child elements.
> **Status:** upheld

### [BLOCK] party-po — Eight unrelated deliverables in one change, with no cut line and no do-nothing price for most

**Quotes:**

> One change, built in groups, each group with its own tasks and gates.
> **Files affected:** about 80 to 120 (estimated; the wording group touches many components).
> Size:** architectural.
> **Problem:** Groups A to H are independent. They share no dependency. The user chose a single change so there is a single verify before the merge, and that is a sequencing preference, not a value argument. The proposal still prices no do-nothing option per group, and it names no cut line between what must precede the merge and what can follow it. One failed gate delays every group, and one panel and one verify cover about 100 files.
> **Fix:** Name the cut line and add a one-line "if omitted, what is lost" per group. At minimum, mark which groups may slip past the merge without blocking it, such as B, E and D.
> **Status:** upheld

### [BLOCK] party-po — Group B builds the whole Google Fonts catalogue when most of the stated value is a few families and a weights bug

**Quotes:**

> The full Google Fonts catalogue, as a committed metadata snapshot (family, category, real weights and styles, scripts) with a refresh script. The brand-kit font picker becomes searchable.
> Instrument Serif is missing, and `googleFontsUrl` always asks for weights 400 to 700
> **Problem:** The stated pain is a few missing families, no Sinhala families, and a weights bug. A cheaper variant fixes all three: extend the existing list by about 20 to 30 families, add a per-family weights field, and make the URL weight-aware. The proposal never prices that variant against a roughly 1,500-family snapshot, a refresh script and a new picker UX. The user did choose the full catalogue, but the proposal does not show that the user compared the two costs.
> **Fix:** Price the curated-list variant. Ship the weights fix and the Sinhala slot first, and make the full catalogue a separable step.
> **Status:** upheld

### [WARN] party-po — Apply-to-image is the largest build in the change and its value rests on a match rate the proposal has not yet measured

**Quotes:**

> the match rate re-measured under the final rule (the sample called non-representative), plus the seeded Path A templates measured.
> One new npm dependency, `parse5` (030 Open Question 3, option a).
> **Problem:** The measurement is a deliverable inside the build, not a gate before it. The new action, the dependency, the splice, the re-parse diff and the failure vocabulary are all built first. The do-nothing price is unquantified: nothing says how often the stale badge fires, or how often Regenerate is the unwanted cost.
> **Fix:** Make the re-measurement a go/no-go step before the splice is built, with a stated threshold. State how often the stale badge fires.
> **Status:** upheld

### [WARN] party-po — Real-spend OP-031 has a poor expected return, and the "move defaults" outcome has no stated size

**Quotes:**

> a cap of **4** image calls, and 2 accepted renders to pass.
> If it passes, Promotion and Milestone move to `spotlight`
> **Problem:** Spotlight SQUARE failed `busy` twice in OP-028. A pass bar of 2 accepted renders out of 4 is weaker than 028's rule, which required every contract to keep its style. The prize is a default image style on two of eight post styles. The do-nothing option, leaving those two on classic, costs nothing.
> **Fix:** State the pass rule in 028 terms, price the do-nothing option, or defer D to a separate change after the merge.
> **Status:** upheld

### [WARN] party-po — The wording sweep touches an unbounded number of files and its recurring cost (E2E locator breakage) is unpriced

**Quotes:**

> Fix every MEDIUM finding of the 2026-10-26 scan and its LOW naming drift, using the user's glossary:
> The wording sweep could break E2E locators that match on text: the full suite runs at the end.
> **Problem:** Only the MEDIUM items have a stated misleading effect. The LOW tail drives the file count and the locator risk. Running E2E only at the end hides which edit broke which test.
> **Fix:** Commit to MEDIUM only, with the LOW tail as a mechanical follow-up. If the sweep stays, run the full E2E suite after group G lands and before the feature groups start.
> **Status:** upheld

### [WARN] party-po — The personal key change spends a data migration and a resolver change to generalise a provider that is mock-verified only

**Quotes:**

> It accepts an OpenAI or a Gemini key, detected from the prefix as `/team` does, and generates with that provider.
> **A live Gemini call** (005 follow-up). The user skipped it; Gemini stays mock-verified only, a known limit.
> **Problem:** The delivered Gemini half cannot be shown to work. The cost is a migration that carries user secrets, a resolver change and a UI rename. The label-only variant, "OpenAI image key", captures the "stops misleading" value for none of that cost.
> **Fix:** Price the label-only variant, or ship the Gemini half after a live check.
> **Status:** upheld

### [NOTE] party-po — Typography rules, a second review host, and the assistants' post-style proposals are low-demand scope with no stated value

**Quotes:**

> A **typography** part of the brand-kit design dataset: font pairing and type scale rules, measurable, with the detector and Improve/Upgrade covering them.
> The campaign briefing assistant proposes a **post style** per planned post (one of the eight).
> **Problem:** No demand or problem statement is given for the typography dataset or the second host. Typography also depends on group B's font work. F's post-style fix does repair a stale `goal`, so it has a stated value.
> **Fix:** Mark E as droppable before the merge. Keep F's post-style fix.
> **Status:** upheld

### [BLOCK] party-security — Apply overwrites styled HTML with no stated way back

**Quotes:**

> Styling inside the element (an accent span, line breaks) flattens to plain text; the confirm step says so. On success the stamp is the check's result, so the badge clears only when the image really shows the new headline.
> **Problem:** Apply loses data by design. It flattens the accent spans and line breaks inside the headline element, then writes the result over the stored HTML and the export. The proposal names a confirm step but never says where the original goes afterwards. It does not say that Apply appends a `DraftRevision` or moves the revision pointer, so nothing in the design shows that Undo or a version switch can bring back the styled headline. A confirm dialog gets consent; it does not give recovery. Once a later refine or regenerate starts from the flattened HTML, the styling is gone for good. Round 2: party-architect's finding that Apply's write path is unnamed reaches the same gap from the structural side, and party-ba's NOTE confirms the flattening rate is unknown. Nothing in round 1 showed a recovery path, so this stands.
> **Fix:** State that Apply writes only through `commitDraftRevision`: a new revision, the pointer advanced, and the earlier styled revision kept, so Undo or a version switch restores the original byte for byte. Add a test that applies, restores, and asserts the original HTML comes back unchanged.
> **Status:** upheld

### [WARN] party-security — Apply's success check proves the new headline is painted, not that the old one is gone

**Quotes:**

> A new claimed draft action, `POST /api/drafts/[id]/apply-headline`. It parses the stored HTML with a real parser that keeps source offsets (`parse5`), finds the one innermost element whose visible text is the stamped old headline (the 030 normaliser), and splices in the new headline, HTML-escaped. Every other byte stays unchanged.
>
> - re-parse after the splice and check that nothing outside the element changed;
>   **Problem:** The proposal does not say what happens when more than one element matches the old headline. One example is a headline repeated as a watermark or a decorative echo. Another is a static parse that counts a copy hidden by CSS as visible. If the splice takes the first match, both checks pass. The re-parse check passes because the other copy was left unchanged, as required. The in-render check passes because the new headline is painted. The badge then clears and the event reports success while the image still shows the old headline. That is a green result on exactly the failure 030 exists to detect. Round 2: "the one innermost element" could be read as a uniqueness requirement, but the proposal never states a refusal when there are several matches. party-architect's point that parse5 has no notion of visibility makes a hidden or duplicate copy more likely to slip through, not less.
>   **Fix:** When more than one candidate matches, refuse with a named code from the closed vocabulary (for example `apply-ambiguous`). Extend the in-render check so the old headline must also no longer appear as painted text before the stamp is written.
>   **Status:** upheld

### [WARN] party-security — Prefix detection with no rule for an unknown prefix can send a secret to the wrong vendor

**Quotes:**

> **C. Personal image generation key.** `/settings` "OpenAI key" becomes "Image generation key". It accepts an OpenAI or a Gemini key, detected from the prefix as `/team` does, and generates with that provider. Existing personal OpenAI keys keep working with no re-entry (a data migration carries them). The resolver's personal tier serves either provider.
> **Problem:** The provider is inferred from text the user pastes in. The proposal does not say what happens when the prefix matches neither provider. If it defaults to OpenAI, which is how this field behaves today, a Gemini key or an unrelated secret goes to a third party it was never meant for, in an Authorization header. The key is also stored under the wrong provider and fails on every generation. Round 2: party-architect's request for one shared detector fixes the drift between the two sides. It does not fix this failure: a shared detector that defaults on an unknown prefix fails open on both sides at once.
> **Fix:** At save time, reject any key whose prefix matches neither known provider with a 400 that names the accepted formats, and never default. Store the detected provider explicitly, and show it next to the masked prefix so the user can see which vendor will receive the key.
> **Status:** upheld

### [WARN] party-security — A never-live-tested personal Gemini key takes precedence over a working team key, and a failure is silent

**Quotes:**

> The resolver's personal tier serves either provider.
>
> - **A live Gemini call** (005 follow-up). The user skipped it; Gemini stays mock-verified only, a known limit.
>   **Problem:** Personal keys now take precedence over the team key for Gemini too, and the Gemini path has never made a real call. A user who saves a personal Gemini key therefore sends every interactive generation through an untested provider, ahead of a team OpenAI key that works. The proposal does not say whether a failed personal call falls back to the team tier. It also does not say whether the user sees anything when the background or hero image is skipped. Image steps are built to degrade quietly (skip the background, fall back to classic), so a broken personal key looks like a run that simply produced no image. Round 2: party-ba independently found that precedence between providers is unstated, and party-po that the Gemini half is unproven. Both support this finding.
>   **Fix:** State the failure rule. On a personal-tier provider error, either fall back once to the team tier (as the Claude token does), or show a named notice on the draft that names the personal key as the cause. Record on the draft which tier and provider ran, so the degradation can be diagnosed afterwards.
>   **Status:** upheld

### [WARN] party-security — The rollback of the personal-key migration has no stated handling for Gemini rows

**Quotes:**

> - Three expected migrations (additive, each with a manual down script): the Sinhala font slot on `BrandKit`; the personal image key's provider (generalising `UserOpenAiKey`, with the data carried); any stamp or field Apply needs (expected none beyond 030's `renderedText`).
>   **Problem:** Generalising a table whose rows today mean "this is an OpenAI key" is the one migration here whose rollback is not neutral. Once users have saved Gemini keys, the down script has three options, and each has a cost:

- Folding all rows back hands Gemini secrets to old code, which sends them to OpenAI.
- Dropping them silently loses users' keys.
- Renaming the table is not additive, so the previous image cannot run against the migrated schema during a rollback.

The proposal names a down script but not which of these it does. Round 2: party-visionary filed the design-commitment side (the change is one-way once a Gemini key exists). This finding is the runtime side: what a rollback does to stored secrets. Both stand.
**Fix:** Keep the migration strictly additive: add a `provider` column, defaulting to `OPENAI`, to the existing table, with no rename. The previous image then still reads the OpenAI rows correctly. The down script explicitly deletes the non-OpenAI rows, and the release note says those users must re-enter their key after a rollback.
**Status:** upheld

### [WARN] party-security — The manually set Sinhala slot reaches the design prompt and the font URL with no stated check

**Quotes:**

> - A **Sinhala font slot** per brand kit (for example Noto Sans Sinhala, Noto Serif Sinhala, Abhaya Libre, Yaldevi, Gemunu Libre). The design prompts get it as a CSS variable, used for Sinhala text. Without one, today's OS fallback stays.
> - The brand-kit assistant **applies** its proposed heading, body and Sinhala fonts (each checked against the catalogue) with the voice and colors, in one Apply, each part shown before you accept. Style stays advisory.
>   **Problem:** The catalogue check is stated only for the assistant's Apply. The slot is a new free-text kit field, and its value goes into every design prompt (as a CSS variable the model is told to use) and into the Google Fonts URL. Nothing says the save route checks the value against the catalogue. Nothing says either path checks that the family actually covers the Sinhala script. A Latin-only family passes "is in the catalogue", then renders Sinhala in the OS fallback with no signal. Round 2: party-architect's BLOCK proposes that code append the family to the emitted font stacks and the `googleFontsUrl` request. That is the right structure, but it moves this stored value directly into generated CSS and a URL without passing through the model, which makes the save-time check more necessary.
>   **Fix:** Validate on the kit save route, not only on Apply. The value must be an exact catalogue family whose `scripts` include `sinhala`; otherwise return a 400. Wherever the value enters a prompt, a CSS stack or a URL, use the stored catalogue name, not the submitted string.
>   **Status:** upheld

### [WARN] party-security — A font the snapshot does not know, or that Google rejects, fails silently into a fallback face

**Quotes:**

> - `googleFontsUrl` asks only for the weights a family has.
>   **Problem:** The URL builder now depends on the snapshot, and the proposal does not say what it does for a family the snapshot lacks. Such families exist: an existing kit's font, a family Google later retires, or a family added after a stale snapshot was taken. The bug this group fixes shows the failure mode: Google refuses the request and the post renders in a fallback face. Nothing marks the export as off-brand, so the wrong font ships looking like a normal render. Round 2: party-visionary and party-architect each independently found that the behaviour for a family missing from the snapshot is unspecified. This finding adds that the failure is invisible at render time.
>   **Fix:** For an unknown family, request no weight list (Google's default) rather than a guessed range, and log it. In the renderer, check `document.fonts` for the kit's families after load. When a requested family did not load, record a named render note so the degradation is visible on the draft.
>   **Status:** upheld

### [NOTE] party-security — Validate the model-proposed post style before it is shown or saved

**Quotes:**

> - The campaign briefing assistant proposes a **post style** per planned post (one of the eight). The plan shows it and the queue entries save it. Its prompt changes; generation prompts do not.
>   **Problem:** The style key is model output, and the assistant is grounded on uploaded campaign documents. "One of the eight" describes the prompt, not a check. A retired key or an unknown key could reach the plan, and a retired key still resolves under the 027 rule, so it would be saved without error. Round 2: party-architect (the parser's handling of unknown values) and party-visionary (the prompt's list drifting from the dataset) reach the same entry point.
>   **Fix:** Parse the schedule block against the current, non-retired style keys. Replace anything else with the campaign default or `general`, and flag the replacement in the plan before the user accepts.
>   **Status:** upheld

### [NOTE] party-security — Scope both new delete paths to objects this run created

**Quotes:**

> - Unit runs leave no `bistec-cli-*` temp dirs.
> - The 019 regenerate-design lost-claim path removes the PNG it uploaded, as `commitDraftRevision` already does.
>   **Problem:** Both items add deletion. A cleanup that sweeps `os.tmpdir()` by the `bistec-cli-*` prefix would also delete the live directories of a dev or OP server running on the same machine. A lost-claim delete keyed on a path derived from the draft could remove the winning run's export if the keys can collide. Round 2: party-architect's request to route the cleanup through `commitDraftRevision` or one shared helper is compatible with this. The helper must still delete only the key this run uploaded.
>   **Fix:** Delete only the exact temp directory path the test or spawn created (kept in a variable and removed in `finally`), never by glob. For the PNG, delete only the unique object key this run uploaded, never the draft's current `exportUrl`.
>   **Status:** upheld

### [NOTE] party-security — The assistant's font Apply overwrites kit fonts with no record of the previous values

**Quotes:**

> - The brand-kit assistant **applies** its proposed heading, body and Sinhala fonts (each checked against the catalogue) with the voice and colors, in one Apply, each part shown before you accept. Style stays advisory.
>   **Problem:** Voice changes are versioned, but kit fonts, like colors, are plain fields. The assistant's proposal is model output grounded on uploaded documents. A mistaken Apply changes every later post, and the proposal names no record of the previous fonts to revert to.
>   **Fix:** In the accept view, show the current value next to each proposed font. Record the replaced values (for example in the voice version written by the same Apply) so an admin can restore them.
>   **Status:** upheld

### [WARN] party-visionary — The Sinhala slot sets a one-column-per-script precedent that the next script copies into four places

**Quotes:**

> - A **Sinhala font slot** per brand kit (for example Noto Sans Sinhala, Noto Serif Sinhala, Abhaya Libre, Yaldevi, Gemunu Libre). The design prompts get it as a CSS variable, used for Sinhala text. Without one, today's OS fallback stays.

> - The brand-kit assistant **applies** its proposed heading, body and Sinhala fonts (each checked against the catalogue) with the voice and colors, in one Apply, each part shown before you accept. Style stays advisory.

> 2. **Typography rules.** Recommend measurable entries for: a heading-to-body size ratio (type scale), a maximum of two families plus the Sinhala slot, a minimum body size at each canvas size, and a pairing rule (heading and body contrast in category). The exact ranges come from the plan, cited.
>    **Problem:** The artifact names Sinhala in four separate places: a `BrandKit` column, a CSS variable in the design prompts, the assistant's Apply, and a typography rule ("two families plus the Sinhala slot"). The next plausible change is a Tamil slot, since Tamil is Sri Lanka's other official language and the obvious second script for this team. That change would have to add a second column with its own migration and down script, a second prompt variable with a `PROMPT_VERSION` bump, a third font in the assistant's Apply block, and a rewrite of the typography rule's count. Nothing fails if one of the four is missed. A contributor who misses the rule's count gets a detector that flags every Tamil-enabled kit as over the family limit. The proposal already builds the seam that would avoid this: its catalogue snapshot records `scripts` for each family. But the slot is keyed to one script by name, not by that field. Round 2: party-architect's BLOCK (code appends the Sinhala family to the font stacks and the font URL) makes this sharper. If the stack injection is keyed by script, the next script is one loop iteration. If it is keyed to Sinhala by name, it is a fifth place the next script has to touch.
>    **Fix:** Store script fonts keyed by the catalogue's script id (for example `scriptFonts: { sinh: "Noto Sans Sinhala" }`). Have code derive one stack entry, and one URL family, for each key present. State the typography rule as "two families plus one per script". Then the next script is a data entry. If a dedicated column is kept, say in the artifact that it is a deliberate one-off, so the next script does not copy it.
>    **Status:** upheld

### [WARN] party-visionary — The briefing assistant's prompt becomes another copy of the post-style list, and nothing fails when the dataset changes

**Quotes:**

> - The campaign briefing assistant proposes a **post style** per planned post (one of the eight). The plan shows it and the queue entries save it. Its prompt changes; generation prompts do not.
>   **Problem:** "One of the eight" makes the assistant prompt another picker of post styles, written as prose. The next change that adds a ninth style or retires one edits the post-style dataset. Unless the prompt text is generated from that dataset, the assistant keeps offering the old eight: it never proposes the new style, and it keeps proposing the retired one. A retired key still resolves, so the queue entry saves without error. The drift surfaces only when someone notices a campaign planning around a style the picker no longer shows, which could take months. Round 2: party-security's NOTE and party-architect's grammar WARN cover validating the key when it arrives, which is a merge-day guard. This finding is about where the list in the prompt comes from, so it does not duplicate them, and the two fixes compose.
>   **Fix:** Build the prompt's style list from the dataset's current, non-retired styles at call time. Validate each proposed key through the single post-style resolver before the plan is shown. State both in the artifact.
>   **Status:** upheld

### [WARN] party-visionary — The committed font snapshot is a second copy of Google's catalogue with no owner and no rule for what a refresh may remove

**Quotes:**

> - The full Google Fonts catalogue, as a committed metadata snapshot (family, category, real weights and styles, scripts) with a refresh script. The brand-kit font picker becomes searchable.

> - `googleFontsUrl` asks only for the weights a family has.
>   **Problem:** After merge, three things read the snapshot: the picker, the URL builder and the assistant's font check ("each checked against the catalogue"). Google keeps changing the live catalogue: families are added, renamed and delisted, and weights change. The artifact names a refresh script but gives it no owner, no cadence and no contract. Two kinds of drift follow, and neither shows up quickly. First, a family Google adds after the snapshot is missing from the picker. That is the Instrument Serif complaint this change exists to fix, and it comes back silently. Second, a refresh that drops or renames a family a kit already uses leaves the URL builder with no weights for that family. The artifact does not say what the builder then requests. The kit's next save, or the assistant's next Apply, may also reject a font the kit has used for months. This first surfaces as a post rendering in a fallback face, long after the refresh that caused it. Round 2: party-security's WARN covers what the renderer does today with an unknown family. This finding is about what a future refresh is allowed to remove. If party-po's curated-list variant is chosen instead, the finding still holds in a weaker form, because a hand-kept weights field also drifts from Google.
>   **Fix:** Write the refresh contract into the artifact. A refresh never removes a family that any kit references; it keeps the family and marks it delisted. The URL builder has a defined behaviour for a family missing from the snapshot. The snapshot records the date it was taken, so a stale picker can be traced to it.
>   **Status:** upheld

### [WARN] party-visionary — The glossary is enforced once by a manual sweep, with nowhere for it to live and nothing to stop the drift coming back

**Quotes:**

> - Fix every MEDIUM finding of the 2026-10-26 scan and its LOW naming drift, using the user's glossary:

> - "post", not "brief", in the UI;

> - "Template" / "Freeform", not "Path A" / "Path B";

> - Routes, API fields and DB names do not change (`/brief`, `Brief` stay).
>   **Problem:** This makes the gap between UI words and code words permanent. The UI will say "post" and "Template"; the routes, fields and models will still say `brief`, `Brief` and Path A. Every future contributor works in code that uses the old words and has to translate them when writing UI text. The scan exists because that translation has already failed: there are five spellings of "brand kit". The artifact fixes today's strings but names no lasting home for the glossary and no check, so the first feature after the merge brings the drift back and the next sweep is another manual scan. Once this lands, "post" is also overloaded. In the UI it names what the code calls a `Brief`, while the code already has a `Post` model for publish records. The next contributor who adds something like "Delete post" or "post count" has to guess which one is meant. Round 2: party-ba's WARN (a brief is the input and a post is the output, so a blanket swap can be wrong) is the same overload seen at merge. party-po's proposal to split off the LOW tail makes a durable check more valuable, not less: whatever the sweep leaves behind should at least not grow.
>   **Fix:** Write the glossary, including the UI-to-code mapping and the `Post`/`Brief` distinction, into the design-system doc. Add a deny-list test over UI strings ("Path A", "Path B", "Brand Kit", "copy provider", "colour") so drift fails a gate instead of waiting for the next scan.
>   **Status:** upheld

### [WARN] party-visionary — The Apply failure vocabulary is stored in analytics events, but the artifact never says it is append-only

**Quotes:**

> - one closed failure vocabulary shared by the route, the badge and the event;
>   **Problem:** Once Apply events land in the event store, each failure reason is a stored value that the insights queries group by, and the badge copy is keyed on the same values. The next change to Apply will want to rename, split or merge a reason. That could be the change that widens Apply beyond the headline, or one that adds a new reserved token type. A rename splits history at the deploy date, and the insights page under-counts both the old and the new name until retention ages the old rows out. The artifact makes this vocabulary closed and shared but never states the rule that keeps it safe to share: keys are never renamed or reused, and new reasons are only added. Without that rule, the next contributor will treat the vocabulary as an ordinary enum they can tidy. Round 2: party-architect's NOTE asks for the members to be listed, and party-security's WARN adds one (`apply-ambiguous`). Both make the list concrete; neither states how it may change after merge.
>   **Fix:** State the key rule for the failure vocabulary in the artifact: append-only, never renamed, and a retired reason stays readable. Import the vocabulary into the event schema rather than copying it.
>   **Status:** upheld

### [NOTE] party-visionary — Apply is named and built for the headline only, though the stamp it reads is keyed by field

**Quotes:**

> **A. Apply to image (no model).** A new claimed draft action, `POST /api/drafts/[id]/apply-headline`. It parses the stored HTML with a real parser that keeps source offsets (`parse5`), finds the one innermost element whose visible text is the stamped old headline (the 030 normaliser), and splices in the new headline, HTML-escaped. Every other byte stays unchanged.

> - **Other on-image text** (CTA, kicker) in Apply.
>   **Problem:** This change builds the costly, reusable parts: an offset-preserving parser, a single-element splice, a post-splice integrity check and a verified stamp. The stamp it reads, `renderedText`, is already keyed by field. But the route is named for the headline, and so, presumably, are the draft-action value and the event that go with it. The obvious next change is Apply for the CTA or the kicker, which the artifact names as out of scope. That change would have to add a second route, a second action value, a second event and probably a second badge path, each copying this one. The artifact plans for a second Apply method (the event's `method` field) but not for a second text field. Round 2: party-architect's WARN asks whether the claim's action set is a stored type that needs a migration. That is the open assumption this finding rested on. If it is a persisted enum, `apply-headline` is the value that is harder to remove later than to add.
>   **Fix:** Name the action, route and event by field rather than for the headline: for example `apply-text` with `field: "headline"`, the field drawn from the stamp's keys, and the event carrying `field` next to `method`. The CTA change then adds a stamp key and fixtures, not a second route.
>   **Status:** upheld

### [NOTE] party-visionary — The catalogue makes the pairing rule checkable in code, but the proposal leaves it as a text rule

**Quotes:**

> 2. **Typography rules.** Recommend measurable entries for: a heading-to-body size ratio (type scale), a maximum of two families plus the Sinhala slot, a minimum body size at each canvas size, and a pairing rule (heading and body contrast in category). The exact ranges come from the plan, cited.
> **Problem:** After this change a kit holds its heading and body fonts as structured fields, and the catalogue records each family's category. Two of these rules, "heading and body contrast in category" and the family count, can therefore be checked exactly against the kit's own data. The proposal instead routes them through the wording detector and Improve/Upgrade, which check the kit's prose. The prose and the structured fonts can then disagree: the prose passes the rule while the fonts break it. The per-canvas-size minimum also adds one more table keyed by post size. The next size the app supports will need an entry here as well as wherever sizes are defined, and the artifact names no completeness check that would catch a missing entry. Round 2: party-po's NOTE marks E as droppable before the merge. If E stays, this holds as written.
> **Fix:** Check the category and family-count rules in code against the kit's fonts and the catalogue. Keep the wording detector for the rules that exist only as prose. Add a completeness test that fails when a supported post size has no minimum body size.
> **Status:** upheld

### [NOTE] party-visionary — Rebuttal of party-po's catalogue BLOCK: the curated-list variant is cheaper at merge and costlier to live with

**Quotes:**

> - The full Google Fonts catalogue, as a committed metadata snapshot (family, category, real weights and styles, scripts) with a refresh script. The brand-kit font picker becomes searchable.
>   **Problem:** party-po prices the full snapshot against "the existing list of 100, extended by 20 to 30 families with a per-family weights field". Over a year, the curated variant keeps the tax that produced this complaint. Every font a kit owner wants next, the way Instrument Serif was wanted here, is a code change, a review and a deploy. The per-family weights field is copied from Google by hand, so the bug this group fixes (a URL that asks for weights a family lacks) comes back on the first entry someone types wrong. Nothing generated would catch it. The snapshot pays a one-time size cost and moves both facts behind a script. My snapshot WARN is the price of that: it needs a refresh contract. But that price is smaller than one hand edit per requested font, forever. This rebuts the BLOCK's severity and its "cheaper" claim, not its request to price both options. Splitting the weights fix and the slot out first, as party-po suggests, is compatible with either variant.
>   **Fix:** If the panel prices the two variants, count the curated list's recurring cost (one code change per requested font, and hand-copied weights) alongside the snapshot's repo weight and refresh script. Keep the snapshot only with the refresh contract from my WARN.
>   **Status:** upheld

## Dissent

_Withdrawn findings. The severity token is prefixed WITHDRAWN so these do not count as live findings._

### [WITHDRAWN WARN] party-visionary — Generalising the personal key is reversible only until the first Gemini key is saved, and the artifact calls it additive

**Quotes:**

> - Three expected migrations (additive, each with a manual down script): the Sinhala font slot on `BrandKit`; the personal image key's provider (generalising `UserOpenAiKey`, with the data carried); any stamp or field Apply needs (expected none beyond 030's `renderedText`).

> **C. Personal image generation key.** `/settings` "OpenAI key" becomes "Image generation key". It accepts an OpenAI or a Gemini key, detected from the prefix as `/team` does, and generates with that provider. Existing personal OpenAI keys keep working with no re-entry (a data migration carries them).
> **Problem:** The migration is described as additive with a down script, but the decision stops being reversible on the day the first user saves a Gemini key. A down migration back to an OpenAI-only shape has nowhere to put that row. The section also adds a second place that knows which key prefixes map to which provider.
> **Fix:** Say in the artifact that this migration is one-way once a non-OpenAI key exists, and what the down script does with those rows. State that the personal and team sides call one shared prefix detector.
> **Status:** withdrawn — subsumed. party-security's rollback WARN names the same one-way point and gives the concrete answer: an additive `provider` column defaulting to `OPENAI`, a down script that deletes non-OpenAI rows, and a release note telling those users to re-enter their key. party-architect's WARN covers the single shared detector and the drift on the next provider. Nothing in this finding is mine alone.
