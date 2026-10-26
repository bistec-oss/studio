### [BLOCK] party-architect — Two stores answer "which model does the next regenerate use", and they diverge after the first per-channel regenerate

**Quotes:** > - `Brief` carries the chosen caption/design model so async generation, retry and regenerate reuse it
**Quotes:** > - **Regenerate default — decided 2026-10-12:** the picker defaults to the draft's **stamped** model, so a regenerate is like for like unless the user changes it.
**Quotes:** > the caption stamp is **per row**, as `DraftCaption.model` plus `Draft.headlineModel`.
**Problem:** The proposal gives the regenerate model two sources. The In Scope line says regenerate reuses the model carried on `Brief`. The 2026-10-12 decision says regenerate defaults to the draft's stamp. The two agree only until the first regenerate that uses a different model. Say a user regenerates the LinkedIn caption on Opus. `DraftCaption(LINKEDIN).model` becomes Opus, `Brief`'s caption model is still the original, and the Instagram row still carries the original. The next "Regenerate all" (`{}`) has no single stamped model to default to, and `Brief` says something different again. The stamp is also not a tier in the `resolveModel` precedence list, so it is unclear whether "defaults to the stamp" is client logic (the picker pre-fills an explicit request) or server logic (a resolver tier). If it is client logic, regenerate from MCP/ACP skips the stamp and uses the team default. A user regenerate and a machine regenerate of the same draft then pick different models. The same pre-fill question applies to legacy drafts whose stamp is null.
**Fix:** Pick one owner. Either `Brief` stores the requested model and the stamps are write-only records that nothing reads for defaults, or the stamps drive regenerate and `Brief` does not. State whether the stamp is a server-side resolver tier. Define what "Regenerate all" defaults to when the rows' stamps differ, and what a null stamp falls back to.
**Status:** upheld

### [BLOCK] party-architect — A regenerate picker is decided, but no regenerate picker or route-body change is in scope

