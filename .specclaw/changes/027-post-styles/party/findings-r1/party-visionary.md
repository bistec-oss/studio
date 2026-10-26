### [BLOCK] party-visionary — The post-style key becomes a persisted, published vocabulary, and the proposal already expects the change that will have to break it

**Quotes:**

> - Team- or brand-kit-editable post styles (code-owned for now)
> - **MCP / ACP generate**, which accept a post style key.
> - 006 analytics: the post style recorded where the brief's image style is recorded today (imported vocabulary)
>   **Risk:** medium. Prompt changes alter every generation (versions bumped; render harness and mock E2E guard the shape, a real-model check guards the result). New image contracts may fail the pixel check often until tuned, but a failure already falls back to classic with no second image call. One additive migration (a post-style column on the brief, the queue entry and the campaign); old briefs have none and behave as today.
>   **Problem:** The words "for now" name the next change on this surface: team-editable post styles. Before that change arrives, a bare code key such as `hiring` will be written in five places that a later migration cannot simply rewrite. Three are database columns: Brief, ScheduledGeneration and Campaign. The fourth is the MCP/ACP generate contract, which external clients holding `bstk_` keys hard-code. The fifth is the 006 event store, which is append-only history kept for 180 days. When team styles arrive, a stored `hiring` could mean either the code style or a team's own row. That change then has three options, none cheap: build a dual-namespace string grammar, migrate three columns to a foreign key while keeping old MCP clients working, or reserve the code names forever. The proposal never names the key as a long-lived contract, and it gives no rule for renaming or retiring a style. Retiring one is already a live hazard. A scheduled entry or a campaign default can keep pointing at a key after a later change has removed it from the dataset.
>   **Fix:** Before shipping, state the key's contract in the proposal. Say that keys are permanent and never reused. Say what a retired key resolves to on a pending queue entry and on a campaign default. Give the key format a namespace now (for example a `system:` prefix, or a separate `source` column) so team-owned styles can arrive later without a remap.
>   **Status:** upheld

### [WARN] party-visionary — No stamp records which version of a post style a draft or a pending queue entry used

**Quotes:**

> **Owned in code (user decision):** the post styles are a versioned, client-safe dataset next to the image styles, like 009 and 007. They are not team-editable in this change.
>
> - **scheduled queue entries**: they carry a post style, which means they get an image style too (today they are always classic);
> - Prompts: caption, Path B design, background, and the Path A fill receive the style's checklist; prompt versions bumped
>   **Problem:** The proposal calls the dataset "versioned", but it stores only the key, and it names no per-draft stamp for the post style. Compare 009's `composition` stamp, or `promptVersion`. The next plausible change is tuning the Hiring or Promotion checklist after the OP check. That edit lands in the dataset, not in a prompt builder, so nothing forces anyone to bump `PROMPT_VERSION`. Three things follow. First, a queue entry planned weeks ahead quietly generates under rules its planner never saw. Second, drafts from before and after the edit look the same in the database. Third, the 006 insights page groups both under the same style key. This leaves a sync pair that every checklist edit must keep: the dataset version and PROMPT_VERSION. Nothing fails if someone bumps one and forgets the other. The drift is invisible until someone tries to explain a change in output quality and cannot tell which rules produced which draft.
>   **Fix:** Stamp the post-style key and its version on Draft and DraftRevision, the same way `composition` is stamped. Decide whether a queue entry pins a version or always takes the latest, and say so in the proposal.
>   **Status:** upheld

### [WARN] party-visionary — `goal` becomes a field with two meanings: chosen by the user before 027, derived from the style after it

**Quotes:**

