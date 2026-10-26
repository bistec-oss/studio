# Spec: Model selection per surface (Haiku / Sonnet / Opus)

**Change:** 008-model-selection
**Created:** 2026-10-12
**Status:** 🟡 Draft

## Overview

Every Claude model in the product is chosen in code today. There are three ways that happens:

- the per-path split in `src/lib/agent/config.ts` (`modelFor`, `modelForBackground`);
- free-standing literals at six other call sites (`voiceDraft.ts`, `designAgent.ts`, `refineVerify.ts`, `userToken.ts`, the Anthropic caption provider, and the `"haiku"` fallback in `claudeCli.ts`);
- the `CLAUDE_CLI_MODEL` env var, which `claudeCli.ts:176` applies on top of all of them as a global override.

The design survey in `design.md` lists every site with its file and line.

008 replaces all of that with **one closed model catalogue and one resolver.** Every model call names a **surface**. The resolver picks a catalogue entry for it, using the explicit request, the draft's stamp, the team default and the system default, and checks the team's allow-list **at every tier**. The CLI spawn and the SDK call accept only that resolved entry, so no other model string can reach either. Each draft records which model produced each caption, the headline and each design revision.

**What this change fixes, with the evidence for each** (party-ba WARN: "the proposal never states what hurts"):

| Problem                                                                                                                                          | Evidence                                                                                                                                                                           | Fixed in                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| The pinned API IDs are a generation behind (`claude-sonnet-4-6`).                                                                                | `config.ts:25`, `designAgent.ts:94,270`, `voiceDraft.ts:7`                                                                                                                         | Wave 1                                    |
| CLI mode passes aliases (`haiku`, `sonnet`) while API mode pins IDs, so the same brief can run on different versions, and nothing records which. | `config.ts:27-30`; no model column on `Draft`, `DraftRevision` or `DraftCaption`                                                                                                   | Wave 1 (stamps; the catalogue's `cliArg`) |
| `CLAUDE_CLI_MODEL` silently beats every per-call choice.                                                                                         | `claudeCli.ts:176-177`                                                                                                                                                             | Wave 1                                    |
| A slower model can be swept to FAILED while it is still running and billing.                                                                     | CLAUDE.md 2026-07-01: the old Path B timeouts "were the **Opus default**, not Sonnet"; one 15-minute constant (`recovery.ts:8`) and the scheduler lease (`generationRunner.ts:14`) | Wave 1 (the time budget)                  |
| Users cannot choose a model.                                                                                                                     | **No observed complaint is cited.** The 2026-09-23 decision ("per post / per chat") is the user's product call, not a measured need.                                               | Wave 2                                    |

**Wave 1 is worth shipping on its own** (party-po WARN). It brings current IDs, one version in both modes, the stamps, team defaults, the allow-list and timeout safety. Wave 2 adds the per-post and per-chat pickers.

**Binding decisions.** These come from the proposal's Decisions, its "Panel rulings (user, 2026-10-12)" and its "Panel resolutions (orchestrator, 2026-10-12)". They are not re-argued here, and where they conflict with the proposal's earlier Proposed Solution, they win.

- **The catalogue** holds Haiku 4.5, Sonnet 5.5 and Opus 5.5, with no Fable. Each entry carries numeric per-MTok prices with a dated source, and the `$ / $$ / $$$` tier is computed from them.
- **Path A** (`DESIGN_TEMPLATE`) offers Haiku and Sonnet only. Every other user surface offers all three models.
- **Choices are stored only as closed catalogue keys.** Full API IDs live only in the "what ran" stamps. The resolver returns a catalogue entry, and the spawn/SDK site passes only that entry's argument.
- **The allow-list is checked at every tier, at call time.**
  - A stored value that is no longer allowed, or no longer in the catalogue, falls through to the next tier. The substitution is recorded on the stamp and logged on non-interactive runs.
  - Only an explicit request returns 400.
  - `/team` refuses a policy that leaves any surface with no allowed model.
- **There is no per-user remembered choice** and no resolver tier for one. New posts and chats pre-select the team default.
- **The draft's stamps own the regenerate default.**
  - "Regenerate all" with mixed row stamps uses the team default.
  - A null stamp falls through to the team default.
  - `Brief`'s model fields mean the initial request only.
- **Captions are stamped per row:** `DraftCaption.model` plus `Draft.headlineModel`. The design is stamped as `Draft.designModel` and `DraftRevision.model`.
- **There is no `ScheduledGeneration` model pin.** Scheduled, MCP and ACP runs use the team default at run time.
- **Team-token protection is two things:** one `/team` switch, "Opus requires a personal token", and an explicit usage-limit classification in a scheduled entry's `errorReason`. There is no per-credential allow-list. The 2026-10-12 team-token notice stays.
- **The time budget is set per action, not per call,** and a unit test enforces it. Per-model timeouts are measured placeholders until a real Opus 5.5 run measures them.
- **`resolveModel` replaces `modelFor` and `modelForBackground`.**
  - `claudeCli.ts` stops reading `CLAUDE_CLI_MODEL`.
  - When set, the variable must be a catalogue key or ID, or the app fails to boot. It acts as the system default, and a boot log line states its changed meaning.
- **Internal steps get fixed, non-selectable surfaces:** the background decision, the refine verifier and the token ping. A guard test fails on any model literal outside the catalogue module.
- **A boundary seam records the model argument** at the CLI spawn and at the SDK call. Tests assert on it for every surface.
- **The pinned CLI's (2.1.287) full-ID behaviour is verified** by an operator before anything relies on it.
- **Two waves, both in 008.** Wave 1 is the foundation and is independently shippable. Wave 2 is the pickers and the team-token notice.

### The cheaper variant (party-po BLOCK, answered by the two-wave ruling)

| Variant                                                                                                                           | Tasks | Full E2E runs | What it buys                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Do nothing**                                                                                                                    | 0     | 0             | The pinned IDs stay a generation behind. Sonnet 4.6 costs $3/$15 per MTok against Sonnet 5.5's $2/$10, so do-nothing is also the more expensive option per token. CLI/API version drift stays unrecorded. |
| **(a) Wave 1 only:** catalogue, resolver, current IDs, stamps, team defaults and allow-list, Opus switch, time budget             | 12    | 1             | Every row of the problem table except "users cannot choose". A team admin can move the whole team to Opus or Sonnet per surface. That is the PO's cheapest variant.                                       |
| **(b) Waves 1 + 2:** plus pickers on the wizard, refine, every regenerate control and the chat headers, and the team-token notice | 19    | 2             | Per-post and per-chat choice, without changing the team default. That is the only increment over (a), and it rests on the 2026-09-23 decision, not on evidence (see the Overview).                        |

The user ruled for (b), built in the order (a) then (b), so (a) can ship alone.

### Cost per post (party-po WARN: "the recurring cost of Opus-for-everyone is unquantified")

Prices are per million tokens, from the catalogue: Haiku 4.5 $1 / $5, Sonnet 5.5 $2 / $10, Opus 5.5 $4 / $20. Token counts are rough estimates from today's prompts, not measurements.

| Call per post                                             | Tokens in / out (estimate)      | Haiku  | Sonnet 5.5 | Opus 5.5 |
| --------------------------------------------------------- | ------------------------------- | ------ | ---------- | -------- |
| Caption (one call: headline plus three captions, 012)     | 3k / 0.9k                       | $0.008 | $0.015     | $0.030   |
| Design, Path B (single-shot)                              | 6k / 8k                         | $0.046 | $0.092     | $0.184   |
| Refine (worst case: two attempts plus the Haiku verifier) | 2 × (8k / 8k) + 2 × (6k / 0.3k) | $0.11  | $0.21      | $0.42    |

- **Sonnet 5.5 and Opus 5.5 think by default** (adaptive thinking). Thinking tokens bill as output, so the Sonnet and Opus figures are floors.
- **Opus costs about twice Sonnet 5.5 per token,** and Sonnet 5.5 costs about twice Haiku.
- **The default split is unchanged** (Haiku for captions and Path A, Sonnet for the rest), so a team that changes nothing gets cheaper per token after wave 1: Sonnet 4.6 → 5.5.
- **In CLI mode** the calls bill the OAuth subscription's usage limit, not dollars. The tiers then read as relative usage-limit burn.

**Calls per post are unchanged by 008:** one caption call, one design call, and the background decision on Path B. Choosing Opus changes the price of each call, not the number of calls.

### Assumptions (for the user to approve)

- **A1: catalogue keys are model families,** stored as the enum `ModelKey { HAIKU SONNET OPUS }`.
  - Upgrading a family (Sonnet 5.5 → 6) is one edit to that entry's `apiId`. The old ID moves to `previousApiIds`, and no data migrates.
  - Stamps keep the exact ID that ran, as history.
  - Fable, if added later, is a new key.
- **A2: the allow-list is an explicit, stored list.**
  - A team with no `TeamModelPolicy` row is allowed the catalogue's `defaultAllowed` entries. Today that is all three (Opus is open to all, per the 2026-09-23 decision).
  - Once an admin saves the policy, the saved list is authoritative. A later catalogue addition reaches that team only when an admin ticks it at `/team`, where it is labelled "New".
  - An admin's saved choice is never widened silently. This answers party-visionary's "what does a new model do for existing teams".
- **A3: the "Opus requires a personal token" switch is off by default and only acts in CLI mode.**
  - In CLI mode the team token is a shared OAuth allowance.
  - In API mode there is no personal Claude credential, so the switch has no effect, and `/team` shows it disabled with a one-line reason.
  - The switch gates every catalogue entry flagged `personalTokenGated`, which today is Opus.
- **A4: `CLAUDE_CLI_MODEL` applies in CLI mode only, as before.**
  - It accepts a key (case-insensitive: `haiku`, `sonnet`, `opus`) or a current catalogue `apiId`.
  - Any other value, including today's `default`, fails the boot with a message naming the accepted values.
  - When set, it replaces the system default on every **user** surface where that model is eligible. Internal surfaces stay fixed.
  - In API mode a set value is ignored, with a boot warning.
- **A5: a picker sends `model` only when the user changes it from its pre-selected default.** An untouched picker omits the field, so the server resolves the default (stamp → team → system), and a team-default change reaches every untouched picker. The pre-selection shown is computed by the same pure resolver.
- **A6: a stamp records the last model write.**
  - A user's caption or headline edit leaves `model` / `headlineModel` unchanged.
  - A manual inline edit carries `Draft.designModel` forward, because the HTML is still that model's output, edited by hand.
  - An Override (the API-mode conflict path) commits with the model recorded in `pendingConflict` when the conflict was stored.
  - Restore and "Use anyway" copy the revision's own stamp, as `promptVersion` already does.
- **A7: the sites without a picker use the team default for their surface.** These are the post-brief Enhance, the campaign-briefing Enhance, image → template and the brand-voice draft. This answers the architect and BA NOTEs, now that there is no remembered choice.
- **A8: refine's system default follows the draft's design path, as today:** `TEMPLATE` → Haiku, `GENERATE` → Sonnet. A team `REFINE` default applies to both paths.
- **A9: the action budget is measured as the worst-case gap between two liveness writes,** a claim, heartbeat or settle. That gap is what both sweeps and the scheduler lease measure: `recovery.ts:82` compares `Draft.updatedAt`, which `touchDraftAction` bumps, and 004 T17's refine heartbeat already relies on it. To keep every gap under the limit at the Opus placeholders, 008 adds:
  - a heartbeat before the design in async generation and in regenerate-design;
  - one before the refine commit;
  - scheduler lease renewal at each entry's start and before its design;
  - a 120 s timeout on the OpenAI image call, which has none today.

  See FR-12.

- **A10: the Haiku ID is `claude-haiku-4-5`,** the current model table's ID. `claude-haiku-4-5-20251001`, which the code pins today, goes into `previousApiIds`.
- **A11: usage-limit classification reads only CLI- or SDK-written fields,** never model text (learning L8). It changes only `errorReason`. Retries and backoff are unchanged.
- **A12: no SDK upgrade.** `@anthropic-ai/sdk` stays at 0.30.1 (NFR-04). The new response blocks (`thinking`) and `stop_reason: "refusal"` are handled by reading content blocks by type.
- **A13: no server-side refusal fallbacks.** A fallback would run a model nobody chose, which is a silent substitution. A refusal fails the call with a readable error.
- **A14: internal surfaces ignore the team allow-list.** They are fixed system steps on the cheapest model (Haiku), not choices. Removing Haiku at `/team` does not stop the background decision, the verifier or the token ping.

### Open questions (each with a recommended default)

1. **A team whose COPY provider is OpenAI.**
   - **Recommended:**
     - the caption model is not selectable, and the wizard and caption-panel pickers are hidden;
     - an explicit caption `model` returns 400 "This team's caption provider is not Claude, so the caption model can't be chosen";
     - the caption stamp records the provider's own model ID (`gpt-4o`), which matches no catalogue entry, so a later regenerate falls through to the team default as usual.
   - The model and the route compose; neither is in 008's scope (proposal Out of Scope; 005 item 2).
2. **The brand-voice draft has no CLI path.** `voiceDraft.ts:36-43` calls the SDK only, so it fails in CLI mode when no Anthropic key resolves.
   - **Recommended:** route it through the shared assistant text call, `runBriefingModel`, which already handles both modes. It is about 10 lines, and it is the only way the boundary seam can cover it in CLI mode.
3. **API-mode retries inside the deadline.** The SDK retries 408/409/429/5xx twice by default, and each attempt has its own timeout.
   - **Recommended:** every SDK call carries an `AbortSignal` that fires at its catalogue timeout. Retries stay, but they all fit inside the deadline.
   - **Fallback**, if SDK 0.30.1's request options lack `signal`: `maxRetries: 0` plus `timeout`, the shape the verifier already uses at `refineVerify.ts:378`.
4. **Adaptive thinking on Sonnet 5.5 and Opus 5.5 in API mode.** Both models think when `thinking` is omitted, and on Opus 5.5 thinking can't be disabled.
   - **Recommended:**
     - leave it on, as the model's default;
     - raise those entries' `max_tokens` floor to 16,000, since thinking shares the output cap;
     - read only `text` blocks;
     - check `stop_reason` for `refusal` and `max_tokens`.
   - The alternative, `thinking: { type: "between_tools" }` on Sonnet 5.5, would turn thinking off but adds a per-model request shape for an unmeasured gain.

## Requirements

### Functional Requirements

#### The catalogue and the resolver (wave 1)

**FR-01: the model catalogue** (`src/lib/models/catalogue.ts`, pure and client-safe). It is the **only** file under `src/` that may contain a model literal (FR-15).

```ts
type ModelKey = 'HAIKU' | 'SONNET' | 'OPUS'
interface CatalogueEntry {
  key: ModelKey
  displayName: string // 'Haiku 4.5'
  apiId: string // the full API ID, passed in API mode
  cliArg: string // passed to `claude -p --model`; = apiId unless T2 falls back to an alias
  previousApiIds: readonly string[] // retired IDs of this family (successor mapping, FR-09)
  priceInputPerMTok: number // USD
  priceOutputPerMTok: number // USD
  priceSource: string // dated source note
  speed: 'fast' | 'medium' | 'slow' // hand-set hint; not derivable from prices
  defaultAllowed: boolean // A2
  personalTokenGated: boolean // A3 (the /team switch)
  apiMaxTokensFloor: number | null // thinking models: 16000 (open question 4)
  surfaces: Partial<Record<Surface, { timeoutMs: number }>> // eligibility = presence
}
```

| Key      | `displayName` | `apiId`             | `previousApiIds`            | In / out $/MTok | Tier | Speed  | Eligible surfaces                              | `personalTokenGated` |
| -------- | ------------- | ------------------- | --------------------------- | --------------- | ---- | ------ | ---------------------------------------------- | -------------------- |
| `HAIKU`  | Haiku 4.5     | `claude-haiku-4-5`  | `claude-haiku-4-5-20251001` | 1 / 5           | $    | fast   | all user surfaces and all internal ones        | no                   |
| `SONNET` | Sonnet 5.5    | `claude-sonnet-5-5` | `claude-sonnet-4-6`         | 2 / 10          | $$   | medium | all user surfaces                              | no                   |
| `OPUS`   | Opus 5.5      | `claude-opus-5-5`   | —                           | 4 / 20          | $$$  | slow   | all user surfaces **except** `DESIGN_TEMPLATE` | **yes**              |

- **Price source:** `priceSource = 'Anthropic first-party API rates, claude-api skill model table (cached 2026-09-25), read 2026-10-12'`.
- **The tier is computed, never written** (`modelTier(entry, catalogue)`):
  - `blended = (in + 3 × out) / 4` gives Haiku 4, Sonnet 8 and Opus 16;
  - `tier = min(3, 1 + round(log2(blended / minBlended)))` gives 1, 2, 3, rendered `$`, `$$`, `$$$`.
  - 006 reads the same numeric fields (party-visionary WARN).
- **Per-model, per-surface timeouts** are in design.md §5. They are **measured placeholders** until a real Opus 5.5 run measures them (AC-32).
- **A unit test fails** when:
  - a key is duplicated;
  - an `apiId` appears twice across `apiId` and `previousApiIds`;
  - an entry lacks a price or a `priceSource`;
  - a user surface has fewer than one eligible entry;
  - `DESIGN_TEMPLATE` lists `OPUS`.
- **Adding a model** is one entry plus two decisions, `defaultAllowed` and `personalTokenGated` (party-visionary WARN). The procedure is in design.md §2.

**FR-02: surfaces, a closed and persisted vocabulary.**

- **User surfaces**, stored as the Prisma enum `ModelSurface`:

  | Surface              | Covers                                                                                                                                                           | Picker (wave 2)                                                    |
  | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
  | `CAPTION`            | 012's caption call: the headline plus three captions (`writeCaptions`), the generation, and `regenerate-copy` in all three forms. Also `POST /api/generate/copy` | Wizard Review step; each caption panel; "Regenerate all"; headline |
  | `DESIGN_TEMPLATE`    | Path A template fill (`runPathADesign`)                                                                                                                          | Wizard Review step (Path A)                                        |
  | `DESIGN_FREEFORM`    | Path B design (`runPathBDesign`): generation and `regenerate-design`                                                                                             | Wizard Review step (Path B); the design regenerate control         |
  | `REFINE`             | The refine call, both attempts (`runRefineAttempts`)                                                                                                             | The refine box                                                     |
  | `ASSISTANT_BRIEFING` | Campaign briefing chat (text and vision), schedule planning, both Enhance flows                                                                                  | The campaign briefing assistant header (Enhance: none, A7)         |
  | `ASSISTANT_BRANDKIT` | Brand-kit assistant (text and vision), image → template, brand-voice draft                                                                                       | The brand-kit assistant header (image → template, voice: none, A7) |

- **Internal surfaces** live only in code, are never persisted and are never selectable: `INTERNAL_BACKGROUND` (`background.ts` decision), `INTERNAL_VERIFIER` (004's refine verifier) and `INTERNAL_TOKEN_PING` (`validateClaudeToken`). Each resolves to exactly one entry, `HAIKU` (A14).
- **The split procedure** (party-visionary WARN: "surface names become a persisted vocabulary"). Splitting a surface, for example `CAPTION` into `CAPTION` and `HEADLINE`, takes:
  1. `ALTER TYPE "ModelSurface" ADD VALUE`, alone in its migration;
  2. a second migration that copies every team's parent `TeamModelDefault` row to the new surface, so the child inherits the parent's choice;
  3. moving the call site.

  Stamps need nothing, because they are per field already: `DraftCaption.model` and `Draft.headlineModel` are separate. This is written into the catalogue module's header comment and the handoff.

**FR-03: the resolver.** There are two layers.

- **The pure core** `decideModel(surface, input)` (`src/lib/models/resolve.ts`, client-safe):

  ```ts
  input: {
    requested?: ModelKey | null      // tier 1: an explicit request (wave 2 body field / Brief initial request)
    stamp?: string | null            // tier 2: a regenerate's stamp (an apiId / cliArg), FR-09
    policy: { allowed: ModelKey[]; defaults: Partial<Record<UserSurface, ModelKey>>; gateOn: boolean }
    credential: 'personal' | 'team' | 'n/a'   // 'n/a' in API mode
    mode: 'api' | 'cli'
    envDefault?: ModelKey | null     // CLAUDE_CLI_MODEL, CLI mode only (FR-04)
    designPath?: 'A' | 'B'           // REFINE's system default (A8)
  }
  → { ok: true; resolved: ResolvedModel } | { ok: false; code: 'UNKNOWN_MODEL' | 'NOT_ELIGIBLE' | 'NOT_ALLOWED' | 'NEEDS_PERSONAL_TOKEN' | 'NO_ALLOWED_MODEL'; message: string }
  ```

- **The effective set** for a surface: `eligible(surface) ∩ policy.allowed`, minus every `personalTokenGated` entry when `gateOn && credential === 'team' && mode === 'cli'`.
- **The tiers, first match wins.** Every tier is checked against the effective set at call time:
  1. **The explicit request.** Outside the effective set → `{ ok: false }` with the specific code. The route returns 400; a stored value is never this tier.
  2. **The stamp** (regenerate only, FR-09): mapped to a key through the catalogue's `apiId`, `cliArg` and `previousApiIds`.
     - Unmapped, or mapped but not in the effective set → fall through, `substitutedFrom = <stamp>`.
     - A `previousApiIds` match is itself a substitution (security NOTE): `substitutedFrom = <stamp>`, and it must still pass the effective set.
  3. **The team default** (`policy.defaults[surface]`). Not in the effective set → fall through, `substitutedFrom = <key>`, unless an earlier tier already set it.
  4. **The system default** (FR-04). Not in the effective set → fall through, as above.
  5. **The fallback:** the first entry of the effective set in catalogue order (cheapest first), with `source = 'fallback'`.

  An empty effective set returns `{ ok: false, code: 'NO_ALLOWED_MODEL' }`. `/team` makes it unreachable (FR-05), and every caller fails closed with that message.

- **`ResolvedModel`:** `{ surface, key, entry, source: 'request' | 'stamp' | 'team' | 'system' | 'fallback', substitutedFrom: string | null, arg: string, timeoutMs: number }`.
  - `arg` is `entry.apiId` in API mode and `entry.cliArg` in CLI mode. It is **the only string a boundary may pass.**
  - `timeoutMs` is `entry.surfaces[surface].timeoutMs`.
- **Internal surfaces:** `internalModel(surface, mode)` returns the fixed entry, `source: 'system'`, and never reads the policy (A14).
- **The I/O wrapper** `resolveModel(surface, { requested, stamp, userId, teamId, designPath })` (`src/lib/models/policy.ts`, server-only):
  - loads the team's policy (no row → A2 defaults);
  - derives `credential`: `personal` when the user has an `ACTIVE`, non-disabled `UserClaudeToken`, otherwise `team`; `n/a` in API mode; `userId: null` (scheduler, MCP, ACP) is always `team`;
  - reads `envDefault` and calls `decideModel`.
  - **Logging:**
    - a substitution logs `[models] <surface>: <substitutedFrom> not available (<reason>) → <key> (<source>)` on every run;
    - non-interactive callers (`userId` null) log at `warn`.
- **`modelFor`, `modelForBackground` and `pathForDesignMode`'s model role are deleted.** `pathForDesignMode` stays as a path helper. `isCliMode` and `pipelineMode` stay in `config.ts`.

**FR-04: system defaults and `CLAUDE_CLI_MODEL`.**

- **The system default table** is today's split, on current IDs:

  | Surface              | System default                                     |
  | -------------------- | -------------------------------------------------- |
  | `CAPTION`            | `HAIKU`                                            |
  | `DESIGN_TEMPLATE`    | `HAIKU`                                            |
  | `DESIGN_FREEFORM`    | `SONNET`                                           |
  | `REFINE`             | `HAIKU` on a Path A draft, `SONNET` on Path B (A8) |
  | `ASSISTANT_BRIEFING` | `SONNET`                                           |
  | `ASSISTANT_BRANDKIT` | `SONNET`                                           |

- **`CLAUDE_CLI_MODEL` (A4)** is validated in `src/lib/env.ts`, case-insensitively, against the catalogue's keys and current `apiId`s.
  - An invalid value throws at load, outside `next build`, with: `CLAUDE_CLI_MODEL must be one of haiku, sonnet, opus, claude-haiku-4-5, claude-sonnet-5-5, claude-opus-5-5 (got "<v>"). It is now the system default, not a global override.`
  - In CLI mode a valid value becomes `envDefault`: the system default for every user surface where the model is eligible. `OPUS` leaves `DESIGN_TEMPLATE` on its table default.
  - **Boot log, once per process,** at the first `resolveModel` call:
    - CLI mode: `[models] CLAUDE_CLI_MODEL=<v> is the system default (below team defaults and explicit picks); it no longer overrides them`;
    - API mode: `[models] CLAUDE_CLI_MODEL is set but ignored in API mode`.
  - `.env.example` and the release note say the same.
- **`claudeCli.ts` no longer reads `env.CLAUDE_CLI_MODEL`.** The `pinModel` option and the `"default"` / no-`--model` path are deleted. Every spawn passes `--model <arg>`.

**FR-05: `TeamModelPolicy`.**

- **The policy fields:** an explicit `allowedModels ModelKey[]`; a `requirePersonalTokenForGated Boolean @default(false)` (the switch, A3); and a per-surface default stored as `TeamModelDefault (teamId, surface, model)` rows, where a missing row means "use the system default".
- **A team with no row** reads as `{ allowed: defaultAllowed keys, defaults: {}, gateOn: false }`.
- **Validation at save** (`PUT /api/team/model-policy`; zod enums at the boundary, NFR-05). Each of these returns 400 with a message naming the problem:
  1. any key outside `ModelKey`, or any surface outside `ModelSurface`;
  2. `allowed` empty;
  3. any user surface whose `eligible ∩ allowed` is empty. For example, `allowed: ['OPUS']` leaves `DESIGN_TEMPLATE` with nothing: "Template fill needs Haiku or Sonnet allowed".
  4. a default outside `allowed`, or not eligible for its surface.
- **The switch can't empty a surface,** because rule 3 forces Haiku or Sonnet into every saved list and neither is gated.
- **Writes are team-admin only** (`withTeamAdmin`). Super-admins pass, as everywhere. Editors get 403.

**FR-06: schema, migration and rollback** (hand-written SQL, never `migrate dev`).

- **One migration, `20261012120000_model_selection`.** It only adds. No `DROP`, no `RENAME` and no `ALTER TYPE … ADD VALUE`:
  - the enums `ModelKey` and `ModelSurface`;
  - the tables `TeamModelPolicy` (PK `teamId`) and `TeamModelDefault` (PK `(teamId, surface)`, FK to the policy, `ON DELETE CASCADE`);
  - `Brief.captionModel "ModelKey"`, `Brief.designModel "ModelKey"`;
  - `Draft.headlineModel`, `Draft.headlineModelSubstitutedFrom`, `Draft.designModel`, `Draft.designModelSubstitutedFrom`;
  - `DraftRevision.model`, `DraftRevision.modelSubstitutedFrom`;
  - `DraftCaption.model`, `DraftCaption.modelSubstitutedFrom`.

  Every column is nullable `TEXT` except the two `Brief` enum columns. Existing rows read as null: "unknown", which is honest, the same rule as 004's render stamps.

- **Rollback:** `prisma/rollback/008-model-selection.down.sql`, a manual step outside `migrations/`. It:
  - drops what the migration added;
  - **deletes its own `_prisma_migrations` row,** so a later 008 redeploy re-applies it (learning L24: a down script that undoes a migration must also un-record it).
- **The previous image works without the down script,** because it never reads the new columns. The script is for a full removal.
- **AC-27 proves the down and the forward direction** on a scratch copy of the test DB.

#### The boundary, the stamps and the defaults (wave 1)

**FR-07: the boundary accepts only a `ResolvedModel`.**

- **CLI:** `ClaudeCliOptions.model` becomes `ResolvedModel`, and is **required** on `runClaudeCli` and `runClaudeCliStreamJson`. `claudeModelArgs(resolved)` returns `['--model', resolved.arg]`. `MODEL_NAME_RE` stays as defence in depth on the win32 shell path (`claudeCli.ts:166-171`). `timeoutMs` defaults to `resolved.timeoutMs`.
- **SDK:** every Anthropic call goes through one wrapper, `createMessage(client, params, resolved)` (`src/lib/models/anthropicCall.ts`). It:
  1. sets `model: resolved.arg`;
  2. sets `max_tokens` to `max(params.max_tokens, entry.apiMaxTokensFloor ?? 0)`;
  3. bounds wall-clock to `resolved.timeoutMs`, using an `AbortSignal` (open question 3);
  4. returns the response, with `textOf(response)` reading only `text` blocks;
  5. throws `ModelRefusalError` ("The model declined this request (<category>).") on `stop_reason: 'refusal'`.

  Callers keep their own `max_tokens` handling. The `content[0]` read in `providers/implementations/copy/anthropic.ts:23` is replaced, because a thinking model's first block is not text.

- **The recorder** (`src/lib/models/modelCalls.ts`): `recordModelCall({ surface, key, arg, mode, source, substitutedFrom, label })` runs at both boundaries **before** the spawn or request.
  - The sink is pluggable: production uses a no-op; `MOCK_AI` uses a `globalThis` ring buffer of 200 records; unit tests install their own.
  - It is the seam the boundary ACs assert on (AC-12).
- **Every `MOCK_AI` short-circuit on a model surface calls `recordModelCall`** with the `ResolvedModel` it was handed, before returning its mock (FR-16). The list is in design.md §7.

**FR-08: the stamps — what each one means and who writes it.** A stamp value is the `arg` that crossed the boundary: the `apiId` in API mode, the `cliArg` in CLI mode. With T2's expected outcome those are equal. `…SubstitutedFrom` is the refused value (a key, or a stamp string), or null.

| Stamp                                                  | Meaning                                        | Written by                                                                                                                                                                                                                                          | Left unchanged by                                       |
| ------------------------------------------------------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `DraftCaption.model` / `modelSubstitutedFrom`          | The model whose output is this row's text      | The generation (async `saveGenerationCaptions`, sync `captionRowsFromFields`) and `settleCaptionAction`, **for `ok` fields only**. A failed field keeps the row's stamp, because its text is kept (012 A7). A FAILED row with no text is left null. | A user edit (A6), the stale sweep                       |
| `Draft.headlineModel` / `headlineModelSubstitutedFrom` | The model that wrote `Draft.headline`          | The generation and `{headline:true}` when the headline validates                                                                                                                                                                                    | A headline edit (A6). Retry clears it with the headline |
| `DraftRevision.model` / `modelSubstitutedFrom`         | The model whose output is this revision's HTML | `finalizeDraftV1`, the sync create, regenerate-design, the refine commit and `recordRejectedRender` (the attempt's model). The legacy "Design before regenerate" snapshot copies the draft's stamp                                                  | —                                                       |
| `Draft.designModel` / `designModelSubstitutedFrom`     | Mirrors the current revision's stamp           | Every writer above, plus restore and "Use anyway" (the row's own stamp). Inline edit carries the current value forward; Override uses `pendingConflict.model` (A6)                                                                                  | Caption actions                                         |

