### [BLOCK] party-visionary — The post-style key becomes a persisted, published vocabulary, and the proposal already expects the change that will have to break it

**Quotes:**

> - Team- or brand-kit-editable post styles (code-owned for now)
> - **MCP / ACP generate**, which accept a post style key.
> - 006 analytics: the post style recorded where the brief's image style is recorded today (imported vocabulary)
>   **Risk:** medium. Prompt changes alter every generation (versions bumped; render harness and mock E2E guard the shape, a real-model check guards the result). New image contracts may fail the pixel check often until tuned, but a failure already falls back to classic with no second image call. One additive migration (a post-style column on the brief, the queue entry and the campaign); old briefs have none and behave as today.
>   **Problem:** "For now" names the next change on this surface: team-editable post styles. Before that change arrives, a bare code key such as `hiring` will be written in five places that a later migration cannot simply rewrite. Three are database columns: Brief, ScheduledGeneration and Campaign. The fourth is the MCP/ACP generate contract, which external clients holding `bstk_` keys hard-code. The fifth is the 006 event store, which is append-only history kept for 180 days. Once team styles exist, a stored `hiring` could mean the code style or a team's own row. That change then has three options, none cheap: build a two-namespace string grammar, migrate three columns to a foreign key while keeping old MCP clients working, or reserve the code names forever. The proposal never calls the key a long-lived contract, and it gives no rule for renaming or retiring a style. Round 2 note: party-security's WARN covers what happens at run time when a stored key no longer resolves, and that half is theirs. This finding is about the decision that cannot be reversed: an un-namespaced key published to external clients and to history. PO's cut lines, which keep the key on the brief only in release 1, would postpone that door but would not remove it.
>   **Fix:** Before shipping, state the key's contract in the proposal: keys are permanent and never reused. Give the key format a namespace now, for example a `system:` prefix or a separate `source` column, so team-owned styles can arrive later without a remap.
>   **Status:** upheld

### [WARN] party-visionary — No stamp records which version of a post style a draft or a pending queue entry used

**Quotes:**

> **Owned in code (user decision):** the post styles are a versioned, client-safe dataset next to the image styles, like 009 and 007. They are not team-editable in this change.
>
> - **scheduled queue entries**: they carry a post style, which means they get an image style too (today they are always classic);
> - Prompts: caption, Path B design, background, and the Path A fill receive the style's checklist; prompt versions bumped
>   **Problem:** The proposal calls the dataset "versioned", but it stores only the key, and it names no per-draft stamp for the post style. Compare 009's `composition` stamp or `promptVersion`. The next plausible change is tuning the Hiring or Promotion checklist after the OP check. That edit lands in the dataset, not in a prompt builder, so nothing forces anyone to bump `PROMPT_VERSION`. Three things follow. A queue entry planned weeks ahead generates under rules its planner never saw. Drafts from before and after the edit look the same in the database. The 006 insights page groups both under one key. Round 2 note: party-architect filed the merge-day half of this (the word "versioned" has no contract behind it). Their option (b), "the prompt-version bump is the only record", is the one this finding argues against for the long run. It leaves a pair, the dataset contents and `PROMPT_VERSION`, that every future checklist edit must keep in sync by hand, and nothing fails when one is edited without the other.
>   **Fix:** Stamp the post-style key and its version on Draft and DraftRevision, the way `composition` is stamped. Or derive the prompt version from the dataset version so one edit cannot happen without the other. Decide whether a queue entry pins a version or always takes the latest, and say so in the proposal.
>   **Status:** upheld

### [WARN] party-visionary — `goal` becomes a field with two meanings: chosen by the user before 027, derived from the style after it

**Quotes:**