**Quotes:** > - **Brief wizard:** Caption model + Design model pickers on the Review step.
**Quotes:** > - **Refine box:** a model picker beside the instruction.
**Quotes:** > - Pickers: brief wizard, refine, assistant chat headers; `/team` admin section
**Quotes:** > the same surface covers `regenerate-copy` in all three forms: "Regenerate all" (`{}`), one channel (`{channel}`) and the headline (`{headline:true}`)
**Problem:** The Regenerate-default decision refers to "the picker" on regenerate. But the list of places users choose (item 4) and the In Scope picker list name only the brief wizard, refine and the chat headers. Neither regenerate-copy (all three body forms, on 012's per-channel panels) nor regenerate-design gets a picker. For the decision to work, the same commit has to add a model field to all three `regenerate-copy` request bodies and to `regenerate-design`. It also has to add a picker to each caption panel, the headline control and the design regenerate control. The proposal names none of these. As written, the merge lands a decision with no UI or route contract to carry it.
**Fix:** Add the regenerate pickers (each caption panel, the headline, design regenerate) and the `model` field on the `regenerate-copy` / `regenerate-design` bodies to item 4 and to In Scope. Specify the field's name and shape across the three body forms.
**Status:** upheld

### [WARN] party-architect — The proposal adds `resolveModel` without saying what happens to the existing `modelFor` and the existing `CLAUDE_CLI_MODEL` read, or where the env var now sits

**Quotes:** > `brandkit/voiceDraft.ts:7` (bypasses `modelFor` entirely)
**Quotes:** > It is applied as `override || explicitModel` (`claudeCli.ts:25`).
**Quotes:** > 4. the system default (today's split).
**Quotes:** > `CLAUDE_CLI_MODEL` moves from override to system-default fallback.
**Quotes:** > the background-image decision (Haiku, `modelForBackground`)
**Problem:** The proposal names three existing model-selection points: `modelFor`, `modelForBackground`, and the env read inside `claudeCli.ts:25`. It also names a fourth, a local choice in `refine/route.ts:160,170`. It then promises "One resolver" but never says whether `modelFor` is deleted, kept as tier 4, or wrapped. If it survives beside `resolveModel`, there are two resolvers for the same surfaces. The proposal also never says that `claudeCli.ts` stops reading `CLAUDE_CLI_MODEL` itself. If that read survives at the spawn site, it still beats the resolver, which is exactly problem 3. Where the env var sits is also ambiguous. "Fallback" below tier 4 would never fire, because today's split always resolves. Placed above tier 4, it replaces the split. Two implementers will pick differently. The env var's values today are aliases (and `default`), not the catalogue's full IDs. The proposal leaves open whether it applies in API mode, and whether its value is validated against the catalogue and the team allow-list.
**Fix:** State that `resolveModel` replaces `modelFor` (or that `modelFor` becomes its tier-4 table), and that `claudeCli.ts` stops reading the env var. Place `CLAUDE_CLI_MODEL` explicitly relative to "today's split". Say which modes it applies in, and how alias values map onto catalogue IDs.
**Status:** upheld

### [WARN] party-architect — The allow-list check covers only tier 1; the other model sources are unvalidated, and the allowed set can be empty

**Quotes:** > 1. explicit request, validated against the team allow-list;
**Quotes:** > 2. the user's remembered choice for that surface;
**Quotes:** > admins can remove any model from their team's list.
**Quotes:** > **Template fill (`design.template`, Path A) — decided 2026-10-12:** offers Haiku and Sonnet only.
**Quotes:** > A `ScheduledGeneration` may optionally pin models at plan time.
**Problem:** As written, only the explicit request is checked against the allow-list. Several other values are persisted and read back later: the remembered choice, the team default, the model carried on `Brief`, the `ScheduledGeneration` pin, and the env fallback. Any of them can name a model an admin has since removed. The resolver contract does not say whether such a value is rejected, skipped to the next tier, or used anyway. Skipping silently is the routing the Risk section says it wants to prevent. For a scheduler run with no user, "400" has no meaning. Two allowed sets also overlap: the per-surface catalogue restriction (template fill offers only Haiku and Sonnet) and the team allow-list. Whether the allow-list is per team or per surface is unstated ("defaults per surface + allow-list"). If an admin leaves only Opus, `design.template` has no valid model. Nothing says whether the `/team` UI prevents this or the resolver errors.
**Fix:** Specify that the allow-list check applies at every tier, and what happens on a miss at each tier (fall through or fail, plus the behaviour for non-interactive callers). State the allow-list's scope. Require that the effective set (catalogue ∩ allow-list) is never empty for any surface, and say where that is enforced.
**Status:** upheld

### [WARN] party-architect — The timeout contract covers single calls, but the sweeps measure the whole chain, and the catalogue's timeout shape is stated two ways

**Quotes:** > A per-model design timeout, e.g. Opus ~600s against today's 300s, **kept strictly under the 15-minute stale sweeps**, or those sweeps become model-aware.
**Quotes:** > Each entry carries its full API ID, a display name, a relative cost/speed label, and a per-surface timeout.
**Quotes:** > (pinned to Haiku by user decision 2026-09-23 — the retry, not the check, uses the user's refine model)
**Problem:** The proposal keeps each design call under 15 minutes. The sweeps, though, judge an action's age, not one call's. A refine is a refine call, then the Haiku verifier, then a retry on the user's refine model. At Opus ~600s each, that is about 1200s plus the check, past the 900s `pendingAction` sweep, even though each call meets the stated rule. Generation is similar: the caption call, the background step and the design call run back to back. The two alternatives ("kept strictly under" vs "sweeps become model-aware") are different contracts with different co-changes, and the proposal leaves both open. The shape of the catalogue entry is also inconsistent. Item 1 says one timeout per surface inside each model entry. Item 8 says one per-model timeout for design. Caption and assistant timeouts for Opus are therefore unspecified.
**Fix:** Pick one of the two options. State the budget as the worst-case chain per action (generation; refine + verify + retry), not as a per-call cap. Define the catalogue's timeout field as a model × surface table that covers caption and the assistants.
**Status:** upheld

### [WARN] party-architect — The proposal adds a `ScheduledGeneration` model pin in its solution but omits it from scope, so its co-changes are unnamed

**Quotes:** > A `ScheduledGeneration` may optionally pin models at plan time.
**Quotes:** > - `TeamModelPolicy` (defaults per surface + allow-list) and per-user remembered choice — schema + migration
**Problem:** Item 6 introduces a model pin on `ScheduledGeneration`. The In Scope list names only `TeamModelPolicy`, the per-user choice, the `Brief` field and the Draft/DraftRevision stamps. A pin needs columns on `ScheduledGeneration`. It also needs fields on the queue create/edit routes, on the batch route, and on the briefing chat's schedule block (its grammar gains a field or explicitly does not), plus a picker in the entry modal. "May optionally" leaves unclear whether this ships in this change. If it does, the merge half-lands without those co-changes.
**Fix:** Either list the pin and its co-changes in In Scope (schema, queue and batch route bodies, the schedule-block grammar, the entry modal), or move it to Out of Scope.
**Status:** upheld

### [WARN] party-architect — No test checks the model ID at the call boundary, and the timeout/sweep reconciliation has no test at all

**Quotes:** > - Unit tests for the pure resolver (precedence + allow-list); E2E: disallowed model → 400, stamp recorded, remembered choice restored
**Quotes:** > (`claude -p --model` accepts full IDs; see the `claudeCli.ts:20` comment)
**Problem:** The listed tests prove that the resolver picks a model and that the value is written to the database. Nothing proves that the resolved ID reaches the `claude -p --model` arguments or the Anthropic SDK request. That gap is the one that matters, because it is where `CLAUDE_CLI_MODEL` used to win silently, and where a leftover hard-coded call site (the table lists eight) would go unnoticed while the stamp still looks right. The claim that the CLI accepts full IDs rests on a code comment, with no test. Per-model timeouts and their relation to the two 15-minute sweeps also need a deterministic test with an injectable clock or timeout. None is listed.
**Fix:** Add a stub seam at the spawn/SDK boundary that records the model argument. Assert on it for every surface in the table, with `CLAUDE_CLI_MODEL` set and unset. Add unit tests that compute the per-action timeout budget against the sweep threshold, with no wall-clock dependence.
**Status:** upheld

### [NOTE] party-architect — Some call sites inside a surface have no picker, so a user sets their model on a different screen

**Quotes:** > - `assistant.brandkit` (vision extraction + image → template + voice draft)
**Quotes:** > - `assistant.briefing` (campaign chat + schedule planning + both Enhance flows)
**Quotes:** > - **Each assistant chat header** (campaign briefing, brand-kit assistant): a model menu.
**Problem:** Pickers exist only in chat headers. Image → template, voice draft and the post-brief Enhance on the wizard's Content step have no picker. They will always resolve from the remembered choice, which the user set in a chat header on another page. The wizard's own pickers cover caption and design, not briefing. This is consistent with the precedence rules, but these call sites can never take an explicit request.
**Fix:** Either confirm in the proposal that these sites resolve from the remembered choice by design, or split them into their own surfaces.
**Status:** upheld
