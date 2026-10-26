### [WARN] party-visionary — The "one stamp per field" rule makes every future editable on-image text a migration, a badge and a route

**Quotes:**

> - A fingerprint over every rendered input (party-visionary's 006 idea). Only the headline is an editable rendered input today, so a second field would get its own stamp.
> - Other on-image text (CTA, kicker, body lines). Captions are not on the image.
>
> 4. **Apply to image, with no model call.** A new draft action, `POST /api/drafts/[id]/apply-headline`, claimed like the other draft actions:

**Problem:** The artifact names the next change itself: making the CTA, kicker or body line editable. Under the precedent it sets, that change has to repeat the whole stack for its field. It needs two more nullable TEXT columns (`Draft` and `DraftRevision`), a new field threaded through `RenderStamp`, `draftStampFields`, `revisionStampFields` and `restoredRenderStamp`, and every render-stamp writer updated. It also needs an extended guard test, a second staleness rule, a second notice on the draft page, an `apply-cta` route and two more events. With N fields that is 2N columns, N notices and N apply routes. A contributor copying 030 will copy the field-named column and the field-named route, because that is what 030 shows them. Choosing a field-specific shape now, when the proposal already expects a second field, means each later field pays a schema migration instead of adding one data entry.
**Fix:** Keep the same cost today but key it by field. Make it one JSONB `renderedText` stamp (`{ headline: "…" }`, the same way `composition` is already JSONB), a staleness rule that loops over the keys, and one apply action that takes the field as a parameter (`apply-text` with `field: 'headline'`). Then the second field is one more key and one more matcher entry, with no migration. If a field-specific shape is still wanted, the artifact should say so explicitly and explain why.
**Status:** upheld

### [WARN] party-visionary — "Visible text" gets two definitions that must agree forever, and the mock suite exercises only one

**Quotes:**

> - **Check the visible text.** In the real render, the element's visible text must equal the new headline. Under `MOCK_PUPPETEER`, the same check runs on the parsed HTML.
>
> 5. **Path A.** All 35 measured drafts are Path B. Template fills may differ. The plan measures the seeded Path A templates before fixing the rule.

**Problem:** The proposal's own table shows these two definitions already disagree. One is "visible in the rendered page" (Chromium: 34 of 35). The other is "innermost element holds it as its text" (the parser: 32 of 35). Chromium knows CSS (`display:none`, `text-transform`, clipped overflow) and the parser does not. The real check will use Chromium and the mock check will use parse5. Every E2E run is under `MOCK_PUPPETEER`, so CI only ever verifies the parser's definition. The rule is already expected to change: Open Question 5's Path A measurement will tune it, and so will any later model or prompt change that alters headline markup. Each tuning has to land in the parse5 matcher and in the Chromium check in the same commit. Nothing fails if only one is edited. The likely result is a mock suite that stays green while prod returns `not-visible` on drafts the parser accepts, or the reverse. Nobody notices until the `revision.headline_applied` outcome mix shifts on `/admin/insights`.
**Fix:** Define visible text once, as a pure function over a node tree, and feed it from both sides: the parse5 tree in the matcher, and a serialised DOM snapshot pulled from Chromium in the real check. Otherwise, state which definition is authoritative and add a render-harness fixture (`test:render`, real Chromium) that runs the stored fixtures through both and fails when they disagree.
**Status:** upheld

### [WARN] party-visionary — The null-stamp read-time branch can never retire, because restore keeps bringing it back

**Quotes:**

> - Backfilling `renderedHeadline` for existing drafts.
>   **Recommend:** for a null stamp, show the badge when the current headline is not the visible text of exactly one element (the same parser and rule, never attributes or `<title>`).
> - restore (`restoredRenderStamp` copies the revision's value);

**Problem:** Without a backfill, staleness has two rules, a stamp comparison and an HTML parse at read time, and every later change to staleness must handle both. The artifact treats null as "rendered before 030", which suggests the branch fades out as old drafts age. It does not fade. Restore copies the revision's stamp, so restoring any pre-030 `DraftRevision` puts a null back on a current draft, years from now. The parser therefore stays on the `GET /api/drafts/[id]` path forever. The next change that touches staleness (for example the second field from the finding above, or a publish-dialog line from Open Question 4) has to reason about both branches, and its tests need pre-030 fixtures indefinitely.
**Fix:** Do a one-time, deterministic, no-model backfill over `Draft` and `DraftRevision`, using the same rule Open Question 2 already applies at read time. Where the current headline is the visible text of exactly one element, stamp it. This is the same inference the read-time branch makes, done once instead of on every read. Rows that do not match stay null, and null then means only "unknown: offer Edit inline and Regenerate design", which needs no parser at read time. If the backfill is declined, the artifact should say that the dual branch is permanent.
**Status:** upheld

### [NOTE] party-visionary — The apply event has no method field, so the match-rate data mixes once the named alternative ships

**Quotes:**

> - `revision.headline_applied` (outcome `ok`, `not-found`, `ambiguous` or `not-visible`).
>   Neither event holds headline text. Together they give the frequency and the real match rate the 006 panel asked for.
> - A model-based apply (a scoped Haiku call that rewrites the element with its styling). It is the alternative in Open Question 1, not built here.

**Problem:** The event's purpose is to measure the real match rate of the splice. The artifact already names the likely next change: Open Question 1(c), a Haiku apply checked the same way, which would emit the same event with the same outcomes. When it lands, either the event gets a `schemaVersion` bump and history splits at that point, or the two methods' outcomes merge into one rate on `/admin/insights`. In the merged case, the number that would justify (or rule out) the model apply would no longer show it. One field now would avoid that.
**Fix:** Add `method: 'splice'` (an enum with one value today) to `revision.headline_applied`, so the later model apply is a new enum value under the same schema version.
**Status:** upheld
