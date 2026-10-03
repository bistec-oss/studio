# Tasks: Provider flexibility and onboarding

**Change:** 005-provider-flexibility-onboarding
**Created:** 2026-10-01
**Total Tasks:** 10

## Summary

There are 10 tasks in 4 waves. All the work lands on `v2`. Each wave is one item and reverts on its own (NFR-04).

| Wave | Item   | Content                                           |
| ---- | ------ | ------------------------------------------------- |
| 1    | Item 3 | Resolution, the background notice, the mock seams |
| 2    | Item 5 | CLI hardening                                     |
| 3    | Item 4 | Gemini                                            |
| 4    | Item 1 | Onboarding                                        |

**Cross-wave dependencies:**

- Wave 3 needs Wave 1's capability module and background seam.
- Waves 2 and 4 are independent of the others.
- Wave 1 carries the change's only migration.

**Operator step:** **T6 needs a real Claude OAuth token**, supplied at `docker run` time, to prove AC-16 in the built image. Claude never handles the value. This is the only task that can't finish unattended.

## Tasks

### Wave 1 — Item 3: image provider resolution

- [x] `T1` — Capability module, resolver fallback, provider-route rules, key-validation seam
  - Files: `src/providers/imageCapabilities.ts` (new), `src/providers/registry.ts`, `src/app/api/admin/providers/route.ts`, `src/app/api/admin/providers/[id]/route.ts`, `src/lib/testHooks.ts`, `tests/unit/imageProviderResolution.test.ts`, `tests/unit/imageCapabilities.test.ts` (new), `tests/e2e/provider-registration.test.ts`
  - Estimate: medium
  - Kind: impl
  - Notes:
    - **Covers:** FR-01 to FR-04, plus NFR-06's `mockProviderKeyValidation`.
    - **The module holds:** `IMAGE_PROVIDERS`, `SLOT_PROVIDERS` and `pickServingImageProvider(rows)`, a pure function with the same rule as resolver tiers 3 and 4. Leave a placeholder for the size map, which T7 fills in.
    - **Resolver changes:** tier 4 orders by `createdAt asc, id asc`; tiers 2–4 gain the compat filter.
    - **Routes:**
      - POST and PATCH return 400 for an incompatible slot/provider;
      - the first enabled row in a slot becomes the default;
      - disabling the default clears its `isDefault`;
      - both validation calls are wrapped in the seam.
    - **ACs:** AC-01 (unit half), AC-02 to AC-06.
    - **Existing TC-PROV cases:** they already accept 201, so confirm they stay green under the seam.

- [x] `T2` — Skip reasons, the draft notice, the background mock seam
  - Files: `src/lib/agent/background.ts`, `src/lib/agent/pathB.ts`, `src/lib/agent/generateDraft.ts`, `src/app/api/drafts/[id]/regenerate-design/route.ts`, `src/app/api/drafts/[id]/refine/route.ts`, `src/lib/drafts/revisions.ts`, `src/lib/drafts/backgroundNotice.ts` (new), `src/app/api/drafts/[id]/route.ts`, `src/lib/api-types.ts`, `src/components/drafts/BackgroundNotice.tsx` (new), `src/app/(app)/drafts/[id]/page.tsx`, `src/lib/testHooks.ts`, `prisma/schema.prisma`, `prisma/migrations/<ts>_draft_background_skip/`, `tests/unit/background.test.ts`, `tests/e2e/background-notice.test.ts` (new), `tests/e2e/path-b.test.ts`
  - Estimate: large
  - Kind: impl
  - Depends: T1
  - Notes:
    - **Covers:** FR-06, FR-07, NFR-02 and NFR-06's background seam (`__MOCK_BG__`, `__MOCK_BG_FAIL__`, `__MOCK_BG_NOT_NEEDED__`).
    - **Seam rules:** provider resolution must run for real under the seam, and the fixture replaces only `generateImage`, after resolution.
    - **Reasons:** the outer catch picks the reason from a stage variable, never by parsing the error message.
    - **Migration:** two nullable TEXT columns, with the down path in a header comment.
    - **Refine:** it writes the skip only per FR-07's refine rule. Touch none of 004's verify or attempt logic.
    - **Un-skip TC-GEN-05**, and rewrite it on the seam.
    - **ACs:** AC-01 (E2E half), AC-08 to AC-12.
    - **Gate:** a full clean mock E2E run with 0 failed and 0 flaky, and no existing case changing outcome.
    - **UI:** amber, `role="status"`; follow `DESIGN_SYSTEM.md`. Take light and dark screenshots.

