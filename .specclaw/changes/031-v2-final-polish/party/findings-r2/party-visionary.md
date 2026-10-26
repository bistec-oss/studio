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

### [WARN] party-visionary — Generalising the personal key is reversible only until the first Gemini key is saved, and the artifact calls it additive

**Quotes:**

> - Three expected migrations (additive, each with a manual down script): the Sinhala font slot on `BrandKit`; the personal image key's provider (generalising `UserOpenAiKey`, with the data carried); any stamp or field Apply needs (expected none beyond 030's `renderedText`).

> **C. Personal image generation key.** `/settings` "OpenAI key" becomes "Image generation key". It accepts an OpenAI or a Gemini key, detected from the prefix as `/team` does, and generates with that provider. Existing personal OpenAI keys keep working with no re-entry (a data migration carries them).
> **Problem:** The migration is described as additive with a down script, but the decision stops being reversible on the day the first user saves a Gemini key. A down migration back to an OpenAI-only shape has nowhere to put that row. The section also adds a second place that knows which key prefixes map to which provider.
> **Fix:** Say in the artifact that this migration is one-way once a non-OpenAI key exists, and what the down script does with those rows. State that the personal and team sides call one shared prefix detector.
> **Status:** withdrawn — subsumed. party-security's rollback WARN names the same one-way point and gives the concrete answer: an additive `provider` column defaulting to `OPENAI`, a down script that deletes non-OpenAI rows, and a release note telling those users to re-enter their key. party-architect's WARN covers the single shared detector and the drift on the next provider. Nothing in this finding is mine alone.

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
