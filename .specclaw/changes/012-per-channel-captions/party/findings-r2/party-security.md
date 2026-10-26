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
