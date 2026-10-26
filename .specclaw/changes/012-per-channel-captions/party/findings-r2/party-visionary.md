### [WARN] party-visionary — A second channel enum is introduced with no stated plan to converge it with `Channel`

**Quotes:**

> - **Storage: a `DraftCaption` table,** one row per (draft, channel), with its own caption-channel enum that includes WHATSAPP. Each channel is regenerated, fails and is undone on its own.

> A `DraftCaption(draftId, channel, text)` table (extensible; needs a caption-channel enum that includes WHATSAPP before 010 adds it to `Channel`)?

> 4. **Publishing sends the matching caption.** `publishToChannel` and the job runner look up the caption for the channel being published.

**Problem:** After this change the system has two persisted enums that name the same channels, and publishing has to translate a `Channel` value into a caption-channel value on every lookup. The proposal's only reason for the second enum is timing ("before 010 adds it to `Channel`"). It never says what happens once 010 does add it, so the pair outlives its reason. Two future changes pay for this:

- **010.** When it adds WHATSAPP to `Channel`, it has to choose between keeping both enums and migrating the `DraftCaption.channel` column onto `Channel`. Postgres cannot simply drop enum values, so the migration is a data migration, not a one-line edit.
- **A fourth channel.** The proposal lists "Channels beyond these three" as out of scope, so it expects one. That change must add the value to both enums and to the mapping between them. If it updates only `Channel`, the new channel can be selected at publish time but always hits the empty-caption guard.

party-architect's round-1 BLOCK reaches the same fix from the merge-day side. This finding covers the cost to 010 and to the change that adds a fourth channel.
**Fix:** State in the artifact which enum is authoritative, and that the caption enum folds into `Channel` when 010 lands, so someone owns the convergence. Better: add WHATSAPP to `Channel` now as a value that cannot be published yet, and key `DraftCaption` on `Channel`, so there is one channel enum from the start.
**Status:** upheld

### [WARN] party-visionary — The on-image headline is a by-product of the caption call, so the design's text shares the caption's model, prompt version and regenerate actions

**Quotes:**

> - **On-image text: a separate short headline.** The caption call also returns a short headline, and the design, Path A and background prompts use it. They no longer use any caption.

> - **008 (model selection):** 008's `copy` surface and `Draft.copyModel` stamp become **`caption`** / **`captionModel`**. If 008 is built first, it uses the new names from the start.

> The reply is parsed at the boundary and each field is validated. This follows the 2026-08-03 lesson ("a prompt rule is not an invariant"): extract what you need, never assert it is in there somewhere. A reply that yields only some captions keeps those and marks the rest failed, so that channel can be retried alone. `PROMPT_VERSION` is bumped.

**Problem:** Every design path now takes its words from a field the caption call writes. That couples two artifacts the proposal otherwise keeps apart ("Revisions stay design-only").

- **008 trips on it first.** 008's per-surface model choice for `caption` will also pick the model that writes the headline painted on the image. A user who moves captions to Haiku to save cost changes the on-image text without touching any design setting.
- **The next caption-prompt edit trips on it too.** A tweak to one channel's brief, or a fourth channel, bumps the same prompt version that now also governs the on-image text.

party-architect (no storage, no regeneration owner) and party-security (no rule for a missing or malformed headline) cover what is wrong with the headline on merge day. This finding is about the later changes that want to treat on-image text separately:

- 004-style fidelity work;
- 009 hero imagery;
- a "change the headline" refine.

Each of them must first untangle the headline from the caption pipeline.
**Fix:** Make the headline its own field, with its own storage and its own regenerate rule, even if version one fills it from the same model call. State in the artifact which model setting and which prompt version govern it, so 008 knows whether to show it under `caption` or as a separate surface.
**Status:** upheld

### [WARN] party-visionary — "Rename where touched" also renames an HTTP route and a persisted enum value, which teaches that contracts get renamed as a side effect

**Quotes:**

> 6. **Rename "copy" → "caption"** (scope decided 2026-09-23: _UI + docs, code where touched_):

> - the regenerate route (`regenerate-copy` → `regenerate-caption`);
>   - `DraftAction.REGENERATE_COPY` → `REGENERATE_CAPTION`;

> - `api/generate/copy`;

**Problem:** This change sets the rule "an identifier takes the new name when a change touches it". That is safe for a function or a component name. Here the same rule also renames a route path and a persisted enum value, and both are contracts.

- **The rule copied forward.** The next change that touches `api/generate/copy` would rename that route too. This change lists that route as a caption writer but leaves its name alone. The likely next toucher is 008, which adds model choice per surface. 008 would break every caller of the route as a side effect of a feature that never meant to change the contract.
- **The meantime.** The codebase settles into a mix: `generate/copy` writes captions, `regenerate-caption` regenerates them, `COPY` is a provider slot, and `captionModel` stamps the result. Every later search for "copy" returns three meanings, and nothing marks which ones are meant to stay.

party-po's round-1 WARN asks for the identifier rename to be cut back on cost grounds. This finding is about the rule it teaches, whichever scope is chosen.
**Fix:** Split the rule in the artifact:

- **Internal identifiers** are renamed where touched.
- **Routes, persisted enum values and MCP/ACP field names** are renamed only on purpose. Either rename them in this change as a complete set (`generate/copy` included), or list them as unchanged, the way the `COPY` slot already is.
  **Status:** upheld

### [WARN] party-visionary — Channel length limits are written both in `channels.ts` and in the caption prompt's per-channel brief

**Quotes:**

> - **Instagram:** hook first, hashtags at the end, up to 2,200 characters.
>   - **LinkedIn:** professional, longer-form, up to 3,000 characters, few or no hashtags.

