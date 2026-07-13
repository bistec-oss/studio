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
