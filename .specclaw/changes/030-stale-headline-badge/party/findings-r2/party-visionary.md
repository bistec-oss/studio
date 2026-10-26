### [WARN] party-visionary — The "one stamp per field" rule makes every future editable on-image text a migration, a badge and a route

**Quotes:**

> - A fingerprint over every rendered input (party-visionary's 006 idea). Only the headline is an editable rendered input today, so a second field would get its own stamp.
> - Other on-image text (CTA, kicker, body lines). Captions are not on the image.
>
> 4. **Apply to image, with no model call.** A new draft action, `POST /api/drafts/[id]/apply-headline`, claimed like the other draft actions:

**Problem:** The artifact names the next change itself: making the CTA, kicker or body line editable. Under the precedent this change sets, that change must repeat the whole stack for its own field:

- two more nullable TEXT columns, on `Draft` and on `DraftRevision`;
- a new field threaded through `RenderStamp`, `draftStampFields`, `revisionStampFields`, `restoredRenderStamp` and every render-stamp writer;
- a wider guard test, a second staleness rule and a second notice;
- an `apply-cta` route and two more events.

With N fields that is 2N columns, N notices and N apply routes. A contributor who copies 030 will copy the field-named column and the field-named route, because that is the shape 030 shows them.

Round-2 findings from other seats make this worse. party-architect's BLOCK and party-security's WARN both say each stamp write must parse the committed HTML and run the match and visibility rule, so the stamp is verified, not just intended. If that is adopted, the per-field cost also includes a per-field matcher at every writer. One field-keyed shape lets that verification loop run once over all fields. Field-named shapes duplicate it per field.

**Fix:** Keep today's cost, but key it by field:

- one JSONB `renderedText` stamp (`{ headline: "…" }`), as `composition` already is;
- a staleness rule and a writer verification that loop over the keys;
- one apply action that takes the field as a parameter (`apply-text` with `field: 'headline'`).

A second field is then one more key and one more matcher entry, with no migration. If the artifact still wants a field-specific shape, it should say so explicitly and explain why.
**Status:** upheld

### [WARN] party-visionary — "Visible text" gets two definitions that must agree forever, and the mock suite exercises only one

**Quotes:**

> - **Check the visible text.** In the real render, the element's visible text must equal the new headline. Under `MOCK_PUPPETEER`, the same check runs on the parsed HTML.
>
> 5. **Path A.** All 35 measured drafts are Path B. Template fills may differ. The plan measures the seeded Path A templates before fixing the rule.

**Problem:** The proposal's own table already shows the two definitions disagree:

- visible in the rendered page (Chromium): 34 of 35;
- held by exactly one innermost element (the parser): 32 of 35.

The real check runs in Chromium and the mock check runs on parse5. E2E runs under `MOCK_PUPPETEER`, so CI only ever tests the parser's side.

The rule is expected to change. The Open Question 5 Path A measurement will tune it, and so will any later look or prompt change that alters headline markup (028 and 025 each added looks). Each tuning must land in both places in the same commit, and nothing fails if only one is edited. The mock suite then stays green while prod returns `not-visible` on drafts the parser accepts. Nobody notices until the `revision.headline_applied` outcome mix shifts on `/admin/insights`.

**Fix (narrowed in round 2):** party-security's BLOCK shows the real check must be a Chromium geometry test (box in canvas, computed visibility, overflow, `elementFromPoint`). A pure node-tree function cannot express that, so my round-1 option of one shared function for both sides is withdrawn.

The pair that must stay in sync is smaller than I first said: the text normaliser (whitespace, case, `<br>` as a space, `text-transform`) and the element-selection rule. Put those in one module that both sides import, keep the geometry on the Chromium side only, and add a `test:render` real-Chromium fixture. That fixture runs the stored real-draft fixtures through the parse5 matcher and the Chromium check, and fails when they disagree on a draft.
**Status:** upheld

### [WARN] party-visionary — The null-stamp branch can never retire, because restore keeps bringing it back, so the null rule chosen now is permanent

**Quotes:**

> - Backfilling `renderedHeadline` for existing drafts.
>   **Recommend:** for a null stamp, show the badge when the current headline is not the visible text of exactly one element (the same parser and rule, never attributes or `<title>`).
> - restore (`restoredRenderStamp` copies the revision's value);

**Problem:** The artifact treats null as "rendered before 030", which suggests the null branch fades out as old drafts age. It does not fade. Restore copies the revision's stamp, so restoring any pre-030 `DraftRevision`, even years from now, puts a null back on a current draft. Whatever rule the artifact picks for null is therefore a permanent second staleness rule, not a migration-period one. Under the recommended Open Question 2 rule, that means:

- a parse5 parse stays on the `GET /api/drafts/[id]` path forever;
- every later change to staleness (a second field, the publish-dialog line from Open Question 4) has to handle both branches;
- tests need pre-030 fixtures indefinitely.

**Fix (revised in round 2):** I withdraw my round-1 fix, a one-time parse-based backfill. party-security's WARN on pre-030 drafts shows the parse-only rule fails open on CSS-hidden or clipped text. A backfill would make that inference permanent in the stamp column, where it cannot be told apart from a verified stamp. That is a worse one-way door than the read-time branch.

The problem still stands and favours the alternative the artifact already names, which party-po's NOTE and party-security's WARN also recommend: null means "unknown". Show no "fresh" claim, offer Edit inline and Regenerate design, and do no parse at read time. Because restore makes the choice permanent, the artifact should state the null rule as a permanent contract, not as a transition.
**Status:** upheld

### [NOTE] party-visionary — The apply event has no method field, so the match-rate data mixes once the named alternative ships

**Quotes:**

> - `revision.headline_applied` (outcome `ok`, `not-found`, `ambiguous` or `not-visible`).
>   Neither event holds headline text. Together they give the frequency and the real match rate the 006 panel asked for.
> - A model-based apply (a scoped Haiku call that rewrites the element with its styling). It is the alternative in Open Question 1, not built here.

**Problem:** The event exists to measure the real match rate of the splice. The artifact already names the likely next change: Open Question 1(c), a Haiku apply checked the same way, which would emit this same event with the same outcomes. When it lands, one of two things happens:

- a `schemaVersion` bump splits the history at that point; or
- the two methods' outcomes merge into one rate on `/admin/insights`, and that rate can no longer show whether the model apply is worth it.

party-architect's WARN on the failure vocabulary and party-security's NOTE on `render-failed` widen the outcome enum. This finding is about a different axis, the method, and it is still missing.

**Fix:** Add `method: 'splice'` to `revision.headline_applied`, an enum with one value today. The later model apply then becomes a new enum value under the same schema version.
**Status:** upheld

### [NOTE] party-visionary — Rebuttal to party-po's stamp-free alternative: a read-time parse rule changes the verdict on old drafts every time the matcher is tuned

**Quotes:**

> **Recommend:** for a null stamp, show the badge when the current headline is not the visible text of exactly one element (the same parser and rule, never attributes or `<title>`).
> It becomes a nullable TEXT column on `Draft` and on `DraftRevision`, written through `draftStampFields` and `revisionStampFields`.

**Problem:** party-po's WARN proposes using the parse-based element check as the only staleness rule and dropping the stamp. On merge day that is cheaper. Over the long run it is the more expensive option to live with:

- **Old verdicts move.** A read-time rule recomputes every draft's verdict on every GET, using whatever matcher is current. The matcher is expected to change: the Open Question 5 Path A tuning, and every later look or prompt change that alters headline markup. Each tuning would silently flip the badge on historical drafts that nobody has touched.
- **The stamp freezes the verdict.** The stamp records the judgment at the moment the design was rendered, so a later matcher change affects only new writes.
- **The stamp is the only signal of an edit.** Without it, the system cannot tell "the user edited the headline" from "the model worded it differently at render". party-ba's WARN shows the second case is common. Every later consumer of staleness (the publish-dialog line, a `Post`-row record as party-security proposes) would inherit that ambiguity.

The stamp's per-writer cost is real. It buys a verdict that stays put, and the stamp-free rule gives that up.

**Fix:** Keep a persisted stamp, ideally the field-keyed form from my first finding. If party-po's cut line defers Apply, ship the stamp with the badge rather than deferring the stamp.
**Status:** upheld
