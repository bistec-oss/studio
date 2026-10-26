# Spec: Product observability (in-app event store and insights page)

**Change:** 006-product-observability · **Size:** architectural · **Proposal:** [proposal.md](proposal.md) · **Party:** [party-report.md](party-report.md)
**Created:** 2026-10-23
**Status:** 🟡 Draft

## Overview

bistec-studio records no history of what happens to drafts. Failure reasons are overwritten by the next action, a refine that was applied stores no verdict, and no duration or token count is stored anywhere. So nobody can say whether 004 improved refine, whether a deploy made generation worse, how the 009 image styles behave on real traffic, or what each model and route costs in time.

This change adds an **append-only event store in the app's own Postgres**, written through one wrapper from the server's existing choke points, and **one super-admin page** that answers four named decisions. It adds no service, no external vendor and no session replay.

**The user's decisions (2026-10-23), and where each lands:**

| Decision                                                                                            | Lands in                         |
| --------------------------------------------------------------------------------------------------- | -------------------------------- |
| In-app Postgres events behind a wrapper; no PostHog or ClickHouse                                   | FR-01, FR-02; Out of scope       |
| No session replay                                                                                   | Out of scope                     |
| Traces hold metadata plus the refine instruction text; no prompts, no model output                  | FR-04, FR-05, NFR-04             |
| Super-admin only, global across teams                                                               | FR-10, NFR-05                    |
| 180-day retention by one daily-capable worker sweep; the page shows the oldest event's age          | FR-11                            |
| The stale-headline badge is **split out** into its own change                                       | Out of scope                     |
| Staged scope: server events and the page first, then wizard events, then token counts               | FR-03 to FR-09 (waves), tasks.md |
| "Applied" means the refine committed a revision at the action; undo, restore and adopt are separate | FR-05, FR-06                     |
| The page serves four decisions                                                                      | FR-10                            |
| Team delete removes its events; draft delete keeps them unlinked; a purge script                    | FR-12                            |
| Wizard abandonment is a brief draft that expires or is discarded without Generate                   | FR-08                            |

## Approach

**One table, one wrapper, a closed catalogue.** `AnalyticsEvent` rows are written only by `track(name, fields)`. Each event name has one zod payload schema and a `schemaVersion`. Payload schemas import the vocabularies the stamps already own (Prisma enums, the model catalogue keys, the 009 archetype keys) rather than copying them, so a new value cannot drift silently. A payload change only ever adds optional fields; a breaking change bumps `schemaVersion` (FR-02).

**Never fail the action, never hide the loss.** `track` is awaited with a 2 s bound and never throws into its caller in production. Every dropped or rejected event increments a per-name counter in a separate table, and the page shows it. Under the test seams a validation failure throws, so a drifting change fails its own tests (FR-02, FR-13).

**One emitter per event name.** Each event name has exactly one place that writes it (the table in FR-04). Shared functions that serve several surfaces gain an explicit `source` (`web`, `scheduler`, `mcp`), so nothing is counted twice and nothing is guessed from a null user.

**A per-action trace object carries data to the settle point.** The draft-action routes create an `ActionTrace` and pass it to `startDraftAction`, which stamps the start time and emits once at settle. The refine work fills in the classes, verdicts, attempts and verifier model as it runs (FR-05).

**Reads go through one query module.** The insights API calls `src/lib/analytics/queries.ts` only. Adopting an external backend later means replacing that module or dual-feeding it; the write wrapper alone is not enough, and this spec says so (NFR-08).

## Requirements

### Functional Requirements

- **FR-01 — The tables.** One additive migration creates:
  - `AnalyticsEvent`: `id` (cuid), `at` (timestamptz, default now), `name` (text), `schemaVersion` (int), `source` (`web` | `scheduler` | `mcp`, a Postgres enum `AnalyticsSource`), `teamId` (text), `userId` (text, null for scheduler and MCP), `draftId` (text, nullable), `durationMs` (int, nullable), `outcome` (text, nullable), `payload` (jsonb). Indexes: `(at)`, `(name, at)`, `(teamId, at)`, `(draftId)`.
  - **No foreign keys.** `teamId`, `userId` and `draftId` are plain strings, like `Post.teamId` and the `LegacyCaptionArchive` precedent, so the table never blocks a delete and never cascades by accident. Delete behaviour is explicit (FR-12).
  - `AnalyticsDrop`: `name` (text, primary key), `dropped` (int), `rejected` (int), `lastAt` (timestamptz), `lastReason` (text, at most 200 characters).
  - A manual down script `prisma/rollback/006-product-observability.down.sql` drops both tables and the enum and deletes the `_prisma_migrations` row.

