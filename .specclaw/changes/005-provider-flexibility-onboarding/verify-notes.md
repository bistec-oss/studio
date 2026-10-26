<!-- Copied from the gitignored .superpowers/sdd/005/verify-notes.md on 2026-10-03 so another machine can run /specclaw:verify. Keep both in sync until verify writes verify-report.md. -->

# 005 verify-report inputs

**Known limits:**

- **The background skip notice is per draft, not per revision** (T2 concern 4). After a restore or Undo, the notice describes the latest generation, regenerate or refine, which matches how `imageUrl` already behaves.
- **A rejected (not-applied) refine or a brand-kit-conflicted refine records no skip** (T2 concern 3).
- **A refine on a team with no image provider leaves the skip unchanged,** and never records NO_PROVIDER itself (T2 ruling). Generation on that team has already recorded NO_PROVIDER.
- **The skip-detail redaction of `name:digits` host:port is broad,** so a string like `status:429` also reads as `<host>` (T2 fix round, FR-3).
- **The refine skip writer stores only PROVIDER_ERROR.** NO_PROVIDER and DECISION_ERROR from a refine leave the notice unchanged, by design.
- **"Exactly the allowlist" holds at the `buildChildEnv` level.** On win32, libuv re-adds non-secret required vars (HOMEDRIVE, HOMEPATH, USERNAME, WINDIR…), and cmd.exe adds PROMPT. None of them is a secret (T4 review).
- **AC-16 is an operator run** (docker-build-local, the user's own token through `--env-file`). The result must be recorded in verify-report, along with the pinned version 2.1.287.
- **The CLI vision size guards** are 5 MB per image (conservative, stricter than the direct API's limit) and 32 MB per call.
- **The pinned CLI 2.1.287 declares Node ≥22,** and the v2 runner is node:20, which only prints an EBADENGINE warning. Re-check AC-17 after merging main (#42's node:22) into v2.
- **Unit runs leave empty `bistec-cli-*` temp dirs** (the real mkdtemp runs). This is a follow-up.
- **Gemini (T8) is mock-verified only — no live key; the request and response shapes are from https://ai.google.dev/api/generate-content and https://ai.google.dev/gemini-api/docs/image-generation as of 2026-10-02** (AC-21, user decision 2026-10-01). Model `gemini-3.1-flash-image`, over generateContent (not the newer Interactions API the image-generation page's REST examples use). A live check should diff against those pages first (design R5).

**Build rulings that verify must judge against** (the binding detail is in the per-task reports under `reports/`):

- **FR-02 and FR-03 apply to the IMAGE slot only** (T1 fix round). COPY behaviour is byte-identical to before 005.
- **Refine resolves the image provider first.** `refineSkipFields` stores only PROVIDER_ERROR (T2 fix round).
- **The moderation regex is anchored and provider detail is redacted** (T2 fix round).
- **Auth classification reads only CLI-written fields:** `api_error_status` 401, or 403 with "OAuth token revoked" result text. It never reads model text (T5 review → T6, T6 fix round).
- **Settings isolation:** `--safe-mode`, `--setting-sources ""`, `--no-session-persistence`, an empty temp cwd and `DISABLE_AUTOUPDATER=1` (T6; spec FR-08/AC-14 amended).
- **The native installer is the primary Windows route,** with winget as an alternative (T9; spec FR-14/AC-22 amended).
- **T10's screenshots were taken with Playwright,** because chrome-devtools MCP was disconnected.
