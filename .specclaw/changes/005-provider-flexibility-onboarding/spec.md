# Spec: Provider flexibility and onboarding

**Change:** 005-provider-flexibility-onboarding
**Created:** 2026-10-01
**Status:** 🟡 Draft

## Overview

005 makes provider choice correct and setup something a marketer can finish unaided. It ships four of the proposal's five items. **Item 2, the COPY route selector, is deferred to 008**, because it sits on 008's model resolver (user decision, 2026-09-30).

| Item                             | What it fixes                                                                                                                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **3. Image provider resolution** | A team's enabled IMAGE key silently serves nobody unless it is flagged `isDefault`. A skipped AI background is invisible.                                                                |
| **5. CLI `Read` sandbox**        | CLI-mode vision is the only agent path that has a tool (`--allowedTools Read`, a server-file-disclosure vector). Every CLI child also inherits the server's whole env, secrets included. |
| **4. Gemini**                    | There is only one image provider (OpenAI).                                                                                                                                               |
| **1. Guided Claude connection**  | Connecting a personal Claude account needs a hand-installed CLI and comes with no guidance.                                                                                              |

Binding decisions are in `proposal.md`'s two Decisions sections (2026-09-30 and 2026-10-01). They are not re-litigated here:

- remove the tool rather than confine it;
- the resolver falls back and the default is made explicit;
- a skipped background is a visible warning, never a failure;
- image sizing uses a per-provider capability map;
- the install guide gives full walkthroughs for Windows and macOS;
- Gemini is mock-verified only.

**Correction to the proposal's problem statement (codebase survey, 2026-10-01):** the no-default bug does not hit every teammate without a personal key.

- **Wizard briefs mostly escape it.** `useBriefWizard.ts:277-280` falls back to the first enabled IMAGE key, and tier 2 of `resolveImageProvider` resolves an explicit key.
- **Briefs with no `imageProviderKey` reach only tier 3** (`isDefault`), so these get no background:
  - the scheduler (`generationRunner.ts:53-68`);
  - MCP and ACP (`mcp/tools/generate.ts:59,81`);
  - the API-mode design agent's own `toolGenerateImage` (`tools.ts:28`).

## Requirements

### Functional Requirements

#### Item 3: image provider resolution

**FR-01: The resolver falls back to an enabled team row.** `resolveImageProvider` (`src/providers/registry.ts:114`) resolves in this order:

1. the personal OpenAI key (unchanged);
2. the explicit `providerKey` (unchanged);
3. the team's enabled default row (unchanged);
4. **new:** when the team has no enabled default row, the **oldest enabled IMAGE row** whose provider is image-capable (FR-04).

It returns `null` only when the team has no enabled image-capable row.

**FR-02: A new team's first IMAGE row becomes its default.** When a team registers its first IMAGE row, or registers one while it has no enabled default, the new row is stored with `isDefault: true`. Registering a later row never steals the default unless the request asks for it.

**FR-03: Default state stays coherent when rows change.**

- Disabling or deleting the default row clears its `isDefault`. The resolver then falls back under FR-01, so nothing goes silent.
- Unsetting a default with `PATCH {isDefault:false}` is allowed. The fallback still applies.

**FR-04: Slot/provider compatibility is enforced on the server.** `POST` and `PATCH /api/admin/providers` refuse with 400 a provider that the slot can't instantiate:

- IMAGE accepts `openai` and `gemini`;
- COPY accepts `anthropic`, `openai` and `cli`;
- an unknown provider name is refused for IMAGE.

Today an Anthropic key can be registered as IMAGE and then throws `Unsupported provider` in `instantiateImageProvider`. The resolver also skips incompatible rows that already exist, so legacy bad rows can't break resolution.

**FR-05: The team default is explicit in /team.** The AI Providers section:

- marks which IMAGE row is the default;
- when no enabled row is the default, says in plain words which row is currently serving teammates (the FR-01 fallback) and offers "Make default";
- when the team has no enabled IMAGE row at all, says that teammates without a personal key get no AI backgrounds.

**FR-06: A skipped AI background is recorded with its reason.** The background step (`src/lib/agent/background.ts`) returns either an image or a skip with one reason:

| Reason           | When                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------- |
| `NO_PROVIDER`    | No personal key and no enabled team row.                                              |
| `PROVIDER_ERROR` | Resolution or generation failed. This includes moderation refusals and rejected keys. |
| `DECISION_ERROR` | The Haiku decision call failed or returned invalid JSON.                              |
| `NOT_NEEDED`     | The model decided no background was needed.                                           |

