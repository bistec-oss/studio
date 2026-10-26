### [WARN] party-visionary — A second channel enum is introduced with no stated plan to converge it with `Channel`

**Quotes:**

> - **Storage: a `DraftCaption` table,** one row per (draft, channel), with its own caption-channel enum that includes WHATSAPP. Each channel is regenerated, fails and is undone on its own.

> A `DraftCaption(draftId, channel, text)` table (extensible; needs a caption-channel enum that includes WHATSAPP before 010 adds it to `Channel`)?

> 4. **Publishing sends the matching caption.** `publishToChannel` and the job runner look up the caption for the channel being published.

**Problem:** After this change the system has two persisted enums naming the same channels. Publishing has to translate a `Channel` value into a caption-channel value on every lookup. The proposal's only reason for the second enum is timing ("before 010 adds it to `Channel`"), and it never says what happens once 010 does add it. So the pair outlives its reason. Two future changes then pay for it. When 010 adds WHATSAPP to `Channel`, it has to decide whether to keep both enums or migrate the `DraftCaption.channel` column onto `Channel`. Postgres enum values cannot simply be dropped, so that is a data migration, not a one-line edit. When a later change adds a fourth channel (the proposal lists "Channels beyond these three" as out of scope, which means it expects one), that change must add the value to both enums and to the mapping between them. If it updates only `Channel`, the result is a channel that can be selected at publish time but always hits the empty-caption guard.
**Fix:** In the artifact, say which enum is authoritative and that the caption enum folds into `Channel` when 010 lands, so the convergence belongs to someone. Better still, add WHATSAPP to `Channel` now as a publish-incapable value and key `DraftCaption` on `Channel`, so there is one channel enum from the start.
**Status:** upheld

### [WARN] party-visionary — Making the on-image headline a by-product of the caption call ties the design's text to the caption's model, prompt version and regenerate surface

**Quotes:**

> - **On-image text: a separate short headline.** The caption call also returns a short headline, and the design, Path A and background prompts use it. They no longer use any caption.

> - **008 (model selection):** 008's `copy` surface and `Draft.copyModel` stamp become **`caption`** / **`captionModel`**. If 008 is built first, it uses the new names from the start.

> The reply is parsed at the boundary and each field is validated. This follows the 2026-08-03 lesson ("a prompt rule is not an invariant"): extract what you need, never assert it is in there somewhere. A reply that yields only some captions keeps those and marks the rest failed, so that channel can be retried alone. `PROMPT_VERSION` is bumped.

**Problem:** Every design path now gets its words from a field the caption call writes. That couples two artifacts the proposal otherwise keeps apart ("Revisions stay design-only"). The first change to trip on this is 008. Its per-surface model choice for `caption` will also pick the model that writes the image's headline, so a user who drops captions to Haiku to save cost changes what is painted on the post without touching any design setting. The next change to the caption prompt (a channel brief tweak, a fourth channel) bumps the same prompt version that now also governs on-image text. The proposal also gives the headline no stored home and no regenerate story. It does not say whether per-channel Regenerate or "Regenerate all" rewrites the headline, or whether regenerate-design reuses a stored one or needs a fresh caption call. So the next change that wants to edit on-image text on its own terms (004-style fidelity work, 009 hero imagery, a "change the headline" refine) has to untangle it from the caption pipeline first.
**Fix:** Treat the headline as its own field with its own storage and regenerate rule, even if the first version fills it from the same model call. State in the artifact which model setting and prompt version govern it, so 008 knows whether to show it as part of `caption` or as a separate surface.
**Status:** upheld

### [WARN] party-visionary — "Rename where touched" is applied to an HTTP route and a persisted enum value, and teaches that contracts get renamed as a side effect

**Quotes:**

> 6. **Rename "copy" → "caption"** (scope decided 2026-09-23: _UI + docs, code where touched_):

> - the regenerate route (`regenerate-copy` → `regenerate-caption`);
>   - `DraftAction.REGENERATE_COPY` → `REGENERATE_CAPTION`;

> - `api/generate/copy`;