- [x] `T3` — Explicit IMAGE default in /team
  - Files: `src/app/(app)/team/page.tsx`, `tests/e2e/provider-registration.test.ts` (or `team-settings.test.ts`)
  - Estimate: small
  - Kind: impl
  - Depends: T1
  - Notes:
    - **Covers:** FR-05.
    - **Three states, using `pickServingImageProvider`:**
      - the default row;
      - "Teammates are using <label> (no default set)" with Make default;
      - "No image provider — teammates without a personal OpenAI key get no AI backgrounds".
    - **Light and dark screenshots.**
    - **AC:** AC-07.

### Wave 2 — Item 5: CLI hardening

- [x] `T4` — One spawn core: `--tools ""`, env allowlist, win32 command, no `allowedTools`
  - Files: `src/lib/agent/claudeCli.ts`, `tests/unit/claudeCliArgs.test.ts` (new), `tests/unit/claudeCliAuth.test.ts`, `tests/unit/refineVerify.test.ts` (argv expectations only)
  - Estimate: medium
  - Kind: impl
  - Notes:
    - **Covers:** FR-08 (text mode), FR-10, FR-17.
    - **The split:** `spawnClaude(args, stdinPayload, opts)` is the core; the auth-retry wrapper is shared; the 600k guard measures the stdin payload.
    - **`buildChildEnv(parentEnv, platform, token)`** is pure and exported.
    - **Win32 empty argument:** with `shell:true`, pass the literal `'""'`, and unit-test the joined command line.
    - **Remove `allowedTools`** from the options type. Vision breaks at compile time until T5, so land T4 and T5 together if needed to keep `tsc` green at each commit, or have T4 move vision's call onto a temporary text-mode path with no tools.
    - **ACs:** AC-13 (text-mode sites), AC-14, AC-25.

- [x] `T5` — Vision over stream-json, with no files
  - Files: `src/lib/agent/claudeCli.ts` (`runClaudeCliStreamJson`), `src/lib/agent/vision.ts`, `tests/unit/visionCli.test.ts` (new), `tests/unit/visionPrompt.test.ts`, `docs/mcp-acp-guide.md`, `docs/security-prompt-injection-review-2026-07-22.md`, `docs/handoff.md`, `docs/plans/README.md`, `docs/plans/feature-5-brandkit-from-references.md`, `CLAUDE.md`
  - Estimate: medium
  - Kind: impl
  - Depends: T4
  - Notes:
    - **Covers:** FR-09 and NFR-07.
    - **The message:** one stream-json user message holding the base64 image blocks and one text block, with the guard kept.
    - **The answer:** parse the NDJSON and return the terminal `result` event; anything else is a `ClaudeCliError`.
    - **Delete** the `mkdtemp`, `writeFile` and `finally` code.
    - **Before relying on the shapes,** check the stream-json input and output shapes against Anthropic's CLI docs, and cite the URL in a code comment.
    - **De-stale every doc that describes `--allowedTools Read` vision**, and add a "closed by 005" note to the security review.
    - **ACs:** AC-13 (vision site), AC-15.
    - **Windows smoke test, recommended but not gating:** one real vision and one real copy call on a dev box.

- [~] `T6` — Pin the container CLI and prove it in the image
  - Files: `Dockerfile`, `scripts/cli-sandbox-check.mjs` (new)
  - Estimate: small
  - Kind: config
  - Depends: T5
  - Notes:
    - **Covers:** FR-11, AC-16 and AC-17, verified as `docker-build-local`.
    - **The check script:** a vision call on a generated PNG must describe it, and an injected request for `/proc/self/environ` and `/app/.env` must yield nothing. Set a canary env var in the parent and grep for it plus `DATABASE_URL=`.
    - **The token:** the operator supplies `CLAUDE_CODE_OAUTH_TOKEN` at `docker run`. Never commit, log or echo it.
    - **Choosing the version:** pin the version that passes, and record it plus the run output in the task report. If no version passes, follow design R2's fallback and report the residual as still open; don't claim AC-16.
    - Change only the `npm install -g` line and its comment, because PR #42 also edits the Dockerfile.
    - `export MSYS_NO_PATHCONV=1` before docker commands.

### Wave 3 — Item 4: Gemini

