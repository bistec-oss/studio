# Party Report: 012-per-channel-captions

**Reviewed:** 2026-10-10
**Tier:** deep (classifier) — Restructures persisted Draft caption storage from a single copyText column to a DraftCaption table, rewires publish routing to select per-channel captions, and touches multiple subsystems (schema, generation, publish, UI, MCP/ACP) across 30+ files.
**Panel:** party-po(sonnet), party-architect(opus), party-ba(sonnet), party-security(opus), party-visionary(opus)
**Verdict:** CHANGES_REQUESTED

## Summary

31 findings: 4 BLOCK, 19 WARN, 8 NOTE upheld — 0 withdrawn

## Findings

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

### [WARN] party-ba — Premise rests on a model behaviour the proposal itself calls unstructured, with no evidence of how often it occurs

**Quotes:**

> the model tends to answer with its own `**INSTAGRAM:** … **LINKEDIN:** …` blocks. Nothing parses them.
> (010's proposal says generation "currently writes `INSTAGRAM:` / `LINKEDIN:` sections". The code does not. That is model behaviour, not a format, and this change replaces it.)
> **Problem:** Problem 1 depends on how often the model emits sectioned output. "Tends to" has no source: no sample of drafts, no count, no published post. The proposal concedes this is unreliable model behaviour. Its migration fallback ("Otherwise the whole text becomes both the Instagram and the LinkedIn caption") also assumes many drafts have no headers, so the incidence is unknown. Problems 3 and 4 are independent and real. Problem 1 is the stated bug and is unmeasured. The 2026-10-09 Decisions section settles storage and headline but does not touch this.
> **Fix:** Cite what was observed (how many published posts or drafts carried both sections, and from where), or restate Problem 1 as "no per-channel control exists" without a prevalence claim.
> **Status:** upheld

### [WARN] party-ba — Two stated goals have no falsifiable acceptance criterion

**Quotes:**

> The markdown `**` markers are published literally, since neither platform renders Markdown.
> WhatsApp: short, `*bold*` / `_italic_` only (never Markdown `**`), link in the body.
> Instagram: hook first, hashtags at the end, up to 2,200 characters.
> **Problem:** The listed tests check structure only: three captions exist, LinkedIn receives only its caption, one panel regenerates. Nothing can fail on the per-channel style rules that justify three separate briefs: no `**` in any output, WhatsApp short, hashtags at the end, few or no hashtags on LinkedIn. The mock AI returns canned text, so the E2E cannot fail on prompt quality. The 1,000-character WhatsApp figure was added in Decisions, but as a soft guide with a warning and no block. That gives "short" a UI hint, not a testable bound. The `**` rule has no enforcement point.
> **Fix:** Add criteria that can fail, such as a boundary validator that rejects or strips `**` on WhatsApp and a measurable WhatsApp length bound. Alternatively, state that style quality is unverified at ship time.
> **Status:** upheld

### [NOTE] party-ba — "Caption" is used for two different things, and the migration fallback duplicates one caption across two channels without saying who sees it

**Quotes:**

> Otherwise the whole text becomes both the Instagram and the LinkedIn caption.
> The design agent gets one caption as on-image text.
> **Problem:** The Decisions section settles the on-image text question with a separate headline. That resolves the ambiguity in intent. However, Solution 5 and the matching Open Question still read "feed the Instagram caption" and are not marked superseded. A builder reading top to bottom meets two contradictory instructions. The migration fallback still writes the same Instagram-style text into LinkedIn for old drafts. That is the cross-channel contamination Problem 1 describes, now stored in the data. The proposal does not say whether users are shown that those drafts are not channel-tailored.
> **Fix:** Mark Solution 5 and the stale Open Questions (storage, on-image text, revisions, wizard wording) as resolved by Decisions. State whether migrated drafts get a visible "not channel-tailored" indicator.
> **Status:** upheld

### [BLOCK] party-po — No cheaper variant is considered; the publish bug is fixable at a fraction of this scope

**Quotes:**

> **Three captions per draft, one per channel, each written, edited, counted, regenerated and published on its own. Everywhere a user reads it, the word is "Caption".**
>
> - **Files affected:** ~30–40 (estimated).
> - **Complexity:** medium
>   **Problem:** The only defect with a stated cost is that each channel is published the whole combined caption (Problem 1) and that the counter measures the wrong thing (Problem 2). The cheapest variant is to keep one generation call, make it return the Instagram and LinkedIn captions as fixed JSON keys that are extracted at the boundary, store them in two columns, and have publish send the matching one. That fixes the publish bug, the counter and the `**` markers. It needs perhaps a third of the files, and it has no new table, no per-channel regenerate, no per-channel undo, no renames and no WhatsApp work. The proposal never prices this variant, and it never says what the remaining 60-70% of the 30–40 files buys. The 2026-10-09 decisions settle storage, headline and WhatsApp counter. They do not compare costs, and they do not attach a value to per-channel regenerate, per-channel undo, "Regenerate all" or the identifier renames. Do-nothing is also unpriced: the artifact never says how many publishes have gone out with the wrong caption.
>   **Fix:** Add a "cheaper variant" section comparing a two-channel structured extraction plus matching-caption publish against the full scope. Attach a value to each of the per-channel regenerate, per-channel undo, WhatsApp caption and rename items, or cut them.
>   **Status:** upheld

### [WARN] party-po — WhatsApp caption, storage and generation ship before any consumer exists

**Quotes:**

> - **Publishing to WhatsApp.** That is **010**. This change only produces and stores the WhatsApp caption and lets it be copied.
>   If 012 lands first, WhatsApp is a caption-only channel until 010 ships.
>   **Problem:** Every generation will spend output tokens on a third caption that nothing publishes. It also adds a third panel, a third counter, a soft guide against a limit the proposal admits is unconfirmed, and a third regenerate path. The value arrives only when 010 ships, and 010 has no date. The user set the soft 1,000-character guide on 2026-10-10, but that decision does not state the per-generation cost, and it does not name the cut line. The `DraftCaption` table makes adding WhatsApp later an additive row, so the cut is cheap. Instagram and LinkedIn publish-correctness is worth shipping alone.
>   **Fix:** Name the cut line. Ship Instagram and LinkedIn in 012, and move the WhatsApp caption, its panel and its counter into 010. Alternatively, state the per-generation token overhead and why it is worth paying before 010 exists.
>   **Status:** upheld

### [WARN] party-po — Recurring cost of the extra model output and the regenerate actions is not stated

**Quotes:**

> Each channel has its own brief:
> **Regenerate** for that channel alone (plus one "Regenerate all");
> The caption call also returns a short headline, and the design, Path A and background prompts use it.
> **Problem:** One call now emits three captions (up to 2,200 + 3,000 + about 1,000 characters) plus a headline, instead of one caption. Failure of one field leaves partial results that are retried per channel. That makes up to 3 extra spawns per draft, plus a "Regenerate all" spawn, and each CLI spawn is a Haiku call with a 120s timeout. The artifact gives no number for output size, expected spawns per draft, or the added wall-clock before the copy skeleton resolves. The headline is now decided, but whether it is required or optional with a fallback is still unstated, and every design prompt now depends on it.
> **Fix:** State tokens and spawns per generation at the largest case (three failed fields retried separately). State whether the headline is a required field or optional with a fallback.
> **Status:** upheld

### [WARN] party-po — Data migration and rename scope carry work with no stated value

**Quotes:**

> Otherwise the whole text becomes both the Instagram and the LinkedIn caption.
> **UI + docs, code where touched**
>
> - the regenerate route (`regenerate-copy` → `regenerate-caption`);
>   **Problem:** The splitter is a best-effort migration for historic drafts, and it duplicates the same text into two channels when no headers are found. That keeps the original bug in the data for every old draft. The cost is a pure planner, unit tests and a data migration. Renaming the route, the enum, the file names and the tests inside "code where touched" breaks every in-repo caller and test for naming only. The user-facing string change is cheap, and the identifier rename is the expensive part with no user-visible return. The 2026-10-09 decisions do not address either.
>   **Fix:** Say what old-draft migration returns that a read-only legacy fallback would not. Limit the rename to UI strings, or give a reason why the route and enum must be renamed in this change.
>   **Status:** upheld

### [NOTE] party-po — Ship order within the change is not named

**Quotes:**

> **Risk:** medium. It changes a column every draft has, and the publish path.
> **Problem:** The proposal bundles the data model change, the publish fix, a UI rebuild, a model-output contract change and a rename into one change. The publish fix with the empty-caption guard is the most valuable slice and the one with a real defect behind it. It should land first and by itself. The panel UI and the rename can follow, and each piece can be reverted on its own.
> **Fix:** In the task plan, sequence as: (1) the storage and extraction, plus the publish and job-runner lookup; (2) the panels; (3) the rename and docs. Name each as a shippable boundary.
> **Status:** upheld

### [BLOCK] party-security — The caption migration rewrites every draft's caption on deploy and gives no way back

**Quotes:**

> The storage shape is a design-phase decision (see Open Questions); `Draft.copyText` is retired, since the rename is done where the change touches code.
> The migration is data-only and applies on deploy through the PR #39 entrypoint.
> the pure, unit-tested migration planner, which never writes an empty caption over real text;
> **Problem:** The migration runs automatically on boot, against every draft in production. It changes the text: it cuts on headers and strips `**`. It also retires the source column. Its only safeguard is that it "never writes an empty caption over real text", which does nothing about a wrong cut. A wrong cut can be a header word inside the body, a section routed to the wrong channel, or a `**` the user meant to keep. The proposal names no way to undo any of these. If `copyText` is dropped in the same release, the original text is gone. Drafts and revisions never snapshot captions ("Revisions stay design-only"), so an operator who finds a bad split has nothing to rebuild it from. Real prod data is involved. Round 2 strengthens this finding. party-visionary independently reached the same one-way-door conclusion ("no later change can re-split legacy drafts"). party-architect showed that the drop-or-keep question and the migration order are not specified at all ("data-only" is wrong). No seat argued that the original text survives.
> **Fix:** Keep `copyText` read-only and untouched (or renamed to `legacyCaptionText`, which nothing writes) for at least one release after the migration. Drop it in a separate, later migration. State the rollback procedure: re-run an improved planner from the preserved source, or run a down migration that rebuilds `copyText`.
> **Status:** upheld

### [WARN] party-security — When the splitter can't split, it silently keeps the combined-caption bug, including for posts already scheduled to publish

**Quotes:**

> If it finds `INSTAGRAM:` / `LINKEDIN:` headers, it splits on them and strips `**`. Otherwise the whole text becomes both the Instagram and the LinkedIn caption.
> **Problem:** I am lowering this from BLOCK to WARN after weighing it again. The fallback output is exactly what a pre-012 draft would have published anyway, so on its own it is not a regression and not a new irreversible effect. The wrong-cut risk on the split path is already covered by the migration finding above. What remains is a visibility failure. The fallback records nothing that marks the result as unsplit, so it looks the same as a clean migration. Problem 1 calls the headers "model behaviour, not a format", so variants are likely and each one falls through silently. A post queued for the scheduler before deploy then publishes after the migration with nobody having seen the migrated caption. The release claims Problem 1 is fixed, so the operator has no reason to check. party-ba (NOTE) and party-po (WARN) independently flagged the same fallback as writing the contamination into the data.
> **Fix:** Store how each migrated draft was handled (`split` / `unsplit-fallback` / `empty`). Show a "migrated: review this caption" notice on fallback drafts. At migration time, log and list every fallback draft that has a pending SCHEDULED post, so an operator can review those drafts before they publish.
> **Status:** upheld

### [WARN] party-security — The publish guard only checks for an empty caption, so a failed or over-limit caption that has text still goes out

**Quotes:**

> An empty caption for a channel that is being published is a validation error with a readable message, never a silent empty post.
> The reply is parsed at the boundary and each field is validated.
> A reply that yields only some captions keeps those and marks the rest failed, so that channel can be retried alone.
> **Problem:** The extractor gives a caption a status (validated or failed), but the publish guard tests only whether the text is empty. A caption can be marked failed and still have text in three cases: it failed validation but the text was kept; a per-channel regenerate failed and the previous text stayed; or the text is whitespace-only. In each case it passes the guard and is published. On the scheduler path no human is in the loop. party-architect's round-1 WARN corroborates the scheduler half from the contract side. A scheduled generation with a publish post-action can hit a partially failed caption, and the guard's outcome in the job runner (Post status, error reason, retry or not) is undefined. Their proposed shared resolver is the right home for the fix below.
> **Fix:** Key the guard on the caption's status as well as its text, inside one shared resolver that both `publishToChannel` and the job runner call. Refuse to publish if the caption is failed or pending, empty after trimming, or over the channel's hard limit. Make that error terminal rather than retryable in the publish scheduler, and record it as the Post's error reason.
> **Status:** upheld

### [WARN] party-security — The model-written headline steers the design prompts, and nothing says what happens when it is missing or malformed

**Quotes:**

> **On-image text: a separate short headline.** The caption call also returns a short headline, and the design, Path A and background prompts use it. They no longer use any caption.
> **Problem:** I am narrowing this on reflection. The untrusted-content half is weaker than I filed it. Today the caption already sits in the same design-prompt position (`prompts/pathB.ts:104`, `pathA.ts:70`, `background.ts:69`), so the headline replaces an existing crossing rather than opening a new one. The fail-open half stands, and round 2 strengthens it. party-architect showed the headline has no storage, no extractor key and no migration value, so every migrated draft has no headline at all. That means any regenerate-design or Path A fill on an old draft runs with no grounded on-image text unless a fallback is defined. The design model then invents on-image text, which is the fabricated-facts risk the "FACTS — DO NOT INVENT" briefings exist to prevent. The result reaches the exported image looking like a normal run.
> **Fix:** Make the headline a required, validated field: non-empty, length-capped, with no newlines or fences. Treat a missing headline on a new generation as a generation failure that shows on the draft. For migrated drafts, define an explicit, logged fallback, or require a headline before design can run, so design never runs on nothing. Keep passing it inside the same untrusted-content fence used today for the caption and brief text.
> **Status:** upheld

### [NOTE] party-security — The extractor has no rule for a reply that contains more than one JSON object

**Quotes:**

> The caption prompt asks for all three in a fenced JSON object with fixed keys.
> **Problem:** The brief and campaign-briefing text the model sees can contain JSON-like content, and the model may echo it. If the extractor takes the first fenced block or the first object that parses, a planted `{"linkedin": "..."}` could be picked as the real captions and published. party-architect's WARN that the JSON contract is unspecified (key names, the headline key, what "validated" means) is the same gap from the contract side. Whatever key set they settle on is the set the strict-match rule below should enforce.
> **Fix:** Accept exactly one object with the expected key set and no unknown keys. If there are zero candidates or several, fail closed and log what was discarded, matching how `extractHtmlDocument` handles HTML replies. Add a unit case for a reply that contains two objects.
> **Status:** upheld

### [NOTE] party-security — Rebuttal-condition on party-architect's enum fix: a WHATSAPP value in `Channel` is safe only if the publisher-map miss fails closed

**Quotes:**

> `publishToChannel` and the job runner look up the caption for the channel being published.
>
> - **Publishing to WhatsApp.** That is **010**. This change only produces and stores the WhatsApp caption and lets it be copied.
>   **Problem:** party-architect (BLOCK) and party-visionary (WARN) both propose adding WHATSAPP to `Channel` now, as a publish-incapable value. I do not dispute the structure. I do dispute the assumption that it is inert. Once WHATSAPP is a `Channel` value, it can reach `Brief.channels`, the publish dialog's channel list, MCP/ACP publish inputs and queued scheduler post-actions. The proposal says WhatsApp publishing is out of scope, but it never says what `publishToChannel` or the job runner does when handed a channel with no publisher. A missing map entry that throws untyped can leave a Post stuck in PUBLISHING. One that is skipped can be recorded as success. One that is retried just loops. Each of those is a fail-open or invisible outcome. The fix is sound only with that path specified.
>   **Fix:** If WHATSAPP joins `Channel` in 012, state that a publish request for a channel with no publisher is rejected up front with a readable error. For scheduled or queued posts, it is recorded as a terminal FAILED with a stated reason and is never retried. Keep WHATSAPP out of the publish dialog's selectable channels until 010.
>   **Status:** upheld

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

## Dissent

No withdrawals.