> - Storing the post style on the brief (and on scheduled queue entries); the goal is derived from it
> - Removing the `goal` column (it stays, derived from the style)
>
> 1. **Existing briefs and queue entries with a goal but no post style:** map each old goal to the nearest style, or leave them as "no style" (today's behaviour)? Leaning: leave them; only new briefs get a style.
>    **Problem:** Under the leaning answer to OQ1, `Brief.goal` holds a value the user chose on old rows and a value copied from the dataset on new rows. On new rows it also freezes the style's goal as of the day the brief was written. If a later change moves Milestone from awareness to engagement, the column and the dataset disagree, and nothing reports it. Two future changes will trip on this: grouping 006 insights by goal, and finally dropping the column. Each has to work out which rows' `goal` can be trusted, and nothing in the schema says. Round 2 note: party-architect's fix (the server is the only writer, and goal is rejected as an input) settles the writer question for new rows. It does not settle the split in meaning across history. A server-only writer still leaves the pre-027 rows as user choices and the post-027 rows as derived snapshots. This is the same shape as the 2026-07-28 `status` overload that the project wrote down as a lesson.
>    **Fix:** Pick one rule and put it in the proposal. Either `goal` is not written when a style is set and readers derive it from the style, or the column is explicitly a snapshot and something marks which rows were user-chosen. In both cases, adopt architect's rule on MCP/ACP `goal` input.
>    **Status:** upheld

### [WARN] party-visionary — "Every image style at every size" makes the next size, or the next image style, cost seven or more tuned layouts

**Quotes:**

> - **9:16 for every image style**, including the two existing ones (each gets a new contract version with a STORY layout; existing versions are immutable).
> - Image styles: STORY layouts for both existing archetypes, the "Showcase" relabel, five new archetypes (light Showcase, light Editorial split, Abstract brand forms, Full-bleed scene, Spotlight), each passing the real-pixel check at every size it declares
>   **Problem:** After this change there are seven image styles across three sizes, and the precedent is that every style covers every size. A new post size, or one more image style, would then cost a full set of tuned layouts before it could ship.
>   **Fix:** Say that a style declares the sizes it supports, and define the fallback when a post style's default image style does not support the brief's size.
>   **Status:** withdrawn — On a second reading, the scope line already says "at every size it declares", which is the per-style size declaration this finding asked for. So a future size can arrive with partial coverage, and no tuning cost is forced on it. The remaining gap, the fallback when a post style's default image style lacks the brief's size, is covered by party-architect's BLOCK, whose single resolver takes the aspect ratio as an input. PO's WARN covers the remaining cost question.

### [WARN] party-visionary — The relabel-but-keep-the-key precedent, plus OQ2's `showcase-light`, leaves the Showcase family with two key grammars from its first addition

**Quotes:**

> - **`product-showcase` is relabelled "Showcase"** (one hero subject: a product, a place or an object). The stored key stays, so existing briefs and stamps keep working.
>
> 2. **Light variants:** separate keys (`showcase-light`) in the image-style picker, or a light/dark toggle beside it? Leaning: separate keys, so the stamp and the pixel check stay one contract per key.
>    **Problem:** The family's dark member is `product-showcase` and its light member is `showcase-light`. The editorial pair will presumably be `editorial-split` and `editorial-split-light`. A contributor adding the next variant, such as a light Spotlight or a light Full-bleed scene, will find no single pattern to follow. Any later change that groups by family or by tone must keep a hand-written alias table. Two examples are an analytics rollup of "Showcase, either tone" and the light/dark toggle that OQ2 sets aside for now. The precedent is sound on its own, since stored keys never change and only labels do. Applied here, though, it means keys and labels drift further apart with every variant. Because these keys are permanent (stamped on drafts and revisions), the first naming is the one that lasts.
>    **Fix:** Since keys are permanent, name the new keys so they form a pattern (for example `product-showcase-light`), or make light/dark a separate stored attribute. Record the key-naming rule in the dataset itself.
>    **Status:** upheld

### [NOTE] party-visionary — The checklist is one step from being a machine-checkable rule set and stops at prose

**Quotes:**

> - a short **content checklist** of measurable rules added to the caption and design prompts (for example Hiring: name the role and how to apply, never invent salary, location or benefits; Promotion: a price, discount or end date appears only if the brief states it, otherwise an open CTA).
>   **Post styles apply on both paths.** On Path A (template) the style drives the caption's goal, tone and checklist, and the design fill gets the checklist's on-image rules; the template still fixes the look. On Path B it also picks the default image style.
>   **Problem:** The proposal already splits rules into caption rules and on-image rules, and calls them measurable. Several can be checked after generation. "Role named" and "headline contains the news" are text-presence checks, and "price, date or salary only if the brief states it" compares the output against the brief. If each rule were a structured entry with a stable id, a scope and an optional predicate, three later changes would come almost free: a post-generation verifier, a per-rule pass rate in 006 insights, and the 007 detector confirming that a new checklist is measurable. Round 2 note: party-security's WARN asks for exactly such a post-generation check on unattended runs. A structured checklist is what lets that check be driven per style from the dataset, instead of being a separate, generic number-extractor that must later be kept in step with the prose rules.
>   **Fix:** Store each checklist rule as `{ id, scope: 'caption' | 'image', text, check? }` in the dataset, even if this change only renders `text` into prompts.
>   **Status:** upheld
