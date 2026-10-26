### [BLOCK] party-architect — A second channel enum alongside `Channel`, with no mapping contract

**Quotes:** > **Storage: a `DraftCaption` table,** one row per (draft, channel), with its own caption-channel enum that includes WHATSAPP. Each channel is regenerated, fails and is undone on its own.
**Quotes:** > A `DraftCaption(draftId, channel, text)` table (extensible; needs a caption-channel enum that includes WHATSAPP before 010 adds it to `Channel`)?
**Quotes:** > `publishToChannel` and the job runner look up the caption for the channel being published.
**Quotes:** > Instagram 2,200 and LinkedIn 3,000 are already in `channels.ts`.
**Problem:** The proposal names the existing `Channel` enum and then adds a second enum for the same channel identities. Its only stated reason is that WHATSAPP has to exist before 010 adds it to `Channel`. The result is two sources of truth for "which channel". The publish path is keyed by `Channel`, so `publishToChannel` and the job runner each need a `Channel` → caption-channel mapping, and the proposal never specifies one. `CHANNEL_CAPTION_LIMITS` in `channels.ts` has the same gap: it is keyed by `Channel`, so there is nowhere to put the WHATSAPP soft limit. party-visionary reached the same objection independently from the long-horizon side (WARN, "A second channel enum is introduced with no stated plan to converge it"). Nothing in round 1 argued that the second enum is needed at merge time.
**Fix:** Add WHATSAPP to `Channel` in this change and key `DraftCaption` on it. Publish eligibility stays gated by `Brief.channels` and the publisher map, so a WhatsApp caption can exist without a WhatsApp publisher. If a separate enum is kept, the artifact must name the one mapping function, say who owns it, and say how 010 retires it.
**Status:** upheld

### [BLOCK] party-architect — The on-image headline has no storage, no migration value and no regeneration owner, and the proposal body contradicts it

**Quotes:** > **On-image text: a separate short headline.** The caption call also returns a short headline, and the design, Path A and background prompts use it. They no longer use any caption.
**Quotes:** > Proposed: feed the **Instagram** caption, the most visual channel. This is confirmed in the design phase.
**Quotes:** > - Design / background prompts fed one chosen caption
**Quotes:** > Otherwise the whole text becomes both the Instagram and the LinkedIn caption. WhatsApp is left empty, and the panel offers **Generate**.
**Problem:** The 2026-10-09 decision creates a new stored artifact, the headline. Solution 5 and the In Scope list still say the design prompts take a caption. The headline has no column or row of its own and is not in the extractor's key set. The migration planner produces captions only, so every migrated draft has no on-image text for a later regenerate-design or Path A fill. The proposal also never says which regenerate action rewrites the headline. Three other seats found the same gap from their own angles:

- party-security (WARN): the headline is missing or malformed.
- party-visionary (WARN): the headline has no stored home and no regenerate story.
- party-ba (NOTE): Solution 5 is not reconciled with the Decisions section.

No one argued that the headline is already specified.
**Fix:** Name the headline's storage, for example a `Draft.headline` column, and put it in the extractor's key set. Give the migration planner a rule for deriving the headline from the old copy, or a fallback the design prompts accept. State which regenerate actions rewrite it. Rewrite Solution 5 and the In Scope line to match the decision.
**Status:** upheld

### [WARN] party-architect — The migration is called "data-only", but it carries schema changes and an enum value rename

**Quotes:** > The migration is data-only and applies on deploy through the PR #39 entrypoint.
**Quotes:** > `Draft.copyText` is retired
**Quotes:** > - `DraftAction.REGENERATE_COPY` → `REGENERATE_CAPTION`;
**Problem:** In the same release the change creates a table and a new enum, retires `Draft.copyText`, and renames a `DraftAction` value. None of that is data-only. An implementer would have to guess the order of steps, whether `copyText` is dropped in this release, and how rows that hold `REGENERATE_COPY` at deploy time are handled. party-security's BLOCK (no way back once `copyText` is gone) and party-visionary's WARN (a one-way lossy splitter) both depend on this order being written down. The keep-or-drop decision is theirs to argue. The missing sequence is the structural defect.
**Fix:** State the migration sequence:

