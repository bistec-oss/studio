### [BLOCK] party-architect — The stamp rule misclassifies writers that change text inside kept HTML, so the badge's own remedy cannot clear it

**Quotes:** > A new render stamps the headline it was built from (`designHeadline`). A write that keeps HTML (inline edit, Override) carries the stored value forward.
**Quotes:** > It offers three buttons: **Apply to image**, **Edit inline** and **Regenerate design**.
**Quotes:** > The only fixes today are Edit inline (find and retype it by hand) or Regenerate design
**Problem:** The proposal sorts every writer into one of two cases: a new render, or a write that keeps the HTML. Three writers fit neither case. (1) Edit inline is offered as a fix precisely because the user retypes the headline in the HTML. Under the carry-forward rule, `renderedHeadline` still holds the old headline afterwards, so the badge stays on after a successful manual fix. One of the three remedies the badge offers can never clear the badge. Override has the same problem whenever the pasted HTML changes the headline. (2) Refine is a model edit of the existing HTML, and the proposal lists it among the writers. If refine counts as a new render and stamps `designHeadline`, then refining a stale draft ("make it bluer") marks it fresh while the image still shows the old headline. That is the same false-clear the proposal cites as the party-security BLOCK (the `<title>` case). If refine instead carries the value forward, a refine that does change the headline leaves the draft stale for good. The design records the stamp per writer type, but whether the HTML still shows the headline depends on what that particular write did to the HTML.
**Fix:** Name a third writer class for writes that keep HTML but may change its text: inline edit, Override and refine. For that class, set the stamp from the written HTML using the same parse-and-match rule Apply uses. Stamp the new headline when exactly one element shows it. Otherwise carry the old value forward, or set it to null. Put that rule in the writer guard test.
**Status:** upheld

### [BLOCK] party-architect — Apply commits before it checks, yet promises to write nothing on a failed check, and never names the commitDraftRevision change this needs

**Quotes:** > **Commit** through `commitDraftRevision`. That re-renders the PNG, and the 025 composite placement still applies.
**Quotes:** > **Check the visible text.** In the real render, the element's visible text must equal the new headline.
**Quotes:** > **Stamp** `renderedHeadline` from what the replace changed, and only after the check passes.
**Quotes:** > **Fail closed.** On no match, more than one match, or a failed check, the action fails with a named reason and writes nothing.
**Problem:** The steps are listed as: commit (which, per the proposal, re-renders), then check against "the real render", then stamp. Item 1 also says the stamp is written "through `draftStampFields` and `revisionStampFields`", which means it is written inside the commit. So "writes nothing on a failed check" and "stamp only after the check passes" can both hold only if one of two things is true. Either `commitDraftRevision` gains a verification hook that runs between its render and its write, or Apply renders once outside `commitDraftRevision` to check and then commits, which would be a second render path beside the one the proposal says `commitDraftRevision` owns. The proposal names neither. An implementer who follows the steps in order writes a revision and then finds the check failed. That is a half-landed write.
**Fix:** State where the check sits. Either `commitDraftRevision` takes a pre-write predicate on the rendered page, listed as a co-change to that function and its other callers, or Apply does an explicit check-render and the proposal accepts that as a second render path. Reorder the steps to match.
**Status:** upheld

### [WARN] party-architect — "Visible text" is defined by two engines, and the mock seam cannot produce the not-visible refusal it promises to test

**Quotes:** > **Match** the innermost element whose visible text equals the stamped old headline, with whitespace normalised and case ignored.
**Quotes:** > Under `MOCK_PUPPETEER`, the same check runs on the parsed HTML.
**Quotes:** > Each draft's HTML was loaded in Chromium with the network blocked:
**Quotes:** > Mock seams and E2E for: badge shown after an edit and after Regenerate headline; apply succeeds; apply refused (not found, ambiguous, not visible)
**Problem:** The match step runs on a parse5 tree, which has no CSS. "Visible text" there can only mean text content minus the listed excluded tags. The check step defines visibility in Chromium, and the 32 of 35 figure that the 28 of 35 acceptance floor rests on was measured in Chromium by `headline-measure.cjs`, not by the parse5 module being built. That makes three definitions of one predicate. Under `MOCK_PUPPETEER`, the check runs "on the parsed HTML" just after a parse5 splice wrote exactly that text, so it passes by construction. The `not-visible` refusal listed for E2E then has no deterministic way to fire unless a sentinel seam is added, and the proposal names none.
**Fix:** Define match-time "visible text" in parse5 terms: the text-node concatenation with the excluded elements, `<br>` read as a space, and nothing CSS-based. Make the fixture acceptance test run the parse5 module itself. Name a `MOCK_*` sentinel that forces the visible-text check to fail, so the `not-visible` E2E case is reachable.
**Status:** upheld