The step still never throws, and generation still completes with CSS/SVG (NFR-02).

**FR-07: The draft shows a warning for an unintended skip.** A generation or design regeneration that skipped for any reason other than `NOT_NEEDED` stores the reason on the draft. `GET /api/drafts/[id]` exposes it as `backgroundSkipped: { reason, message } | null`. The draft page shows an amber, non-blocking notice that says why no AI image was used and how to fix it:

- for `NO_PROVIDER`: "add an OpenAI key at /settings, or ask a team admin to add an image provider at /team";
- for team admins: a link to /team.

`NOT_NEEDED` shows nothing.

- **Generation and regenerate-design** set the field, or clear it when a background was produced or not needed.
- **Refine** sets it only when its decision asked for a background and generation then failed. A refine that produces a background clears it, and any other refine leaves it unchanged, matching how refine already treats `imageUrl` (`revisions.ts:320`).

#### Item 5: CLI hardening

**FR-08: No CLI child gets a tool.**

- Every `claude -p` spawn passes `--tools ""`, an empty tool list.
- The `allowedTools` option is **removed** from `ClaudeCliOptions`, so no caller can opt back in without a code change that a reviewer sees.
- On win32, where the spawn uses `shell: true`, the empty argument must survive. Today Node joins argv with spaces, so a bare `""` element vanishes.
- _Amended 2026-10-02 (T6, after the T4 review):_ every spawn also isolates the child from host configuration.
  - It passes `--no-session-persistence`, `--safe-mode` and `--setting-sources ""`, and runs from an empty per-process temp cwd (`bistec-cli-*`).
  - So no user, project or local settings, hooks, plugins, project `CLAUDE.md` or session transcript loads or is written.
  - The CLI's own built-in skills and `cc-plugin-*` plugins still load, but they are inert with `--tools ""`.
  - Evidence: real CLI 2.1.287 with an env OAuth token. Hook events went 4 → 0, the cwd stayed empty, and the env token was the credential used.

**FR-09: CLI-mode vision sends images over stdin, not files.**

- `runVisionModel`'s CLI path (`vision.ts:114-134`) sends a single stream-json user message on stdin. It holds the reference images as base64 `image` blocks plus one `text` block (system text, the untrusted-content guard, then the task).
- The call is `--input-format stream-json --output-format stream-json --verbose --strict-mcp-config --tools ""`.
- The answer is read from the terminal `result` event. A `result` event with an error subtype, or a stream that has no `result` event, is an error.
- No temp files are written, and the prompt no longer tells the model to read files.

**FR-10: The CLI child env is an allowlist.**

- `runClaudeCliOnce` builds the child env from an explicit allowlist instead of copying `process.env`. Every other variable is absent, including:
  - `DATABASE_URL`;
  - `TOKEN_ENCRYPTION_KEY`;
  - `MINIO_*`;
  - `BETTER_AUTH_*`;
  - `ANTHROPIC_*`;
  - any `*_SECRET` or `*_KEY`.