1. Create the enum and the table.
2. Backfill through the planner.
3. Rename the `DraftAction` value, and say how in-flight rows are handled.
4. Drop or keep `copyText`.

Remove "data-only".
**Status:** upheld

### [WARN] party-architect — Per-channel regenerate and per-channel failure have no slot in the draft-level action and status contract

**Quotes:** > - **Regenerate** for that channel alone (plus one "Regenerate all");
**Quotes:** > A reply that yields only some captions keeps those and marks the rest failed, so that channel can be retried alone.
**Quotes:** > Generation skeletons resolve per panel.
**Quotes:** > - `DraftAction.REGENERATE_COPY` → `REGENERATE_CAPTION`;
**Problem:** The proposal keeps a single draft-level `REGENERATE_CAPTION` value but does not say:

- how the action carries its target channel;
- what scope its single-flight claim covers;
- where "marks the rest failed" is stored. The `(draftId, channel, text)` shape has no status field.

party-security's WARN asks the publish guard to key on caption status. That only strengthens the case: the status has to be a stored field before either the poll or the guard can read it.
**Fix:** Specify:

- the regenerate request shape (one channel or all);
- the single-flight scope;
- per-channel state on `DraftCaption` (status and failure reason);
- how GET /api/drafts/[id] exposes that state.
  **Status:** upheld

### [WARN] party-architect — The extractor's JSON contract is not specified: key names, the headline key and what "validated" means

**Quotes:** > The caption prompt asks for all three in a fenced JSON object with fixed keys.
**Quotes:** > The reply is parsed at the boundary and each field is validated.
**Quotes:** > - **WhatsApp:** short, `*bold*` / `_italic_` only (never Markdown `**`), link in the body.
**Quotes:** > - **WhatsApp counter (2026-10-10):** a soft 1,000-character guide with a warning past it, not a hard block.
**Problem:** The proposal names no keys, leaves the headline out of the key set, and has no per-field rules for length, empty strings or the WhatsApp `**`. Each of these decides which channels end up "failed".

Other seats depend on the same unwritten contract:

- party-security's NOTE: how to treat more than one candidate object.
- party-ba's WARN: a validator for `**` that can fail.

Writing the shape into the artifact settles all three findings together.
**Fix:** Write the JSON shape into the artifact, with key names including the headline. Give each field a rule: what happens over the length limit, whether an empty string counts as present, and whether a WhatsApp `**` is rejected or normalised. Also state how zero or several candidate objects are treated.
**Status:** upheld

### [WARN] party-architect — The scheduler's auto-publish actions meet partial caption failure, and the empty-caption guard has two homes

**Quotes:** > - the scheduler (`generationRunner.ts`), MCP (`mcp/tools/generate.ts`) and ACP, which stay on `generateDraft` and so get three captions automatically.
**Quotes:** > An empty caption for a channel that is being published is a validation error with a readable message, never a silent empty post.
**Quotes:** > `publishToChannel` and the job runner look up the caption for the channel being published.
**Problem:** The proposal puts the lookup and the guard in two callers. It also never says how sync `generateDraft` callers treat a partial caption result when their post-action publishes. party-security's WARN wants a broader guard rule: failed status, empty after trimming, over the hard limit, and terminal rather than retryable. That rule makes the two-copy problem worse, because a richer rule is more likely to drift between two copies.
**Fix:** Put the channel → caption lookup and the guard in one shared resolver that both `publishToChannel` and the job runner call. Say what the job runner records when the guard trips and whether it retries. Specify how partial results are handled on the scheduler's publish post-actions.
**Status:** upheld

### [WARN] party-architect — The shapes of the PATCH body, `api-types.ts` and the MCP/ACP draft reads are not given, and these are shared contracts

**Quotes:** > The MCP/ACP draft reads return all three captions.
**Quotes:** > - the PATCH editor;
**Quotes:** > - `api-types.ts`;
**Problem:** Retiring `copyText` changes every interface that carried it, and MCP/ACP clients outside this repo consume one of them. The proposal names these interfaces as touched but gives none of the new shapes. party-visionary's NOTE (return `{channel, text}` as a list) is one candidate shape. Until the artifact chooses one, two implementers will build different shapes.
**Fix:** State the new JSON shapes:

