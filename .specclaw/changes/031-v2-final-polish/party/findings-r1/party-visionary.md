### [WARN] party-visionary — The Sinhala slot sets a one-column-per-script precedent that the next script copies into four places

**Quotes:**

> - A **Sinhala font slot** per brand kit (for example Noto Sans Sinhala, Noto Serif Sinhala, Abhaya Libre, Yaldevi, Gemunu Libre). The design prompts get it as a CSS variable, used for Sinhala text. Without one, today's OS fallback stays.

> - The brand-kit assistant **applies** its proposed heading, body and Sinhala fonts (each checked against the catalogue) with the voice and colors, in one Apply, each part shown before you accept. Style stays advisory.

> 2. **Typography rules.** Recommend measurable entries for: a heading-to-body size ratio (type scale), a maximum of two families plus the Sinhala slot, a minimum body size at each canvas size, and a pairing rule (heading and body contrast in category). The exact ranges come from the plan, cited.
>    **Problem:** The artifact names Sinhala in four separate places: a `BrandKit` column, a CSS variable in the design prompts, the assistant's Apply, and a typography rule ("two families plus the Sinhala slot"). The next plausible change is a Tamil slot, since Sri Lanka's other official language is the obvious second script for this team. That change has to add a second column with its own migration and down script, a second prompt variable with a `PROMPT_VERSION` bump, a third font in the assistant's Apply block, and a rewrite of the typography rule's count. Nothing fails if one of the four is missed. A contributor who misses the rule's count gets a detector that flags every Tamil-enabled kit as over the family limit. The proposal already builds the seam that would avoid this: its catalogue snapshot records `scripts` for each family. But the slot is keyed to one script by name, not by that field.
>    **Fix:** Store script fonts keyed by the catalogue's script id (for example `scriptFonts: { sinh: "Noto Sans Sinhala" }`). Derive one prompt variable per present key, and state the typography rule as "two families plus one per script". Then the next script is a data entry. If a dedicated column is kept, say in the artifact that it is a deliberate one-off, so the next script does not copy it.
>    **Status:** upheld

### [WARN] party-visionary — The briefing assistant's prompt becomes another copy of the post-style list, and nothing fails when the dataset changes

**Quotes:**

> - The campaign briefing assistant proposes a **post style** per planned post (one of the eight). The plan shows it and the queue entries save it. Its prompt changes; generation prompts do not.
>   **Problem:** "One of the eight" makes the assistant prompt another picker of post styles, written as prose. The next change that adds a ninth style, or retires one, edits the post-style dataset. Unless the prompt text is generated from that dataset, the assistant keeps offering the old eight. It never proposes the new style, and it keeps proposing the retired one. A retired key still resolves, so the queue entry saves without error and the drift surfaces only when someone notices a campaign planning around a style the picker no longer shows. That could take months. The schedule block is model output, so it is also a second place where a style key enters the system outside the wizard's picker.
>   **Fix:** Build the prompt's style list from the dataset's current, non-retired styles at call time. Validate each proposed key through the single post-style resolver before the plan is shown, and state both in the artifact.
>   **Status:** upheld

### [WARN] party-visionary — The committed font snapshot is a second copy of Google's catalogue with no owner and no rule for what a refresh may remove

**Quotes:**

> - The full Google Fonts catalogue, as a committed metadata snapshot (family, category, real weights and styles, scripts) with a refresh script. The brand-kit font picker becomes searchable.

> - `googleFontsUrl` asks only for the weights a family has.
>   **Problem:** After merge, three things read the snapshot: the picker, the URL builder and the assistant's font check ("each checked against the catalogue"). Google keeps changing the live catalogue. Families are added, renamed and delisted, and weights change. The artifact names a refresh script but no owner, no cadence and no contract for a refresh. Two kinds of drift follow, and neither shows up quickly. First, a family Google adds after the snapshot is missing from the picker. That is exactly the Instrument Serif complaint this change exists to fix, and it comes back silently. Second, a refresh that drops or renames a family a kit already uses means the URL builder has no weights for that family. The artifact does not say what the builder then requests. The kit's next save, or the assistant's next Apply, may also reject a font the kit has used for months. This first surfaces as a post rendering in a fallback face, long after the refresh that caused it.
>   **Fix:** Write the refresh contract into the artifact. A refresh never removes a family that any kit references; it keeps the family and marks it delisted. The URL builder has a defined behaviour for a family missing from the snapshot. The snapshot records the date it was taken, so a stale picker can be traced to it.
>   **Status:** upheld

### [WARN] party-visionary — The glossary is enforced once by a manual sweep, with nowhere for it to live and nothing to stop the drift coming back

**Quotes:**

> - Fix every MEDIUM finding of the 2026-10-26 scan and its LOW naming drift, using the user's glossary:

> - "post", not "brief", in the UI;

> - "Template" / "Freeform", not "Path A" / "Path B";

> - Routes, API fields and DB names do not change (`/brief`, `Brief` stay).
>   **Problem:** This makes the gap between UI words and code words permanent. The UI says "post" and "Template"; the routes, fields and models say `brief`, `Brief` and Path A. Every future contributor works in code that uses the old words and has to translate them when writing UI text. The scan exists because that translation has already failed: there are five spellings of "brand kit". The artifact fixes today's strings but names no lasting home for the glossary and no check. So the first feature after the merge brings the drift back, and the next sweep is another manual scan. "Post" is also overloaded once this lands. In the UI it names what the code calls a `Brief`, while the code already has a `Post` model for publish records. The next contributor who adds something like "Delete post" or "post count" has to guess which one is meant.
>   **Fix:** Write the glossary, including the UI-to-code mapping and the `Post`/`Brief` distinction, into the design-system doc. Add a deny-list test over UI strings ("Path A", "Path B", "Brand Kit", "copy provider", "colour") so the drift fails a gate instead of waiting for the next scan.
>   **Status:** upheld

