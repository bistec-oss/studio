### [BLOCK] party-security — Apply overwrites styled HTML with no stated way back

**Quotes:**

> Styling inside the element (an accent span, line breaks) flattens to plain text; the confirm step says so. On success the stamp is the check's result, so the badge clears only when the image really shows the new headline.
> **Problem:** Apply is designed to lose data: the accent spans and line breaks inside the headline element are flattened, then written over the stored HTML and the export. The proposal names a confirm step but never says where the original goes afterwards. It does not say Apply appends a `DraftRevision` or moves the revision pointer, so nothing on the page shows that Undo or version switching can bring back the styled headline. A confirm dialog is consent, not recovery. Once a later refine or regenerate starts from the flattened HTML, the styling is gone for good.
> **Fix:** State that Apply writes only through `commitDraftRevision`: a new revision, the pointer advanced, the prior styled revision kept. Then Undo or a version switch restores the original byte for byte. Add a test that applies, restores, and asserts the original HTML comes back unchanged.
> **Status:** upheld

### [WARN] party-security — Apply's success check proves the new headline is painted, not that the old one is gone

**Quotes:**

> A new claimed draft action, `POST /api/drafts/[id]/apply-headline`. It parses the stored HTML with a real parser that keeps source offsets (`parse5`), finds the one innermost element whose visible text is the stamped old headline (the 030 normaliser), and splices in the new headline, HTML-escaped. Every other byte stays unchanged.
>
> - re-parse after the splice and check that nothing outside the element changed;
>   **Problem:** The proposal does not say what happens when more than one element matches the old headline. Examples: the headline repeated as a watermark or decorative echo, or a static parse that counts a CSS-hidden copy as visible. If the splice takes the first match, both checks pass. The re-parse check is satisfied because the other copy was left unchanged, as required. The in-render check is satisfied because the new headline is painted. The badge then clears and the event reports success while the image still shows the old headline. That is a green result on exactly the failure 030 exists to detect.
>   **Fix:** Refuse with a named code from the closed vocabulary (for example `apply-ambiguous`) when more than one candidate matches. Extend the in-render check so it also requires the old headline to no longer appear as painted text before the stamp is written.
>   **Status:** upheld

### [WARN] party-security — Prefix detection with no rule for an unknown prefix can send a secret to the wrong vendor

**Quotes:**

> **C. Personal image generation key.** `/settings` "OpenAI key" becomes "Image generation key". It accepts an OpenAI or a Gemini key, detected from the prefix as `/team` does, and generates with that provider. Existing personal OpenAI keys keep working with no re-entry (a data migration carries them). The resolver's personal tier serves either provider.
> **Problem:** The provider is inferred from user-pasted text. The proposal does not say what happens when the prefix matches neither provider. A default to OpenAI, which is the old behavior of this field, would send a Gemini or unrelated secret in an Authorization header to a third party it was never meant for. It would also store the key under the wrong provider and fail on every generation.
> **Fix:** Reject any key whose prefix matches neither known provider at save time (a 400 naming the accepted formats), never default. Store the detected provider explicitly, and show it next to the masked prefix so the user can see which vendor the key will be sent to.
> **Status:** upheld

### [WARN] party-security — A never-live-tested personal Gemini key takes precedence over a working team key, and a failure is silent

**Quotes:**

> The resolver's personal tier serves either provider.
>
> - **A live Gemini call** (005 follow-up). The user skipped it; Gemini stays mock-verified only, a known limit.
>   **Problem:** Personal keys now take precedence over the team key for Gemini as well. The Gemini path has never made a real call. A user who saves a personal Gemini key therefore sends every interactive generation through an untested provider, ahead of a team OpenAI key that works. The proposal does not say whether a failed personal call falls back to the team tier. It also does not say whether the user sees anything when the background or hero image is skipped. Image steps are designed to degrade (skip the background, fall back to classic), so a broken personal key looks like a run that simply produced no image.
>   **Fix:** State the failure rule. On a personal-tier provider error, either fall back once to the team tier (as the Claude token does) or show a visible, named notice on the draft that names the personal key as the cause. Record which tier and provider ran on the draft so the degradation can be diagnosed afterwards.
>   **Status:** upheld

### [WARN] party-security — The rollback of the personal-key migration has no stated handling for Gemini rows

**Quotes:**