### [WARN] party-architect — Two staleness rules feed one `headlineStale` field, its shape is unspecified, and the null-stamp rule puts an HTML parse into the draft GET

**Quotes:** > A draft is stale when `renderedHeadline` is set and differs from `Draft.headline` after whitespace normalisation. `GET /api/drafts/[id]` returns `headlineStale` with the reason. No model call and no render are needed to read it.
**Quotes:** > **Recommend:** for a null stamp, show the badge when the current headline is not the visible text of exactly one element (the same parser and rule, never attributes or `<title>`).
**Problem:** Item 2 describes staleness as a cheap comparison of the stamp against `Draft.headline`, case-sensitive with whitespace normalised. The recommended answer to Open Question 2 adds a second rule for null stamps: a full parse5 parse of the stored HTML on every draft GET, case-insensitive. One field carries the answers of two rules that disagree on case. A case-only headline edit is stale under the first rule and fresh under the second. The "reason" values that `headlineStale` carries are never listed, though the badge must offer Apply for one reason and hide it for the other. `api-types.ts` and the badge both depend on that shape.
**Fix:** Specify the `headlineStale` shape as a closed set of reasons, for example `stamp-differs` and `unstamped-unmatched`, plus whether Apply is offered. Use one shared normaliser for both rules. State whether the null-stamp parse runs on every GET or is computed once and cached.
**Status:** upheld

### [WARN] party-architect — The failure vocabulary differs between the route, the badge and the event

**Quotes:** > On no match, more than one match, or a failed check, the action fails with a named reason and writes nothing. The badge then says why
**Quotes:** > `revision.headline_applied` (outcome `ok`, `not-found`, `ambiguous` or `not-visible`).
**Quotes:** > That re-renders the PNG, and the 025 composite placement still applies.
**Problem:** The route, the badge text and the analytics event share one set of failure reasons, but only the event spells its set out. The route can also fail in ways the event's outcomes do not cover. A claim conflict happens because the action is "claimed like the other draft actions". A 025 composite placement failure happens during the re-render. A render error can occur. Apply can be invoked on a null-stamp draft. Two implementers would map these differently, either by dropping events or by inventing outcome values that the catalogue's schema rejects.
**Fix:** Define one closed reason enum in the new `headlineApply` module. Have the route response, the badge and the event outcome all import it. Cover the claim conflict, composite failure, render failure and null-stamp cases, or say explicitly which of these are not recorded.
**Status:** upheld

### [WARN] party-architect — The affected-files list leaves out writers that item 1 says must change, and the co-changes a new claimed action needs

**Quotes:** > regenerate design, refine, inline edit, Override, adopt;
**Quotes:** > **Files affected:** about 15 (estimated): `prisma/schema.prisma` plus the migration and down script; `src/lib/drafts/revisions.ts`; the generation writers in `src/lib/agent/generateDraft.ts`; the regenerate-design route; a new `src/lib/drafts/headlineApply.ts`; a new apply route; `src/app/api/drafts/[id]/route.ts`; `src/lib/api-types.ts`; a new badge component and the draft page; the analytics catalogue; tests.
**Quotes:** > A new draft action, `POST /api/drafts/[id]/apply-headline`, claimed like the other draft actions:
**Problem:** Item 1 says refine, inline edit, Override, adopt, restore and Path A first generation each write the stamp. Inline edit and Override must read the stored value and pass it forward. Yet only `generateDraft.ts` and the regenerate-design route appear in the files list. A new claimed action also needs a value for the claim to record, plus whatever shows the pending state and handles a stale claim for it. The proposal describes the migration only as the `renderedHeadline` column ("one additive migration") and does not say whether the claim's action vocabulary changes with it. The guard test catches a missing stamp writer only after the fact. This is the merge set, and as written it is incomplete.
**Fix:** List every stamp writer's route or module in Impact. List the claim co-changes: the action value, whether the same migration carries it, and the client pending-state handling.
**Status:** upheld
