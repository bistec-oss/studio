### [WARN] party-visionary — Preference rows store model identity, so the next model upgrade is a data migration and old drafts regenerate onto a retired ID

**Quotes:**

> 1. **The pinned IDs are a generation behind.** The API path pins `claude-sonnet-4-6`.
>    Each entry carries its full API ID, a display name, a relative cost/speed label, and a per-surface timeout.
>    A `ScheduledGeneration` may optionally pin models at plan time.
>
> - `Brief` carries the chosen caption/design model so async generation, retry and regenerate reuse it
> - **Regenerate default — decided 2026-10-12:** the picker defaults to the draft's **stamped** model, so a regenerate is like for like unless the user changes it.
>   **Problem:** Today the upgrade that motivates the proposal (Problem 1) is a one-file edit to `config.ts`. After this change, model identity is persisted in at least five places: `TeamModelPolicy` defaults and allow-lists, per-user remembered choices, `ScheduledGeneration` pins, `Brief` model fields, and the stamps. The proposal never says whether those rows hold the full API ID or a stable catalogue key. If they hold the full ID, the next upgrade (Sonnet 5.5 to its successor, or retiring `claude-haiku-4-5-20251001`) means migrating every preference table. Without that migration, the rows point at an ID that has left the catalogue. The regenerate decision makes this certain to surface: every draft made before the upgrade opens its picker on its stamped ID, tier 1 rejects that ID against the allow-list, and regenerating any old draft fails until someone writes a fallback rule. party-security's round-1 findings support this from a separate direction. Their closed-enum BLOCK asks for the same storage shape (catalogue keys, not strings). Their stale-model WARN asks for the same missing rule (a stored model that is no longer valid). Neither finding covers the cost addressed here, which is that a config edit becomes a data migration repeated at every upgrade. The proposal still does not acknowledge it.
>   **Fix:** Store a stable catalogue key (e.g. `sonnet`, `opus`) in the preference, policy, pin and Brief rows. Keep full IDs only in the "what ran" stamps, which are history and are never rewritten. State the resolver's rule for a stamped or remembered key that has left the catalogue: map it to its successor key, or fall through to the next tier. Do not reject it.
>   **Status:** upheld

### [WARN] party-visionary — Per-model timeouts and the two 15-minute sweeps become an ordering invariant kept by hand, and the proposal leaves it undecided

**Quotes:**

> 8. **Timeouts scale with the model.** A per-model design timeout, e.g. Opus ~600s against today's 300s, **kept strictly under the 15-minute stale sweeps**, or those sweeps become model-aware. A generation must never be marked FAILED by the sweep while its model call is still legitimately running.
> **Problem:** As written, "kept strictly under" means constants in at least two files must stay ordered for as long as the code exists. Nothing fails when they stop being ordered. party-architect and party-security showed in round 1 that the invariant concerns chain sums: refine, then verify, then retry, or caption, then background, then design. A single maximum is not enough. That makes the long-horizon problem worse. Raising any one per-model timeout, or adding a model such as Fable 5.1, changes several chain totals at once, and the contributor editing one catalogue value has no way to see that. The first symptom is a correctly running generation marked FAILED with "Generation was interrupted". It shows up only on the slowest real runs, which the mock E2E suite never exercises. Because the proposal says "or", the planner may ship the invariant as a comment.
> **Fix:** Decide it in the proposal. Either both sweeps derive their threshold from the catalogue (worst-case chain per action, plus a margin), or a unit test computes each action's worst-case chain from the catalogue and fails if it reaches either sweep constant. Then an edit to one value is stopped at the gate.
> **Status:** upheld

### [WARN] party-visionary — "Added later as one entry" is not true: a new model also needs allow-list membership, per-surface eligibility, a cost tier and a timeout, and allow-list semantics for it are undefined

**Quotes:**

> Fable 5.1 is left out by user decision (2026-10-12) and can be added later as one entry.
> **Decided 2026-09-23: Opus is allowed for everyone by default**; admins can remove any model from their team's list.
>
> - **Template fill (`design.template`, Path A) — decided 2026-10-12:** offers Haiku and Sonnet only. Freeform design, refine and the assistants offer all three models.
>   **Problem:** The next catalogue change is already named: adding Fable 5.1. The contributor who makes it has to settle four things the proposal counts as one entry: which surfaces the model is eligible for (`design.template` shows eligibility is per surface), its cost tier, its timeout (which interacts with the sweeps), and whether existing teams get it. The last is a real fork the proposal does not settle. If `TeamModelPolicy` stores an explicit allowed list, as "remove any model from their team's list" implies, the new model reaches no existing team until each admin adds it. If it stores a deny-list, every team silently gains the new model, and its cost, on deploy. party-security's BLOCK (a removal does not stop stored choices) makes the choice of representation more pressing, since it governs what "removed" means across every tier.
>   **Fix:** State the allow-list representation: an explicit list, or "all catalogue models except removed ones". State what a newly added catalogue model does for existing teams. Put per-surface eligibility on the catalogue entry itself, so that adding a model really is one entry plus one decision.
>   **Status:** upheld

### [WARN] party-visionary — Internal steps stay as scattered hard-coded pins, so the next ID upgrade repeats Problem 1 for exactly the sites outside the catalogue

**Quotes:**

