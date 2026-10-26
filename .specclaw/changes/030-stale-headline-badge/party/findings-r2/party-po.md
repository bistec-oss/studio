### [BLOCK] party-po — A cheaper variant (inform-only badge, or a no-stamp read-time check) is dismissed in one line, and the proposal's own numbers show the Apply path is the expensive, low-value part

**Quotes:**

> 4. **Apply to image, with no model call.** A new draft action, `POST /api/drafts/[id]/apply-headline`, claimed like the other draft actions:
> (b) an inform-only badge with no Apply button (cheapest);
> **Recommend (a), the no-model replace,** because the user sees the result before publishing and can still Regenerate design.
> **How often.** Unknown. No analytics event records a headline edit (the 006 catalogue has none), and prod does not run `v2` yet. This change adds the events that will answer it.
> **Problem:** Do-nothing is priced as "unknown" frequency. Even so, the proposal builds an architectural change: a stamp on two tables, every render-stamp writer, a new parser dependency, a new claimed draft action, a splice module, a visible-text check and a revision commit. The cheap variant (b), an inform-only badge, delivers the main value, which is that the user is told the image is stale. That value does not depend on Apply. The stated reason for choosing (a) is only that the user can still Regenerate design, and that reason does not weigh the cost of building Apply at all. The proposal's own table says Apply flattens the accent span and line breaks on most real drafts, so the result often looks worse than the original. The events it adds are meant to measure frequency, yet Apply is built before that frequency is known.
> **Fix:** Ship the badge, the stamp and the two events first, with inform-only buttons (Edit inline and Regenerate design). Gate Apply on the measured edit rate and apply-eligible rate from the events. Name that cut line in the proposal.
> **Status:** upheld

### [WARN] party-po — The per-revision stamp and migration are paid for by every writer to serve a read-time check that could be cheaper

**Quotes:**

> It becomes a nullable TEXT column on `Draft` and on `DraftRevision`, written through `draftStampFields` and `revisionStampFields`. Every writer that already writes a render stamp therefore carries it
> **Size:** architectural. It adds a per-revision stamp that every design writer must carry, plus a migration, a new draft action and a new HTML-parsing module.
> **Recommend:** for a null stamp, show the badge when the current headline is not the visible text of exactly one element
> **Problem:** The stamp costs about 8 writers, a guard test, a migration and a down script, forever. Open Question 2 already designs a stamp-free check: parse the HTML and test whether the current headline is the visible text of exactly one element. That check works on every draft, including all pre-030 drafts, and the proposal itself says the stamp is backfilled for none of them. The proposal does not compare the two. If the element check is reliable (91% match on the measured set), it could serve as the only staleness rule and remove the stamp. It would need a parser, but no migration and no writer coverage. The proposal never prices this alternative, and it never says what the stamp buys beyond Apply's "old headline" lookup.
> **Fix:** State what the stamp adds over the parse-based check. If the answer is only Apply, tie the stamp to the Apply cut line so it ships later or not at all.
> **Status:** upheld

### [WARN] party-po — Unbounded scope with no stated value, plus one acceptance bar with no stated source

**Quotes:**

> 4. **The publish dialog.** Should it show one non-blocking line ("The image shows an older headline") when the draft is stale? **Recommend yes** if it fits the dialog without a new component.
>
> - The apply rule matches at least 28 of the 35 real drafts measured above. The fixtures are stored with ids redacted.
> - Mock seams and E2E for: badge shown after an edit and after Regenerate headline; apply succeeds; apply refused (not found, ambiguous, not visible); restore and adopt carry the stamp; a pre-030 (null) draft.
>   **Problem:** The publish-dialog line is "while we're in here" scope. It is also the only surface a user sees at the moment of cost (publishing a stale image), which weakens "Out of Scope: blocking or warning inside publish" and the stated cut line. The proposal states a value for neither. The badge-on-page and publish-time warning pair is one decision, not two. The E2E list covers seven or more scenarios plus mock seams for what is a note on one page. Open Question 5 leaves Path A unmeasured, so the 28/35 bar covers only Path B and gives no guarantee for template fills.
>   **Fix:** Decide the publish-dialog line now (include or cut). Trim E2E to the paths that differ in behaviour. Name the Path A cost as either in scope or a separate later change.
>   **Status:** upheld

### [NOTE] party-po — Name the shipping cut line and the default for pre-030 drafts

**Quotes:**

> - Backfilling `renderedHeadline` for existing drafts.
>   The alternative is to show nothing for null drafts.
>   **Problem:** On upgrade every existing draft has a null stamp, so under the recommended Open Question 2 rule, parsing runs on every draft GET and may badge old drafts that were never edited. Every old draft opening would carry a parse cost and a possible false alarm. The default for a user who changes nothing is then noise, and the proposal never prices it.
>   **Fix:** Default to "show nothing for null drafts" (the proposal's own alternative). Add the element-parse check later only if the events show demand.
>   **Status:** upheld