- [x] `T7` — Per-provider image sizes
  - Files: `src/providers/imageCapabilities.ts`, `src/providers/interfaces/ImageProvider.ts`, `src/providers/implementations/image/openai.ts`, `src/lib/agent/background.ts`, `src/lib/agent/tools.ts`, `src/app/api/generate/image/route.ts`, `tests/unit/imageCapabilities.test.ts`, `tests/unit/background.test.ts`, `tests/unit/toolGenerateImage.test.ts`
  - Estimate: small
  - Kind: impl
  - Depends: T2
  - Notes:
    - **Covers:** FR-12.
    - **Interface:** `ImageProvider` gains `readonly providerName`.
    - **Size map:** openai is `1024x1024` / `1024x1536` / `1024x1536`; gemini is `1:1` / `4:5` / `9:16`.
    - **Callers:** `tools.ts` and `/api/generate/image` pass the brief's aspect ratio, so they stop always getting a square image.
    - **Tests:** add the missing STORY assertion.
    - **AC:** AC-18.

- [x] `T8` — Gemini image provider
  - Files: `src/providers/implementations/image/gemini.ts` (new), `src/providers/registry.ts`, `src/app/api/admin/providers/route.ts`, `src/app/(app)/team/page.tsx` (client `detectProvider` gains `AIza`), `tests/unit/geminiImage.test.ts` (new), `tests/e2e/provider-registration.test.ts`, `tests/e2e/background-notice.test.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T1, T2, T7
  - Notes:
    - **Covers:** FR-13 and NFR-05.
    - **Transport:** `fetch` with the `x-goog-api-key` header, never `?key=` in the URL. The model is a constant.
    - **Request and response shapes:** take them from the current Gemini API docs (WebFetch), and cite the URL in a comment.
    - **Registration:** `AIza` → `gemini`, with validation through `GET …/v1beta/models` behind the T1 seam.
    - **E2E:** register a Gemini key, make it the default, and serve a background through the T2 seam.
    - **ACs:** AC-19, AC-20. Record AC-21 (mock-only) for verify.

### Wave 4 — Item 1: guided Claude connection

- [x] `T9` — `docs/claude-account-setup.md`
  - Files: `docs/claude-account-setup.md` (new), `docs/cold-start.md`
  - Estimate: small
  - Kind: docs
  - Notes:
    - **Covers:** FR-16, plus the doc half of FR-15.
    - **Windows:** `winget install Anthropic.ClaudeCode`, with winget-cli#6200 (not in `winget list`, no winget upgrade or uninstall) and the working upgrade and uninstall route.
    - **macOS:** Anthropic's documented installer.
    - **Linux:** a link to Anthropic's docs.
    - **Then:** `claude setup-token`, then paste at /settings (personal) or /team (team token, admins).
    - **Troubleshooting:** a rejected token; `claude` not found (open a new terminal; PATH); the token expiring after about a year.
    - **Verify every command against Anthropic's docs** (WebFetch) and cite the sources at the bottom.
    - Remove "logged-in `claude` session by default" from `cold-start.md` §2 and link the new doc.
    - **AC:** AC-24.

- [x] `T10` — In-app connection walkthrough, plus copy fixes
  - Files: `src/components/settings/ClaudeConnectGuide.tsx` (new), `src/components/settings/ClaudeTokenCard.tsx`, `src/components/settings/ClaudeTokenPrompt.tsx`, `src/components/team/TeamClaudeTokenCard.tsx`, `tests/e2e/settings-claude-token.test.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T9
  - Notes:
    - **Covers:** FR-14 and FR-15 (UI).
    - **The guide component:** an OS selector of segmented buttons, defaulted from the platform after mount (no SSR mismatch). The steps come from one data table, the same commands as T9's doc, and the component links to the doc.
    - **Replace the inline `<ol>`** in both cards.
    - **Fix the stale copy:** "shared server credential" in all three components. The correct story is personal → team → hard failure.
    - **Light and dark screenshots,** following `DESIGN_SYSTEM.md`.
    - **ACs:** AC-22, AC-23 (grep).

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
- `[>]` Deferred — correctly blocked on a sibling change, not incomplete through any fault of its own; excluded from the incomplete-task count that gates `verify`

**Task format:**

```
- [ ] `T<n>` — <title>
  - Files: <files to create/modify>
  - Estimate: small | medium | large
  - Kind: docs | test | config | refactor | impl | migration   (optional; hints the build subagent's role, tools, and model)
  - Depends: <task ids> (if any)
  - Notes: <additional context>
  - Deferred-Reason: <why this can't be built yet>            (required when marker is `[>]`)
  - Deferred-Blocked-On: <sibling change name, if known>      (optional; free text, not a structured link)
```

The optional `Kind` hint is consumed by `build.dynamic_agents` (when enabled) to
synthesize a specialized subagent per task. Omit it and build classifies
heuristically, defaulting to `impl`.
