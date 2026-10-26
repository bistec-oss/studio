### [BLOCK] party-architect — Two stores answer "which model does the next regenerate use", and they diverge after the first per-channel regenerate

**Quotes:** > - `Brief` carries the chosen caption/design model so async generation, retry and regenerate reuse it
**Quotes:** > - **Regenerate default — decided 2026-10-12:** the picker defaults to the draft's **stamped** model, so a regenerate is like for like unless the user changes it.
**Quotes:** > the caption stamp is **per row**, as `DraftCaption.model` plus `Draft.headlineModel`.
**Problem:** The proposal gives the regenerate model two sources. The In Scope line says regenerate reuses the model carried on `Brief`. The 2026-10-12 decision says regenerate defaults to the draft's stamp. The two agree only until the first regenerate that uses a different model. If a user regenerates the LinkedIn caption on Opus, `DraftCaption(LINKEDIN).model` becomes Opus while `Brief` and the other rows keep the original. The next "Regenerate all" (`{}`) has no single stamped model to default to, and `Brief` says something else again. The stamp is not a tier in the `resolveModel` precedence list either. So it is unclear whether "defaults to the stamp" is client logic (the picker pre-fills an explicit request) or server logic (a resolver tier). If it is client logic, an MCP/ACP regenerate skips the stamp and uses the team default, and a user regenerate and a machine regenerate of the same draft pick different models. Drafts whose stamp is null raise the same question. party-visionary filed the same divergence on their own lens, and party-ba filed the unplaced precedence tier. Three seats reached this independently, which supports keeping it at BLOCK.
**Fix:** Pick one owner. Either `Brief` stores the requested model and the stamps are write-only records that nothing reads for defaults, or the stamps drive regenerate and `Brief` does not. State whether the stamp is a server-side resolver tier. Define what "Regenerate all" defaults to when the rows' stamps differ, and what a null stamp falls back to.
**Status:** upheld

### [BLOCK] party-architect — A regenerate picker is decided, but no regenerate picker or route-body change is in scope

