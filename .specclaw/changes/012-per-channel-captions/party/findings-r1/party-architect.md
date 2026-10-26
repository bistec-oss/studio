### [BLOCK] party-architect — A second channel enum alongside `Channel`, with no mapping contract

**Quotes:** > **Storage: a `DraftCaption` table,** one row per (draft, channel), with its own caption-channel enum that includes WHATSAPP. Each channel is regenerated, fails and is undone on its own.
**Quotes:** > A `DraftCaption(draftId, channel, text)` table (extensible; needs a caption-channel enum that includes WHATSAPP before 010 adds it to `Channel`)?
**Quotes:** > `publishToChannel` and the job runner look up the caption for the channel being published.
**Quotes:** > Instagram 2,200 and LinkedIn 3,000 are already in `channels.ts`.
**Problem:** The proposal names the existing `Channel` enum, then adds a second enum for the same channel identities. The only reason it gives is that WHATSAPP must exist before 010 adds it to `Channel`. That leaves two sources of truth for "which channel". The publish path is keyed by `Channel`, so `publishToChannel` and the job runner each need a `Channel` → caption-channel mapping, and the proposal never specifies it. `CHANNEL_CAPTION_LIMITS` in `channels.ts` has the same problem. The proposal says the IG/LI limits live there, but it never says where the WHATSAPP soft limit goes if that table is keyed by `Channel`. Once 010 adds WHATSAPP to `Channel`, the codebase holds two WHATSAPP values with no rule linking them.
**Fix:** Add WHATSAPP to `Channel` in this change and key `DraftCaption` on it. Publish eligibility stays gated by `Brief.channels` and the publisher map, so a WhatsApp caption can exist without a WhatsApp publisher. If a separate enum is kept, the artifact must name the single mapping function, say who owns it, and say what 010 does to retire it.
**Status:** upheld

### [BLOCK] party-architect — The on-image headline has no storage, no migration value and no regeneration owner, and the proposal body contradicts it

**Quotes:** > **On-image text: a separate short headline.** The caption call also returns a short headline, and the design, Path A and background prompts use it. They no longer use any caption.
**Quotes:** > Proposed: feed the **Instagram** caption, the most visual channel. This is confirmed in the design phase.
**Quotes:** > - Design / background prompts fed one chosen caption
**Quotes:** > Otherwise the whole text becomes both the Instagram and the LinkedIn caption. WhatsApp is left empty, and the panel offers **Generate**.
**Problem:** The 2026-10-09 decision creates a new persisted artifact, the headline. Solution 5 and the In Scope list still say the design prompts take a caption, so the document gives two answers to what the design pipeline reads. The headline also has no home. `DraftCaption` is keyed per channel, and no column or row is named for it. The extractor's fixed keys are listed as three captions. The migration planner (item 7) produces captions only. As a result, every migrated draft has no headline, and any later regenerate-design or Path A fill on it has no on-image text unless a fallback is defined. The proposal also never says whether per-channel "Regenerate", or "Regenerate all", regenerates the headline. Merging this as written half-lands: the design prompts switch to an input that old drafts lack and new code paths may not write.
**Fix:** Name the headline's storage (for example a `Draft.headline` column), include it in the extractor's key set, give the migration planner a rule for deriving it from the old copy (or a defined fallback the design prompts accept), and state which regenerate actions rewrite it. Rewrite Solution 5 and the In Scope line to match the decision.
**Status:** upheld

### [WARN] party-architect — The migration is called "data-only", but it carries schema changes and an enum value rename

**Quotes:** > The migration is data-only and applies on deploy through the PR #39 entrypoint.
**Quotes:** > `Draft.copyText` is retired
**Quotes:** > - `DraftAction.REGENERATE_COPY` → `REGENERATE_CAPTION`;
**Problem:** In the same release the change creates a table and a new enum, drops (or retires) `Draft.copyText`, and renames a value of the `DraftAction` enum. None of those is data-only. The contract an implementer would have to guess is the order and the split. Does the backfill run in the same migration as the `DraftCaption` create and before the `copyText` drop? Is `copyText` dropped now or left in place? How does the `REGENERATE_COPY` rename treat rows whose pending action holds that value at deploy time? Two implementers would produce different migration files here, and one of them loses data or fails on an in-flight row.
**Fix:** State the migration sequence explicitly: create the enum and table, backfill via the planner, rename the `DraftAction` value (and say how in-flight rows are handled), then drop or keep `copyText`. Remove "data-only".
**Status:** upheld

### [WARN] party-architect — Per-channel regenerate and per-channel failure have no slot in the draft-level action and status contract

**Quotes:** > - **Regenerate** for that channel alone (plus one "Regenerate all");
**Quotes:** > A reply that yields only some captions keeps those and marks the rest failed, so that channel can be retried alone.
**Quotes:** > Generation skeletons resolve per panel.
**Quotes:** > - `DraftAction.REGENERATE_COPY` → `REGENERATE_CAPTION`;
**Problem:** The rename keeps a single draft-level `REGENERATE_CAPTION` action value, but the UI calls for regenerating one channel and for "Regenerate all". The proposal never says how the action carries its target channel. It never says whether a one-channel regenerate claims the whole draft's single-flight slot, which would block the other two panels and design actions, or claims something per channel. It never says where "marks the rest failed" is stored either. The decided table shape is `(draftId, channel, text)`, which has no status or error field. The poll contract behind "skeletons resolve per panel" therefore has nothing per channel to read. The client, the route, the action runner and the poll response all depend on this one shape.
**Fix:** Specify the regenerate request shape (channel or all), the single-flight scope, and per-channel state on `DraftCaption` (for example status and failure reason). Then specify how GET /api/drafts/[id] exposes that state for the per-panel skeletons.
**Status:** upheld