> - Three expected migrations (additive, each with a manual down script): the Sinhala font slot on `BrandKit`; the personal image key's provider (generalising `UserOpenAiKey`, with the data carried); any stamp or field Apply needs (expected none beyond 030's `renderedText`).
>   **Problem:** "Generalising" a table that currently means "this is an OpenAI key" is the one migration here whose rollback is not neutral. Once users have saved Gemini keys, the down script has three options. Folding all rows back hands Gemini secrets to old code that sends them to OpenAI. Dropping them loses users' keys silently. A rename is not additive, so the previous image cannot run against the migrated schema during a rollback. The proposal names a down script but not which of these it does.
>   **Fix:** Keep the migration strictly additive: add a `provider` column that defaults to `OPENAI` on the existing table, with no rename. The previous image then still reads only OpenAI rows correctly. The down script explicitly deletes the non-OpenAI rows, and the release note says that those users must re-enter their key after a rollback.
>   **Status:** upheld

### [WARN] party-security — The manually set Sinhala slot reaches the design prompt and the font URL with no stated check

**Quotes:**

> - A **Sinhala font slot** per brand kit (for example Noto Sans Sinhala, Noto Serif Sinhala, Abhaya Libre, Yaldevi, Gemunu Libre). The design prompts get it as a CSS variable, used for Sinhala text. Without one, today's OS fallback stays.
> - The brand-kit assistant **applies** its proposed heading, body and Sinhala fonts (each checked against the catalogue) with the voice and colors, in one Apply, each part shown before you accept. Style stays advisory.
>   **Problem:** The catalogue check is stated only for the assistant's Apply. The slot is a new free-text kit field, and its value is put into every design prompt (as a CSS variable the model is told to use) and into the Google Fonts URL. Nothing says the save route checks the value against the catalogue. Nothing says either path checks that the family actually covers the Sinhala script. A Latin-only family passes "is in the catalogue" and then renders Sinhala in the OS fallback without any signal.
>   **Fix:** Validate on the kit save route, not only on Apply: the value must be an exact catalogue family whose `scripts` include `sinhala`. Otherwise return a 400. Use the stored catalogue name, not the submitted string, wherever the value enters a prompt or URL.
>   **Status:** upheld

### [WARN] party-security — A font the snapshot does not know, or that Google rejects, fails silently into a fallback face

**Quotes:**

> - `googleFontsUrl` asks only for the weights a family has.
>   **Problem:** The URL builder now depends on the snapshot. The proposal does not say what it does for a family that is missing from the snapshot. Such families exist: an existing kit's font, a family Google later retires, or a stale snapshot. The bug this group fixes shows the failure mode: Google refuses the request and the post renders in a fallback face. Nothing marks the export as off-brand, so the wrong font ships looking like a normal render.
>   **Fix:** For an unknown family, request no weight list (Google's default) rather than a guessed range, and log it. In the renderer, check `document.fonts` for the kit families after load. Record a named render note when a requested family did not load, so the degradation can be seen on the draft.
>   **Status:** upheld

### [NOTE] party-security — Validate the model-proposed post style before it is shown or saved

**Quotes:**

> - The campaign briefing assistant proposes a **post style** per planned post (one of the eight). The plan shows it and the queue entries save it. Its prompt changes; generation prompts do not.
>   **Problem:** The style key is model output, and the assistant is grounded on uploaded campaign documents. "One of the eight" describes the prompt, not a check. A retired key or an unknown key could reach the plan. A retired key still resolves under the 027 rule, so it would be saved without error.
>   **Fix:** Parse the schedule block against the current (not retired) style keys. Replace anything else with the campaign default or `general`, and flag it in the plan before the user accepts.
>   **Status:** upheld

### [NOTE] party-security — Scope both new delete paths to objects this run created

**Quotes:**

> - Unit runs leave no `bistec-cli-*` temp dirs.
> - The 019 regenerate-design lost-claim path removes the PNG it uploaded, as `commitDraftRevision` already does.
>   **Problem:** Both items add deletion. A cleanup that sweeps `os.tmpdir()` by the `bistec-cli-*` prefix would also delete the live directories of a dev or OP server running on the same machine. A lost-claim delete keyed on a draft-derived path could remove the winning run's export if the keys can collide.
>   **Fix:** Delete only the exact temp directory path the test or spawn created (tracked in a variable, removed in `finally`), never by glob. For the PNG, delete only the unique object key this run uploaded, never the draft's current `exportUrl`.
>   **Status:** upheld

### [NOTE] party-security — The assistant's font Apply overwrites kit fonts with no record of the previous values

**Quotes:**

> - The brand-kit assistant **applies** its proposed heading, body and Sinhala fonts (each checked against the catalogue) with the voice and colors, in one Apply, each part shown before you accept. Style stays advisory.
>   **Problem:** Voice changes are versioned, but kit fonts (like colors) are plain fields. The assistant's proposal comes from model output grounded on uploaded documents. A mistaken Apply changes every later post, and the proposal names no record of the prior fonts to revert to.
>   **Fix:** In the accept view, show the current value next to each proposed font, and record the replaced values (for example in the voice version written by the same Apply) so an admin can restore them.
>   **Status:** upheld
