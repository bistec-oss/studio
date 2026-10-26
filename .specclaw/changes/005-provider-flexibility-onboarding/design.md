# Design: Provider flexibility and onboarding

**Change:** 005-provider-flexibility-onboarding
**Created:** 2026-10-01

## Technical Approach

Four items, built as four independently revertible waves (NFR-04), on `v2`. They are ordered by how silent the current failure is, and by reach:

1. **Wave 1, image resolution (item 3).** This is a live prod bug that ROADMAP recommends pulling forward ("005 item 3 → 009, else most users get no image at all"). It also adds the background mock seam that Wave 3 needs.
2. **Wave 2, CLI hardening (item 5).** The security residual, touching the one spawn site that every model call shares.
3. **Wave 3, Gemini (item 4).** Built on Wave 1's resolver and seam.
4. **Wave 4, onboarding (item 1).** UI copy and docs; the lowest risk.

### Wave 1: resolution as a pure ranking plus a reason-carrying background result

**Resolver** (`src/providers/registry.ts`): tiers 1–3 are unchanged. A new tier 4:

```ts
findFirst({
  where: { slot: 'IMAGE', teamId, isEnabled: true, providerName: { in: IMAGE_PROVIDERS } },
  orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
})
```

`IMAGE_PROVIDERS = ['openai','gemini']` comes from the capability map module (one definition, FR-04 + FR-12). Tiers 2 and 3 also gain the `providerName: { in: IMAGE_PROVIDERS }` filter, so a legacy incompatible row is skipped, not thrown on.

**Routes** (`src/app/api/admin/providers/route.ts`, `[id]/route.ts`):

- a `SLOT_PROVIDERS` table (`IMAGE: IMAGE_PROVIDERS`, `COPY: ['anthropic','openai','cli']`) gates POST and PATCH with 400;
- POST sets `isDefault: true` when the team has no enabled default in that slot (FR-02), inside the existing transaction;
- PATCH `isEnabled:false` on the default row also writes `isDefault:false` (FR-03), and DELETE needs no change;
- `detectProvider` gains `AIza` → `gemini`, and `validateApiKey` gains a gemini branch: `GET https://generativelanguage.googleapis.com/v1beta/models` with header `x-goog-api-key`;
- both validation calls pass through `mockProviderKeyValidation` under `MOCK_AI` (NFR-06).

**Background result:** `background.ts`'s two entry points change from returning `string | null` to returning:

```ts
type BackgroundResult =
  | { url: string }
  | {
      url: null
      skip: 'NO_PROVIDER' | 'PROVIDER_ERROR' | 'DECISION_ERROR' | 'NOT_NEEDED'
      detail?: string
    }
```