- **Always allowed:** `PATH`, `HOME`, `CLAUDE_CODE_OAUTH_TOKEN` (set by the runner).
- **Locale and proxy:** `LANG`, `LC_ALL`, `TZ`, `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` (and their lowercase forms), `NODE_EXTRA_CA_CERTS`.
- **Temp:** `TMPDIR`.
- **On win32:** `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `SystemRoot`, `ComSpec`, `PATHEXT`, `TEMP`, `TMP`.

**FR-11: The container's Claude CLI version is pinned.** The runner stage installs an exact `@anthropic-ai/claude-code@<version>`. That version is the one on which FR-09 was proven inside the built image. The Dockerfile comment records why it is pinned: the stream-json schema can drift.

#### Item 4: Gemini

**FR-12: A per-provider image capability map.**

- A single module declares, for each image provider, the native size value it sends for each `AspectRatio` (`SQUARE`, `PORTRAIT`, `STORY`):
  - **openai:** `1024x1024`, `1024x1536`, `1024x1536`;
  - **gemini:** aspect ratios `1:1`, `4:5`, `9:16`.
- `imageSizeFor(providerName, aspectRatio)` replaces the two-way helper at `background.ts:47-49`, and the provider receives that value.
- `toolGenerateImage` and `POST /api/generate/image` pass the brief's aspect ratio instead of always getting a square image.

**FR-13: Gemini is an IMAGE provider.**

- **Provider:** a `GeminiImageProvider` implements `ImageProvider` against the Gemini API over HTTPS. No new npm dependency (NFR-05). It returns a `data:` PNG URL, exactly as the OpenAI provider does, so `persistDataUrlImage` handles it unchanged.
- **Wiring:** `instantiateImageProvider` gains a `gemini` case.
- **Registration:** a key starting `AIza` is detected as `gemini`; it is IMAGE-only (FR-04). The key is validated against the Gemini models list on registration, the same way OpenAI and Anthropic keys are validated today.
- **Selection:** Gemini is selectable per team and can be the default. The personal tier stays OpenAI-only (out of scope below).

#### Item 1: guided Claude connection

**FR-14: An in-app connection walkthrough.**

- The `/settings` Claude account card and the `/team` team-token card show a step-by-step guide with an OS selector, defaulting to the visitor's OS.
- **Windows:** `winget install Anthropic.ClaudeCode`, including the known winget defect (winget-cli#6200: the package doesn't show in `winget list` and doesn't upgrade or uninstall through winget), with the working upgrade and uninstall route.
- **macOS:** Anthropic's documented installer.
- **Linux:** a link to Anthropic's docs.
- **Then:** open a new terminal, run `claude setup-token`, finish the sign-in, and paste the `sk-ant-oat01-…` token.
- Every command must match Anthropic's current docs at build time, with the source cited in the guide doc.
- _Amended 2026-10-02 (T9, as this FR's last bullet requires):_ Anthropic's setup page now lists the **native installer as "Recommended"**.
  - Windows' primary route is therefore `irm https://claude.ai/install.ps1 | iex`.
  - `winget install Anthropic.ClaudeCode` is shown as an alternative with the #6200 note. The issue is still open and has no confirmed workaround, so the guide says to try `winget upgrade` / `winget uninstall`, and otherwise reinstall with the native line.
  - macOS's primary route is `curl -fsSL https://claude.ai/install.sh | bash`.

**FR-15: The stale credential copy is corrected.**

- `ClaudeTokenCard`, `ClaudeTokenPrompt` and `TeamClaudeTokenCard` stop saying generations fall back to a "shared server credential", because no env tier exists. The correct story is personal token → team token → hard failure.
- `docs/cold-start.md` §2 drops "the logged-in `claude` session by default".

**FR-16: A written guide.** A new `docs/claude-account-setup.md` gives full Windows and macOS walkthroughs, including troubleshooting: the token was rejected, `claude` isn't recognised after install, and how to re-run `setup-token` when the token expires after about a year. The in-app guide and `cold-start.md` link to it.

**FR-17: Local Windows dev finds a winget-installed CLI.** On win32, when `CLAUDE_CLI_PATH` is unset, the runner spawns `claude` through the shell, which resolves `.exe` and `.cmd` through `PATHEXT`, instead of the hard-coded `claude.cmd` (`claudeCli.ts:7-11`). So both the npm shim and the winget `claude.exe` work.

### Non-Functional Requirements

- **NFR-01: Least privilege for the CLI.** No CLI child can call a tool or read a server secret from its env. This is enforced in code (an option that no longer exists, plus an allowlist), not by prompt wording.
- **NFR-02: Generation never fails because of the background step.** That invariant (`background.ts:10-13`) is kept. FR-07 only makes it visible.
- **NFR-03: No silent behaviour change for working teams.**
  - A team with a default IMAGE row resolves exactly as before.
  - A team without one starts getting backgrounds through the FR-01 fallback, which is the intended fix.
  - This is called out in the release notes, because those teams' scheduled and MCP posts start using their image key, and spending on it.