- **FR-02 — The wrapper and the catalogue.** `src/lib/analytics/catalogue.ts` holds every event name with its zod payload schema and `schemaVersion`. `src/lib/analytics/track.ts` exports `track(name, fields)`:
  - `fields` = `{ source, teamId, userId, draftId?, durationMs?, outcome?, payload }`. The wrapper validates `payload` against the name's schema.
  - **Vocabularies are imported, not copied:** `z.nativeEnum` over the Prisma enums (`DraftAction`, `Channel`, `CaptionRoute`, `DesignMode`, `AspectRatio`), the model catalogue keys from `src/lib/models/`, and the 009 `ArchetypeKey` union from `src/lib/designData`.
  - **Bounded:** the insert races a 2 s timeout; on timeout the event counts as dropped.
  - **Never throws in production:** an invalid payload increments `AnalyticsDrop.rejected`, a failed or timed-out insert increments `AnalyticsDrop.dropped`, each with `lastReason`, and one `[analytics]` log line is written (no payload text). The counter write is itself best-effort.
  - **Throws under the test seams:** when `MOCK_AI` is true or `NODE_ENV` is `test`, an invalid payload throws `AnalyticsSchemaError`, so a unit or E2E run of a drifting change goes red.
  - **Rule for later changes (stated in the catalogue file header):** a payload change only adds optional fields; renaming or removing a field, or changing its meaning, bumps that event's `schemaVersion`, and the queries read by version.