The two design stamps travel in 004's `RenderStamp` (`revisions.ts:36-45`). It gains `model` and `modelSubstitutedFrom`, so every revision writer that already carries `promptVersion` carries the model too. A `RenderStamp` is resolved once per render and written to the row and the draft.

**FR-09: the regenerate default — the stamps own it** (architect BLOCK 1).

- **`regenerate-copy {channel}`:** the stamp tier is that row's `model`.
- **`regenerate-copy {headline:true}`:** `Draft.headlineModel`.
- **`regenerate-copy {}` ("Regenerate all"):**
  - if all three rows' `model` values are non-null and equal, the stamp tier is that value;
  - otherwise, mixed or any null, **there is no stamp tier**, and resolution starts at the team default. This is not recorded as a substitution: no single stamp was refused.
- **`regenerate-design`:** `Draft.designModel`. After a refine that is the refine's model, so the regenerate is like for like with what made the current design.
- **Refine has no stamp tier.** It is not a regenerate. Its default is the team `REFINE` default, then the system default by path (A8).
- **Retry of a FAILED generation** re-runs the initial request: `Brief.captionModel` / `Brief.designModel`, then team, then system.
- **A stamp that maps to no entry, or to an entry outside the effective set,** falls through with `substitutedFrom` set (FR-03 tier 2). The new stamp records it, so a "like for like" that wasn't is visible per draft (security WARN).
- **The server owns this rule.** Wave 2's pickers show the same answer by calling the same pure `decideModel` (FR-18).