### [WARN] party-visionary — The Apply failure vocabulary is stored in analytics events, but the artifact never says it is append-only

**Quotes:**

> - one closed failure vocabulary shared by the route, the badge and the event;
>   **Problem:** Once Apply events land in the event store, each failure reason is a stored value that the insights queries group by, and the badge copy is keyed on the same values. The next change to Apply will want to rename, split or merge a reason. That could be the change that widens Apply beyond the headline, or one that adds a new reserved token type. A rename splits history at the deploy date, and the insights page under-counts both the old and new names until retention ages the old rows out. The artifact makes this vocabulary closed and shared but never states the rule that keeps it safe to share: keys are never renamed or reused, and new reasons are only added. Without that rule, the next contributor will treat the vocabulary as an ordinary enum they can tidy.
>   **Fix:** State the key rule for the failure vocabulary in the artifact: append-only, never renamed, a retired reason stays readable. Import the vocabulary into the event schema rather than copying it.
>   **Status:** upheld

### [WARN] party-visionary — Generalising the personal key is reversible only until the first Gemini key is saved, and the artifact calls it additive

**Quotes:**

> - Three expected migrations (additive, each with a manual down script): the Sinhala font slot on `BrandKit`; the personal image key's provider (generalising `UserOpenAiKey`, with the data carried); any stamp or field Apply needs (expected none beyond 030's `renderedText`).

> **C. Personal image generation key.** `/settings` "OpenAI key" becomes "Image generation key". It accepts an OpenAI or a Gemini key, detected from the prefix as `/team` does, and generates with that provider. Existing personal OpenAI keys keep working with no re-entry (a data migration carries them).
> **Problem:** The migration is described as additive with a down script, but the decision stops being reversible on the day the first user saves a Gemini key. A down migration back to an OpenAI-only shape has nowhere to put that row. Reverting means deleting user credentials that are encrypted and cannot be recovered, and those users have to re-enter them. The artifact does not acknowledge this. The same section also adds a second place that knows which key prefixes map to which provider. Unless it is literally the same function `/team` uses, the next image provider must be added to two detectors, and a personal key and a team key with the same prefix could resolve to different providers.
> **Fix:** Say in the artifact that this migration is one-way once a non-OpenAI key exists, and what the down script does with those rows. State that the personal and team sides call one shared prefix detector, so adding a provider is a single edit.
> **Status:** upheld

### [NOTE] party-visionary — Apply is named and built for the headline only, though the stamp it reads is keyed by field

**Quotes:**

> **A. Apply to image (no model).** A new claimed draft action, `POST /api/drafts/[id]/apply-headline`. It parses the stored HTML with a real parser that keeps source offsets (`parse5`), finds the one innermost element whose visible text is the stamped old headline (the 030 normaliser), and splices in the new headline, HTML-escaped. Every other byte stays unchanged.

> - **Other on-image text** (CTA, kicker) in Apply.
>   **Problem:** This change builds the costly, reusable parts: an offset-preserving parser, a single-element splice, a post-splice integrity check and a verified stamp. The stamp it reads, `renderedText`, is already keyed by field. But the route name, and the draft-action value and event that presumably go with it, name the headline. The obvious next change is Apply for the CTA or the kicker, which the artifact names as out of scope. That change would have to add a second route, a second action value, a second event and probably a second badge path, all copying this one. If the draft action is stored as a database enum value, that value is also harder to remove later than to add. My reasoning here assumes the action is a persisted enum value, which the artifact does not state. The artifact already plans for a second Apply method by adding a `method` field to the event, but not for a second text field.
>   **Fix:** Name the action, route and event by field rather than for the headline: for example `apply-text` with `field: "headline"`, the field drawn from the stamp's keys, and the event carrying `field` next to `method`. The CTA change then adds a stamp key and fixtures, not a second route.
>   **Status:** upheld

### [NOTE] party-visionary — The catalogue makes the pairing rule checkable in code, but the proposal leaves it as a text rule

**Quotes:**

> 2. **Typography rules.** Recommend measurable entries for: a heading-to-body size ratio (type scale), a maximum of two families plus the Sinhala slot, a minimum body size at each canvas size, and a pairing rule (heading and body contrast in category). The exact ranges come from the plan, cited.
> **Problem:** After this change a kit holds its heading and body fonts as structured fields, and the catalogue records each family's category. Two of these rules ("heading and body contrast in category" and the family count) can therefore be checked exactly against the kit's own data. Instead the proposal routes them through the wording detector and Improve/Upgrade, which check the kit's prose. The kit's prose and its structured fonts can then disagree: the prose can pass the rule while the fonts break it. The per-canvas-size minimum also adds one more table keyed by post size. The next size the app supports will need an entry here as well as wherever sizes are defined. The artifact names no completeness check to catch a missing entry.
> **Fix:** Check the category and family-count rules in code against the kit's fonts and the catalogue, and keep the wording detector for the rules that only exist as prose. Add a completeness test that fails when a supported post size has no minimum body size.
> **Status:** upheld
