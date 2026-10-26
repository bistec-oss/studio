### [BLOCK] party-security — The caption migration rewrites every draft's caption on deploy and gives no way back

**Quotes:**

> The storage shape is a design-phase decision (see Open Questions); `Draft.copyText` is retired, since the rename is done where the change touches code.
> The migration is data-only and applies on deploy through the PR #39 entrypoint.
> the pure, unit-tested migration planner, which never writes an empty caption over real text;
> **Problem:** The migration runs automatically on every boot, against every draft in production. It changes the text: it cuts on headers and strips `**`. It also retires the source column. The only safeguard is that it "never writes an empty caption over real text". It does nothing about a wrong cut. A wrong cut is a header word inside the body, a caption sent to the wrong channel, or a `**` the user meant to keep. The proposal names no way to undo any of these. If `copyText` is dropped in the same release, the original text is gone. An operator who finds a bad split has nothing to rebuild it from, because drafts and revisions never snapshot captions ("Revisions stay design-only"). Real prod data is involved (the Hearts Academy/IRP drafts), so a bad split cannot be recovered.
> **Fix:** Keep `copyText` read-only and untouched for at least one release after the migration, and drop it in a separate later migration. Alternatively, copy the original text into the migrated row (for example an `originalText` / `migratedFrom` field). Either way, state the rollback procedure: re-run the planner from the preserved source, or a down migration that rebuilds `copyText`.
> **Status:** upheld

### [BLOCK] party-security — When the splitter can't split, it silently keeps the combined-caption bug, including for posts already scheduled to publish

**Quotes:**

> If it finds `INSTAGRAM:` / `LINKEDIN:` headers, it splits on them and strips `**`. Otherwise the whole text becomes both the Instagram and the LinkedIn caption.
> **Problem:** The fallback reproduces Problem 1 exactly: Instagram and LinkedIn get the same combined text, hashtags and `**` markers included. It records nothing that marks the result as unsplit, so it looks the same as a clean migration. Problem 1 itself calls the headers "model behaviour, not a format", so variants like `Instagram caption:` or `## LinkedIn` are likely. Each variant falls through without any signal. The worst case is a post already queued for the scheduler before deploy. It publishes after the migration with nobody having seen the migrated caption, and a public post cannot be recalled. The release claims Problem 1 is fixed, so the operator has no reason to check.
> **Fix:** Store how each migrated draft was handled (`split` / `unsplit-fallback` / `empty`). Show a "migrated: review this caption" notice on fallback drafts. For any fallback draft that has a pending SCHEDULED post, hold the post until a human confirms the caption, or at least log and list those drafts at migration time.
> **Status:** upheld

### [WARN] party-security — The publish guard only checks for an empty caption, so a failed or over-limit caption that has text still goes out

**Quotes:**

> An empty caption for a channel that is being published is a validation error with a readable message, never a silent empty post.
> The reply is parsed at the boundary and each field is validated.
> A reply that yields only some captions keeps those and marks the rest failed, so that channel can be retried alone.
> **Problem:** Two separate mechanisms are involved. The extractor gives a caption a status (validated or failed). The publish guard tests only whether the text is empty. A caption can be marked failed and still have text in at least three cases:

- it failed validation (over the limit, or Markdown `**` in WhatsApp) but the text was kept;
- a per-channel regenerate failed and the previous text stayed;
- it is whitespace-only.

In each case it passes the guard and is published. On the scheduler path this happens with no human in the loop. The `failed` mark becomes advisory at the one point where it matters.
**Fix:** Key the guard on the caption's status as well as its text. Refuse to publish if the caption is failed or pending, if the text is empty after trimming, or if it is over the channel's hard limit. Make this error terminal rather than retryable in the publish scheduler, and record it as the Post's error reason.
**Status:** upheld

### [WARN] party-security — The model-written headline steers the design prompts, and nothing says what happens when it is missing or malformed

**Quotes:**

> **On-image text: a separate short headline.** The caption call also returns a short headline, and the design, Path A and background prompts use it. They no longer use any caption.
> **Problem:** The headline is now the only source of on-image text. The partial-failure contract covers captions only, and the extractor test list ("clean, partial, preamble, fenced, missing keys") names captions, not the headline. With no stated rule, the likely outcome is that a missing or empty headline sends the design run forward with no grounded text. The design model then invents on-image text. That is the fabricated-facts risk the IRP briefing's "FACTS — DO NOT INVENT" rule exists to prevent, and the result reaches the exported image looking like a normal run. The headline is also model output, derived from brief and campaign-briefing text, and it now enters three model prompts. The proposal does not say it is fenced as untrusted content or limited in length.
> **Fix:** Make the headline a required, validated field: non-empty, with a length cap and no newlines or fences. Treat its absence as a generation failure that shows on the draft, rather than letting design run without it. Pass it to the design, Path A and background prompts inside the same untrusted-content fence used for brief text.
> **Status:** upheld

### [NOTE] party-security — The extractor has no rule for a reply that contains more than one JSON object

**Quotes:**

> The caption prompt asks for all three in a fenced JSON object with fixed keys.
> **Problem:** The brief and campaign-briefing text the model sees can contain JSON-like content, and the model may echo or quote it. If the extractor takes the first fenced block or the first object that parses, a planted `{"linkedin": "..."}` could be picked as the real captions and then published. The proposal tests "preamble" and "fenced", but not "two candidate objects".
> **Fix:** Accept exactly one object that has the expected key set and no unknown keys. If there are zero or several candidates, fail closed and log what was thrown away, matching how `extractHtmlDocument` handles HTML replies. Add a unit case for a reply with two objects.
> **Status:** upheld