**FR-10: `Brief`'s initial request.**

- `Brief.captionModel` and `Brief.designModel` are `ModelKey?`. Null means "no explicit request".
- They are read only by the initial generation and its retry (`runGenerationForDraft`, `generateDraftForBrief`), as tier 1.
  - `designModel` serves `DESIGN_TEMPLATE` or `DESIGN_FREEFORM` by `Brief.designMode`.
  - A stored key that has since become disallowed is a **stored** value: it falls through, never 400, and is recorded as a substitution. This is because tier 1 → 400 applies only at the request boundary.
- **Wave 1 never writes them** (null everywhere: wizard, scheduler, MCP). Wave 2's `POST /api/briefs` validates and writes them (FR-17).
- `scripts/export-posts.mjs` and `import-posts.mjs` carry the two fields and the stamps.

**FR-11: non-interactive callers.**

- **The scheduler, MCP `generate_post` and ACP `generate_post`** pass `userId: null` and get `credential = 'team'`.
  - They resolve each surface from the team default, then the system default.
  - With the switch on in CLI mode, a team default of `OPUS` is outside the effective set: it falls through, is recorded on the stamp and logged at `warn` (FR-03).
  - There is no `model` input on MCP/ACP, and the ACP manifest is unchanged. An unknown `model` key in an ACP `input` is ignored, as today, because `generatePost` spreads nothing into the `Brief`.