### [WARN] party-architect — The extractor's JSON contract is not specified: key names, the headline key and what "validated" means

**Quotes:** > The caption prompt asks for all three in a fenced JSON object with fixed keys.
**Quotes:** > The reply is parsed at the boundary and each field is validated.
**Quotes:** > - **WhatsApp:** short, `*bold*` / `_italic_` only (never Markdown `**`), link in the body.
**Quotes:** > - **WhatsApp counter (2026-10-10):** a soft 1,000-character guide with a warning past it, not a hard block.
**Problem:** The prompt and the extractor share this grammar, and so do `buildMockCopy`-style test fixtures and any non-default COPY provider. The artifact names no keys, does not put the headline in the key set, and never says what per-field validation checks. A caption over 2,200 or 3,000 characters could fail, be kept with a warning, or be truncated. A WhatsApp caption containing `**` could fail or be stripped. An empty string could count as present or as failed. Each answer decides whether that channel lands in the "failed" state from the partial-failure rule, so two implementers would mark different replies failed.
**Fix:** Write the JSON shape into the artifact (key names, including the headline) and give each field a rule: maximum length behaviour, the empty-string rule, and the WhatsApp `**` rule (reject or normalise).
**Status:** upheld

### [WARN] party-architect — The scheduler's auto-publish actions meet partial caption failure, and the empty-caption guard has two homes

**Quotes:** > - the scheduler (`generationRunner.ts`), MCP (`mcp/tools/generate.ts`) and ACP, which stay on `generateDraft` and so get three captions automatically.
**Quotes:** > An empty caption for a channel that is being published is a validation error with a readable message, never a silent empty post.
**Quotes:** > `publishToChannel` and the job runner look up the caption for the channel being published.
**Problem:** The proposal assumes the scheduler gets three captions automatically, but it also allows partial success. A scheduled generation whose post-action publishes, now or on a schedule, can create a publish for a channel whose caption failed. The proposal never says whether partial caption failure fails the scheduled generation (and triggers its retries), skips that channel, or lets the publish hit the guard later. In the job runner no user sees a "readable message", so the guard's outcome there is undefined: a Post status, an error reason, and a retry or no-retry choice. The proposal also places the lookup-plus-guard in two callers, which means two copies of a rule that must stay identical.
**Fix:** Put the channel → caption lookup and the empty guard in one shared resolver that both `publishToChannel` and the job runner call. Say what the job runner records when the guard trips, and whether it retries. Specify how `generateDraft`'s sync callers treat a partial caption result, including the scheduler's publish post-actions.
**Status:** upheld

### [WARN] party-architect — The shapes of the PATCH body, `api-types.ts` and the MCP/ACP draft reads are not given, and these are shared contracts

**Quotes:** > The MCP/ACP draft reads return all three captions.
**Quotes:** > - the PATCH editor;
**Quotes:** > - `api-types.ts`;
**Problem:** Retiring `copyText` changes every interface that carried it. The PATCH editor's body (one channel per request, or a map), the client types and the MCP/ACP tool outputs all change, and MCP/ACP are consumed by clients outside this repo. The proposal names these as touched but specifies none of the new shapes. It never says whether MCP/ACP responses keep a `copyText` field for existing clients or drop it, or whether the headline appears in them.
**Fix:** State the new JSON shapes: the PATCH request, the draft GET and type, and the MCP/ACP draft output. State whether `copyText` stays in external outputs (and with what content) or is removed in this commit.
**Status:** upheld

### [WARN] party-architect — The E2E plan needs a mock AI caption seam that the proposal never names

**Quotes:** > - E2E: generation yields three captions; LinkedIn is published with the LinkedIn caption only; per-channel regenerate touches one panel; the TC-ASYNC-10 copy-edit status guard still holds
**Quotes:** > - **Files affected:** ~30–40 (estimated). Schema + migration; the caption prompt + extractor; `generateDraft.ts`; `pathA` / `pathB` / `background` prompts; regenerate + PATCH + `generate/copy` routes; `publishDraft.ts`; `jobRunner.ts`; `channels.ts`; `api-types.ts`; the draft page + new caption panels; brief wizard wording; MCP/ACP; tests; docs.
**Problem:** Every listed E2E case runs against mocked AI. Without a live model, those cases can only produce three distinct captions and a headline if the mock copy path emits the new JSON. The affected-files list names no mock or test-hook change. The proposal also never says whether the mock returns a raw reply that goes through the extractor, or pre-structured captions that skip it. In the second case the parse boundary is never exercised end to end. There is also no deterministic way to trigger partial per-channel failure in E2E, so the "retry one channel" path has no E2E stub.
**Fix:** Name the mock caption seam in scope. It should return raw reply text, fenced JSON with a preamble, so that the real extractor runs. It should also take a sentinel that drops one channel's key, so partial failure and single-channel retry can be tested deterministically.
**Status:** upheld