- **NFR-04: Independently revertible items.** Items 3, 5, 4 and 1 land in separate waves, with separate commits. The one migration (FR-06/07's draft field) belongs to item 3 only.
- **NFR-05: No new runtime dependency.** Gemini goes over `fetch`, and the CLI work uses the CLI already in the image.
- **NFR-06: Mock-suite visibility.** The background step gets a deterministic E2E seam, so FR-01, FR-06 and FR-07 are exercised over HTTP. The currently skipped TC-GEN-05 becomes runnable.
  - The seam is gated behind a topic sentinel, the same way `__FAIL_*__` is.
  - Existing suites keep today's "MOCK_AI ⇒ no background" behaviour.
  - **Provider key validation gets a `MOCK_AI` seam** (`mockProviderKeyValidation`), mirroring `mockClaudeTokenValidation` at `testHooks.ts:189`: accept, unless the key contains `invalid`.
    - Today E2E registration calls the live OpenAI and Anthropic APIs with fake keys and accepts either 201 or 422 (`provider-registration.test.ts:21-23`), so no suite can create a usable IMAGE row.
    - The seam is dormant in prod, and the existing TC-PROV cases already accept 201.
- **NFR-07: Prompt-injection posture.**
  - The vision text block still carries `UNTRUSTED_CONTENT_GUARD`, and fenced untrusted text stays fenced.
  - Removing the tool doesn't loosen any prompt-level guard; it only makes file access impossible rather than discouraged.

## Acceptance Criteria

Each criterion must pass for the change to be considered complete.

### Item 3

- **AC-01:** A team with one enabled IMAGE row that has `isDefault:false`, and a scheduler-style brief (no `imageProviderKey`, `userId: null`), resolves that row. **Unit:** a new resolver tier case. **E2E:** a background is produced through the mock seam with no personal key.
- **AC-02:** A team with two enabled non-default IMAGE rows resolves the **older** one.
- **AC-03:** A team whose enabled default row exists resolves the default, even when an older enabled row exists. This is unchanged behaviour, and the existing resolver suite stays green.
- **AC-04:** Disabling the default row clears its `isDefault`, and resolution falls back under FR-01. Deleting it does the same.
- **AC-05:** A team's first registered IMAGE row is stored with `isDefault:true`. A second row registered without `isDefault` leaves the first as the default.
- **AC-06:** Registering an `sk-ant-` key as IMAGE returns 400 and creates no row. A PATCH can't move a row into an incompatible state. An existing incompatible IMAGE row is skipped by the resolver, not instantiated.
- **AC-07:** /team shows the default IMAGE row. With no default, it names the row that is serving, offers Make default (which works), and shows a no-backgrounds message when no enabled row exists. Verified in the UI by E2E.
- **AC-08:** A generation on a team with no image row stores `backgroundSkipped.reason = NO_PROVIDER`, and `GET /api/drafts/[id]` returns it. The draft page shows the amber notice with fix-it text. The draft is still `EXPORTED`.
- **AC-09:** A generation where the model decided no background stores no skip and shows no notice.
- **AC-10:** A provider that throws during generation gives `PROVIDER_ERROR`, and the draft still completes.
- **AC-11:**
  - A regenerate-design that produces a background clears an earlier skip.
  - A refine that wanted a background and failed sets it.
  - A refine that didn't want one leaves the skip unchanged.
- **AC-12:** TC-GEN-05 is no longer skipped, and the full mock E2E keeps 0 failed and 0 flaky, with no other existing case changing outcome.

### Item 5

- **AC-13:** **Unit:** for every CLI call site (copy, design, refine, verifier, background, briefing, token-validate, vision), the spawned argv contains `--tools` with an empty value and never `--allowedTools`. On win32 the empty value survives shell joining.
- **AC-14:** **Unit:** the child env holds exactly the FR-10 allowlist plus the OAuth token and the constant `DISABLE_AUTOUPDATER=1` (amended 2026-10-02 in T6: it is set by the runner, never inherited, so the pinned CLI of FR-11 can't self-update). With `DATABASE_URL`, `TOKEN_ENCRYPTION_KEY`, `MINIO_SECRET_KEY`, `BETTER_AUTH_SECRET` and `ANTHROPIC_API_KEY` all set in the parent, none of them appears in the child.
- **AC-15:** **Unit:** CLI-mode vision:
  - writes no file;
  - sends one stream-json user message with N base64 image blocks and one text block containing `UNTRUSTED_CONTENT_GUARD`;
  - returns the `result` event's text;
  - errors on an error-subtype result, and on a stream with no result.
- **AC-16 (`docker-build-local`):** Inside the built runner image with the pinned CLI and a real token, CLI vision correctly describes a test PNG. An injected instruction to print `/proc/self/environ` or read `/app/.env` yields no file or env content.
  - This is run by a script kept out of CI, with the token supplied by the operator at run time.
  - The pinned version is recorded with the result.
- **AC-17:** The Dockerfile pins an exact CLI version. `claude --version` in the built image prints it.

### Item 4

- **AC-18:** **Unit:** `imageSizeFor` gives:
  - openai: `1024x1024` / `1024x1536` / `1024x1536`;
  - gemini: `1:1` / `4:5` / `9:16`.

  The provider receives that value, and STORY is covered.

- **AC-19:** **Unit, fetch mocked:**
  - `GeminiImageProvider` sends the documented request shape (model, prompt, aspect ratio) with the key in a header, not the URL;
  - it returns a `data:image/png;base64,…` URL from the documented response shape;
  - it throws a readable error on a non-2xx response, a safety block, or a response with no image.
  - The request and response shapes cite the Gemini API docs page they were taken from.
- **AC-20:** **E2E:** an `AIza…` key registers as `gemini` in the IMAGE slot (validation passes through a new `MOCK_AI` key-validation seam; see NFR-06), can be made the default, and serves a background through the mock seam.
- **AC-21:** Gemini is recorded in verify-report as **mock-verified only, not live-verified** (user decision, 2026-10-01).

### Item 1

- **AC-22:** The /settings and /team Claude cards render the walkthrough with Windows, macOS and Linux options. Windows shows the native installer (`irm https://claude.ai/install.ps1 | iex`) as the primary route, plus `winget install Anthropic.ClaudeCode` as an alternative with the #6200 note (amended 2026-10-02 per FR-14). Every option ends at `claude setup-token`. The existing `settings-claude-token` E2E cases stay green, with new assertions for the guide.
- **AC-23:** No UI string or doc that 005 touches says "shared server credential" or "logged-in `claude` session by default". A grep shows it.
- **AC-24:** `docs/claude-account-setup.md` exists, gives full Windows and macOS walkthroughs with troubleshooting, cites its Anthropic sources, and is linked from the cards and `cold-start.md`.
- **AC-25:** **Unit:** on win32 with no `CLAUDE_CLI_PATH`, the spawn command is `claude` with `shell: true`. With `CLAUDE_CLI_PATH` set, it is that path with `shell: false`.

## Edge Cases

- **Two IMAGE rows registered in the same millisecond:** the oldest-first ordering needs a tiebreak, so the order is `createdAt` then `id`.
- **The fallback row turns out to be a legacy incompatible row:** it is skipped (FR-04), and resolution moves to the next compatible row.
- **A personal OpenAI key that is INVALID:** this path is unchanged. It is skipped, and team resolution applies.
- **A moderation refusal from either provider:** it maps to `PROVIDER_ERROR`, and the notice says the image request was refused, not that a key is missing.
- **MOCK_AI without the sentinel:** the background step returns a `NOT_NEEDED`-equivalent with no notice, so existing suites are unaffected.
- **A stream-json reply with several assistant messages:** only the terminal `result` event counts.
- **A vision call over the 600k prompt guard:** base64 images are counted against the stdin payload, and the guard measures the stdin payload, not only the text.
- **An empty image list in a vision call:** today's text-only fallback through `runBriefingModel` is unchanged.
- **win32 with `shell: true` and a system prompt containing quotes:** the system text travels in the stdin text block, never in argv.
- **A Gemini aspect ratio the chosen model doesn't support:** the capability map is the contract. A provider error then maps to `PROVIDER_ERROR`, never a crash.
- **A user switches the walkthrough's OS:** the selection is local UI state only, and nothing is stored on the server.

## Dependencies

- **Branch `v2`** (release rule). There is no dependency on PR #42.
- **Dockerfile overlap with PR #42:** #42 changes the base image to `node:22-alpine` in the same file. FR-11 touches only the CLI install line, so the merge is a trivial textual one, and AC-17 is re-checked after `main` is merged into `v2`.
- **Item 2, the COPY route, is deferred to 008**, and nothing in 005 builds a COPY selector.
- **009 depends on FR-01** (ROADMAP: "005 item 3 → 009").

## Notes

**Out of scope:**

- personal Gemini keys (the personal tier stays OpenAI);
- a full in-app OAuth flow;
- Claude-authored SVG backgrounds;
- server-side enforcement of IMAGE-only registration in CLI mode (part of item 2's slot work);
- wiring `markUserOpenAiKeyInvalid` on a rejected personal key. It is noted as a TODO at `background.ts:132-137`, and FR-06's `PROVIDER_ERROR` makes such a failure visible instead.

**Docs that go stale with FR-09 and must be updated in the same wave:**

- `CLAUDE.md:188`;
- `docs/handoff.md:697`;
- `docs/plans/README.md:34`;
- `docs/plans/feature-5-brandkit-from-references.md`;
- `docs/mcp-acp-guide.md:143-146`;
- `docs/security-prompt-injection-review-2026-07-22.md` (add a "closed by 005" note).