- **FR-03 — Free text is capped and redacted.** The catalogue caps `instruction` at 2 000 characters and `failureReason` at 500 (longer values are cut, not rejected). Every `failureReason` passes through one shared `redactText` (moved out of `backgroundNotice.ts`'s `redactSkipDetail`, with the same rules: URLs, `sk-…` and `AIza…` keys, `key=…`, host:port) before `track`. No event stores prompt text or model output.

- **FR-04 — The server events (wave 1).** One emitter per event name:

  | Event                          | Emitted by (the only place)                                                                                                                                                           | Source                        | Outcome                                         | Payload (besides the common fields)                                                                                                                                                                                                                                                                                  |
  | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `generation.finished`          | `src/lib/agent/generateDraft.ts`: `runGenerationForDraft` (success and catch) and `generateDraftForBrief` (success and a catch that rethrows)                                         | the actor's new `source`      | `ok` \| `failed`                                | path (A/B), aspect ratio, caption model and route, design model and substitution, prompt version, requested and applied archetype and fallback reason (from the composition stamp), background skipped (bool), failure reason (redacted). Duration from function entry. `draftId` null for a failed sync generation. |
  | `generation.swept`             | `recoverIfStuck` in `src/app/api/drafts/[id]/route.ts`, when it fails a stuck generation                                                                                              | `web`                         | `failed`                                        | age in ms (`now - createdAt`)                                                                                                                                                                                                                                                                                        |
  | `draft_action.settled`         | `startDraftAction` in `src/lib/drafts/draftActions.ts`, at its single settle point                                                                                                    | `web`                         | `ok` \| `not-applied` \| `conflict` \| `failed` | action (`DraftAction`), model and substitution; for `REFINE`: instruction (capped), per-attempt classes, effective classes, verdicts, attempts, refine and verifier call counts, verifier model id and `VERIFIER_PROMPT_VERSION`; failure reason (redacted). Duration from `startDraftAction` entry.                 |
  | `draft_action.swept`           | `recoverIfStuck`, when it releases a stuck action                                                                                                                                     | `web`                         | `failed`                                        | action                                                                                                                                                                                                                                                                                                               |
  | `revision.edited`              | `inline-edit/route.ts`, both modes                                                                                                                                                    | `web`                         | `ok`                                            | mode (`document` \| `element`)                                                                                                                                                                                                                                                                                       |
  | `revision.override`            | the refine route's Override branch                                                                                                                                                    | `web`                         | `ok`                                            | —                                                                                                                                                                                                                                                                                                                    |
  | `revision.adopted`             | `rejected/[revisionId]/adopt/route.ts`                                                                                                                                                | `web`                         | `ok`                                            | —                                                                                                                                                                                                                                                                                                                    |
  | `revision.restored`            | `revisions/[rev]/restore/route.ts`                                                                                                                                                    | `web`                         | `ok`                                            | from and to revision numbers                                                                                                                                                                                                                                                                                         |
  | `publish.settled`              | one helper `trackPublish` in `src/lib/publish/`, called at each place an outcome is decided: `createAndPublishPost`, `posts/[id]/publish/route.ts`, the three `jobRunner.ts` branches | `web` \| `mcp` \| `scheduler` | `published` \| `failed` \| `retry-scheduled`    | channel, terminal (bool), retry count, error reason (redacted)                                                                                                                                                                                                                                                       |
  | `scheduled_generation.settled` | `src/lib/scheduler/generationRunner.ts`, at COMPLETED, retry and FAILED                                                                                                               | `scheduler`                   | `completed` \| `retry` \| `failed`              | retry count, error reason (redacted)                                                                                                                                                                                                                                                                                 |
  - `GenerationActor` gains `source: 'web' | 'scheduler' | 'mcp'`; its three callers pass it (`backgroundGeneration.ts` web, `generationRunner.ts` scheduler, `mcp/tools/generate.ts` mcp). `createAndPublishPost` gains `source`; its callers pass it (`posts/route.ts` web, `mcp/tools/publish.ts` mcp). ACP has no generate or publish caller today (its file is a manifest only), so it emits nothing.
  - **No event is emitted twice for one operation,** and every outcome is emitted, including `failed`, `not-applied`, `conflict` and the swept cases.

- **FR-05 — The refine trace.** The refine route creates an `ActionTrace`, passes it to `startDraftAction` (a new argument for all three actions), and the refine work fills it:
  - `runRefineAttempts`'s `accepted` result gains the per-attempt diagnostics it already computes (`classes`, `effectiveClasses`, `verdict`, `reasons` count) so they reach settle on success, as they already do on `not-applied`.
  - The verifier model id is the one `internalModel('INTERNAL_VERIFIER', mode)` resolves, recorded by the route. `refineVerify.ts` gains an exported `VERIFIER_PROMPT_VERSION` constant; **the verifier prompt text is unchanged.**
  - A conflict settle records `outcome: 'conflict'`.
  - **"Applied" = `draft_action.settled` with `action: REFINE` and `outcome: ok`.** Undo, restore, adopt and override are their own events, so "kept in the final post" can be derived later and is not computed here.

- **FR-06 — Duration.** `durationMs` is measured from the emitter's own start: `startDraftAction` entry for actions, `runGenerationForDraft` / `generateDraftForBrief` entry for generation, the publish attempt's start for publish. A swept action has no duration (`null`). `Draft.updatedAt` is never used.

- **FR-07 — Test seam for events.** `GET /api/test/analytics-events` (optional `name`, `draftId` filters) returns recent events and `DELETE` clears them; `POST /api/test/analytics-events` seeds rows with a given `at` (for retention tests). Gated like `model-calls`: 404 in production, 404 unless `MOCK_AI`, admin only.

- **FR-08 — Wizard events (wave 2).**
  - `wizard.step` (client): the brief wizard posts the step index it reached when the user moves forward (`useBriefWizard.ts` step changes). Payload: step (0 to 4), the brief draft id if one exists.
  - `brief.submitted` (server): `POST /api/briefs` after the brief is created. Payload: path, aspect ratio, image style, whether it came from a resumed brief draft.
  - `brief.abandoned` (server): emitted when a brief draft is deleted without a Generate — by the 7-day TTL sweep (`sweepExpiredBriefDrafts`) with reason `expired`, or by a Discard (`DELETE /api/brief-drafts/[id]` without `keepImages`) with reason `discarded`. Payload: the last step from the draft's payload.
  - **`POST /api/events`** (`withTeamAuth`): accepts only the client list (`wizard.step`); sets `teamId`, `userId` and `source: 'web'` from the session and ignores any such field in the body; accepts a brief draft id only if it belongs to the caller; body at most 2 KB; at most 60 events per user per minute (an in-process window), the excess dropped and counted in `AnalyticsDrop`.

- **FR-09 — Token counts (wave 3).** An `AsyncLocalStorage` usage accumulator (beside the auth context) is opened by each emitter that reports tokens (generation and draft actions). `createMessage` adds `message.usage.input_tokens` and `output_tokens` to it. The CLI text path reports no usage (plain-text output), so CLI-mode events carry `inputTokens: null` and `outputTokens: null`, meaning "not reported". **The CLI output mode and its parser are not changed.** The page shows token totals over reported events only, beside the share of events with no usage.

- **FR-10 — The insights page.** `/admin/insights`, super admin only (an in-page `GateNotice` gate like `/admin/users`, the `withSuperAdmin` API `GET /api/admin/insights?range=7d|30d|90d`, and a `superAdminOnly` "Insights" nav item). Global across teams. Every number comes from `src/lib/analytics/queries.ts`. Sections, one per decision:
  1. **Did 004 work:** refine applied rate (`ok` ÷ settled REFINE) per instruction class and overall, by week, split by verifier model and verifier prompt version; counts of override, adopt and restore beside it.
  2. **Catch regressions:** generation and draft-action failure rate per day, by prompt version and by design model; the top 10 failure reasons in the range with counts; swept counts.
  3. **009 image styles:** per requested style: generations, applied-as-requested rate, fallback reasons, and the mean number of refines per draft.
  4. **Model and route choices:** p50 and p90 duration by surface (generation, each action) and model and route; token totals (wave 3) with the not-reported share.
  - Plus (wave 2) **the wizard funnel:** briefs that reached each step, submitted, abandoned (expired vs discarded).
  - Plus, always: **activity per team** (events and generations per team in the range), **events lost** (`AnalyticsDrop` dropped and rejected per name, last reason), and **retention health** (the oldest event's age and the retention loop's last tick).
  - Charts are tables and bars built from the `src/components/ui/` atoms (no charting library; none is installed).

- **FR-11 — Retention.** A third worker loop, `retention`, runs through `runTick` every 60 s like the others. Each tick runs `DELETE FROM "AnalyticsEvent" WHERE id IN (SELECT id … WHERE at < now() - interval '180 days' LIMIT 5000)`; the cutoff is computed in SQL only and takes no input. One indexed query per minute replaces a once-a-day gate, so no gate state is stored. The loop is **not** added to 023's `HeartbeatLoop` or the status route's `LOOPS` (it would trip the 3-minute offline rule and the "Scheduler offline" banner); its health is shown on the insights page instead (FR-10). The page never deletes.

- **FR-12 — Deletes and purge.**
  - **Team delete** (`DELETE /api/admin/teams/[id]`, a soft delete today) also deletes that team's `AnalyticsEvent` rows in the same transaction.
  - **Draft delete** (`DELETE /api/drafts/[id]`) sets `draftId` to null on that draft's events in its existing transaction; the events stay.
  - **User deactivation** changes nothing (events stay; users are never hard-deleted).
  - **Purge script** `scripts/purge-analytics.mjs --team <id> | --user <id> | --draft <id> [--dry-run]` deletes matching events. It refuses to run without an explicit `DATABASE_URL` in the environment and prints the database name and the count before deleting.

- **FR-13 — Coverage guard.** `tests/unit/analyticsCoverage.test.ts` fails if a `DraftAction` value, a `Channel` value or a `source` value has no catalogue event that can carry it, and if any catalogue payload declares its own string list where an imported vocabulary exists. The catalogue header states that a change adding an action, a channel, a generation path or a publish path owns its events.

### Non-Functional Requirements

- **NFR-01: the action is unaffected by analytics.** With `track` failing (insert throws or times out), every action returns the same result and writes the same domain rows as without analytics. `track` adds at most 2 s in the worst case and is otherwise one indexed insert.
- **NFR-02: no generation behaviour changes.** No prompt text changes (`PROMPT_VERSION` stays `2026-10-21.1`; the verifier prompt text is unchanged and only gains a version constant). No model call is added.
- **NFR-03: additive schema.** One migration, two new tables and one enum; no existing column changes. A down script exists.
- **NFR-04: privacy.** Events hold ids, enums, counts, durations, redacted failure reasons and the refine instruction (capped). Never prompt text, model output, keys, captions or headline text.
- **NFR-05: access.** Only super admins read events (page and API). Editors and team admins get the existing gate (page) and 403 (API). No event read route exists outside `/api/admin/insights` and the test seam.
- **NFR-06: volume.** Measured, not asserted: the largest flow (a generation, 5 refines, 2 restores, 2 publishes) writes about 10 to 12 rows of under 3 KB each. The unit test of the catalogue asserts the largest valid payload is under 4 KB.
- **NFR-07: design system.** The page uses `src/components/ui/` atoms and Graphite tokens only; `uiTokenGuard.test.ts` passes with no new `// ui-exception`.
- **NFR-08: the read seam.** Reads go only through `queries.ts`. The docs say plainly that adopting PostHog later means replacing or dual-feeding that module.
- **NFR-09: shared databases.** No prisma or DB command without an explicit `DATABASE_URL` for `bistec_studio_test` or a named scratch database. `bistec_studio` is never touched.
- **NFR-10: no real model calls** in any test or gate.

## Acceptance Criteria

- **AC-01 (FR-01, NFR-03): the migration.** The migration creates `AnalyticsEvent`, `AnalyticsDrop` and `AnalyticsSource` with the listed columns and indexes and no foreign key; on a scratch database it deploys, the down script reverts it, it re-applies, and `prisma migrate diff --exit-code` is clean. `git diff --name-only <base> -- prisma/migrations` lists only the new migration.
- **AC-02 (FR-02): the wrapper.** Unit: a valid event writes one row; an invalid payload in production mode writes no event row, increments `rejected` and does not throw; under `MOCK_AI` it throws `AnalyticsSchemaError`; an insert that hangs past 2 s returns within 2.1 s and increments `dropped`; a failing counter write does not throw.
- **AC-03 (FR-02, FR-13): vocabularies are imported.** The coverage test passes, and a planted copy of a `Channel` list in a catalogue schema makes it fail (asserted on a fixture, not by editing the catalogue).
- **AC-04 (FR-03, NFR-04): caps and redaction.** An instruction of 5 000 characters is stored at 2 000; a failure reason containing `sk-abc…` and a URL is stored redacted; no event payload in the E2E run contains the brief description, a caption, the headline or HTML (asserted on every event the suite collects).
- **AC-05 (FR-04): one event per operation, every outcome.** E2E with the seam: a web generation writes exactly one `generation.finished` `ok`; a failing generation (the existing failure sentinel) writes one `failed` with a redacted reason; a refine writes exactly one `draft_action.settled` per outcome for `ok`, `not-applied` (the 004 sentinel) and `conflict`; regenerate design and regenerate copy write one each; a scheduled generation writes one `generation.finished` with `source: scheduler` and one `scheduled_generation.settled`; an MCP-style sync generation (unit) writes one with `source: mcp`; a publish writes one `publish.settled` per channel attempt; inline edit, override, adopt and restore write one event each. No operation writes two events of the same name.
- **AC-06 (FR-05): the refine trace.** For an applied refine, the event holds the instruction, at least one attempt with classes and verdict `pass`, the verifier model id and `VERIFIER_PROMPT_VERSION`; for a not-applied refine, the attempts hold the `miss` verdicts. The verifier prompt string is unchanged (golden test).
- **AC-07 (FR-06): durations.** Every `generation.finished` and `draft_action.settled` has `durationMs > 0`; swept events have `durationMs` null.
- **AC-08 (NFR-01): failure isolation.** With `track` forced to fail (unit, the insert rejects; E2E, a seam that makes the next N inserts throw), a generation, a refine and a publish still reach the same final status and rows, and `AnalyticsDrop.dropped` grew.
- **AC-09 (FR-08): wizard events and the client route.** Moving forward through the wizard writes one `wizard.step` per step reached; Generate writes `brief.submitted`; Discard writes `brief.abandoned` reason `discarded` with the last step; an expired brief draft (seeded old) swept on the dashboard read writes `brief.abandoned` reason `expired`. `POST /api/events` ignores a body `teamId`/`userId`, rejects a name outside the client list (400), rejects a body over 2 KB (413), and drops the 61st event in a minute (counted in `AnalyticsDrop`); no session is 401.
- **AC-10 (FR-09): tokens.** Unit: an API-mode action whose two `createMessage` calls report usage records the summed tokens; a CLI-mode action records null tokens; the page's token total excludes null events and shows the not-reported share.
- **AC-11 (FR-10, NFR-05): the page.** As a super admin the page shows the four decision sections, events lost and retention health, with numbers equal to a hand count over the seeded events (E2E seeds a known set through the seam and compares each figure). An editor and a team admin see the gate; the API returns 403 to them and 401 with no session.
- **AC-12 (FR-10): the applied rate is checkable.** For a seeded week, the page's applied rate per class equals `ok ÷ (ok + not-applied)` computed by hand from the seeded rows, and the split by verifier model shows two lines when two verifier ids are seeded.
- **AC-13 (FR-11): retention.** Seeded rows at 181 and 179 days: after one retention tick the 181-day rows are gone and the 179-day rows remain; a tick with 12 000 old rows deletes at most 5 000; the page shows the oldest event's age; `HeartbeatLoop` and the status route's `LOOPS` are unchanged (`git diff`), and the "Scheduler offline" banner is not shown because of the retention loop.
- **AC-14 (FR-12): deletes and purge.** Deleting a draft leaves its events with `draftId` null; soft-deleting a team removes its events and no other team's; the purge script with `--dry-run` deletes nothing and prints the count, without `DATABASE_URL` it exits non-zero.
- **AC-15 (NFR-02): generation untouched.** `PROMPT_VERSION` is `2026-10-21.1`; `git diff --name-only <base> -- src/lib/agent/prompts` is empty; the verifier prompt golden test passes; no model call is added (the existing `model-selection` and refine E2E suites, which assert the recorder's calls per flow, pass unchanged, and no `src` change adds a `createMessage`, `runClaudeCli` or `recordModelCall` call site).
- **AC-16 (NFR-07): design system.** `uiTokenGuard.test.ts` passes with no new `// ui-exception`; screenshots of the page at 390 px and 1440 px, light and dark, show no horizontal scroll and visible focus.
- **AC-17 (gate): nothing regressed.** tsc clean; lint 0 errors / 7 warnings; unit 3147 plus the new cases; render 47/47; build passes; `test:upgrade` passes; full clean mock E2E 442/3/0/0 plus the new section AD cases; CI green on `v2`.

## Edge Cases

- **The database is down:** the action fails on its own domain writes as today; `track` times out or throws inside, is swallowed and counted (best-effort).
- **A generation fails before models resolve:** the event carries the fields it has; model fields are null.
- **A sync generation (scheduler, MCP) fails:** no draft exists; `draftId` is null and the event still counts toward the failure rate.
- **A refine is swept as stuck:** one `draft_action.swept`, no `draft_action.settled` (the settle never ran); if the original run settles later, its guarded settle is lost (019) and emits nothing, because emission happens only after a successful settle write.
- **Override after a conflict:** the conflict settle writes `draft_action.settled` `conflict`; the later Override writes `revision.override`.
- **A user leaves the wizard without a brief draft** (nothing typed): no `brief.abandoned` (there is nothing to expire); the funnel counts it only through `wizard.step`.
- **Clock skew:** `at` is set by the database default, not the app clock.
- **A team is soft-deleted, then a late worker run emits for it:** the late event is written (the team id is a plain string); it is removed by the next purge or by retention.

## Assumptions

- **A1:** users are never hard-deleted and teams only soft-delete (verified: no `user.delete` or `team.delete` in `src`), so plain-string ids are safe.
- **A2:** the stuck sweep is lazy (on draft read), so a stuck action is recorded only when someone reads the draft; an unread stuck draft is never swept, as today.
- **A3:** the CLI's plain-text output carries no usage; reading it would need `--output-format json` and a parser change, which this change does not make (FR-09).
- **A4:** event volume is small (NFR-06); no partitioning is needed.
- **A5:** `.env.test` runs API mode (`DESIGN_PROVIDER=claude-html`) with `MOCK_AI`; E2E reaches every emitter through the existing seams.

## Open Questions

None blocking. The panel's upheld findings are answered in this spec (the FR each lands in is named in `design.md` → "Panel findings").

## Dependencies

- **Hard:** 004 (the refine pipeline and its diagnostics), 008 (the model catalogue and `internalModel`), 009 (the composition stamp), 019 (the claim token and guarded settle), 023 (the worker, `runTick`), 024 (the caption route). All VERIFIED PASS on `v2`.
- **Follow-ups (proposals, not built here):** the stale-headline badge (split out by the user, 2026-10-23); CLI token usage (needs a CLI output-mode change); "kept in the final post" refine metric; an external analytics backend behind `queries.ts`.

## Out of scope

- PostHog, ClickHouse or any external analytics service; session replay in any form.
- Prompt text, model output, captions or headlines in events.
- A team-admin or tenant-facing view.
- Money: prices, cost, billing.
- The stale-headline badge (its own change).
- Changing the CLI output mode to read usage.
- Acting on what the data shows.
- The scheduler heartbeat (done by 023) and fixing B4.