- Every existing skip branch maps to exactly one reason (survey §5).
- The outer catch splits on _where_ it threw: before the decision parse it is `DECISION_ERROR`, after it `PROVIDER_ERROR`. A `stage` variable set as the function advances does this, rather than parsing the error message.
- The function still never throws (NFR-02).
- Consumers:
  - `pathB.ts` threads the result into `PathBDesignResult`;
  - `generateDraft.ts` (`finalizeDraftV1`, `generateDraftForBrief`), `regenerate-design/route.ts` and refine (`commitDraftRevision`'s caller) write the draft field per FR-07.

**Mock seam (NFR-06):** in `testHooks.ts`, `shouldMockBackground(brief)` is true when `MOCK_AI` is on and the topic contains `__MOCK_BG__`. Then:

- the Haiku decision is skipped, and the decision is `needed: true` with a fixed prompt;
- **provider resolution runs for real**, which is the point, because it is what AC-01, AC-02 and AC-08 test;
- the resolved provider's `generateImage` is replaced by a fixture 1×1 PNG data URL;
- `__MOCK_BG_FAIL__` makes the fixture throw (AC-10), and `__MOCK_BG_NOT_NEEDED__` returns `needed:false` (AC-09).

Without a sentinel, `MOCK_AI` still returns early with no notice, which keeps every existing suite identical (AC-12).

The fixture swap happens inside `background.ts` after resolution (`provider = mockImageProvider(provider)`), not in the registry, so the resolver under test is the production one.

**Draft field:** `Draft.backgroundSkipReason String?` and `Draft.backgroundSkipDetail String?` (the detail is clipped to 300 chars). The poll maps them to `backgroundSkipped: { reason, message } | null`, with `message` built from a fixed per-reason table in `src/lib/drafts/backgroundNotice.ts`. Provider text is never echoed raw into UI copy beyond the clipped detail. The page renders `BackgroundNotice.tsx` (amber, `role="status"`, not an alert) under the preview. It takes its fix-it link from `useCurrentUser().teamRole`.

**/team UI:** `ProvidersSection` (in `src/app/(app)/team/page.tsx`) computes `servingImageRow` with the same rule as the resolver's tiers 3 and 4. The rule is a pure function, `pickServingImageProvider(rows)`, exported from the capability module and unit-tested once; both the resolver's ordering test and the UI use it as the contract. The section then renders the default, serving-fallback or none state (FR-05).

### Wave 2: one spawn core, two input modes

`claudeCli.ts`:

- **`runClaudeCliOnce` is split:**
  - a `spawnClaude(args, stdinPayload, opts)` core owns the env, the auth token, timeout/kill-tree, logging and buffers;
  - the two modes are text (today's) and **stream-json**.
- **`runClaudeCli` keeps its signature minus `allowedTools`.**
- **New `runClaudeCliStreamJson(content: ContentBlock[], opts)`:**
  - writes one line, `{"type":"user","message":{"role":"user","content":[...]}}`, then ends stdin;
  - parses NDJSON stdout and returns the terminal `{"type":"result"}` event's `result`;
  - throws `ClaudeCliError` on `is_error` or an error subtype, or when no result arrives;
  - the auth retry wrapper is shared, because the logic moves into a helper both entry points call.
- **Args, for both modes:** `-p --strict-mcp-config --tools <EMPTY> ...modelArgs`. Stream-json adds `--input-format stream-json --output-format stream-json --verbose`.
- **`<EMPTY>`:** `""` as an argv element when `shell:false`. When `shell:true` (win32), the literal two-character string `'""'`, so cmd.exe receives an empty argument (FR-08). A unit test asserts the joined command line on win32.
- **Env:** `buildChildEnv(parentEnv, platform, token)` is a pure, exported, unit-tested function implementing the FR-10 allowlist.
- **Command:** `claudeCommand()` uses `CLAUDE_CLI_PATH` when it is set; otherwise `claude` on POSIX, and `claude` with `shell:true` on win32 (FR-17).
- **The 600k guard** measures the serialized stdin payload in both modes.

`vision.ts`:

- `runVisionCli` builds the content blocks: base64 images, then one text block from `buildVisionCliPrompt(system, userMessage)`. The prompt drops the file list and the "use the Read tool" lines, and keeps `UNTRUSTED_CONTENT_GUARD` and the `--- Task ---` structure.
- It calls `runClaudeCliStreamJson`. No `mkdtemp` or `writeFile`, and the `finally` block is deleted.

**Dockerfile:** pin `@anthropic-ai/claude-code@<V>`, where `<V>` is the version AC-16 passed on. The task records it. Fix the stale "shared server token" comment.

**AC-16 script:** `scripts/cli-sandbox-check.mjs`, run only by hand inside the image:

- it takes the token from `CLAUDE_CODE_OAUTH_TOKEN`, supplied at `docker run` time;
- (a) a vision call on a generated PNG must describe it;
- (b) a vision call whose text block carries an injection asking for `/proc/self/environ` and `/app/.env` must return neither file nor env content. It greps for a canary env var set in the parent process, plus `DATABASE_URL=`.

It is excluded from CI and the unit globs.

### Wave 3: a capability map, then a provider

`src/providers/imageCapabilities.ts`:

- `IMAGE_PROVIDERS`;
- `IMAGE_SIZES: Record<ImageProviderName, Record<AspectRatio,string>>`;
- `imageSizeFor(name, aspect)`;
- `pickServingImageProvider` (from Wave 1).

`background.ts` drops its local `imageSizeFor`. The provider name comes from the resolved row: `ImageProvider` gains a `readonly providerName`. `tools.ts` and `/api/generate/image` pass `imageSizeFor(provider.providerName, brief.aspectRatio)`.

`src/providers/implementations/image/gemini.ts`:

- `fetch` with `x-goog-api-key`;
- the model is a constant at the top of the file;
- the request and response shapes are taken from the Gemini API docs at build time, with the URL cited in a comment (AC-19);
- it extracts the first inline image part (base64 PNG) and returns `data:image/png;base64,…`;
- errors: non-2xx, a prompt or safety block, or no image part each throw an `Error` with a readable message, which `background.ts` maps to `PROVIDER_ERROR`.

### Wave 4: one shared guide component

`src/components/settings/ClaudeConnectGuide.tsx`:

- an OS selector of segmented buttons (Windows, macOS, Linux), defaulting from `navigator.userAgentData?.platform ?? navigator.platform` after mount (no SSR mismatch);
- the steps per OS, from one data table;
- a link to the doc.

It is used by `ClaudeTokenCard` and `TeamClaudeTokenCard`, replacing their inline `<ol>`. The stale copy in both cards and `ClaudeTokenPrompt` is corrected. The new `docs/claude-account-setup.md` carries the walkthroughs, and `cold-start.md` §2 links to it. The commands are verified against Anthropic's docs at build time, and the doc cites them.

## Architecture

```
brief ──► background.ts ──resolve──► registry.resolveImageProvider (tiers 1–4, compat filter)
              │                                   │
              │                       imageCapabilities (IMAGE_PROVIDERS, sizes, serving rule)
              ▼                                   ▲
       BackgroundResult ──► pathB / generateDraft / regenerate-design / refine
              │                                   │
              └──► Draft.backgroundSkip* ──► GET /api/drafts/[id] ──► BackgroundNotice
                                            /team ProvidersSection ──┘ (same serving rule)

every model call ──► claudeCli.spawnClaude(args, stdin)   env = buildChildEnv(allowlist)
                       ├─ text mode   (copy/design/refine/verify/background/briefing/ping)
                       └─ stream-json (vision: base64 image blocks, no tools, no files)
```

## File Changes Map

| File                                                                                                                                                                                                             | Action          | Description                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/providers/imageCapabilities.ts`                                                                                                                                                                             | create          | `IMAGE_PROVIDERS`, `SLOT_PROVIDERS`, size map, `imageSizeFor`, `pickServingImageProvider`                                                               |
| `src/providers/registry.ts`                                                                                                                                                                                      | modify          | tier 4 fallback, compat filter, `gemini` case                                                                                                           |
| `src/providers/interfaces/ImageProvider.ts`                                                                                                                                                                      | modify          | `readonly providerName`                                                                                                                                 |
| `src/providers/implementations/image/openai.ts`                                                                                                                                                                  | modify          | `providerName = 'openai'`                                                                                                                               |
| `src/providers/implementations/image/gemini.ts`                                                                                                                                                                  | create          | Gemini over fetch                                                                                                                                       |
| `src/app/api/admin/providers/route.ts`                                                                                                                                                                           | modify          | compat 400, first-row default, `AIza` detection, gemini validation, validation seam                                                                     |
| `src/app/api/admin/providers/[id]/route.ts`                                                                                                                                                                      | modify          | compat on PATCH; disabling the default clears it                                                                                                        |
| `src/lib/agent/background.ts`                                                                                                                                                                                    | modify          | `BackgroundResult`, stage-based reasons, mock seam hook, size from the map                                                                              |
| `src/lib/agent/pathB.ts`, `src/lib/agent/generateDraft.ts`                                                                                                                                                       | modify          | thread `BackgroundResult`, write the skip fields                                                                                                        |
| `src/app/api/drafts/[id]/regenerate-design/route.ts`, `src/app/api/drafts/[id]/refine/route.ts`, `src/lib/drafts/revisions.ts`                                                                                   | modify          | skip-field writes per FR-07                                                                                                                             |
| `src/lib/agent/tools.ts`, `src/app/api/generate/image/route.ts`                                                                                                                                                  | modify          | aspect-aware size                                                                                                                                       |
| `src/lib/drafts/backgroundNotice.ts`                                                                                                                                                                             | create          | reason → message table                                                                                                                                  |
| `src/app/api/drafts/[id]/route.ts`, `src/lib/api-types.ts`                                                                                                                                                       | modify          | `backgroundSkipped` in `DraftDetail`                                                                                                                    |
| `src/components/drafts/BackgroundNotice.tsx`, `src/app/(app)/drafts/[id]/page.tsx`                                                                                                                               | create / modify | amber notice                                                                                                                                            |
| `src/app/(app)/team/page.tsx`                                                                                                                                                                                    | modify          | default / serving / none states                                                                                                                         |
| `src/lib/testHooks.ts`                                                                                                                                                                                           | modify          | `shouldMockBackground`, `mockImageProvider`, `mockProviderKeyValidation`                                                                                |
| `prisma/schema.prisma`, `prisma/migrations/<ts>_draft_background_skip/`                                                                                                                                          | create / modify | two nullable Draft columns                                                                                                                              |
| `src/lib/agent/claudeCli.ts`                                                                                                                                                                                     | modify          | spawn core split, stream-json mode, `--tools`, `buildChildEnv`, win32 command, no `allowedTools`                                                        |
| `src/lib/agent/vision.ts`                                                                                                                                                                                        | modify          | stream-json content blocks; no temp files                                                                                                               |
| `Dockerfile`                                                                                                                                                                                                     | modify          | pinned CLI version; comment fix                                                                                                                         |
| `scripts/cli-sandbox-check.mjs`                                                                                                                                                                                  | create          | the manual AC-16 in-image check                                                                                                                         |
| `src/components/settings/ClaudeConnectGuide.tsx`                                                                                                                                                                 | create          | OS-tabbed walkthrough                                                                                                                                   |
| `src/components/settings/ClaudeTokenCard.tsx`, `src/components/settings/ClaudeTokenPrompt.tsx`, `src/components/team/TeamClaudeTokenCard.tsx`                                                                    | modify          | use the guide; stale copy                                                                                                                               |
| `docs/claude-account-setup.md`                                                                                                                                                                                   | create          | the full guide                                                                                                                                          |
| `docs/cold-start.md`, `docs/mcp-acp-guide.md`, `docs/security-prompt-injection-review-2026-07-22.md`, `docs/handoff.md`, `docs/plans/README.md`, `docs/plans/feature-5-brandkit-from-references.md`, `CLAUDE.md` | modify          | de-stale (FR-15, the spec's Notes)                                                                                                                      |
| `tests/unit/*`                                                                                                                                                                                                   | create / modify | `imageProviderResolution`, `background`, `imageCapabilities`, `geminiImage`, `claudeCliArgs` (new: argv/env/win32), `visionCli` (new), `providerRoutes` |
| `tests/e2e/provider-registration.test.ts`, `tests/e2e/background-notice.test.ts` (new), `tests/e2e/settings-claude-token.test.ts`, `tests/e2e/path-b.test.ts` (TC-GEN-05 un-skip)                                | modify / create | E2E per the ACs                                                                                                                                         |

## Data Model Changes

There is one migration (Wave 1): `ALTER TABLE "Draft" ADD COLUMN "backgroundSkipReason" TEXT, ADD COLUMN "backgroundSkipDetail" TEXT;`.

- There is no backfill: existing drafts read as `null`, meaning no notice.
- It is a plain `TEXT`, not a Postgres enum, so adding a reason later needs no migration. The allowed values are enforced in TypeScript.
- Down: drop both columns.

No `AvailableProvider` schema change. One default per slot is still enforced in app code. A partial unique index was considered and rejected, because the existing `updateMany`-then-set transaction already serializes it and an index adds migration risk for no behaviour change.

## API Changes

- **`GET /api/drafts/[id]`** gains `backgroundSkipped: { reason, message } | null`. It is additive, and AC-20 of 004 (response shapes) is unaffected because the regenerate routes' own responses don't change.
- **`POST /api/admin/providers`:**
  - new 400 `{ error: 'Provider X cannot serve the IMAGE slot' }`;
  - the first enabled row in a slot gets `isDefault:true`;
  - `AIza…` is detected as `gemini`.
- **`PATCH /api/admin/providers/[id]`:** a compat 400; `isEnabled:false` on the default also clears `isDefault`.
- **No new routes.**

## Key Decisions

1. **Resolver fallback, not a data migration** (user, 2026-10-01). A data fix would go stale the next time an admin disables a default. The fallback makes "enabled" mean "usable".
2. **The oldest enabled row is the fallback,** not the newest. It is deterministic and matches what the GET list shows first (`createdAt asc`), so the "serving" row in /team is the top IMAGE card.
3. **The skip reason is a column on Draft,** not derived from logs. Logs aren't user-visible, and the poll already carries similar outcome fields (`failureReason`, `notAppliedReason`).
4. **`NOT_NEEDED` is silent.** A model choosing CSS/SVG is a design decision, not a failure, and a notice on every typographic post would train users to ignore the notice.
5. **Remove the tool, don't confine it** (user, 2026-10-01; proposal research). Built-in sandboxing covers only Bash; bubblewrap/firejail need user namespaces that Docker blocks; a uid split gains nothing when the secrets are env vars. With no tools, injection has nothing to call.
6. **An env allowlist, not a denylist.** A denylist misses the next secret someone adds to `.env`; an allowlist fails safe. The cost is a variable the CLI genuinely needs being missing. That fails loudly, as a CLI error at the first call, and is covered by AC-16's in-image run.
7. **Gemini over `fetch`.** It is one endpoint and one response shape, and a new SDK would be dependency weight for that. It is mock-verified only, so the request and response shapes must cite the docs page (AC-19) to make a later live check a diff against a source.
8. **The background mock seam is sentinel-gated.** It keeps 231 existing cases byte-identical while making the resolver reachable over HTTP. That follows the established `__FAIL_*__` pattern (CLAUDE.md: "deterministic publish failures via a `__FAIL_*__` sentinel in the brief topic").

## Risks & Mitigations

- **R1. A too-tight env allowlist breaks every generation.** Mitigations:
  - the allowlist is explicit and unit-tested;
  - AC-16 runs a real call in the built image before the wave is marked done;
  - `CLAUDE_CLI_DEBUG` already logs stderr, so a missing-variable failure is visible;
  - the wave reverts alone.
- **R2. stream-json image input fails on the container's CLI version.** Mitigations:
  - pin the version that passes AC-16;
  - if no available version passes, fall back (proposal: `--restricted` with cwd set to a temp dir, plus scoped deny rules) and record that the residual is still open. That is a defence-in-depth outcome, and verify must say so plainly rather than claim AC-16.
- **R3. win32 empty-argument quoting.** Unit-test the joined command line, and smoke-test copy and vision once on a Windows dev box.
- **R4. FR-01 starts spending a team's image key on scheduled and MCP posts** that previously got none. This is intended, but it changes cost, so it goes in the release notes (NFR-03).
- **R5. Gemini request shape drift, untested live.** It is mock-only by decision. The docs citation plus a readable error mean a live failure reads as "Gemini returned …", not as a crash, and generation still completes (NFR-02).
- **R6. The Dockerfile textual conflict with PR #42.** FR-11 touches only the `npm install -g` line, and AC-17 is re-run after `main` merges into `v2`.
- **R7. `pathB` / `generateDraft` signature churn touching 004's areas.** The background result is threaded through as one new field. The refine change is limited to the skip write beside the existing `backgroundImageUrl` handling, with no change to 004's verify or attempt logic.

## Grounding sources

- `CLAUDE.md`: "Both prod IMAGE providers are `isEnabled: true` but `isDefault: false`. `resolveImageProvider` tier 3 requires `isDefault`, so a teammate **without** a personal OpenAI key silently gets no AI background". This motivates FR-01. The survey refined its scope: wizard briefs mostly escape it.
- `CLAUDE.md`: "deterministic publish failures via a `__FAIL_*__` sentinel in the brief topic". This is the pattern for the background seam (Key decision 8).
- `docs/security-prompt-injection-review-2026-07-22.md:59`: "**Constrain the CLI vision `Read` tool** (highest priority). … or feed images without granting `Read`, so injection can't reach `.env` or sibling/other-tenant files." FR-08 and FR-09 take the second option.
- `docs/mcp-acp-guide.md:146`: "**Residual (documented, not yet closed):** the Read-tool restriction is **prompt-level** only". Closed by Wave 2; the doc is updated there.
- `docs/e2e-test-plan.md:51`: TC-GEN-05 is skipped because "there is no mock IMAGE-provider seam". NFR-06 adds it.
- `.specclaw/ROADMAP.md`: "005 item 3 (isDefault image fix) ─────► 009 (else most users get no image at all)". That sets the wave order.
- `Dockerfile:90-93`: "The Claude CLI writes config/cache under ~/.claude* — the system user needs a real, writable home". So `HOME` is on the allowlist.
