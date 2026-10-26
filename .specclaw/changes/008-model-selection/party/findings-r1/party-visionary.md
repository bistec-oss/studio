### [WARN] party-visionary — Preference rows store model identity, so the next model upgrade is a data migration and old drafts regenerate onto a retired ID

**Quotes:**

> 1. **The pinned IDs are a generation behind.** The API path pins `claude-sonnet-4-6`.
>    Each entry carries its full API ID, a display name, a relative cost/speed label, and a per-surface timeout.
>    A `ScheduledGeneration` may optionally pin models at plan time.
>
> - `Brief` carries the chosen caption/design model so async generation, retry and regenerate reuse it
> - **Regenerate default — decided 2026-10-12:** the picker defaults to the draft's **stamped** model, so a regenerate is like for like unless the user changes it.
>   **Problem:** Today the upgrade the proposal is motivated by (Problem 1) is a one-file edit to `config.ts`. After this change, model identity is written into at least five persisted places: `TeamModelPolicy` defaults and allow-lists, per-user remembered choices, `ScheduledGeneration` pins, `Brief` model fields, and the stamps. The artifact never says whether those rows hold the catalogue's full API ID or a stable catalogue key. If they hold the full ID, the next upgrade (Sonnet 5.5 → its successor, or the retirement of `claude-haiku-4-5-20251001`) means migrating every preference table. Without that migration, rows point at an ID that has left the catalogue. The regenerate decision makes this certain to surface: every draft made before the upgrade opens its picker on its stamped ID. Under precedence step 1, which is "explicit request, validated against the team allow-list", that ID is rejected, so regenerating any old draft fails until someone writes a fallback rule. The proposal doesn't acknowledge that it is turning a config edit into a recurring data migration.
>   **Fix:** Persist a stable catalogue key (e.g. `sonnet`, `opus`) in preference, policy, pin and Brief rows, and keep full IDs only in the "what ran" stamps, which are history and should never be rewritten. Also state the resolver's rule for a stamped or remembered ID that is no longer in the catalogue (map it to its successor key, or fall through to the next precedence tier). Don't reject it.
>   **Status:** upheld

### [WARN] party-visionary — Per-model timeouts and the two 15-minute sweeps become an ordering invariant kept by hand, and the proposal leaves it undecided

**Quotes:**

> 8. **Timeouts scale with the model.** A per-model design timeout, e.g. Opus ~600s against today's 300s, **kept strictly under the 15-minute stale sweeps**, or those sweeps become model-aware. A generation must never be marked FAILED by the sweep while its model call is still legitimately running.
> **Problem:** As written, "kept strictly under" means three constants in at least two files must stay ordered forever: the largest catalogue timeout, the generation sweep and the `pendingAction` sweep. Nothing fails when they stop being ordered. The next change that trips on it is foreseeable. Adding Fable 5.1, or raising Opus's timeout after a run of slow briefs, puts one per-model value over 900s. The first symptom is a correctly running generation marked FAILED with "Generation was interrupted". That is the same mis-signalled-state class of bug CLAUDE.md records for the copy-edit status clobber, and it only shows up on the slowest real runs, which the mock E2E suite never exercises. The "or" leaves the planner to choose, so the invariant may ship as a comment.
> **Fix:** Decide it in the proposal. Either have both sweeps derive their threshold from the catalogue (max per-surface timeout plus a margin), or add a unit test that fails when any catalogue timeout is at or above either sweep constant. Then a contributor who edits one value is stopped at the gate, not in prod.
> **Status:** upheld

### [WARN] party-visionary — "Added later as one entry" is not true: a new model also needs allow-list membership, per-surface eligibility, a cost tier and a timeout, and allow-list semantics for it are undefined

**Quotes:**

> Fable 5.1 is left out by user decision (2026-10-12) and can be added later as one entry.
> **Decided 2026-09-23: Opus is allowed for everyone by default**; admins can remove any model from their team's list.
>
> - **Template fill (`design.template`, Path A) — decided 2026-10-12:** offers Haiku and Sonnet only. Freeform design, refine and the assistants offer all three models.
>   **Problem:** The next catalogue change is already named: adding Fable 5.1. The contributor who makes it has to decide four things the proposal calls one entry: which surfaces the model is eligible for (`design.template` shows eligibility is per surface), its cost tier, its timeout (which interacts with the sweeps), and whether existing teams get it. The last one is a genuine fork the artifact doesn't settle. If `TeamModelPolicy` stores an explicit allowed list, as "remove any model from their team's list" implies, a new model reaches no existing team until each admin adds it, and teams created afterwards get whatever the seed default is then. If it stores a deny-list, every team silently gains the new model, and its cost, on deploy. The "Opus for everyone" default has the same issue: once it's written into rows, changing the system default later never reaches existing teams.
>   **Fix:** State the allow-list representation (explicit list vs. "all catalogue models except removed ones") and what a newly added catalogue model does for existing teams. Also put per-surface eligibility on the catalogue entry itself, so adding a model really is one entry plus one decision.
>   **Status:** upheld

### [WARN] party-visionary — Internal steps stay as scattered hard-coded pins, so the next ID upgrade repeats Problem 1 for exactly the sites outside the catalogue

**Quotes:**