**Problem:** The rule this change sets is "an identifier takes the new name when a change touches it". That is safe for a function or component name. Here the same rule also renames a route path and a persisted enum value, which are contracts. Copied forward, the rule means the next change that touches `api/generate/copy` renames that route too. This change already lists that route as a caption writer and leaves it under the old name. The likely next toucher is 008, which adds model choice per surface. That change would break any caller of the route as a side effect of a feature that never meant to change the contract. In the meantime the codebase settles into a mix: `generate/copy` writes captions, `regenerate-caption` regenerates them, `COPY` is a provider slot, and `captionModel` stamps the result. Every later search for "copy" returns three meanings, and nothing marks which ones are meant to stay.
**Fix:** Split the rule in the artifact. Internal identifiers are renamed where touched. Routes, persisted enum values and MCP/ACP field names are renamed only on purpose, either in this change as a complete set (so `generate/copy` too) or listed as staying unchanged, like the `COPY` slot already is.
**Status:** upheld

### [WARN] party-visionary — Channel length limits live in `channels.ts` and are also written into the caption prompt's per-channel brief

**Quotes:**

> - **Instagram:** hook first, hashtags at the end, up to 2,200 characters.
>   - **LinkedIn:** professional, longer-form, up to 3,000 characters, few or no hashtags.

> - **WhatsApp counter (2026-10-10):** a soft 1,000-character guide with a warning past it, not a hard block. 010 can tighten it once the real Channel limit is confirmed.

> Instagram 2,200 and LinkedIn 3,000 are already in `channels.ts`.

**Problem:** Each channel's limit is stated in two places: `CHANNEL_CAPTION_LIMITS`, which drives the counter, and the prose of the caption prompt, which drives what the model writes. The artifact already names the change that will update only one of them. When 010 confirms WhatsApp's real limit, the obvious edit is the limits table, because that is where the counter reads it. The prompt keeps asking for roughly the old length. Every new WhatsApp caption is then written to one length and counted against another, and only a user who notices persistent over-limit warnings would catch it. The same thing happens whenever Instagram or LinkedIn change their limits.
**Fix:** Have `buildCaptionPrompt` build each channel's length guidance from `CHANNEL_CAPTION_LIMITS`, so the limit is defined once.
**Status:** upheld

### [WARN] party-visionary — Retiring `copyText` in the same change as a best-effort, lossy splitter means no later change can re-split legacy drafts

**Quotes:**

> `Draft.copyText` is retired, since the rename is done where the change touches code.

> 7. **Existing drafts are migrated, not stranded.** A best-effort splitter moves each old `copyText` into the new shape. If it finds `INSTAGRAM:` / `LINKEDIN:` headers, it splits on them and strips `**`.

**Problem:** The artifact calls the splitter "best-effort". It recognises one header spelling, and on that path it rewrites the text, stripping `**` and putting each section in its own row. Dropping the source column in the same change means the splitter's output becomes the only record of every pre-012 caption. Two later changes are plausible: one that finds legacy drafts split wrongly (a header variant the splitter missed, text lost from around the sections) and wants to re-run a better planner, and one that wants to seed legacy WhatsApp captions from the original text rather than from an already-split section. Neither has anything to start from. The planner is unit-tested, but it cannot be re-run in production. The artifact does not acknowledge this as a one-way step.
**Fix:** Keep `copyText`, renamed to something like `legacyCaptionText` if the rename matters, as a read-only column that nothing writes. Drop it in a later change once the migrated captions have been checked in use. That turns the door into a reversible one at the cost of one nullable column.
**Status:** upheld

### [NOTE] party-visionary — The table is chosen for extensibility, but the prompt, panels and MCP output stay fixed at three, so a fourth channel is still a many-file change

**Quotes:**

> The caption prompt asks for all three in a fenced JSON object with fixed keys.

> 3. **Three caption panels on the draft page**, replacing the single Copy panel.

> The MCP/ACP draft reads return all three captions.

> - Channels beyond these three

**Problem:** `DraftCaption` (one row per channel) is the storage choice that makes a new channel cheap. Everything around it is written for exactly three. The prompt uses fixed JSON keys. The extractor validates those keys. The UI has three panels. The MCP/ACP read returns three captions in a shape the artifact does not specify. The next change to add a channel (the Out of Scope line suggests one is expected) must edit the enum(s), the limits, the prompt keys, the extractor, the panel list and the external read shape. That last one is a contract once MCP clients depend on it. The table is the expensive half of extensibility, and the change stops one step short of the cheap half.
**Fix:** Drive the prompt's keys and briefs, the extractor's expected fields, the panel list and the MCP/ACP output from one per-channel registry next to `CHANNEL_CAPTION_LIMITS`. Expose the MCP/ACP read as a list of `{channel, text}` rather than named fields, so a fourth channel is additive for external readers.
**Status:** upheld
