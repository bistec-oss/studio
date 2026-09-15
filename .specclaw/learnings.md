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

## [L6] spec_gap — AC-06 says a clean absence 'restores' the placeholder and...

**When:** 2026-09-15 15:36 UTC
**Category:** spec_gap
**Priority:** high
**Status:** pending

### Detail

AC-06 says a clean absence 'restores' the placeholder and commits, but the signature the plan mandates — reconcileInlineAssets(sentTokens, replyHtml) — has neither the sent HTML nor the assets map, so positional re-insertion of a dropped token is impossible. 'restored' therefore means 'reconciles as a clean subset, commits, dropped token named for logging', NOT 'the asset is put back'. The dropped asset is still absent from that render, exactly as today.

### Action

Do not claim AC-06 as auto-reinsertion in verify-report.md. True reinsertion needs the sent HTML in the signature and is the separate follow-up CLAUDE.md already names ('auto-reinsert is a candidate follow-up'). Brief T10 that 'restored' commits with the asset absent.

---

## [L7] pattern — Playwright 1.61 does not apply the tsconfig '@/*' alias t...

**When:** 2026-09-15 15:47 UTC
**Category:** pattern
**Priority:** high
**Status:** pending

### Detail

Playwright 1.61 does not apply the tsconfig '@/*' alias to imports made INSIDE src/ modules. It maps the alias for imports written in the test file, but src/lib/renderer/puppeteer.ts's own import of '@/lib/testHooks' fails with Cannot find module. Root cause: Playwright's CJS Module._resolveFilename hook (installCJSHooks) is installed only on the out-of-process-loader path; on Node >= 22.15 it takes the module.registerHooks branch and returns early, so the hook never installs. Verified on Node 24.16.

### Action

Any future E2E test that imports from src/ needs the 10-line Module._resolveFilename shim now in tests/e2e/helpers/rasterize.ts. Reuse it rather than rediscovering this.

---

## [L8] pattern — The E2E suite runs single-process (workers:1, fullyParall...

**When:** 2026-09-15 15:47 UTC
**Category:** pattern
**Priority:** medium
**Status:** pending

### Detail

The E2E suite runs single-process (workers:1, fullyParallel:false), so a test that mutates process.env.MOCK_AI/MOCK_PUPPETEER leaks into every suite that sorts after it. Six suites gate their skips on those vars and would have silently gone dark. T3 saves and restores them in a finally around its dynamic import, and asserts the restore happened.

### Action

Any test that flips a MOCK_* var must restore it in a finally and assert the restore, not just set it.

---

## [L9] design_gap — Two parallel Wave-2 agents (T5 table, T6 envelope parser)...

**When:** 2026-09-15 16:01 UTC
**Category:** design_gap
**Priority:** medium
**Status:** pending

### Detail

Two parallel Wave-2 agents (T5 table, T6 envelope parser) each independently declared the four instruction-class names, because T6 started before T5's module existed. That is exactly the second hand-maintained copy AC-19/FR-06 forbid. Both agents spotted it and flagged it; neither could fix it, since the other's file was outside its declared scope.

### Action

When a wave contains a task that DEFINES a vocabulary and another that CONSUMES it, either sequence them across waves or have the orchestrator reconcile immediately after the batch. Reconciled here by hand: refineEnvelope.ts now imports InstructionClass/INSTRUCTION_CLASS_KEYS/isInstructionClass from instructionClasses.ts.

---

## [L10] design_gap — T9 found a cross-machine laundering path the design's own...

**When:** 2026-09-15 16:08 UTC
**Category:** design_gap
**Priority:** high
**Status:** pending

### Detail

T9 found a cross-machine laundering path the design's own consumer enumeration missed: scripts/export-posts.mjs included revisions unfiltered, and scripts/import-posts.mjs re-creates each revision from a fixed column whitelist that excludes 'rejected'. An exported rejected row would arrive on the target machine with rejected=false and a NEGATIVE revisionNumber, pass the rejected-only CHECK constraint, and be indistinguishable from a chain revision — restorable, past every filter added in T9.

### Action

Fixed at the export side. Lesson: when enumerating consumers of a table, grep scripts/ and any serialization boundary too, not just src/. A column whitelist in an importer silently drops new flags, which turns any out-of-chain marker into a laundering path.

---

## [L11] design_gap — T9 modified two files no task declared: eslint.config.mjs...

**When:** 2026-09-15 16:08 UTC
**Category:** design_gap
**Priority:** low
**Status:** pending

### Detail

T9 modified two files no task declared: eslint.config.mjs (a no-restricted-syntax rule making direct prisma.draftRevision.find* a lint error, the enforced chokepoint tasks.md asked for) and scripts/export-posts.mjs (the laundering fix above). Both were necessary for the task's stated success criterion and were reported, not silently added.

### Action

Accepted. tasks.md asked to 'filter at the query helper where possible' but declared no file in which enforcement could live — declare the enforcement surface when a task's goal is to make forgetting impossible.

---

## [L12] design_gap — T10 and T12 ran in the same wave and collided invisibly. ...

**When:** 2026-09-15 16:31 UTC
**Category:** design_gap
**Priority:** high
**Status:** pending

### Detail

T10 and T12 ran in the same wave and collided invisibly. T10 discovered that buildMockHtml's output depends only on the first hex colour in the prompt, so under MOCK_AI a refine returns the draft's current HTML byte-identical — which, once verification landed, turns every mocked refine into not-applied and makes T12's forced-miss seam unreachable. T10 could not fix it (testHooks.ts was T12's file) and T12 had already finished without knowing. Orchestrator fixed it afterwards.

### Action

When a wave pairs a task that CONSUMES a mock with a task that EXTENDS the same mock, the consumer's assumptions about the stub must be in the extender's brief. Generally: a deterministic stub that ignores most of its input is safe until something starts measuring its output.

---

## [L13] spec_gap — The E2E suite cannot exercise ANY of this change's classi...

**When:** 2026-09-15 16:49 UTC
**Category:** spec_gap
**Priority:** high
**Status:** pending

### Detail

The E2E suite cannot exercise ANY of this change's classification logic. .env.test line 27 and .github/workflows/e2e.yml line 55 both set DESIGN_PROVIDER=claude-html, so isCliMode() is false and the refine route takes its API branch — which hardcodes classes=['add'], supersedes=[] on every refine regardless of wording. The envelope parser, resolveEffectiveClasses, and the remove/replace/constrain post-conditions are CLI-mode-only and unreachable from E2E, locally and in CI. Production runs CLI mode. So the suite is green against a code path prod never takes.

### Action

Do not read a green E2E run as evidence that classification works. AC-08/09/10/11/12/13 need one real CLI-mode run. This is the same masking pattern CLAUDE.md already records for PR #40 ('a green E2E suite missed it' because a seed row made the gate pass) — worth generalising: whenever a config value in .env.test differs from prod, list what that difference makes untestable.

---