> Internal steps stay fixed and are not user-facing: the background-image decision (Haiku, `modelForBackground`), the token-validation ping (`userToken.ts:127`), and **004's refine verifier** (pinned to Haiku by user decision 2026-09-23 — the retry, not the check, uses the user's refine model).
> | Brand voice draft | Sonnet 4.6, separately hard-coded | `brandkit/voiceDraft.ts:7` (bypasses `modelFor` entirely) |
> **Problem:** The proposal documents one bypass (`voiceDraft.ts`) and fixes it. It then leaves at least three other model pins outside the catalogue, cited by file and line, so the next "the pinned IDs are a generation behind" fix has to rediscover them by grep. "Not user-facing" is a reason not to show a picker. It is not a reason to keep the ID out of the catalogue. The precedent it sets is that a model call is either a user surface routed through `resolveModel` or a free-standing literal. The next contributor adding an internal call (006's tracing, or 009's hero-imagery decision step) will copy the literal, because that is what the internal examples do. Nothing catches it: `voiceDraft.ts` already shows a bypass can sit unnoticed until someone audits it.
> **Fix:** Give internal steps fixed, non-selectable surfaces in the same catalogue, e.g. `internal.background`, `internal.verifier` and `internal.tokenPing`, each resolving to a catalogue key. Add a guard unit test that fails on any `claude-*` ID or bare `haiku`/`sonnet`/`opus` model literal outside `config.ts`. That makes "every model call declares a surface" self-enforcing instead of a convention.
> **Status:** upheld

### [WARN] party-visionary — Cost tiers are a hand-copied snapshot of Anthropic's price sheet, and 006 will need a second, numeric copy

**Quotes:**

> - **Cost label — decided 2026-10-12:** relative tiers (`$ / $$ / $$$`) plus a speed hint. They are derived from current published pricing at design time, not from memory.
>   **Problem:** "Derived at design time" means the tiers are a fact copied from an external source into code once, with nothing that refreshes them. They drift silently the first time a price changes or a model is added (the Fable entry has to pick a tier by hand). Nobody notices, because a stale `$$` label raises no error. The proposal also points cost visibility to **006** ("cost visibility belongs to **006**"), and 006 needs real per-token prices, not tiers. Once 006 lands, two representations of pricing exist: the tier glyphs here and 006's numbers. They can disagree, and the picker shows the one nobody updates.
>   **Fix:** Store input and output price per million tokens on each catalogue entry, with a dated source note, and compute the `$ / $$ / $$$` tier from those numbers. 006 then reads the same field, and a price change is one edit in one place.
>   **Status:** upheld

### [WARN] party-visionary — `Brief`'s model field and the draft's stamp become two answers to "which model does regenerate use", and they diverge after the first regenerate

**Quotes:**

> - `Brief` carries the chosen caption/design model so async generation, retry and regenerate reuse it
> - **Regenerate default — decided 2026-10-12:** the picker defaults to the draft's **stamped** model, so a regenerate is like for like unless the user changes it.
>   **Problem:** Scope says regenerate reuses the `Brief`'s model. The later decision says regenerate defaults to the stamp. They agree only until a user regenerates with a different model. After that, the stamp moves and the `Brief` field keeps the original pick, and it stays stale for the life of the draft. With per-row caption stamps, one draft can hold four different models against one `Brief` value. The next change that reads the `Brief` field trusting its name will read stale data. Two examples: 006's traces, or a "duplicate this post" feature that copies the brief. Retry after a failed regenerate is ambiguous today, because the proposal names both sources for it.
>   **Fix:** Name one authority. Either the `Brief` field means "initial request" only, stating that the stamps are the source of truth for anything after first generation (and possibly renaming the field to match), or regenerate writes the `Brief` too. Don't leave both as live inputs to the same path.
>   **Status:** upheld

### [WARN] party-visionary — Surface names become a persisted vocabulary that is coarser than the stamps, so the obvious next split (headline vs captions, voice draft vs vision) is a data migration

**Quotes:**

> So the headline sits **under** the `caption` surface, not beside it, and the same surface covers `regenerate-copy` in all three forms
>
> - `assistant.brandkit` (vision extraction + image → template + voice draft)
>
> 7. **Stamp what ran.** **Decided 2026-10-12:** the caption stamp is **per row**, as `DraftCaption.model` plus `Draft.headlineModel`.
>    **Problem:** Surface names are keys in persisted rows: `TeamModelPolicy` per-surface defaults, per-user remembered choices, and the 006 traces that are meant to read them. The proposal doesn't acknowledge them as a durable vocabulary. The granularity is already uneven: stamps distinguish the headline from each channel, but choice doesn't, and `assistant.brandkit` groups a text task (voice draft) with two vision tasks. The next plausible request is a stronger model for the on-image headline only, or a cheaper model for voice drafting only. The stamp schema is ready for it, but the surface isn't. Splitting `caption` or `assistant.brandkit` after rows exist means a migration plus an inheritance rule (does the new `headline` surface take the old `caption` preference?) for every team and every user. 006's traces would also need a mapping from the old key to the new ones.
>    **Fix:** Acknowledge the surface list as a persisted contract, and either store surfaces as a closed enum with a documented split procedure (the new surface inherits its parent's row), or split now where the stamp granularity already shows the seam: `caption` vs `headline`, and `assistant.brandkit` vs `assistant.voice`.
>    **Status:** upheld
