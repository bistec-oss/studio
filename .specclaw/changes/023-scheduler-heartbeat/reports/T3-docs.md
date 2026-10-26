# T3 docs half: edits

Docs only. No src, tests, prisma, npm, DB or docker. Nothing committed. The literal placeholders `E2E_PENDING` and `CI_PENDING` are left for the orchestrator.

- `docs/handoff.md`: date line leads with 023 BUILT; a 023 row in "Where things stand"; a 023 bullet (T1, T2, T3, gate) before the 019 bullet; "Next" line (verify 023, then 009 Phase 1) and the gates line (unit 2706/2706, lint 0/7, E2E placeholder); the 023 line in "Check before the merge" (additive migration `20261021120000_worker_heartbeat`, down script, post-deploy banner check, not blocking).
- `CLAUDE.md`: "updated 2026-10-21" and the pick-up headline (023 built, verify next, then 009 Phase 1); a 023 entry under "Where things stand" (T1 `708c80e`, T2 `f43669a`, CI placeholder); the gates line; the B4 hardening bullet marked BUILT by 023, with the `:131` pointer replaced by `:184` and the banner noted as the quick B4 signal.
- `docs/scheduler-b4-diagnosis-2026-08-03.md`: "Check the banner first (since 023)" paragraph before "The symptom".
- `docs/e2e-test-plan.md`: section Z (TC-HB-01..06, AC-to-case table, the unit-test note) before section 7; the `POST /api/test/worker-heartbeat` seam in the seam notes.
- `.specclaw/ROADMAP.md`: title and "Updated" date; new 2026-10-21 status banner (earlier ones kept as superseded); 011 row corrected; rows 013-022 added (AC counts: 013 7, 014 21, 015 8, 016 12, 017 6, 018 8, 019 9, 020 7, 021 19, 022 11; counts for 014-017 come from the verify reports or each spec's AC list); a 023 row (built); 006 row and the soft-dependency line say item 7 moved to 023.
