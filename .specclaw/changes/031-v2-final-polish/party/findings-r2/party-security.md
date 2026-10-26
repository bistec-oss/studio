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
