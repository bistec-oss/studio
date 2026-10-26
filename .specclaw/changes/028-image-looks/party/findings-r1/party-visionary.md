### [BLOCK] party-visionary — Five new look keys become permanent through two immutable datasets and a free-text column, and no rule says how to rename or retire them

**Quotes:**

> - **Size:** architectural (the look keys and the `realCheck` allow-list are a vocabulary that the resolver, the stamp, the unattended surfaces and 025 all depend on)
> - **Post-style defaults move** in a new post-style version (`versions[2]`, never an edit): Promotion → Spotlight, Event → Full-bleed scene, Hiring → Full-bleed scene, Tip → Abstract brand forms, Milestone → Spotlight. General, Launch and Announcement stay. This bumps `POST_STYLES_REVISION`, so `PROMPT_VERSION` moves with it (027's version rule).
> - **Risk:** medium. New contracts may fail on real pixels often until tuned; a failure already falls back to classic with no second image call, and unattended surfaces see a look only after it passed. **No migration expected:** `Brief.imageStyle` is free text, the stamp is JSON, and the allow-list lives in code. The spec confirms.
>   **Problem:** The artifact calls the look keys a vocabulary that other parts of the system depend on. It never decides the rule that 027 did write for post-style keys: never renamed, never reused, and a retired key stays resolvable. That decision is needed here, because these keys get pinned in three places a later change cannot edit. (a) Post-style `versions[2]` names `spotlight`, `full-bleed-scene` and `abstract-forms`, and 027's version rule forbids editing a released version, so those names must resolve as long as a draft is stamped with that version. (b) Every composition stamp in `Draft`/`DraftRevision` JSON stores the key. (c) `Brief.imageStyle` is free text, so a stale value has no enum to reject it. Take the plausible next change: insights show Spotlight falling back on most Promotion posts, and someone wants to retire it, or rename `abstract-forms` once 025 adds a real "forms" look. The artifact gives no path. The released post-style version can't be edited to point elsewhere. Nothing defines what the resolver does when a post-style default names a retired look. And refine/regenerate on drafts stamped with the old key would have nothing to resolve to. Shipping makes all five keys permanent without anyone having decided they are.
>   **Fix:** Extend 027's key rule to look keys explicitly: never renamed, never reused, and a retired look stays resolvable but is hidden from pickers. Also state the resolver's behaviour when a post-style version's default names a retired look: classic, with a named note such as `retired-classic`. A test should fail if any post-style version names a key that is missing from the dataset.
>   **Status:** upheld

### [WARN] party-visionary — The `<base>-<variant>` grammar can't be parsed from the key, because bases already contain hyphens

**Quotes:**

> - Dataset validation: at least one `text` region per contract; the variant key grammar `<base>-<variant>`; pass and fail fixtures for every (key, version, size).
> - Five new looks (`product-showcase-light`, `editorial-split-light`, `abstract-forms`, `full-bleed-scene`, `spotlight`), each at SQUARE, PORTRAIT and STORY.
>   **Problem:** Every multi-word base (`product-showcase`, `editorial-split`, `abstract-forms`, `full-bleed-scene`) is itself shaped like `<base>-<variant>`. So the grammar can't tell a variant from a base by syntax. A test can only enforce it by matching the key against existing base keys as a prefix. That makes each key's meaning depend on which other keys exist. The next change that adds a plausible base such as `full-bleed` (no scene) or `abstract` silently turns `full-bleed-scene` into "a variant of `full-bleed`". The grammar test then either fails on a key that was legal at merge or quietly misclassifies it. Any reader that groups looks by family has to do the same lookup, and one that splits on the last hyphen gets it wrong: for example the per-look insights section, or 025 deciding which family takes product screenshots. Once keys are persisted (finding above), the grammar is a published contract and can't be redrawn.
>   **Fix:** Store the family as an explicit field on each look (for example `family: 'product-showcase'`, `variant: 'light' | null`). Test that a variant's key equals `${family}-${variant}`, and fail validation when a new base key is a prefix of an existing key.
>   **Status:** upheld

### [WARN] party-visionary — A `realCheck` keyed to (key, current version, size) is revoked by changes that don't need it and survives changes that do

**Quotes:**

> The spec sets the exact rectangles, subjects and band sizes. Existing versions are never edited (the dataset's immutability rule): STORY arrives as `versions[2]` with `current: 2`, and drafts stamped `v1` keep resolving.
>
> - **The allow-list:** each contract carries a `realCheck` record (`{ passedOn, renders }`), written into the dataset only from the real-image check's results. Unset means unproven.
> - `resolvePostStyle` lets a queue entry, an MCP call or an ACP call use a non-classic look **only when the contract at (key, current version, size) has a `realCheck` record**. Otherwise it is classic, with a new note `unproven-classic`. Interactive briefs may use every active look at every declared size, as today (a failed pixel check already falls back to classic with no second image call).
>   **Problem:** The version number belongs to the look, not to the size. So the next change that adds a size or retunes one size's rectangle creates `versions[n+1]`. That clears the allow-list for every size of that look, so unattended use falls back to classic until a new paid operator run, even for sizes whose geometry was copied unchanged. This change already does it once. `product-showcase` and `editorial-split` v2 copy SQUARE/PORTRAIT "as is", but those are not among the 17 renders. So OP-1's pass either gets copied onto v2 by hand under an unwritten rule, or the only looks ever proven on real images lose that proof. 025, which changes these same contracts, will hit the same thing. The record also fails in the other direction. What a real check proves is contract × hero prompt wording × image model × `evaluate.ts` thresholds, and only the first is in the key. The next change that rewrites the hero prompt wording (moving `PROMPT_VERSION`), or replaces `gpt-image-2`, leaves every `realCheck` set while it proves nothing about the new pipeline. Nobody will notice until an unattended post renders badly.
>   **Fix:** Key the record per (key, size). Store a fingerprint with it: that size's geometry, the hero prompt version and the image model. The resolver treats a mismatch as unproven. Alternatively, state in the artifact exactly which future edits must clear `realCheck` and which carry it over, and add a test that enforces the list.
>   **Status:** upheld

### [WARN] party-visionary — The light looks copy their base's whole contract, so every later geometry fix must be made twice and checked twice

**Quotes:**

> **Light polarity is data, not new code.** `evaluateRegions` already takes a `textTone` of `light` or `dark` (`src/lib/designData/evaluate.ts:29-35`). The light looks need fixtures and prompt wording, not a new check.
>
> - Five new looks (`product-showcase-light`, `editorial-split-light`, `abstract-forms`, `full-bleed-scene`, `spotlight`), each at SQUARE, PORTRAIT and STORY.
>   **Problem:** Polarity is data, but it sits at the wrong level. Each light variant is its own key with its own versions, contracts, fixtures and `realCheck`, so the base geometry exists in two copies for each of six (look, size) pairs. Take the next foreseeable change: tuning after the real check widens the `editorial-split` STORY text rectangle as v3. `editorial-split-light` keeps the old rectangle and nothing fails. The two drift until someone compares a light and a dark story post side by side. Every fix then costs two version bumps, two fixture pairs and two paid re-checks. Each future look that gets a light twin doubles this again. 027b sets the template, so that will be the norm.
>   **Fix:** Model a variant as its base plus overrides (`textTone`, subject wording), so geometry edits reach the variant automatically. If the copy is intentional, say so, and add a test that the variant's regions equal its base's at matching versions.
>   **Status:** upheld

### [WARN] party-visionary — The only tool that writes the allow-list lives in a closed change's folder, and nothing ties its output to the record in code

**Quotes:**

> - **Real-image check (operator-run, capped):** the 009 OP-1 runner (`.specclaw/changes/009-hero-image-design/op1/run-op1.mjs`) is extended to render **one brief per new contract** (17 hero image calls), plus **at most one re-run per failing contract** after tuning. **Hard cap: 34 hero image calls**; the runner refuses to go past it. A contract passes when its render keeps the style (no fallback) and the user marks it acceptable. It runs locally on a scratch database, as OP-1 did. It is a tuning step and the allow-list input, never a merge gate.
>   **Problem:** This runner becomes the only writer of a record that controls what unattended surfaces do in production. It sits in a completed change's folder: outside `src/` and `scripts/`, outside tsc, lint and CI, and it moves when `/specclaw:archive` archives 009. 025, Phase 3 and every new look will have to find and extend a 009 artifact to get proof. The cap of 34 is two times 17, a figure fixed to this change's contract count, so the next run needs it worked out again. And `realCheck` is typed into the dataset by hand from the runner's output, so nothing fails when the two disagree. The first drift is a hand-edited `realCheck` with no matching render. It would be found only by someone auditing an unattended post that looked wrong.
>   **Fix:** Move the runner to `scripts/`, where `purge-analytics.mjs` already sits. Compute the cap from the dataset as two times the number of contracts without a record. Have the runner write a committed results file, and add a test that every `realCheck` matches an entry in it.
>   **Status:** upheld

### [WARN] party-visionary — "One render and the user's approval" becomes the standard of proof every later look will copy

**Quotes:**

> 3. **Real-check pass bar:** per contract, "kept the style and the user marks it acceptable" (proposed), or a preference bar like OP-1's 4 of 6 per look (more renders, over the cap)?
> **Problem:** Whatever bar this change uses to admit a look to unattended surfaces is the bar 025's screenshot looks and Phase 3 will cite as already established. OP-1 set the bar at six briefs per look against a preference threshold. The proposed default drops it to one render per contract, judged by eye, and the record (`{ passedOn, renders }`) keeps neither which brief was used nor the judgement. The lesson a contributor takes away is "one render proves a look". That holds only as long as the looks are this close to OP-1's two proven ones. It will be wrong for 025, where the subject is a product screenshot with failure modes no one has seen yet.
> **Fix:** Whatever bar is chosen, write it down as a named, stated rule. Store the brief id and the render reference in `realCheck`, so a later change can see what the proof consisted of and decide whether it carries over.
> **Status:** upheld

### [NOTE] party-visionary — Production fallback rates per look and the allow-list are two halves that never connect

**Quotes:**

> - **Fallbacks are seen** (finding 19): the look outcome per draft (styled, or fell back with its reason) is shown per look key on `/admin/insights`, from events 006 already emits or one new field on them. The spec decides which.
>   **Problem:** The allow-list is written once and only grows, while the evidence that should promote or demote a look is live production fallback per contract. The proposal sends that evidence only to a page a person reads, grouped by look key rather than by the (key, version, size) triple that `realCheck` is keyed on. One small step would let a later change derive or revoke unattended use from real outcomes. Without it, demoting a look that fails in production is always a hand-made code change, and comparing the page with the record means a manual join.
>   **Fix:** Group the insights outcome query by the same (key, version, size) identity `realCheck` uses, and state that revoking `realCheck` is currently a code change.
>   **Status:** upheld