- the PATCH request;
- the draft GET and its type;
- the MCP/ACP draft output.

State whether `copyText` stays in the external outputs, and with what content.
**Status:** upheld

### [WARN] party-architect — The E2E plan needs a mock AI caption seam that the proposal never names

**Quotes:** > - E2E: generation yields three captions; LinkedIn is published with the LinkedIn caption only; per-channel regenerate touches one panel; the TC-ASYNC-10 copy-edit status guard still holds
**Quotes:** > - **Files affected:** ~30–40 (estimated). Schema + migration; the caption prompt + extractor; `generateDraft.ts`; `pathA` / `pathB` / `background` prompts; regenerate + PATCH + `generate/copy` routes; `publishDraft.ts`; `jobRunner.ts`; `channels.ts`; `api-types.ts`; the draft page + new caption panels; brief wizard wording; MCP/ACP; tests; docs.
**Problem:** Every listed E2E case runs against mocked AI. The proposal names no change to the mock that would emit the new JSON. It also has no deterministic trigger for partial failure in one channel. party-ba's WARN notes that canned mock text cannot fail on style. That is a separate, falsifiability point and does not affect this one: the structural cases still need a seam that runs the real extractor.
**Fix:** Name the mock caption seam in scope. It should return the raw reply, fenced JSON with a preamble, so the real extractor runs. It should also take a sentinel that drops one channel's key, for partial-failure and single-channel-retry tests.
**Status:** upheld

### [NOTE] party-architect — Rebuttal to party-po's ship order: slice (1) cannot land without the editor and PATCH changes if `copyText` is retired

**Quotes:** > The storage shape is a design-phase decision (see Open Questions); `Draft.copyText` is retired, since the rename is done where the change touches code.
**Quotes:** > - the PATCH editor;
**Quotes:** > 3. **Three caption panels on the draft page**, replacing the single Copy panel.
**Problem:** party-po's NOTE sequences the work as (1) storage, extraction and the publish lookup, (2) the panels, (3) the rename. On the proposal's own text this is a coupling fact, not a release-order preference. The single Copy panel edits through the PATCH editor, and slice (1) retires the field that panel reads and writes. Shipped alone, slice (1) half-lands: the draft page and its PATCH lose their backing field. Slice (1) is shippable on its own only if `copyText` (or a single-caption compatibility path) stays live until slice (2). That is the same keep-the-column condition party-security and party-visionary raise.
**Fix:** If the change is to be sliced, the artifact must say that `copyText` stays readable and writable until the panels and PATCH land. Otherwise storage, PATCH and the panels form one merge unit.
**Status:** upheld

### [NOTE] party-architect — Rebuttal to party-po's read-time legacy fallback: it creates a second caption source in every reader

**Quotes:** > - the scheduler (`generationRunner.ts`), MCP (`mcp/tools/generate.ts`) and ACP, which stay on `generateDraft` and so get three captions automatically.
**Quotes:** > `publishToChannel` and the job runner look up the caption for the channel being published.
**Quotes:** > The MCP/ACP draft reads return all three captions.
**Problem:** party-po's WARN suggests a lazy read-time fallback ("if no caption rows, show copyText as read-only legacy") as cheaper than migrating. Structurally, the fallback is not limited to the draft page. Every reader the proposal names would need a "rows, or else copyText" branch: `publishToChannel`, the job runner, and the MCP/ACP draft reads. Scheduled posts on legacy drafts make that unavoidable, because a fallback that only shows the text cannot publish it. That is two sources of truth for a caption, read in at least three places, and it lasts as long as any legacy draft exists. It is not obviously cheaper than one pure planner run once. Keeping `copyText` read-only as a preserved source, as security and visionary propose, is a different thing and does not have this problem, because nothing reads it at runtime.
**Fix:** If the fallback is adopted, it should live inside the one shared caption resolver proposed above, not in each reader. Otherwise keep the migration and preserve `copyText` only as an untouched source for re-running the planner.
**Status:** upheld