> Internal steps stay fixed and are not user-facing: the background-image decision (Haiku, `modelForBackground`), the token-validation ping (`userToken.ts:127`), and **004's refine verifier** (pinned to Haiku by user decision 2026-09-23 — the retry, not the check, uses the user's refine model).
> | Brand voice draft | Sonnet 4.6, separately hard-coded | `brandkit/voiceDraft.ts:7` (bypasses `modelFor` entirely) |
> **Problem:** The proposal fixes one bypass (`voiceDraft.ts`) and leaves at least three other model pins outside the catalogue. The next "the pinned IDs are a generation behind" fix will have to find them again by grep. "Not user-facing" is a reason not to show a picker. It is not a reason to keep the ID out of the catalogue. The precedent this sets is that a model call is either a user surface routed through `resolveModel` or a free-standing literal. The next internal call (006's tracing, or a 009 hero-imagery decision step) will copy the literal. party-architect's call-boundary WARN asks for a seam that records the model argument for each user surface. It does not cover call sites that never declare a surface.
> **Fix:** Give internal steps fixed, non-selectable surfaces in the same catalogue (`internal.background`, `internal.verifier`, `internal.tokenPing`), each resolving to a catalogue key. Add a guard unit test that fails on any `claude-*` ID, or any bare `haiku`/`sonnet`/`opus` model literal, outside `config.ts`.
> **Status:** upheld

### [WARN] party-visionary — Cost tiers are a hand-copied snapshot of Anthropic's price sheet, and 006 will need a second, numeric copy

**Quotes:**

> - **Cost label — decided 2026-10-12:** relative tiers (`$ / $$ / $$$`) plus a speed hint. They are derived from current published pricing at design time, not from memory.
>   **Problem:** "Derived at design time" means the tiers are copied once from an external source into code, and nothing refreshes them. They drift silently the first time a price changes or a model is added, and a stale `$$` label raises no error. The proposal hands cost visibility to 006, which needs real per-token prices. Once 006 lands there will be two representations of pricing, the glyphs here and 006's numbers, and they can disagree.
>   **Fix:** Store input and output price per million tokens on each catalogue entry, with a dated source note, and compute the tier from those numbers. 006 then reads the same field.
>   **Status:** upheld

### [WARN] party-visionary — `Brief`'s model field and the draft's stamp become two answers to "which model does regenerate use", and they diverge after the first regenerate

**Quotes:**

> - `Brief` carries the chosen caption/design model so async generation, retry and regenerate reuse it
> - **Regenerate default — decided 2026-10-12:** the picker defaults to the draft's **stamped** model, so a regenerate is like for like unless the user changes it.
>   **Problem:** Scope says regenerate reuses the `Brief`'s model, while the later decision says it defaults to the stamp. After the first regenerate on a different model the two diverge. The `Brief` field then goes stale for the life of the draft.
>   **Fix:** Name one authority for the regenerate default.
>   **Status:** withdrawn — the divergence is true on merge day, so it is outside this seat's horizon. party-architect's BLOCK "Two stores answer which model the next regenerate uses" covers it in full, including the mixed per-row stamps on "Regenerate all" and the null-stamp case, with the same fix. Once that ruling picks an owner, the downstream-reader concern (006, a future "duplicate post") goes away with it.

### [WARN] party-visionary — Surface names become a persisted vocabulary that is coarser than the stamps, so the obvious next split (headline vs captions, voice draft vs vision) is a data migration

**Quotes:**

> So the headline sits **under** the `caption` surface, not beside it, and the same surface covers `regenerate-copy` in all three forms
>
> - `assistant.brandkit` (vision extraction + image → template + voice draft)
>
> 7. **Stamp what ran.** **Decided 2026-10-12:** the caption stamp is **per row**, as `DraftCaption.model` plus `Draft.headlineModel`.
>    **Problem:** Surface names are keys in persisted rows: `TeamModelPolicy` per-surface defaults, per-user remembered choices, and the 006 traces that read them. The proposal does not treat them as a lasting vocabulary. Their granularity is already uneven. The stamps separate the headline from each channel, but choice does not, and `assistant.brandkit` groups a text task with two vision tasks. party-architect's NOTE and party-ba's NOTE confirm the seam is real today: image to template and voice draft have no picker of their own. Both treat it as a merge-day question of where these sites choose their model. The long-horizon cost is different. Splitting `caption` or `assistant.brandkit` after rows exist means a migration plus an inheritance rule for every team and user, and a key mapping for 006's traces.
>    **Fix:** Acknowledge the surface list as a persisted contract. Either store surfaces as a closed enum with a documented split procedure (the new surface inherits its parent's row), or split now where the stamps already show the seam: `caption` vs `headline`, and `assistant.brandkit` vs `assistant.voice`.
>    **Status:** upheld

### [NOTE] party-visionary — Rebuttal of party-security's per-credential-tier fix: it adds a third policy axis that every later catalogue change must fill in

**Quotes:**

> **Team-token warning — decided 2026-10-12:** in CLI mode, when Opus is picked and the run would use the **team** Claude token (no personal token connected), the picker shows a small non-blocking notice that the run uses the team's allowance.
> **Problem:** I do not dispute the failure mode party-security raises (interactive Opus use draining the team token the scheduler depends on). Their proposed fix ("Let `TeamModelPolicy` allow a model per credential tier") would turn the policy from surface × model into surface × model × credential tier, and that shape would be persisted. Every later catalogue addition (Fable 5.1 is already named) and every surface split would then need a decision for each credential tier for each team, and the allow-list representation question from my Fable finding would apply to each tier separately. Credential routing is also being reworked by 005 item 2, which the proposal places out of scope ("Choosing the **provider or credential route** for captions"). A policy axis keyed on today's two-tier personal→team chain would be built on the part of the system most likely to change next.
> **Fix:** Address starvation with something that does not widen the persisted policy matrix. Use party-security's own second suggestion, an explicit usage-limit classification in `errorReason` for scheduled runs, together with a single team-level boolean, "expensive models require a personal token". Leave a per-tier allow-list until 005's credential routing has settled.
> **Status:** upheld
