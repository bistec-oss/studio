# Proposal: Product observability

**Created:** 2026-09-15
**Status:** 🟡 Draft

## Problem

Nobody can see what happens inside bistec-studio. Every quality problem so far has been found by a human noticing something, and the delay has been measured in days or weeks.

**The product has no usage telemetry at all.** The only evidence that editing is frustrating is one tester's email. There is no data on where users abandon the brief wizard, how many refines it takes to reach an acceptable post, which instructions fail, or which teams have stopped using the tool. Proposal **004** fixes the refine defects Maleesha reported — but without instrumentation there is no way to know whether the fix worked, or whether other instruction classes fail just as often and simply were not emailed in.

**Generation failures are invisible in aggregate.** Individual failures write `Draft.failureReason` and log lines, but nothing aggregates them. A systematic regression — a bad `PROMPT_VERSION`, a provider degrading, a font missing — looks like scattered one-off complaints.

**The scheduler has no heartbeat.** B4 (the scheduled-generation worker not running) went undetected for roughly 11 days and was eventually found by watching a database row fail to change. CLAUDE.md records the recommended hardening and it was never built: a `WorkerHeartbeat` per poll loop, a "Scheduler offline" banner when the newest tick is older than 3 minutes, and showing `errorReason` while an entry is still retrying (`ScheduledQueueSection.tsx:131` currently gates it on `FAILED` only). B4 stayed invisible not because it was subtle but because nothing self-reports.

**An edited caption silently disagrees with its rendered image.** The 2026-07-28 fix correctly stopped a copy edit from clobbering `Draft.status`, and deliberately left the _"your export predates this copy"_ signal to the UI. That nudge was never built, so the drift is real and unsignalled.

## Proposed Solution

Stand up self-hosted PostHog and instrument the product, then give admins a place to read it.

1. **Self-hosted PostHog**, deployed alongside the existing stack so user behaviour and client campaign content never leave Bistec infrastructure. This is the deliberate trade: heavier operations (PostHog requires ClickHouse in addition to the existing Postgres) in exchange for tenancy-safe analytics, which matters with Hearts Academy as a separate tenant.
2. **Product analytics events** — wizard step completion and abandonment, generate / refine / regenerate / publish actions, funnel drop-off. Answers "where do users give up".
3. **AI generation traces** — per generation and per refine: prompt version, model, path A/B, duration, cost, retry count, success/failure, the refine instruction, and whether it was satisfied. This is what turns 004's fix from an assertion into a measurement, and what would have made Maleesha's report a dashboard rather than an email.
4. **Error and failure telemetry** — failed generations with `failureReason`, stuck `pendingAction`, timeouts, render anomalies and scheduler misses, surfaced as trends.
5. **Session replay** with masking rules, so pain points can be observed directly.
6. **An admin analytics view** inside the product, so usage and pain points can be read without a PostHog login.
7. **Scheduler self-reporting** — `WorkerHeartbeat` per loop, a "Scheduler offline" banner when the newest tick is >3 min old, and `errorReason` shown while an entry is still retrying.
8. **A stale-export indicator** on drafts whose copy has been edited since the export was rendered.

All event emission goes through an internal wrapper rather than calling PostHog directly at each call site, so the backend can be replaced without touching instrumentation.

## Scope

### In Scope

- Self-hosted PostHog deployment (PostHog + ClickHouse) and its operational documentation
- An internal analytics wrapper; no direct vendor calls at call sites
- Product analytics events across the brief wizard, draft actions and publishing
- AI generation traces, including refine instruction and outcome
- Error/failure telemetry
- Session replay with masking rules, retention policy and a consent position
- An in-product admin analytics view
- `WorkerHeartbeat` model + migration, scheduler offline banner, `errorReason` while retrying
- Stale-export indicator on the draft page

### Out of Scope

- Acting on what the analytics reveal — this change measures, it does not tune
- Replacing existing application logging
- Billing or cost-allocation reporting built on the cost field
- Customer-facing analytics for tenants
- Fixing B4 itself — that is a Coolify resource configuration issue, already diagnosed as not-code in `docs/scheduler-b4-diagnosis-2026-08-03.md`. This change makes the **next** such outage self-reporting.

## Impact

- **Files affected:** ~25–40 (estimated) — plus new infrastructure (compose services), one migration, and instrumentation spread across wizard, draft, publish and scheduler paths
- **Complexity:** large — the biggest of the four proposals, mostly because of the infrastructure and the privacy surface rather than the application code
- **Risk:** medium-high. Session replay captures whatever is on screen, including client campaign material, which makes masking rules a correctness requirement rather than a nicety. Self-hosted PostHog adds ClickHouse to the operational footprint of a stack that currently has one database. Instrumentation itself is low-risk and additive.

## Decisions

- **Analytics view access — decided 2026-09-15.** **Super-admin only, global.** The view is unscoped: one query across all teams, no row-level tenant filtering. Team admins get no analytics visibility into their own team. This is simpler to build than a scoped view and preserves cross-team trend detection, at the cost of team admins having no self-service usage data.
- **Session replay — decided 2026-09-15.** **Full capture, disclosed to staff with opt-in consent.** No masking rules; replay records the screen as-is, including draft previews and client campaign material.
  - **Prerequisite, not optional:** full capture records Hearts Academy's brand and campaign content, so their agreement is required as a tenant before replay is enabled for any team carrying their data. Bistec's own consent does not cover another tenant's material. The build must therefore gate replay per-team rather than enabling it globally at deploy.
  - Retention must be set explicitly before launch — full capture with no masking makes storage growth and the standing privacy liability materially larger than a masked configuration would.

## Open Questions

- **Retention period for full-capture replay?** Drives ClickHouse sizing and the length of the privacy exposure. Needs a number before deployment, not after.
- Should AI generation traces record the **full prompt and output**? Enormously useful for debugging quality, but it means brand voice prompts and generated client copy land in the analytics store.
- Does the heartbeat need its own table, or can it reuse an existing row? A dedicated `WorkerHeartbeat` is cleaner but adds a migration.
- Should the stale-export indicator merely inform, or offer a one-click re-export?

---

**To proceed:** Review this proposal and approve to begin planning.