- **Usage-limit classification for scheduled runs** (A11):
  - `isClaudeUsageLimit(err)`, pure, in `claudeCli.ts`, true for:
    - a `ClaudeCliError` whose `apiErrorStatus === 429`;
    - one whose CLI-written `stderr`/`stdout` matches the conservative phrase list in design.md §8;
    - an `Anthropic.RateLimitError`.
  - `generationRunner` prefixes such a failure's `errorReason` with `Claude usage limit reached on the team's credential — `. The retry count and backoff are unchanged.
  - The queue table already shows `errorReason` on FAILED entries.
  - A regression test feeds model-written text containing "usage limit" and 429 through the classifier and gets `false` (L8).

**FR-12: the time budget is per action and enforced by a unit test.**

- **Per-model, per-surface timeouts** (FR-01, design.md §5) feed every boundary:
  - CLI: `timeoutMs`;
  - API: the signal deadline, and `runDesignAgent` / `runDesignAgentRefine`'s `deadlineMs`.
- **Liveness writes added (A9):**
  - **async generation** (`runGenerationForDraft`): one heartbeat after the captions are saved, which already bumps `updatedAt` through the headline write, and one more right before the design (`touchGeneration(draftId)`, guarded on `status = 'IN_PROGRESS'`);
  - **regenerate-design:** `touchDraftAction(draftId, 'REGENERATE_DESIGN')` right before `runPathBDesign`'s design call, after the background step;
  - **refine:** `touchDraftAction(…, 'REFINE')` right before the final commit render, alongside the existing per-attempt heartbeat (`refine/route.ts:192`);
  - **the scheduler:** `renewGenerationLease(entryId)` (`nextRetryAt = now() + GENERATION_LEASE_MS`, guarded on `status = 'RUNNING'`), at each entry's start and before its design. Today `leaseUntil` is computed once per tick for both claimed entries (`generationRunner.ts:114`), and the second entry runs after the first.
  - Design hooks reach the shared pipeline through an optional `onBeforeDesign` callback on `generateDraftForBrief`, `runGenerationForDraft` and `runPathBDesign`.
- **The OpenAI image call** gets `timeout: IMAGE_GENERATION_TIMEOUT_MS` (120 s, Gemini's value) and `maxRetries: 0`. Today it has no timeout.
- **`actionBudgetViolations(catalogue, steps)`** (`src/lib/models/budget.ts`, pure):
  - It models each action as liveness segments (design.md §5): async generation, regenerate-design, refine, regenerate-copy and scheduled generation.
  - For each segment it takes the **largest** timeout over every model eligible for its surface, in **both** modes, plus the fixed step budgets in design.md §5: background decision 90 s, image 120 s, render 90 s, verifier 60 s, the API tool tails (design 210 s, refine 120 s) and the transaction 10 s.
  - It returns every segment where `worst + MARGIN_MS (60 s) > limit`. The limit is `STUCK_GENERATION_MS` for draft actions and `GENERATION_LEASE_MS` for the scheduler.
  - **The unit test asserts that it returns `[]` for the real catalogue,** and that a planted catalogue (Opus `DESIGN_FREEFORM` at 800 s) returns that segment. No clock is involved.
- **The 15-minute constants stay where they are,** and the test imports them. An edit to either constant, or to any timeout, is stopped at the unit gate (party-visionary WARN).

**FR-13: the policy and model APIs.**

- **`GET /api/team/model-policy`** (`withTeamAdmin`): `{ allowed, defaults: Record<UserSurface, ModelKey | null>, requirePersonalTokenForGated, saved: boolean, newModels: ModelKey[] }`. `newModels` lists `defaultAllowed` entries absent from a saved list (A2).
- **`PUT /api/team/model-policy`** (`withTeamAdmin`): body `{ allowed: ModelKey[], defaults: Partial<Record<UserSurface, ModelKey | null>>, requirePersonalTokenForGated: boolean }`. It is strict zod, validated per FR-05, and upserts the policy and default rows in one transaction.
- **`GET /api/models`** (`withTeamAuth`, any member). It is what every picker reads, and the client-side `decideModel` needs exactly this:

  ```ts
  {
    catalogue: Array<{ key, displayName, tier: '$' | '$$' | '$$$', speed, surfaces: UserSurface[], personalTokenGated }>
    allowed: ModelKey[]
    defaults: Partial<Record<UserSurface, ModelKey>>
    gateOn: boolean
    mode: 'api' | 'cli'
    credential: 'personal' | 'team' | 'n/a'
    envDefault: ModelKey | null
  }
  ```

  It never returns a price or an `apiId`. They are not secrets, but the client needs neither, and the boundary is the only consumer of `arg`.

- **The cross-team rule holds:** `teamId` comes only from the session (`withTeamAuth`), never from a body.

**FR-14: the `/team` "Models" section** (wave 1). The section is `SectionHead numeral="v." title="Models"` on `/team`, after "API keys".

- **Allowed models:** a checkbox per entry, labelled `<displayName> · <tier> · <speed>`. New entries show a "New" chip (A2).
- **Defaults:** one `Select` per user surface:
  - its label is the surface's plain name ("Captions", "Template fill (Path A)", "Freeform design (Path B)", "Refine", "Campaign briefing assistant", "Brand-kit assistant");
  - its options are "System default (<name>)" plus each allowed, eligible model.
- **The switch:** a checkbox, "Opus requires a personal token". Its helper text reads: "Runs that would use the team's Claude token can't use Opus. Scheduled posts, MCP and ACP always use the team token." In API mode it is disabled, with "Only applies in CLI mode."
- **Save** calls PUT. A 400 shows inline, through `Notice tone="error"`, with the server's message.
- **The section is built only from `src/components/ui` primitives** (`SectionHead`, `FieldLabel`, `Select`, `Notice`, `Button`), and `uiTokenGuard` stays green.

**FR-15: internal surfaces and the literal guard.**

- The background decision, the verifier and the token ping call `internalModel(...)`. `VERIFIER_MODEL` (`refineVerify.ts:131`) and the literal `'haiku'` (`userToken.ts:127`) are deleted.
- **The guard** `tests/unit/modelLiteralGuard.test.ts` scans every `.ts` and `.tsx` file under `src/`, skipping comment lines. It fails on:
  - `/claude-(haiku|sonnet|opus|fable|mythos)[\w.-]*/i`;
  - a quoted bare `'haiku' | 'sonnet' | 'opus' | 'fable'` (any quote, case-insensitive);
  - anywhere except `src/lib/models/catalogue.ts`.

  It does not flag `claude-token`, `claude-html`, `claude-cli` or `claude-guide`. Its self-test plants one of each pattern in a fixture string and expects a hit, and runs the non-model `claude-` strings and expects none.

- **Outside `src/`:** `scripts/cli-sandbox-check.mjs`'s `VISION_MODEL` (line 87) drift test is re-pinned to the catalogue's `ASSISTANT_BRANDKIT` system-default `cliArg`.

**FR-16: test seams** (`MOCK_AI`, dormant in production).

- **`GET /api/test/model-calls`** returns the recorder's ring buffer, newest last. **`DELETE`** clears it. It is gated like `/api/test/scheduler-tick`: 404 when `NODE_ENV === 'production'`, 404 unless `MOCK_AI`, admin-only.
- **Every mock branch on a surface records** (FR-07):
  - the registry's mock `CopyProvider`;
  - `runDesignAgent` and `runDesignAgentRefine`'s mock branches;
  - the verifier mock;
  - the background mock decision;
  - `runBriefingChat`, `enhanceBriefing` and `enhancePostBrief`;
  - the brand-kit assistant;
  - `generateTemplateFromImage`;
  - `draftBrandVoice`;
  - `validateClaudeToken`.
- **The E2E reads the stamps through the draft GET** (FR-13 additions to `DraftDetail`, below) and the recorder for the stamp-less surfaces.
- **`DraftDetail` gains** `designModel`, `headlineModel`, `captions[].model`, the `…SubstitutedFrom` siblings, and `revisions[].model` on the revisions list. These are additive.

#### Choice (wave 2)

**FR-17: the `model` body fields** (party-architect BLOCK 2). One field, `model?: ModelKey`, validated by zod against the enum, on:

| Route                                           | Field                                                                       | Surface                                                          |
| ----------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `POST /api/briefs`                              | `captionModel?`, `designModel?` (written to `Brief`)                        | `CAPTION`; `DESIGN_TEMPLATE` / `DESIGN_FREEFORM` by `designMode` |
| `POST /api/drafts/[id]/regenerate-copy`         | `{ model? }`, `{ channel, model? }`, `{ headline: true, model? }`           | `CAPTION`                                                        |
| `POST /api/drafts/[id]/regenerate-design`       | `{ model? }` (an empty body stays valid)                                    | `DESIGN_FREEFORM`                                                |
| `POST /api/drafts/[id]/refine`                  | `model?` beside `instruction` (ignored on the Override path, no model call) | `REFINE`                                                         |
| `POST /api/campaigns/[id]/briefing/chat`        | `model?`                                                                    | `ASSISTANT_BRIEFING`                                             |
| `POST /api/admin/brandkits/[id]/assistant/chat` | `model?`                                                                    | `ASSISTANT_BRANDKIT`                                             |

- **Each route resolves before its claim,** so a 400 claims nothing.
- **A failed resolution returns `400 { error: <message>, code: 'MODEL_NOT_ALLOWED' }`.** The messages:
  - `NOT_ALLOWED`: "Opus 5.5 isn't allowed on this team";
  - `NOT_ELIGIBLE`: "Opus 5.5 isn't available for template fill";
  - `NEEDS_PERSONAL_TOKEN`: "Your team requires a personal Claude token for Opus 5.5 — connect one in Settings";
  - `UNKNOWN_MODEL`: the zod enum message.
- **The `regenerate-copy` body stays strict** (`captions/requests.ts:74-97`), so `{ channel, headline, model }` is still a 400, and an unknown extra key still is.
- **The brief-draft autosave payload** (`briefDraftPayload.ts`) gains `captionModel?` and `designModel?`, so a resumed brief restores the picks.
- **No `model` field is added to** the two Enhance routes, image → template or the voice draft (A7), or to MCP/ACP (FR-11).

**FR-18: the shared `ModelPicker`** (`src/components/ui/ModelPicker.tsx`) and the `useModels()` hook (React Query over `GET /api/models`).

- **Options:** only the effective set for the surface. Each is labelled `<displayName> · <tier>`, with the speed hint as secondary text.
- **Pre-selection:** `decideModel(surface, { stamp?, designPath?, …models })` without `requested`, which is the exact rule the server will apply (FR-09).
- **The hint line under the picker:**
  - `stamp` → "Same model as the current <caption | headline | design>";
  - `team` → "Team default";
  - `system` → "Default";
  - `fallback` → "Default (the team's choice isn't available)";
  - with a substitution: "<stamped name> is no longer available on this team — using <name>".
- **Send rule (A5):** the picker reports `undefined` until the user picks a different value, and the caller omits `model` then.
- **Accessible name:** `<FieldLabel>` "Model", tied by `htmlFor` / `aria-labelledby`, plus a surface-specific suffix where several pickers share a screen ("Caption model", "Design model", "Instagram caption model").
- **Disabled while any action is pending,** like the controls next to it.
- **Hidden** when the effective set has one entry, which shows as plain text "Model: Haiku 4.5", and for `CAPTION` when the COPY provider isn't Claude (open question 1).

**FR-19: the brief wizard's Review step.**

- **Two pickers:** "Caption model" (`CAPTION`) and "Design model" (`DESIGN_TEMPLATE` or `DESIGN_FREEFORM`, following the Size & Design step's choice).
- **When the design path changes,** a picked design model that the new path doesn't allow (Opus → Path A) resets to `undefined`, with the hint "Opus 5.5 isn't available for template fill".
- **The picks go to `POST /api/briefs` and to the autosave** (FR-17).
- **The Review summary rows** show "Caption model" and "Design model" with the effective choice.

**FR-20: the draft page.**

- **Refine box:** a `ModelPicker` for `REFINE` beside the instruction. Its pre-selection is the team or system default, by the draft's path.
- **Caption panels (012):**
  - each `CaptionPanel` and the `HeadlinePanel` gets a compact picker in its tail, pre-selected from that row's or the headline's stamp;
  - "Regenerate all" gets one picker in the section tail, pre-selected per the FR-09 mixed-stamp rule.
- **The design regenerate control** (`drafts/[id]/page.tsx:195`) gets a picker pre-selected from `designModel`.
- **"Generated with":** each panel's tail and the Versions sheet show the stamp's display name in muted text, for example "Generated with Sonnet 5.5". An unmapped stamp shows the raw ID. A substitution adds "(substituted)" with a `title` naming `substitutedFrom`.

**FR-21: the assistant chat headers.** `BriefingAssistantPanel` and `BrandKitAssistantPanel` each get a `ModelPicker` in the header, pre-selected to the team or system default.

- The pick lasts for the open chat only. It is client state, not stored (no remembered choice).
- Each turn sends it when changed. Switching mid-conversation is safe, because each turn is a stateless call with the transcript.

**FR-22: the team-token notice** (the 2026-10-12 decision) and the gated state.

- **The notice:** in CLI mode, when the selected or pre-selected model is `personalTokenGated` and `credential === 'team'`, the picker shows `Notice tone="warning"` (non-blocking, `role="status"`): "This run uses your team's Claude allowance. Connect your own token in Settings to use yours."
- **The gated state:** with the switch on, gated entries leave the effective set for that user, so they are not offered. The picker's hint reads "Opus requires a personal Claude token on this team — connect one in Settings". Any stamp-derived Opus pre-selection substitutes visibly, per FR-18.
- **The pure helper** `teamTokenNotice(models, key)` decides both.

**FR-23: docs.**

- **`CLAUDE.md`:** the new top entry; the per-path model notes are superseded by the catalogue.
- **`docs/handoff.md`:** a runbook covering the migration, the rollback (down.sql un-records itself), the `CLAUDE_CLI_MODEL` meaning change and the boot error on `default`, the surface split procedure, and the release note.
- **`docs/mcp-acp-guide.md`:** MCP/ACP use the team default; no `model` input.
- **`docs/ui-reference/DESIGN_SYSTEM.md`:** a new §8.19 for the model picker, the hint line and the team-token notice.
- **`docs/e2e-test-plan.md`:** §Y, model selection.
- **`.env.example`:** `CLAUDE_CLI_MODEL` re-documented.
- **`.specclaw/ROADMAP.md`:** 008's status, and 006 reading the stamps.

**The release note:**

- "Models are now chosen per team at /team → Models."
- "`CLAUDE_CLI_MODEL` is the system default, not a global override, and `default` is no longer accepted."
- "Freeform design and the assistants move from Sonnet 4.6 to Sonnet 5.5."

### Non-Functional Requirements

- **NFR-01: gates.**
  - **Per task:** `npm run lint` (0 errors), `npm run test:unit`, `npx tsc --noEmit -p .`, and `npx prisma generate` after a schema edit.
  - **Per wave:** a full clean mock E2E, **0 failed and 0 flaky**, after a dropped and recreated test DB. Every edited pre-existing case is listed with its reason in the wave's last task report.
- **NFR-02: the deciding logic is pure and unit-tested without a DB or a clock:** `decideModel`, `modelTier`, `actionBudgetViolations`, the policy validation, `isClaudeUsageLimit`, the regenerate stamp rule (`regenerateStampTier`) and `teamTokenNotice`. This is the `recovery.ts` / `captions/resolve.ts` split.
- **NFR-03: no model string reaches a boundary except `ResolvedModel.arg`.** It is enforced three ways: by the type (`model: ResolvedModel` on both boundaries), by the literal guard (FR-15) and by the boundary ACs (AC-12).
- **NFR-04: no new runtime dependency and no SDK upgrade** (A12).
- **NFR-05: closed vocabularies at every write boundary.** Keys and surfaces are Prisma enums and zod `z.enum`. A stored value is re-checked at call time (FR-03). No free-form string from a request or a row reaches argv.
- **NFR-06: deploy safety.** The migration only adds. The previous image runs against the migrated schema unchanged.
- **NFR-07: Folio and 014.** Pickers and the `/team` section use `src/components/ui` primitives. `uiTokenGuard`, `designTokens` and `contrast` stay green. Every picker has an accessible name, and the axe blocks on the draft page, the wizard and `/team` stay green.
- **NFR-08: test seams are dormant in production** (the `MOCK_AI` gates; the recorder's no-op sink).
- **NFR-09: model quality is not verified by any gate.** `MOCK_AI` returns canned output, so no E2E can fail because Opus writes a worse caption than Sonnet. What the gates verify:
  - that the chosen model is the one that ran (the boundary, the stamps, the recorder);
  - the allow-list;
  - the budget.

  The panel's "quality premise" (party-ba WARN) rests on the user's decision and an optional operator sample (AC-32).

## Acceptance Criteria

**Unit (wave 1)**

- **AC-01 (FR-01): `tests/unit/modelCatalogue.test.ts`.**
  - **(a)** The catalogue invariants of FR-01 hold, and each is shown failing on a planted bad catalogue.
  - **(b)** `modelTier` returns `$`, `$$`, `$$$` for the real prices; a planted Sonnet at $8/$40 returns `$$$`.
  - **(c)** `DESIGN_TEMPLATE` is eligible for exactly `HAIKU` and `SONNET`.
  - **(d)** Every entry has a `priceSource` containing a date.
- **AC-02 (FR-03): `tests/unit/modelResolve.test.ts`, the tiers.**
  - **(a)** request > stamp > team > system > fallback, one case per tier, each with `source` asserted.
  - **(b)** An explicit disallowed request gives `NOT_ALLOWED`, an ineligible one `NOT_ELIGIBLE` (`OPUS` on `DESIGN_TEMPLATE`), and a gated one with `credential: 'team'` in CLI mode `NEEDS_PERSONAL_TOKEN`. In API mode the same gated request is ok.
  - **(c)** `REFINE`'s system default is `HAIKU` for path A and `SONNET` for path B.
  - **(d)** `envDefault: 'OPUS'` in CLI mode makes `DESIGN_FREEFORM` resolve to `OPUS` (source `system`) and leaves `DESIGN_TEMPLATE` on `HAIKU`. In API mode it is ignored.
  - **(e)** An empty effective set gives `NO_ALLOWED_MODEL`.
- **AC-03 (FR-03, security BLOCK): a disallowed stored value is never returned, at any tier.** A property test runs every combination of `{ stamp ∈ every apiId, cliArg and previousApiId, plus 'claude-sonnet-4-6', 'gpt-4o' and null } × { team default ∈ keys ∪ {none} } × { allowed ∈ every non-empty subset } × { gateOn } × { credential } × { mode } × { envDefault }` over every user surface. For each it asserts:
  - the result is `ok`, or `NO_ALLOWED_MODEL` exactly when the effective set is empty;
  - `resolved.key` ∈ the effective set;
  - `substitutedFrom` is non-null whenever a non-null stamp, team default or `envDefault` was skipped, and null when nothing was skipped;
  - a `previousApiIds` stamp maps to its family and sets `substitutedFrom`.
- **AC-04 (FR-04): `tests/unit/envModel.test.ts`.**
  - `CLAUDE_CLI_MODEL` values `sonnet`, `OPUS` and `claude-haiku-4-5` parse.
  - `default`, `claude-sonnet-4-6`, `gpt-4o` and `sonnet; rm -rf /` each throw with the FR-04 message.
  - The boot line is logged once across two `resolveModel` calls, with different text in API mode.
- **AC-05 (FR-05): `tests/unit/modelPolicy.test.ts`.**
  - Each validation rule in FR-05 rejects its case with its message, including `allowed: ['OPUS']`, which gives "Template fill needs Haiku or Sonnet allowed".
  - A valid policy round-trips.
  - With no stored row, `{ allowed: all three, defaults: {}, gateOn: false }` comes back.
- **AC-06 (FR-09): `tests/unit/regenerateStamp.test.ts`.**
  - `{}` with stamps `[S, S, S]` → stamp tier `S`;
  - `[S, O, S]` → no stamp tier, resolution starts at the team default, and `substitutedFrom` is null;
  - `[S, null, S]` → no stamp tier;
  - `{channel:'LINKEDIN'}` uses the LinkedIn row's stamp only;
  - `{headline:true}` uses `headlineModel`.
- **AC-07 (FR-08): the stamp writers,** in `tests/unit/captionStore.test.ts`, `renderStamps.test.ts` and `draftActions.test.ts`, with Prisma mocked.
  - `saveGenerationCaptions` writes `model` on `ok` rows only.
  - `settleCaptionAction` keeps a failed row's stamp.
  - `saveCaptionEdit` and `saveHeadlineEdit` write no stamp field.
  - `RenderStamp` carries `model`. `commitDraftRevision`, `recordRejectedRender`, restore (`restoredRenderStamp`) and adopt (`rejectedRenderStamp`) write the row's own stamp.
  - The inline-edit commit carries the draft's `designModel` forward.
- **AC-08 (FR-11): `tests/unit/usageLimit.test.ts`.**
  - `apiErrorStatus: 429` → true.
  - A CLI-written usage-limit phrase in `stderr` → true.
  - `Anthropic.RateLimitError` → true.
  - **Hostile model text** containing "usage limit reached 429", in `diagnostic` or in assistant text → false.
  - `generationRunner` prefixes `errorReason` for a usage-limit failure, and its `retryCount` and `nextRetryAt` match a non-usage failure's.
- **AC-09 (FR-12): `tests/unit/actionBudget.test.ts`.**
  - `actionBudgetViolations(CATALOGUE, STEPS)` returns `[]`.
  - A planted Opus `DESIGN_FREEFORM` of 800 s returns the async-generation and regenerate-design design segments, plus the scheduler's.
  - A planted `REFINE` of 800 s returns both refine attempt segments.
  - `STUCK_GENERATION_MS` and `GENERATION_LEASE_MS` are imported, not copied.
- **AC-10 (FR-12): the heartbeats.**
  - `runGenerationForDraft` calls `touchGeneration` after captions and before design.
  - regenerate-design touches before the design.
  - refine touches before the commit.
  - `runGenerationJobs` renews each entry's lease at its start and before its design. A test with `CLAIM_BATCH = 2` shows the second entry renewed before it starts.

  Each is shown by the order of mocked Prisma calls.

- **AC-11 (FR-15): `tests/unit/modelLiteralGuard.test.ts`.**
  - It passes on `src/`.
  - Its self-test flags a planted `'claude-sonnet-4-6'`, `"opus"` and `` `Haiku` `` in a fixture.
  - It does not flag `claude-token`, `claude-html`, `claude-cli` or `claude-guide-tab`.
  - It runs before T10 finishes, as part of T10, and stays green from then on.
- **AC-12 (FR-07, NFR-03, architect WARN): the boundary seam records the expected `arg` for every surface,** in **both** modes, with `CLAUDE_CLI_MODEL` **set and unset.** This is `tests/unit/modelBoundary.test.ts`. It mocks `child_process.spawn` and the Anthropic client, with `MOCK_AI` off. For each of the 9 surfaces it calls the real call-site function (design.md §7) and asserts:
  - **(a)** CLI mode, env unset: the spawn's argv contains `--model <system default cliArg>`, and the recorder has one record with that `arg` and surface;
  - **(b)** CLI mode, `CLAUDE_CLI_MODEL=opus`: user surfaces where Opus is eligible record `claude-opus-5-5`'s `cliArg`; `DESIGN_TEMPLATE` and the three internal surfaces record Haiku;
  - **(c)** API mode, env set or unset: the SDK request's `model` is the system default `apiId`;
  - **(d)** with a team default of `OPUS` on the `DESIGN_FREEFORM` row, the recorded `arg` is Opus in both modes;
  - **(e)** the timeout reaching the spawn, or the signal deadline, equals the entry's surface timeout.
- **AC-13 (FR-07): `tests/unit/anthropicCall.test.ts`.**
  - A response whose first block is `thinking` returns its `text` block.
  - `stop_reason: 'refusal'` throws `ModelRefusalError`.
  - `max_tokens` 2048 on Sonnet becomes 16000; on Haiku it stays 2048.
  - A request still running at the deadline is aborted. A fake timer drives the signal; there is no wall clock.
  - The Anthropic caption provider no longer reads `content[0]`.

**Operator (wave 1)**

- **AC-14 (T2, gating): CLI full-ID acceptance.** The operator runs the ready-to-paste command from tasks.md T2 against the pinned CLI 2.1.287: one `claude -p --output-format stream-json --verbose --model <apiId>` call per catalogue entry, with the prompt "Reply with: ok". It records in `reports/T2.md`, per ID:
  - the exit code;
  - the `system/init` event's `model`;
  - whether a `result` came back.

  **Pass:** every `apiId` is accepted and init echoes it, so `cliArg = apiId` is kept. **For any ID that is rejected:** that entry's `cliArg` becomes its alias (`haiku`, `sonnet` or `opus`), its alias's init model is recorded, and the version-consistency claim is narrowed to that entry in the verify report.

**E2E, wave 1** (new suite `tests/e2e/model-selection.test.ts`, catalog §Y, mock mode, API mode)

- **AC-15 (FR-08, FR-04): the generation stamps on system defaults.**
  - A Path B draft is `EXPORTED`, every `captions[].model` equals `claude-haiku-4-5`, `headlineModel` is `claude-haiku-4-5`, `designModel` is `claude-sonnet-5-5`, and revision 1's `model` is `claude-sonnet-5-5`.
  - The recorder shows `CAPTION` → Haiku and `DESIGN_FREEFORM` → Sonnet, both with source `system`.
  - A Path A draft's `designModel` is `claude-haiku-4-5`.
- **AC-16 (FR-05, FR-13): the team policy.**
  - `PUT /api/team/model-policy` with `defaults.DESIGN_FREEFORM = 'OPUS'` → 200, then a new generation's `designModel` is `claude-opus-5-5`, with recorder source `team`.
  - `allowed: ['OPUS']` → 400 "Template fill needs Haiku or Sonnet allowed".
  - A default outside `allowed` → 400.
  - An editor's PUT → 403.
  - Team B's policy never affects team A's generation.
- **AC-17 (FR-03, FR-09, security BLOCK): a removal applies to stored values.**
  - Seed through the test DB: a draft with `designModel = 'claude-opus-5-5'` and a LinkedIn row `model = 'claude-opus-5-5'`.
  - PUT `allowed: ['HAIKU','SONNET']`.
  - `regenerate-design` → 202. On settle, `designModel` is the team or system default (`claude-sonnet-5-5`) and `designModelSubstitutedFrom` is `claude-opus-5-5`.
  - `regenerate-copy {channel:'LINKEDIN'}` → the LinkedIn row's `model` is `claude-haiku-4-5`, with `modelSubstitutedFrom = 'claude-opus-5-5'`.
  - The recorder shows no Opus record after the PUT.
- **AC-18 (FR-09): regenerate is like for like.**
  - Seed all three rows' `model = 'claude-sonnet-5-5'`. `regenerate-copy {}` → all three record Sonnet (source `stamp`).
  - Seed mixed stamps (`[sonnet, opus, sonnet]`, Opus allowed) with a team `CAPTION` default of `HAIKU`. `{}` → all three rows `claude-haiku-4-5`, source `team`, `modelSubstitutedFrom` null.
  - A null-stamp draft (seeded) with no team default → system default.
- **AC-19 (FR-08, A8): refine and the verifier.**
  - Refine on a Path B draft → revision 2's `model` is `claude-sonnet-5-5`, `designModel` follows it, and the recorder has an `INTERNAL_VERIFIER` record of `claude-haiku-4-5`.
  - On a Path A draft, refine → revision 2 `claude-haiku-4-5`.
  - With a team `REFINE` default of `OPUS`, refine → Opus. Restore revision 1 → `designModel` back to revision 1's stamp.
- **AC-20 (FR-11): non-interactive callers use the team default.**
  - With team `DESIGN_FREEFORM` = `OPUS`, a scheduled HOLD entry run through `/api/test/generation-tick` → its draft's `designModel` is `claude-opus-5-5`.
  - ACP `generate_post` → the same.
  - The scheduled entry's `errorReason` is untouched on success.
- **AC-21 (FR-02, A7): the assistants and the stamp-less surfaces.** Each of these, with no team default, records Sonnet (`system`); after a team `ASSISTANT_BRIEFING` / `ASSISTANT_BRANDKIT` default of `HAIKU`, each records Haiku (`team`):
  - the campaign briefing chat;
  - the campaign Enhance;
  - the post-brief Enhance;
  - the brand-kit assistant chat;
  - image → template;
  - both voice-draft routes.
- **AC-22 (FR-14): `/team` → Models.**
  - The section renders under its h2 "Models".
  - Unticking Opus and saving persists it (the GET shows it). Saving with only Opus ticked shows the 400 message inline.
  - Each `Select` and checkbox has an accessible name.
  - Within 014's axe block on `/team`: 0 violations.
- **AC-23 (FR-06): the migration and rollback,** run on a scratch copy of the test DB (`CREATE DATABASE … TEMPLATE`, dropped afterwards):
  - `008-model-selection.down.sql` removes every added object and the migration row;
  - `prisma migrate deploy` then re-applies `20261012120000_model_selection`;
  - the schema matches the forward state again (`information_schema` column check).
- **AC-24 (NFR-01):** wave 1's full clean mock E2E is 0 failed and 0 flaky, and every edited pre-existing case is listed with its reason.

**Unit (wave 2)**

- **AC-25 (FR-17): `tests/unit/modelRequests.test.ts`.**
  - Every route body accepts `model` per the FR-17 table.
  - `{ channel, headline: true, model }` stays a 400.
  - `{ model: 'gpt-4o' }` and `{ model: 'opus' }` (wrong case) → 400.
  - The brief-draft payload round-trips `captionModel` and `designModel`.
- **AC-26 (FR-18, FR-22): `tests/unit/modelPicker.test.ts`,** pure helpers only.
  - The pre-selection equals `decideModel` for 20 seeded combinations, the same ones AC-03 uses.
  - `teamTokenNotice` is true only for CLI mode, a gated key and `credential: 'team'`.
  - With `gateOn`, the gated key is absent from the options.

**E2E, wave 2** (§Y, continued)

- **AC-27 (FR-17): an explicit disallowed request → 400, and claims nothing.**
  - With `allowed: ['HAIKU','SONNET']`, `model: 'OPUS'` returns 400 `MODEL_NOT_ALLOWED` on: `POST /api/briefs` (`designModel`), all three `regenerate-copy` forms, `regenerate-design`, `refine`, the briefing chat and the brand-kit chat.
  - The draft's `pendingAction` stays null after each.
  - `designModel: 'OPUS'` on a TEMPLATE brief → 400 "…isn't available for template fill".
- **AC-28 (FR-19): the wizard.**
  - On the Review step, choose "Design model: Opus 5.5" → generate → the draft's `designModel` is `claude-opus-5-5`, and `Brief.designModel` is `OPUS`, read through the test DB.
  - A second brief with untouched pickers → `Brief.captionModel` and `Brief.designModel` are null, and the draft uses the defaults.
  - Switching to Path A after picking Opus resets the picker and shows the hint.
  - A resumed autosaved brief restores the pick.
- **AC-29 (FR-20): the draft page pickers.**
  - The LinkedIn panel's picker is pre-selected to its stamp's model and shows "Same model as the current caption".
  - Choosing Opus and regenerating → only the LinkedIn row's `model` is Opus; the other rows' `model` and `updatedAt` are unchanged.
  - The headline picker → `headlineModel`.
  - The refine box with Haiku → revision `model` is Haiku.
  - The design regenerate picker → `designModel`.
  - "Generated with …" shows on each panel.
  - On the AC-17 seeded draft the design picker shows the substitution hint.
- **AC-30 (FR-21): the chat headers.** Choosing Haiku in the briefing assistant header, then sending a turn, records `ASSISTANT_BRIEFING` → Haiku (`request`). The next turn without a change also records Haiku, because the pick lasts for the chat.
- **AC-31 (FR-22): the team-token notice.**
  - With `/api/me` and `/api/models` fulfilled by `page.route` to read `mode: 'cli'`, `credential: 'team'` and no personal token, picking Opus in the refine box shows the notice (`role="status"`).
  - With `gateOn: true`, Opus is not offered and the hint names Settings.
- **AC-32 (NFR-09), not a gate:** optionally, the operator runs one real Path B generation and one refine on Opus 5.5 in CLI mode. Recorded in the verify report:
  - each call's duration against its placeholder timeout (design.md §5);
  - whether any call came within 20 % of its timeout.

  This is the only measurement of Opus durations, and it is a single sample.

- **AC-33 (NFR-01, NFR-07):**
  - wave 2's full clean mock E2E is 0 failed and 0 flaky;
  - the axe blocks on the wizard Review step and the draft page stay green with the pickers present;
  - every edited pre-existing case is listed.

## Edge Cases

- **An admin removes a model while an action runs.** Resolution happens before the claim, and the run keeps its resolved model. The allow-list is checked "at call time", meaning when the call is resolved, not on every spawn. The next action resolves afresh.
- **The personal token is rejected mid-run** (`withAuthRetry`). With the switch on, the one fallback attempt runs on the team token with the already-resolved Opus. The personal token is marked INVALID, so the user's next resolution is `credential: 'team'` and Opus substitutes or 400s. This is accepted and logged; it is one call.
- **The catalogue `apiId` is bumped** (Sonnet 5.5 → 6). Old drafts' Sonnet 5.5 stamps match `previousApiIds`, so a regenerate runs Sonnet 6, recorded as a substitution from `claude-sonnet-5-5`, and visible in the picker's hint.
- **A pre-008 draft has null stamps,** so a regenerate starts at the team default.
- **A stamp from an OpenAI caption provider** (`gpt-4o`) maps to nothing and falls through (open question 1).
- **`CLAUDE_CLI_MODEL=default` on an existing deployment** now fails the boot loudly, by design. It used to mean "omit `--model`", the costly account default. The release note and the boot message name the fix.
- **The budget test fails after an honest timeout change.** That is the point: raise the heartbeat coverage or lower the timeout. The test's failure message names the segment, its worst case and its limit.
- **Opus on a Path A draft:** not offered by the picker, 400 when explicit, and a stored `OPUS` on a TEMPLATE brief falls through. Refine on a Path A draft does offer Opus (`REFINE` is a separate surface, binding decision).
- **Two pickers on one screen** (the caption panels): each has its own accessible name (FR-18), so axe's duplicate-label rule holds.
- **The model-calls ring buffer in `next dev`:** routes are compiled separately, so the buffer lives on `globalThis` (the Prisma client pattern) to be shared across route modules in one process. The E2E runs with `workers: 1` (`playwright.config`), so the records don't interleave.
- **MCP/ACP never 400 on a model,** because they have no `model` input. A team with an empty effective set is impossible after FR-05. If a hand-edited row makes it happen anyway, the run fails closed with `NO_ALLOWED_MODEL`'s message, surfaced as the MCP error and as the scheduled entry's `errorReason`.

## Dependencies

- **012 is built and verified PASS** (2026-10-12). 008 stamps its shape: `DraftCaption`, `Draft.headline`, `writeCaptions`, and the three `regenerate-copy` forms. 012 FR-09 already says: "008 shows it under its `caption` surface. Because the headline has its own column and its own regenerate request, a later change can split it into a separate surface without a migration."
- **011 and 014:** pickers and `/team` are built in Folio, on the shared primitives.
- **004:** the verifier is pinned to Haiku by user decision (2026-09-23), and becomes `INTERNAL_VERIFIER`. The refine heartbeat, `touchDraftAction`, and `RenderStamp` are reused.
- **015:** the draft page settles on state after an awaited refetch (learning L25). The caption and design pickers add no new edge-triggered settle.
- **005 item 2** (the COPY credential route) is out of scope. It should sit on top of this resolver (ROADMAP: "008 → 005 item 2").
- **006** reads `DraftCaption.model`, `Draft.headlineModel`, `Draft.designModel`, `DraftRevision.model` and the catalogue's numeric prices (ROADMAP: "008 → 006"). The ROADMAP still says `captionModel`; T19 updates it.

## Notes

- **Run tasks one at a time,** even within a wave: lint-staged stashes.
- **Before each wave's full E2E:**
  - stop stray node processes;
  - check there is exactly one `:3001` listener (L19);
  - `rm -rf .next`;
  - drop the test DB (`docker exec designer-postgres-1 psql -U bistec -d postgres -c "DROP DATABASE IF EXISTS bistec_studio_test WITH (FORCE);"`), because `test:e2e:db` does not drop it, then recreate it.
- **After each push,** check `gh run list --branch v2` (L21).
- **Where each panel finding is addressed:** the table in `design.md` → "Panel findings → where addressed".