> - **WhatsApp counter (2026-10-10):** a soft 1,000-character guide with a warning past it, not a hard block. 010 can tighten it once the real Channel limit is confirmed.

> Instagram 2,200 and LinkedIn 3,000 are already in `channels.ts`.

**Problem:** Each channel's limit is stated twice: in `CHANNEL_CAPTION_LIMITS`, which drives the counter, and in the prose of the caption prompt, which drives what the model writes. The artifact already names the change that will update only one of them.

- When 010 confirms WhatsApp's real limit, the obvious place to edit is the limits table, because that is where the counter reads it.
- The prompt keeps asking for roughly the old length.
- From then on, every new WhatsApp caption is written to one length and counted against another. Only a user who notices persistent over-limit warnings would catch it.

The same drift happens whenever Instagram or LinkedIn change their limits.
**Fix:** Have `buildCaptionPrompt` build each channel's length guidance from `CHANNEL_CAPTION_LIMITS`, so each limit is defined once.
**Status:** upheld

### [WARN] party-visionary — Retiring `copyText` in the same change as a best-effort, lossy splitter means no later change can re-split legacy drafts

**Quotes:**

> `Draft.copyText` is retired, since the rename is done where the change touches code.

> 7. **Existing drafts are migrated, not stranded.** A best-effort splitter moves each old `copyText` into the new shape. If it finds `INSTAGRAM:` / `LINKEDIN:` headers, it splits on them and strips `**`.

**Problem:** The artifact calls the splitter "best-effort". It recognises one header spelling, and on that path it rewrites the text: it strips `**` and puts each section in its own row. If the source column is dropped in the same change, the splitter's output becomes the only record of every caption written before 012.

Two later changes are plausible, and neither would have anything to start from:

- one that finds legacy drafts split wrongly (a header variant the splitter missed, or text lost from around the sections) and wants to re-run a better planner;
- one that wants to seed legacy WhatsApp captions from the original text rather than from a section that has already been split.

The planner is unit-tested, but it cannot be re-run in production. The artifact does not acknowledge this as a one-way step. Its word "retired" does not say whether the column is dropped or kept, so neither reading is a decision anyone made.

party-security's round-1 BLOCK covers the operator's inability to roll back a bad run. This finding covers the team's inability to revisit the decision later. Both point to the same fix.
**Fix:** Keep `copyText` as a read-only column that nothing writes. If the rename matters, call it something like `legacyCaptionText`. Drop it in a later change, once the migrated captions have been checked in use. That makes the step reversible for the cost of one nullable column.
**Status:** upheld

### [NOTE] party-visionary — The table is chosen because it extends, but the prompt, panels and MCP output stay fixed at three, so a fourth channel is still a many-file change

**Quotes:**

> The caption prompt asks for all three in a fenced JSON object with fixed keys.

> 3. **Three caption panels on the draft page**, replacing the single Copy panel.

> The MCP/ACP draft reads return all three captions.

> - Channels beyond these three

**Problem:** `DraftCaption` (one row per channel) is the storage choice that makes a new channel cheap. Everything around it is written for exactly three:

- the prompt uses fixed JSON keys;
- the extractor validates those keys;
- the UI has three panels;
- the MCP/ACP read returns three captions, in a shape the artifact does not specify.

The next change to add a channel must edit:

- the enum or enums;
- the limits;
- the prompt keys;
- the extractor;
- the panel list;
- the external read shape. Once MCP clients depend on it, that shape is a contract.

party-po's round-1 suggestion to move WhatsApp into 010 "as an additive row" is cheap only if this registry exists. Without it, that additive row is the same many-file change. The table is the expensive half of extensibility, and the change stops one step short of the cheap half.
**Fix:** Drive the prompt's keys and briefs, the extractor's expected fields, the panel list and the MCP/ACP output from one per-channel registry next to `CHANNEL_CAPTION_LIMITS`. Return the MCP/ACP read as a list of `{channel, text}` rather than named fields, so a fourth channel only adds entries for external readers.
**Status:** upheld

### [NOTE] party-visionary — Rebuttal of party-po's BLOCK: the two-column variant is cheaper to build but more expensive to live with by the time 010 lands

**Quotes:**

> **Three captions per draft, one per channel, each written, edited, counted, regenerated and published on its own. Everywhere a user reads it, the word is "Caption".**

> - **Storage: a `DraftCaption` table,** one row per (draft, channel), with its own caption-channel enum that includes WHATSAPP. Each channel is regenerated, fails and is undone on its own.

**Problem:** party-po's cheaper variant stores the Instagram and LinkedIn captions in two `Draft` columns. It is priced only up to merge day. Later it costs more:

- **The column count multiplies.** The partial-failure contract that party-architect and party-security both require (status and failure reason per channel) becomes a status column and an error column for every channel on `Draft`. That is six columns for two channels, nine once WhatsApp arrives.
- **010 pays the bill.** 010 then has to add a schema migration of its own plus a column set for WhatsApp, edit every column-keyed reader, and run a second data migration if it later moves to a table. Once MCP clients read named per-channel fields, that move is not cheap.

The user's 2026-10-09 table decision is the compounding choice, and the variant would undo it to save build cost now. party-po's demand to price the per-channel regenerate, undo and rename items is not contested here. The objection is only that "two columns" is the cheapest option over the next two changes.
**Fix:** If a smaller first slice is wanted, keep the `DraftCaption` table and cut the slice elsewhere, for example defer the WhatsApp row, per-channel regenerate or the rename. Do not cut it at the storage shape.
**Status:** upheld
