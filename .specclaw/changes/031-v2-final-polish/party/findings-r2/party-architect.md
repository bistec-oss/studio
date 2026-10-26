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