**Quotes:** > - **Brief wizard:** Caption model + Design model pickers on the Review step.
**Quotes:** > - **Refine box:** a model picker beside the instruction.
**Quotes:** > - Pickers: brief wizard, refine, assistant chat headers; `/team` admin section
**Quotes:** > the same surface covers `regenerate-copy` in all three forms: "Regenerate all" (`{}`), one channel (`{channel}`) and the headline (`{headline:true}`)
**Problem:** The Regenerate-default decision refers to "the picker" on regenerate. But item 4 and the In Scope picker list name only the brief wizard, refine and the chat headers. Neither regenerate-copy (all three body forms, on 012's per-channel panels) nor regenerate-design gets a picker. For the decision to work, the same commit has to add a model field to all three `regenerate-copy` request bodies and to `regenerate-design`. It also has to add a picker to each caption panel, the headline control and the design regenerate control. The proposal names none of these. No other seat's round-1 finding answers this. As written, the merge lands a decision with no UI or route contract to carry it.
**Fix:** Add the regenerate pickers (each caption panel, the headline, design regenerate) to item 4 and to In Scope. Add the `model` field on the `regenerate-copy` / `regenerate-design` bodies too, and specify the field's name and shape across the three body forms.
**Status:** upheld

### [WARN] party-architect — The proposal adds `resolveModel` without saying what happens to the existing `modelFor` and the existing `CLAUDE_CLI_MODEL` read, or where the env var now sits

**Quotes:** > `brandkit/voiceDraft.ts:7` (bypasses `modelFor` entirely)
**Quotes:** > It is applied as `override || explicitModel` (`claudeCli.ts:25`).
**Quotes:** > 4. the system default (today's split).
**Quotes:** > `CLAUDE_CLI_MODEL` moves from override to system-default fallback.
**Quotes:** > the background-image decision (Haiku, `modelForBackground`)
**Problem:** The proposal names three existing model-selection points: `modelFor`, `modelForBackground` and the env read inside `claudeCli.ts:25`. A fourth is the local choice in `refine/route.ts:160,170`. It promises "One resolver" but never says whether `modelFor` is deleted, kept as tier 4, or wrapped. If it survives beside `resolveModel`, two resolvers serve the same surfaces. The proposal also never says that `claudeCli.ts` stops reading `CLAUDE_CLI_MODEL` itself. If that read survives at the spawn site, it still beats the resolver, which is exactly problem 3. The env var's position is ambiguous as well. As a "fallback" below tier 4 it would never fire, because today's split always resolves. Placed above tier 4, it replaces the split. The env var's values today are aliases, not catalogue IDs. party-security's ceiling finding and party-visionary's literal-guard finding both depend on this placement being settled.
**Fix:** State that `resolveModel` replaces `modelFor` (or that `modelFor` becomes its tier-4 table), and that `claudeCli.ts` stops reading the env var. Place `CLAUDE_CLI_MODEL` explicitly relative to "today's split". Say which modes it applies in, and how alias values map onto catalogue IDs.
**Status:** upheld

### [WARN] party-architect — The allow-list check covers only tier 1; the other model sources are unvalidated, and the allowed set can be empty

**Quotes:** > 1. explicit request, validated against the team allow-list;
**Quotes:** > 2. the user's remembered choice for that surface;
**Quotes:** > admins can remove any model from their team's list.
**Quotes:** > **Template fill (`design.template`, Path A) — decided 2026-10-12:** offers Haiku and Sonnet only.
**Quotes:** > A `ScheduledGeneration` may optionally pin models at plan time.
**Problem:** Only the explicit request is checked against the allow-list. Several persisted values are read back later: the remembered choice, the team default, the `Brief` model, the `ScheduledGeneration` pin and the env fallback. Any of them can name a model an admin has since removed. The resolver contract does not say whether such a value is rejected, skipped to the next tier, or used anyway. For a scheduler run with no user, "400" has no meaning. The per-surface catalogue restriction overlaps with the team allow-list, and the allow-list's scope (per team or per surface) is unstated. If an admin leaves only Opus, `design.template` has no valid model. party-security's BLOCK covers the bypass, which is the fail-open half of this. My finding is limited to the contract half: what each tier does on a miss, and whether the effective set can be empty. The two do not duplicate each other, so I keep mine at WARN.
**Fix:** Specify that the allow-list check applies at every tier, and what happens on a miss at each tier (fall through or fail, plus non-interactive behaviour). State the allow-list's scope. Require that catalogue ∩ allow-list is never empty for any surface, and say where that is enforced.
**Status:** upheld

### [WARN] party-architect — The timeout contract covers single calls, but the sweeps measure the whole chain, and the catalogue's timeout shape is stated two ways

**Quotes:** > A per-model design timeout, e.g. Opus ~600s against today's 300s, **kept strictly under the 15-minute stale sweeps**, or those sweeps become model-aware.
**Quotes:** > Each entry carries its full API ID, a display name, a relative cost/speed label, and a per-surface timeout.
**Quotes:** > (pinned to Haiku by user decision 2026-09-23 — the retry, not the check, uses the user's refine model)
**Problem:** Each call stays under 15 minutes, but the sweeps judge an action's age. A refine is the refine call, then the Haiku verifier, then a retry on the user's refine model. At Opus ~600s per call that is about 1200s, past the 900s `pendingAction` sweep. The two options ("kept strictly under" and "sweeps become model-aware") are different contracts with different co-changes, and the proposal leaves both open. The catalogue entry's timeout shape is inconsistent: item 1 says a per-surface timeout inside each model entry, while item 8 says a per-model timeout for design only. party-security and party-visionary both reached the same chain arithmetic. party-po suggests reducing the timeout to one per-model value. Structurally, that only works if the proposal also states that caption and assistant calls share the design budget, and it does not.
**Fix:** Pick one of the two options. State the budget as the worst-case chain per action (generation; refine + verify + retry), not as a per-call cap. Define the timeout field as a model × surface table that covers caption and the assistants.
**Status:** upheld

### [WARN] party-architect — The proposal adds a `ScheduledGeneration` model pin in its solution but omits it from scope, so its co-changes are unnamed

**Quotes:** > A `ScheduledGeneration` may optionally pin models at plan time.
**Quotes:** > - `TeamModelPolicy` (defaults per surface + allow-list) and per-user remembered choice — schema + migration
**Problem:** Item 6 introduces a model pin on `ScheduledGeneration`, but In Scope does not list it. A pin needs columns on `ScheduledGeneration` and fields on the queue create/edit routes and the batch route. The briefing chat's schedule-block grammar either gains a field or explicitly does not. The entry modal needs a picker. party-po proposes dropping the pin. Either resolution satisfies this finding, which is about the half-landed merge, not the pin's value.
**Fix:** Either list the pin and its co-changes in In Scope (schema, queue and batch route bodies, the schedule-block grammar, the entry modal), or move it to Out of Scope.
**Status:** upheld

### [WARN] party-architect — No test checks the model ID at the call boundary, and the timeout/sweep reconciliation has no test at all

**Quotes:** > - Unit tests for the pure resolver (precedence + allow-list); E2E: disallowed model → 400, stamp recorded, remembered choice restored
**Quotes:** > (`claude -p --model` accepts full IDs; see the `claudeCli.ts:20` comment)
**Problem:** The listed tests prove that the resolver picks a model and that the value is written to the database. Nothing proves that the resolved ID reaches the `claude -p --model` arguments or the Anthropic SDK request. That is where `CLAUDE_CLI_MODEL` used to win silently, and where a leftover hard-coded call site would go unnoticed while the stamp still looks right. Per-model timeouts against the two sweeps also need a deterministic test with an injectable clock or timeout. party-ba's criterion "stamped model equals requested model" is the acceptance side of this. A stamp-equals-request check would still pass with the gap above, because the stamp is written from the resolver's output, not from the spawn argument. A stub seam at the boundary is the test strategy that closes it.
**Fix:** Add a stub seam at the spawn/SDK boundary that records the model argument. Assert on it for every surface in the table, with `CLAUDE_CLI_MODEL` set and unset. Add unit tests that compute the per-action timeout budget against the sweep threshold, with no wall-clock dependence.
**Status:** upheld

### [NOTE] party-architect — Some call sites inside a surface have no picker, so a user sets their model on a different screen

**Quotes:** > - `assistant.brandkit` (vision extraction + image → template + voice draft)
**Quotes:** > - `assistant.briefing` (campaign chat + schedule planning + both Enhance flows)
**Quotes:** > - **Each assistant chat header** (campaign briefing, brand-kit assistant): a model menu.
**Problem:** Pickers exist only in chat headers. Image → template, voice draft and the post-brief Enhance on the wizard's Content step have no picker. They always resolve from a remembered choice the user set in a chat header on another page. party-ba filed the same gap as a definitional NOTE, which confirms it but does not change its severity.
**Fix:** Either confirm in the proposal that these sites resolve from the remembered choice by design, or split them into their own surfaces.
**Status:** upheld

### [NOTE] party-architect — Rebuttal to party-po's per-user-memory NOTE: the stamped-model default cannot stand in for remembered choice on new posts

**Quotes:** > - **Regenerate default — decided 2026-10-12:** the picker defaults to the draft's **stamped** model, so a regenerate is like for like unless the user changes it.
**Quotes:** > The last pick per surface is remembered per user.
**Problem:** party-po argues that browser-local storage or "default to the draft's stamped model" covers the repeat-use case. I am not disputing whether the feature is worth building; that is PO's call. The structural claim does not hold, though. A stamp exists only once a draft does, so it can seed the regenerate picker but not the brief wizard, the refine box on a fresh draft, or any assistant chat header. Those three of the four choice points listed in item 4 never see a stamp. Browser-local storage does work structurally, but only if pickers pre-fill and send a tier-1 explicit request. That removes tier 2 from the server resolver and changes the precedence contract the proposal states. So the deferral PO proposes is not a pure cut: it changes the resolver's tiers, and the proposal would need to say so.
**Fix:** If party-po's deferral is adopted, the proposal should state that the remembered-choice tier is removed from `resolveModel`. It should also say which value the wizard and chat pickers pre-select for a user with no stamp in reach.
**Status:** upheld
