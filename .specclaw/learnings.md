# Learnings: brief-draft-recovery

Build learnings, spec gaps, and patterns discovered.

**Categories:** spec_gap | design_gap | pattern | best_practice | agent_issue

---

## [L1] design_gap — Files src/lib/brief/briefDraftPayload.ts (client-safe sch...

**When:** 2026-07-13 13:08 UTC
**Category:** design_gap
**Priority:** low
**Status:** pending

### Detail

Files src/lib/brief/briefDraftPayload.ts (client-safe schema split) and src/components/ui/StatusChip.tsx (unfinished variant) were modified but not declared in tasks

### Action

Declare shared-UI/type files when a task adds a new visual status or a client/server module split

---

## [L2] pattern — Unauthenticated API asserts must use maxRedirects:0 — the...

**When:** 2026-07-13 13:08 UTC
**Category:** pattern
**Priority:** low
**Status:** pending

### Detail

Unauthenticated API asserts must use maxRedirects:0 — the auth proxy redirects /api/* to /login before withAuth can 401 (same as TC-AUTH-07)

### Action

Reuse the TC-AUTH-07 redirect assertion pattern for new routes

---

## [L3] design_gap — T1 declared src/lib/agent/pathB.ts but the data-URI filte...

**When:** 2026-07-17 09:36 UTC
**Category:** design_gap
**Priority:** medium
**Status:** pending

### Detail

T1 declared src/lib/agent/pathB.ts but the data-URI filter belongs in prompts/pathB.ts (the single join-point, unit-testable without DB) — file declaration was one layer off

### Action

When declaring files for prompt-level guards, point at the prompt builder, not the orchestrator

---

## [L4] design_gap — Converting sync routes to 202 broke existing E2E suites (...

**When:** 2026-07-17 09:36 UTC
**Category:** design_gap
**Priority:** medium
**Status:** pending

### Detail

Converting sync routes to 202 broke existing E2E suites (agui-refinement, TC-REG-H7a) not listed in task files — contract-change blast radius on tests was underdeclared

### Action

When a task changes an API contract, enumerate every test suite asserting the old contract in the task's file list

---

## [L5] best_practice — .env.test lost BISTEC_API_KEYS during the MinIO credentia...

**When:** 2026-07-17 09:36 UTC
**Category:** best_practice
**Priority:** low
**Status:** pending

### Detail

.env.test lost BISTEC_API_KEYS during the MinIO credential rotation, silently skipping 3 ACP-auth E2E cases

### Action

After rotating credentials in .env, diff .env.test against the CI workflow env to catch dropped keys

---

## [L6] design_gap — Files modified outside task declarations: briefs/route.ts...

**When:** 2026-10-02 02:54 UTC
**Category:** design_gap
**Priority:** low
**Status:** pending

### Detail

Files modified outside task declarations: briefs/route.ts + providers/available/route.ts (T1-review items carried to T3), claudeAuth.ts + .env.example (T4-review follow-ups in T6), designAgent.ts (T7 aspect threading), tests/e2e/path-a.test.ts (TC-GEN-05 stub lived there), team-image-default.test.ts (T3 suite), docs/e2e-test-plan.md (catalog). All controller-ruled.

### Action

When a review carries items forward, add the files to the receiving task's Files list in tasks.md at the same time

---

## [L7] spec_gap — Spec edge case 'base64 images count against the 600k prom...

**When:** 2026-10-02 02:54 UTC
**Category:** spec_gap
**Priority:** medium
**Status:** pending

### Detail

Spec edge case 'base64 images count against the 600k prompt guard' caused a regression: ordinary 1-2 MB reference images were refused in CLI vision. Images cost by pixels, not base64 length.

### Action

Size guards for multimodal payloads: text-only char limit + separate per-image and total byte caps; test with a realistic image size

---

## [L8] best_practice — Auth-failure classification must never read model-written...

**When:** 2026-10-02 02:54 UTC
**Category:** best_practice
**Priority:** high
**Status:** pending

### Detail

Auth-failure classification must never read model-written text: in stream-json mode the no-result branch fed assistant text into isClaudeAuthFailure and coerced exit 0 to null, so a '401' in a reply (e.g. a phone number on a reference image) would mark a good personal token INVALID. Fixed by classifying on structured api_error_status (401, or 403 + CLI-written 'OAuth token revoked' text) only.

### Action

Any classifier that changes account state must read only CLI/system-authored fields; add regression cases with hostile model text

---

## [L9] agent_issue — Two controller rulings were wrong and caught only by the ...

**When:** 2026-10-02 02:54 UTC
**Category:** agent_issue
**Priority:** medium
**Status:** pending

### Detail

Two controller rulings were wrong and caught only by the next review: FR-02/FR-03 default rules applied to COPY (CLI-mode copy could switch providers); refine 'resolves first' rippled into writers/tests. Reviews after each fix round paid for themselves.

### Action

Scope every behavioural ruling to the slot/path it was written for, and ask the reviewer to check rulings for ripple effects

---

## [L10] best_practice — Anthropic now recommends the native installer (irm https:...

**When:** 2026-10-02 02:54 UTC
**Category:** best_practice
**Priority:** low
**Status:** pending

### Detail

Anthropic now recommends the native installer (irm https://claude.ai/install.ps1 | iex; curl -fsSL https://claude.ai/install.sh | bash) over winget; winget-cli#6200 is still open with no workaround.

### Action

Verify install commands against the vendor's current page at build time rather than trusting the proposal

---