> - Storing the post style on the brief (and on scheduled queue entries); the goal is derived from it
> - Removing the `goal` column (it stays, derived from the style)
>
> 1. **Existing briefs and queue entries with a goal but no post style:** map each old goal to the nearest style, or leave them as "no style" (today's behaviour)? Leaning: leave them; only new briefs get a style.
>    **Problem:** Under the leaning answer to OQ1, `Brief.goal` holds a value the user chose on old rows and a value copied from the dataset on new rows. It also keeps the style's goal as it was on the day the brief was written. If a later change moves Milestone from awareness to engagement, the column and the dataset disagree, and nothing reports it. Two future changes will trip on this. One groups 006 insights by goal; the other finally drops the column. Each has to work out which rows' `goal` can be trusted, and nothing in the schema says. The proposal also never says whether MCP/ACP still accept a raw `goal`. If they do, the rule that goal is derived holds on the web surface only, and a machine client can store a style and a goal that contradict each other. This is the same shape as the 2026-07-28 `status` overload the project wrote down as a lesson.
>    **Fix:** Pick one rule and put it in the proposal. Either `goal` is never written when a style is set, and readers derive it from the style, or the column is explicitly called a snapshot. In both cases, state whether MCP/ACP may still pass `goal` alongside a style.
>    **Status:** upheld

### [WARN] party-visionary — "Every image style at every size" makes the next size, or the next image style, cost seven or more tuned layouts

**Quotes:**

> - **9:16 for every image style**, including the two existing ones (each gets a new contract version with a STORY layout; existing versions are immutable).
> - Image styles: STORY layouts for both existing archetypes, the "Showcase" relabel, five new archetypes (light Showcase, light Editorial split, Abstract brand forms, Full-bleed scene, Spotlight), each passing the real-pixel check at every size it declares
>   **Problem:** After this change there are seven image styles across three sizes, which is 21 pixel-checked contracts, and the precedent is that every style covers every size. The next plausible change on this surface is a new post size, such as LinkedIn's 1.91:1 landscape. It cannot ship until someone writes and tunes seven new layout versions and runs a real-model check on each. The other route is to break the "every" rule, after which the picker needs per-size filtering logic it never had. Adding one more image style has the same cost: three tuned layouts before the first render. Separately, each post style names a default image style, so the post-style dataset now depends on the image-style dataset. If a new size lacks one style's layout, the post styles that default to it need a per-size fallback that nobody has designed.
>   **Fix:** Say in the proposal that the rule is that a style declares the sizes it supports, not that every style supports every size. Define the fallback when a post style's default image style does not support the brief's size (classic is the obvious answer). Then a new size can arrive with partial coverage.
>   **Status:** upheld

### [WARN] party-visionary — The relabel-but-keep-the-key precedent, plus OQ2's `showcase-light`, leaves the Showcase family with two key grammars from its first addition

**Quotes:**

> - **`product-showcase` is relabelled "Showcase"** (one hero subject: a product, a place or an object). The stored key stays, so existing briefs and stamps keep working.
>
> 2. **Light variants:** separate keys (`showcase-light`) in the image-style picker, or a light/dark toggle beside it? Leaning: separate keys, so the stamp and the pixel check stay one contract per key.
>    **Problem:** The family's dark member is `product-showcase` and its light member is `showcase-light`. The editorial pair will presumably be `editorial-split` and `editorial-split-light`. A contributor adding the next variant, such as a light Spotlight or a light Full-bleed scene, will see no single pattern to follow. Any later change that groups by family or by tone will have to keep a hand-written alias table: an analytics rollup of "Showcase, either tone", or the light/dark toggle that OQ2 rejects for now. The precedent is sound on its own, since stored keys never change and only labels do. Applied here, though, it guarantees that keys and labels drift further apart with every variant, and nobody will read the footnote explaining why `product-` appears on only one of them.
>    **Fix:** If keys are permanent, name the new keys so they form a pattern, for example `product-showcase-light`, or make light/dark a separate stored attribute. Record the rule for naming keys in the dataset itself.
>    **Status:** upheld

### [NOTE] party-visionary — The checklist is one step from being a machine-checkable rule set and stops at prose

**Quotes:**

> - a short **content checklist** of measurable rules added to the caption and design prompts (for example Hiring: name the role and how to apply, never invent salary, location or benefits; Promotion: a price, discount or end date appears only if the brief states it, otherwise an open CTA).
>   **Post styles apply on both paths.** On Path A (template) the style drives the caption's goal, tone and checklist, and the design fill gets the checklist's on-image rules; the template still fixes the look. On Path B it also picks the default image style.
>   **Problem:** The proposal already splits rules into caption rules and on-image rules, and it calls them measurable. Several are checkable after generation. "Role named" and "headline contains the news" are text-presence checks. "Price, date or salary appears only if the brief states it" compares the output against the brief. If each rule were a structured entry with a stable id, a scope (caption or image) and an optional predicate, three later changes would get it at little cost: a post-generation verifier (the refine verifier and the stale-headline badge's visible-text check are the obvious hosts), a per-rule pass rate in 006 insights, and the 007 detector checking that a new checklist really is measurable. As prose concatenated into prompts, each of those changes must first parse the checklist back apart.
>   **Fix:** Store each checklist rule as `{ id, scope: 'caption' | 'image', text, check? }` in the dataset, even if this change only renders `text` into prompts.
>   **Status:** upheld
