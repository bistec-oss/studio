# bistec-studio: DevOps deploy handover

**For:** the company DevOps team (Coolify administrators)
**Written:** 2026-10-27, from branch `v2` at `caf0c0b` (`origin/main` was `671ad6e`)
**Scope:** fix the broken deploy pipeline and prod setup, then carry out the `v2` to `main` release.
**Rules for this document:** every claim names the file it comes from. Where two files disagree, both are cited. No secrets appear here; `<...>` marks a value you must supply.

Paths are relative to the repo root (`bistec-oss/studio`).

---

## 1. Summary

### What is broken today

| #   | Problem                                                                                                                                                                                                           | Source                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | **Deploys do not happen.** `COOLIFY_API_TOKEN` (a GitHub secret) has been rejected by Coolify with HTTP 401 since 2026-09-15. A merge to `main` builds and pushes the image to GHCR, but the redeploy step fails. | `docs/coolify-token-rotation.md`                                          |
| 2   | **The scheduler resource does nothing.** Scheduled generation never runs on prod (known as B4). The code and image are audited clean, so this is Coolify resource configuration.                                  | `docs/scheduler-b4-diagnosis-2026-08-03.md`                               |
| 3   | **No team Claude token on either prod team** (Bistec, Hearts Academy). Scheduled and MCP runs have no personal-token tier and fail on credentials, even after B4 is fixed.                                        | `docs/scheduler-b4-diagnosis-2026-08-03.md` (second blocker); `CLAUDE.md` |
| 4   | **MinIO on prod is unpullable and vulnerable.** The pinned MinIO image can no longer be pulled from any registry, and prod's release carries CVE-2026-40344 (CVSS 8.2).                                           | `docs/minio-silo-migration.md`                                            |
| 5   | **An OAuth token was pasted into chat on 2026-10-06** and must be revoked.                                                                                                                                        | `CLAUDE.md` (Outstanding work)                                            |
| 6   | **Both prod IMAGE providers are enabled but not marked default**, so a teammate without a personal OpenAI key gets no AI background. Generation still completes (it falls back to CSS/SVG). Not blocking.         | `docs/scheduler-b4-diagnosis-2026-08-03.md` ("Adjacent, non-blocking")    |

### What the release is

`v2` to `main` is **one pull request** that brings changes 004 to 031. It contains **22 new migrations** (counted with `git fetch origin` and `git diff --name-only origin/main origin/v2 -- prisma/migrations | grep migration.sql | wc -l`; the list is in section 6.1). CI on `v2` was green at `a511013` (commit message `docs(031): CI green at a511013`).

The merge is **not DevOps's to make**. It waits on the product owner's go-ahead and on three blocking steps (section 6.1) (`docs/handoff.md`, section "Pre-merge prod checklist").

**Contradiction to know about:** the checklist's opening line says `v2` "carries changes 004-024" (`docs/handoff.md`, line 515). That is stale. The same file adds "Check before the merge" lines for 025 to 031 below it, and the git diff shows migrations up to `20261030120000_apply_text_action` (031). Trust the git diff.

### ⚠️ The release is merged to `main` (2026-10-27): the first working deploy ships it

The product owner merged `v2` into `main` (PR #45) on 2026-10-27, once CI was green, **before** the operator steps in section 6.1. Prod did not change, because the Coolify token is dead. But **the first deploy that works after the token is rotated deploys the whole release** (22 migrations, including the drop of `Draft.copyText`). There is no longer a small "deploy `main` first" step.

The merge's build already pushed the release image to GHCR as `:latest`. So **any** deploy now ships it: the token test (section 3, step 3), a dispatch (step 4), and a manual **Redeploy** of either resource in Coolify. **Do not redeploy either resource until section 6.1 is done.** Do the release's blocking steps before the token goes back into GitHub.

### Recommended order

1. Security items (section 5). These can run at any time.
2. **The release's "before" steps (section 6.1): the `pg_dump`, the legacy-count query, the recovery plan and the env checks on both resources.**
3. Fix the pipeline (section 3): rotate the token. Its first successful deploy **is** the release (sections 6.3 and 6.4 apply to it); wait until `in_flight = 0`.
4. Fix the scheduler resource (section 4).
5. App-level setup by the owners (section 7).

---

## 2. Architecture in prod

### One image, two Coolify resources

- **One image**, `ghcr.io/bistec-oss/studio`, tagged `:latest` and `:sha-<full commit>` (`.github/workflows/docker-publish.yml`, "Extract metadata").
- **Two Coolify resources run it** (`.github/workflows/docker-publish.yml`; `docs/coolify-token-rotation.md`, "Resource UUIDs"):

  | Resource  | UUID                       | Start command                                                                  |
  | --------- | -------------------------- | ------------------------------------------------------------------------------ |
  | App       | `nck8s530pseqdcfxt50hndl5` | default `CMD` (`node server.js`, `Dockerfile` line 171)                        |
  | Scheduler | `warr96qhvzrie5ndwv8oteeu` | override **command** to `node dist/scheduler/worker.js` (`docker-compose.yml`) |

- The scheduler has no HTTP surface. It runs three loops: `scheduler` (publishing), `generation` (scheduled generation) and `retention` (analytics purge). Each writes a `WorkerHeartbeat` row on every tick (`src/scheduler/worker.ts`; `docs/handoff.md` checklist items for 023 and 006).
- The image has the Claude Code CLI pinned at 2.1.287 and Chromium for rendering (`Dockerfile` lines 86 to 98).

### The entrypoint (runs on every boot, both resources)

`Dockerfile` sets `ENTRYPOINT ["/app/docker-entrypoint.sh"]` (line 167). `docker-compose.yml` overrides only `command:`, so the scheduler boots through the same entrypoint. `docker-entrypoint.sh` does this in order, under `set -e`:

1. **Env preflight:** `node dist/scripts/env-preflight.js`. It loads `src/lib/env.ts`. A bad env value stops the boot **before any migration runs**. It has no skip flag, and it also runs when `SKIP_MIGRATIONS=1`.
2. **Migrations:** `node node_modules/prisma/build/index.js migrate deploy`. Prisma takes a Postgres advisory lock, so two containers starting together serialize; the second sees "No pending migrations" and continues. Set `SKIP_MIGRATIONS=1` on a resource for an emergency boot.
3. `exec "$@"` starts the command.

If a step fails, `set -e` ends the container, Coolify marks the deploy failed, and the previous container keeps serving (`docker-entrypoint.sh` header comment).

### Health endpoint

`GET https://studio.bistecglobal.com/api/health` returns `{ "ok": true, "commit": "<sha>" }`. The commit comes from the image build arg `GIT_SHA` (`src/app/api/health/route.ts`; `Dockerfile` lines 161 to 162; `.github/workflows/docker-publish.yml` "Build and push"). It is public and shows nothing else. It reports `unknown` if the image was built without the arg. **Prod's current image (`sha-09a38b71`) predates this route,** so until the first successful deploy of `main` it returns 404; read prod's running SHA from Coolify, **resource, Deployments**, until then.

### Storage and database

- **Postgres 16** (`docker-compose.yml`, `postgres:16-alpine`).
- **Object storage:** MinIO-compatible. The repo's `docker-compose.yml` already pins **pgsty/silo** by digest. Prod's Coolify MinIO service is separate and **still has the old MinIO image** (section 5.1). Public buckets: images, brand kits. Private: exports (signed on read) and campaign docs (`.env.example`).
- The browser-facing storage URL is `MINIO_PUBLIC_ENDPOINT`, falling back to `MINIO_ENDPOINT` (`src/lib/env.ts`).

### Environment variables (names only)

The scheduler's `.env` must be **identical** to the app's. A scheduler with a different `DATABASE_URL` is one of the four B4 causes (`docs/scheduler-b4-diagnosis-2026-08-03.md`).

**Required in production.** `src/lib/env.ts` refuses to start without these ("Production fail-fast checks"):

| Variable                               | Rule                                             |
| -------------------------------------- | ------------------------------------------------ |
| `TOKEN_ENCRYPTION_KEY`                 | 64-character hex (32 bytes); not the placeholder |
| `BETTER_AUTH_SECRET`                   | set; not the placeholder                         |
| `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` | set; neither may be `minioadmin`                 |

**Also needed in practice** (read by the app; `src/lib/env.ts`, `.env.example`):

| Variable                                                 | Note                                                                                                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                           | read by Prisma; the same value on both resources                                                                                                                            |
| `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`                 | the public app URL                                                                                                                                                          |
| `MINIO_ENDPOINT`, `MINIO_PUBLIC_ENDPOINT`                | internal and browser-facing storage URLs. Export links are signed against `MINIO_ENDPOINT`'s host (`docs/handoff.md`, 2026-07-16 note in `CLAUDE.md`)                       |
| `MINIO_BUCKET_IMAGES`, `_EXPORTS`, `_BRANDKITS`, `_DOCS` | optional; defaults exist                                                                                                                                                    |
| `DESIGN_PROVIDER`                                        | `cli` (Claude Code CLI) or `claude-html` (API mode). `CLAUDE.md` says prod runs CLI mode. Confirm on the resource. **Never `cli` together with `MOCK_AI`** (the boot fails) |
| `ANTHROPIC_API_KEY`                                      | API mode only (`.env.example`)                                                                                                                                              |
| `CLAUDE_CLI_MODEL`                                       | optional. If set it must be `haiku`, `sonnet`, `opus` or a current model ID. **Any other value, including `default`, stops the boot** (section 5.3)                         |
| `IMAGE_QUALITY`                                          | optional; leave **unset** on prod (`.env.example`)                                                                                                                          |
| `PUPPETEER_EXECUTABLE_PATH`                              | the image sets `/usr/bin/chromium` (`Dockerfile` line 102)                                                                                                                  |
| `PUPPETEER_MAX_CONCURRENCY`, `CLAUDE_CLI_DEBUG`          | optional                                                                                                                                                                    |
| `MCP_API_KEY`                                            | only for a stdio MCP client; not a server setting                                                                                                                           |
| `SKIP_MIGRATIONS`                                        | emergency only                                                                                                                                                              |

**Never set in production:** `MOCK_AI`, `MOCK_PUPPETEER`, `MOCK_SOCIAL`, `MOCK_SOCIAL_FAIL` (`.env.example`).

**Not env vars any more:** OpenAI keys, Claude OAuth tokens, social tokens and MCP/ACP keys live in the database, set in the app (`.env.example`). `GIT_SHA` is a build arg, not something you set on the resource.

---

## 3. Fix the pipeline first

**Goal:** a push to `main` builds the image, redeploys both resources, and CI confirms `/api/health` serves that commit.

**Current state of `main`:** `origin/main` already has the fixed workflow (it POSTs to `/api/v1/deploy`, redeploys both resources, and verifies `/api/health`). `.github/workflows/docker-publish.yml` is identical on `main` and `v2` (the diff between them is empty). So the "Phase 0 has merged" branch of the rotation doc applies. Ignore the rotation doc's "not merged" branch.

### Steps (from `docs/coolify-token-rotation.md`)

1. **Create a new Coolify API token** (Coolify v4: **Keys & Tokens, API tokens**; check the label in your version).
   - Abilities: **`deploy` and `read`**. `deploy` triggers the redeploys. `read` lets the workflow poll `GET /api/v1/deployments/<uuid>`. A deploy-only token redeploys but the verify step fails with "token rejected".
   - It must belong to the team that owns both resources, and be created by a team **Admin or Owner**, not a Member. A Member's token gets HTTP 200 but the body says `"Unauthorized to deploy this application."` and nothing deploys.
   - Copy the value. Coolify shows it once.
2. **Save it as the GitHub secret:**

   ```sh
   gh secret set COOLIFY_API_TOKEN --repo bistec-oss/studio
   ```

   Paste the value when prompted (it stays out of shell history). Or use GitHub, **Settings, Secrets and variables, Actions, `COOLIFY_API_TOKEN`, Update**.

3. **Test the token directly** (safe at any time; it redeploys the current `:latest`):

   ```sh
   read -rs COOLIFY_TOKEN   # paste the token; not echoed
   curl -sS -X POST -H "Authorization: Bearer $COOLIFY_TOKEN" \
     "https://coolify.bistecglobal.com/api/v1/deploy?uuid=nck8s530pseqdcfxt50hndl5&force=false"
   curl -sS -X POST -H "Authorization: Bearer $COOLIFY_TOKEN" \
     "https://coolify.bistecglobal.com/api/v1/deploy?uuid=warr96qhvzrie5ndwv8oteeu&force=false"
   curl -sS -H "Authorization: Bearer $COOLIFY_TOKEN" \
     "https://coolify.bistecglobal.com/api/v1/deployments/<deployment_uuid from above>"
   unset COOLIFY_TOKEN
   ```

   - Good: each deploy reply has a `deployment_uuid`; the deployments call returns 200 with a `status`.
   - HTTP 401 or 403: token rejected; redo step 1.
   - HTTP 200 with `Unauthorized to deploy this application.` and no `deployment_uuid`: the token is a Member's; recreate it as Admin or Owner.

4. **Prove the pipeline end to end** by triggering a fresh run on `main`:

   ```sh
   gh workflow run docker-publish.yml --ref main --repo bistec-oss/studio
   ```

   Or use **Actions, Build and push Docker image, Run workflow** with `main`. The job is guarded to `main` only (`if: github.ref == 'refs/heads/main'`).
   - **Do not re-run the old failed run** (34988162569). It would rebuild an old commit as `:latest` (`docs/coolify-token-rotation.md`, step 3).
   - **Heads-up: this dispatch deploys the release.** A dispatch deploys whatever `main` is, and since 2026-10-27 `main` holds the merged `v2` release (PR #45): 22 migrations, Node 22, the drop of `Draft.copyText`. Prod still runs `sha-09a38b71` (`docs/coolify-token-rotation.md`). Do section 6.1 first, then treat this run as the release deploy (sections 6.3 to 6.5). The merge's own build already pushed the release image to GHCR as `:latest` (its redeploy step then failed on the dead token), so the direct `curl` test in step 3 deploys the release too.

### How to verify it worked

- Step **Redeploy on Coolify (app + scheduler, both always attempted)** prints `app redeploy: HTTP 200 (ok)` and `scheduler redeploy: HTTP 200 (ok)`. A line `queued no deployment: ...` means the token is a Member's.
- Step **Verify deploy** is green. It polls `/api/health` for up to about 10 minutes (40 polls of 15 s) until the commit equals the run's SHA, and polls the scheduler's Coolify deployment until `finished`.
- By hand:

  ```sh
  curl -s https://studio.bistecglobal.com/api/health
  ```

  It returns the `main` commit SHA.

**Limit:** the scheduler check proves the container deployed, not that the worker loops run (`.github/workflows/docker-publish.yml` comment above "Verify deploy"). Section 4 covers that.

**Tell the dev team** when it is done (`docs/coolify-token-rotation.md`, step 4).

---

## 4. Fix the scheduler resource (B4)

**Do not re-audit the code or image.** It is verified clean (`docs/scheduler-b4-diagnosis-2026-08-03.md`, "Ruled out").

### Step 1: read the scheduler resource's logs in Coolify

The first lines tell you which cause it is:

| Logs show                                                                   | Cause                                                                                                                | Fix                                                                                                                                                                                                 |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `▲ Next.js` / listening on port 3000                                        | **Start command not overridden.** It is a second copy of the web app: deploys green, polls nothing. **Most likely.** | Set the resource's **Start Command** to `node dist/scheduler/worker.js`. Override the **command**, not the entrypoint: overriding the entrypoint would skip `migrate deploy` and the env preflight. |
| `[scheduler] starting, poll interval: 60000 ms`                             | The worker **is** running, so it points at a different database.                                                     | Make `DATABASE_URL` byte-identical to the app's. The whole env should match.                                                                                                                        |
| `[entrypoint] applying pending Prisma migrations…` then an error, repeating | **Crash-loop.** A failed `migrate deploy` exits before the worker starts.                                            | Fix the failing migration or database permissions. `SKIP_MIGRATIONS=1` on the resource is the emergency boot.                                                                                       |
| Nothing                                                                     | Resource stopped or never created.                                                                                   | Start it, or create it from the same image and `.env` with the start command above.                                                                                                                 |

A log line `[preflight] environment invalid — refusing to boot` is a different failure: a bad env value (section 5.3). It appears before any migration.

### Step 2: set team Claude tokens first (a second, independent blocker)

Even a running worker fails every scheduled job today. Scheduled runs use `withClaudeAuth(null, teamId, …)`, so there is no personal-token tier, only the team's token. Neither prod team has one. Result: three retries at 20/40/60 minutes, then `FAILED` about two hours later (`docs/scheduler-b4-diagnosis-2026-08-03.md`). This is a team-admin action at `/team` (section 7); schedule it so the token exists before you declare B4 fixed.

The worker logs which teams lack a token at startup: `[scheduler] N team(s) have no Claude token — …` (`src/scheduler/worker.ts`). That line also confirms you are reading a real worker's log.

### How to verify

1. Scheduler logs show `[scheduler] starting, poll interval: 60000 ms`.
2. In the app, a campaign's queue panel shows **no** "Scheduler offline" banner. The banner appears when the newest worker tick is older than about 3 minutes, and names the loop that is down (`docs/scheduler-b4-diagnosis-2026-08-03.md`, "Check the banner first"; `docs/handoff.md`, 023 item). It clears within about a minute of the first tick.
3. Optional end-to-end test by a team admin: create a HOLD queue entry with `generateAt` in the past. Within 60 s it goes `PENDING` to `RUNNING`; a full CLI-mode generation takes about 5 minutes and ends `COMPLETED` with a draft.

**The banner is the quick B4 signal.** A banner that stays after a deploy means the scheduler resource is not running.

---

## 5. Security items

### 5.1 MinIO to silo (CVE-2026-40344)

Full procedure: `docs/minio-silo-migration.md`. Short version:

1. Shell access to the Coolify host. Allow a minute or two of MinIO downtime, and free disk equal to the data volume.
2. Record the running image and volume:

   ```sh
   docker inspect minio-ahhurs4f46a66uva7tx3ayam --format '{{.Config.Image}} {{.Image}} {{json .Mounts}}'
   ```

   (That container name was correct when the doc was written; find the right one in Coolify if it differs.)

3. Keep a rollback image: `docker tag <image id from step 2> local/minio-rollback:pre-silo`
4. Back up the volume:

   ```sh
   docker run --rm -v <volume from step 2>:/data:ro -v /root/backups:/b alpine \
     tar czf /b/minio-$(date +%F).tgz -C /data .
   ```

5. In Coolify, open the MinIO service, **Edit Compose**, and change **only** the `image:` line to:

   ```
   pgsty/silo:RELEASE.2026-09-16T00-00-00Z@sha256:635197cb9f36d01bee221d34d1c7d7960f6a95c48b0b6c01d99cd13bdae51a46
   ```

   Save and Redeploy. Leave `command`, `environment`, `volumes` and `healthcheck` as they are.

6. Verify: logs show `Silo Object Storage Server` and `RELEASE.2026-09-16`; the healthcheck is green; library thumbnails (signed export reads) and brand-kit logos (public reads) load; one real generation completes.
7. Rollback if needed: set `image:` back to `local/minio-rollback:pre-silo` and Redeploy. Data is compatible both ways.

**When:** do this **before** the release, not during it, so a storage problem is not mixed up with a release problem. This is a recommendation; no file requires the order.

Later (not urgent): mirror the pinned image to `ghcr.io/bistec-oss/silo` (`docs/minio-silo-migration.md`, "Later").

### 5.2 Revoke the pasted OAuth token (owner action)

The product owner must revoke the Claude OAuth token that was pasted into chat on 2026-10-06 and create a new one with `claude setup-token` (`CLAUDE.md`, Outstanding work). DevOps cannot do this. Confirm it was done. The new token then goes into `/settings` (personal) or `/team` (team), never into `.env` (`.env.example`).

### 5.3 `CLAUDE_CLI_MODEL` check (both resources)

- Accepted values: `haiku`, `sonnet`, `opus` (any case), or a **current** model ID such as `claude-sonnet-5-5`. Unset is fine. `default`, a retired ID, or anything else throws at boot (`src/lib/env.ts`, `parseCliModelEnv`; `.env.example`).
- Since change 022 the check also runs in the entrypoint **before** migrations, so a bad value fails the deploy with the schema untouched (`docker-entrypoint.sh`).
- The product owner said on 2026-10-18 that prod sets a catalogue key. **Re-read the value in Coolify on both the app and the scheduler resource at merge time** (`docs/handoff.md`, "Check before the merge", `CLAUDE_CLI_MODEL`).

### 5.4 Other secrets hygiene

- Rotate nothing else on your own initiative. This document lists no secret values.
- MinIO credentials must not be `minioadmin` (`src/lib/env.ts`); the boot refuses them.

---

## 6. The `v2` to `main` release runbook

**Source of truth:** `docs/handoff.md`, section "Pre-merge prod checklist: `v2` to `main`" (line 513 on), plus the "016 runbook" and "008 runbook" below it.

**Context:** prod holds real data (the Hearts Academy team, its kit and IRP posts). There was **no prod dump** when this was planned, so the upgrade path was proven only on synthetic data with `npm run test:upgrade`. The three blocking steps below are the compensating control (`docs/handoff.md`, "The named waiver").

### 6.1 Before the merge

**A. The three blocking steps (all three, before the merge):**

1. **Back up prod:**

   ```sh
   pg_dump -Fc -f studio-prod-<date>.dump "<prod DATABASE_URL>"
   ```

   Keep the file **off the prod server** and record where it is.

2. **Run the legacy-count query on prod** and record both numbers:

   ```sql
   SELECT count(*) FILTER (WHERE "copyText" IS NOT NULL) AS legacy,
          count(*) FILTER (WHERE status = 'IN_PROGRESS' OR "pendingAction" IS NOT NULL) AS in_flight
   FROM "Draft";
   ```

   - `legacy` is how many drafts the carry-over converts. The post-deploy checks use it.
   - **`in_flight` must be 0 at deploy time.** Re-run the query just before the deploy and wait for running generations and draft actions to finish.

3. **Know the recovery plan** (section 6.5) before deploying. Read it now.

**B. Environment checks on both resources (app and scheduler):**

- Both have valid values for the required variables in section 2. The entrypoint preflight will refuse to boot otherwise, and it does so before any migration.
- `CLAUDE_CLI_MODEL` is unset or valid (section 5.3).
- `MOCK_*` variables are not set.
- Both resources use the **same** `.env`.

**C. Pipeline and scheduler are fixed** (sections 3 and 4). A merge before section 3 builds an image but does not deploy it (`docs/handoff.md`, last line of the checklist).

**D. Other checks from the handoff checklist:**

- **External `copyText` callers.** Change 016 removed `copyText` from MCP `get_draft` and `generate_post`, ACP `generate_post` and `POST /api/generate/copy`. Confirm no external caller reads it, using each team's API keys and last-use at `/team` (a team-admin view).
- **Release notes for the PR** (`docs/handoff.md`): teams whose IMAGE key is not default start using, and spending, it for scheduled, MCP and agent images (005 NFR-03); models are chosen per team and `CLAUDE_CLI_MODEL` is the system default (008); every legacy caption is copied whole to Instagram and LinkedIn and the original is kept in `LegacyCaptionArchive` (022); queued auto-publish entries created before 027 can be **held** by the facts check on their first run (it completes with a `heldReason` and publishes nothing; mandatory release note).
- **Deploy at a quiet time.** Between 016's column drop and the cutover to the new container, the old container's draft reads fail because `Draft.copyText` is gone (`docs/handoff.md`, "The deploy window").

**E. The migration list.** Produce it at merge time; never keep it by hand (`docs/handoff.md`):

```sh
git fetch origin
git diff --name-only origin/main origin/v2 -- prisma/migrations
```

At `v2` head `caf0c0b` this gives **22 migrations**:

```
20260927120000_draft_font_set
20260927130000_refine_not_applied
20261001120000_revision_render_stamps
20261002120000_draft_background_skip
20261011120000_channel_whatsapp
20261011130000_draft_captions
20261011140000_legacy_caption_text
20261012120000_model_selection
20261012130000_legacy_caption_carryover
20261013120000_drop_legacy_captions
20261013130000_drop_empty_default_team
20261020120000_draft_action_claim_id
20261021120000_worker_heartbeat
20261022120000_hero_composition
20261023120000_caption_route
20261024120000_analytics_events
20261025120000_post_styles
20261026120000_composite_source
20261027120000_rendered_text
20261028120000_personal_image_key_provider
20261029120000_post_fonts
20261030120000_apply_text_action
```

The entrypoint applies them all in one `migrate deploy` on boot. The carry-over `20261012130000` sorts before 016's `20261013120000`, which is what keeps 016's guard from firing on prod data (`docs/handoff.md`, 016 runbook "Deploy"). Re-run the command at merge time; the count can change if more commits land.

**What the migrations do to data (from the handoff):**

- `20261012130000_legacy_caption_carryover` archives every legacy `copyText` in `LegacyCaptionArchive` (never dropped) and gives each unconverted draft three READY caption rows. Instagram and LinkedIn get the whole text; WhatsApp gets an empty string.
- `20261013120000_drop_legacy_captions` drops `Draft.copyText`, two other caption columns and the `CaptionMigration` enum. This is the step that makes an image-only rollback impossible (section 6.5).
- `20261013130000_drop_empty_default_team` deletes the migration-created "Bistec" team (`team_bistec_default`) **only if it is empty**. A team in use is kept.
- All the others are additive. `20261030120000_apply_text_action` adds an enum value that a rollback cannot drop.

### 6.2 The merge

- **One PR, `v2` into `main`. Only the product owner decides to merge** (`CLAUDE.md`, repo rules). DevOps does not merge and does not push to `main`.
- `main` auto-builds on push (`.github/workflows/docker-publish.yml`). The CI gate `.github/workflows/e2e.yml` runs on every PR and on pushes to `v2` and `main`. It runs typecheck, lint, E2E, unit tests, the upgrade test from `main`'s schema, a build, and a no-push docker build with the env preflight. It deploys nothing.
- Do not re-run an earlier workflow run after the merge (`docs/coolify-token-rotation.md`).

### 6.3 During the deploy

1. GitHub builds the image and pushes `:latest` and `:sha-<commit>` to GHCR.
2. The workflow POSTs a redeploy for the app, then the scheduler. Both are always attempted.
3. Each new container runs the entrypoint: **preflight, then `migrate deploy`, then the command** (section 2). Both resources start close together; the advisory lock serializes them.
4. **The `legacy` numbers are used here:** the carry-over migration runs once, in this first deploy.
5. CI polls `/api/health` for up to about 10 minutes for the new commit, and polls the scheduler deployment status. The budget is sized to cover a migration (`docker-publish.yml` comment).

**How failure behaves:**

- **Bad env:** `[preflight] environment invalid — refusing to boot (no migration was run)`. The deploy fails, the schema is untouched, and the previous container keeps serving.
- **A migration fails:** the entrypoint exits (`set -e`), Coolify marks the deploy failed and the previous container keeps serving. Migrations are not one transaction across the whole set, so earlier ones in the same run may already be committed. They are additive, and the previous image reads them (`docs/handoff.md`, blocking step 3).
- **If the carry-over migration itself fails** (the error starts `022 legacy_caption_carryover: …`): it is one atomic block and wrote nothing. **Act at once.** The failed row in `_prisma_migrations` makes every later `migrate deploy` fail with P3009, so any container that restarts through the entrypoint (the previous app container or the scheduler included) cannot boot until you run:

  ```sh
  DATABASE_URL="<prod DATABASE_URL>" npx prisma migrate resolve --rolled-back 20261012130000_legacy_caption_carryover
  ```

  From a workstation that is the command in the handoff. Inside the prod image there is no `npx` on PATH (`docker-entrypoint.sh` comment), so the equivalent there is `node node_modules/prisma/build/index.js migrate resolve --rolled-back 20261012130000_legacy_caption_carryover` with `DATABASE_URL` set. This second form is my adaptation from the entrypoint, not a documented command; test it once on a scratch database.

- **016's own guard** (`016 drop_legacy_captions: this system is fresh-start only…`) should not fire after the carry-over. If it does, do **not** reset the database. Find out why the carry-over did not convert the rows (`docs/handoff.md`, 016 runbook).

### 6.4 After the deploy

Run these right away, before users create new drafts (`docs/handoff.md`, "After the deploy (operator)"):

```sql
SELECT count(*) FROM "LegacyCaptionArchive";   -- must equal the recorded `legacy`
SELECT count(*) FROM "DraftCaption";           -- must equal 3 x `legacy`
```

The `DraftCaption` baseline is 0, because that table is created by `20261011130000_draft_captions`, which is part of this same deploy. Once users create new drafts the number moves, which is why the check is time-boxed.

Then:

1. `curl -s https://studio.bistecglobal.com/api/health` returns the merged commit. The workflow also checks this.
2. **Scheduler banner:** open a campaign's queue panel. No "Scheduler offline" banner within about a minute of the scheduler's first tick. A banner that stays means the scheduler resource is not running (section 4).
3. **Retention tick:** `/admin/insights` (super admin only) shows a recent retention tick. The retention loop starts with the scheduler deploy. A stale tick also means B4 (`docs/handoff.md`, 006 item).
4. **Open one converted draft.** Instagram and LinkedIn show the old caption. The handoff checklist also says "WhatsApp is empty", but change 026 later removed the WhatsApp panel, so the page shows only Instagram and LinkedIn captions and the old WhatsApp rows are hidden, not deleted (`docs/handoff.md` 026 item). Treat the two lines as consistent: no visible WhatsApp panel.
5. **Held queue entries (027):** look at the campaign queues for a held line on entries that were auto-publish before the deploy.
6. **Migration state:** `SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 25;` shows no row with a null `finished_at`.

### 6.5 Rollback

**Rule: the rollback is "restore the dump, then redeploy the previous SHA".** Rolling back the image alone does not work. Once 016 has dropped `Draft.copyText`, the old image cannot read drafts (`docs/handoff.md`, blocking step 3).

1. Stop both resources (app and scheduler).
2. Restore the `pg_dump` from step 6.1.A into the database. Use your standard restore procedure for a `-Fc` dump (`pg_restore`). Test the procedure on a scratch database **before** the release; the handoff gives the dump command but not the restore command.
3. Redeploy the previous SHA, using the image tag `sha-<previous main commit>` from GHCR. Confirm that `main` was `671ad6e` before the merge (`git rev-parse origin/main` at the time of writing).
4. If the previous image's `migrate deploy` refuses because a newer migration is recorded, boot it with `SKIP_MIGRATIONS=1` (`docs/handoff.md`, 008 runbook "Rollback"). After a full restore this should not happen.
5. Verify `/api/health` returns the previous SHA.

**Per-change down scripts** are in `prisma/rollback/` (`006`, `009`, `016`, `019`, `023`, `024`, `025`, `027`, `030`, `031`). They are **manual**: they sit outside `prisma/migrations/`, so `migrate deploy` never runs them, and the checklist uses them only as a fallback for a partial rollback.

- Run them with `psql -v ON_ERROR_STOP=1 "<DATABASE_URL>" -f prisma/rollback/<file>.sql` or `npx prisma db execute --file <file> --url "$DATABASE_URL"` (`docs/handoff.md`, 016 runbook).
- Stop both resources first if the running code reads what the script drops.
- `031-v2-final-polish.down.sql` is run in **reverse** order (the 031 migrations in the order C, B, A). It cannot drop the enum value `APPLY_TEXT`. A rollback of 031 also deletes every non-OpenAI personal image key (`docs/handoff.md`, 031 item).
- `016-fresh-start-cleanup.down.sql` re-adds the dropped columns **empty**; it restores no caption text. On a database converted by the carry-over, the original text is in `LegacyCaptionArchive`. On prod, the dump restore is the real recovery.
- Several scripts discard data (events, stamps, stored choices). Read the header of each before running it.
- There is **no down script** for the 012 or 008 era (`docs/handoff.md`, 016 runbook: "There is no rollback to before 012 or 008 any more").

**An additive-only migration needs no down script for an image rollback** (the previous image ignores new columns), but that statement stops being true at 016 and the carry-over.

---

## 7. App-level setup after the deploy

These are product-owner or team-admin actions in the app, **not DevOps work**. DevOps should know them because scheduled runs and MCP fail until they are done.

| #   | Action                                                                                                                                                                                                                                                                              | Where                 | Who           | Source                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------- | ---------------------------------------------------------------------------------------- |
| 1   | **Set a team Claude token for each prod team** (Bistec and Hearts Academy). Create it with `claude setup-token` on a Claude account; paste it into the Claude account section. Scheduled posts, MCP and ACP use only this token.                                                    | `/team`               | team admin    | `docs/claude-account-setup.md` (team token); `docs/scheduler-b4-diagnosis-2026-08-03.md` |
| 2   | **Mark the IMAGE provider default** on each team. Without it, a teammate who has no personal OpenAI key gets no AI background. Marking it default means that team's key is used, and spent, for scheduled, MCP and agent images (005 NFR-03).                                       | `/team`, AI Providers | team admin    | `docs/scheduler-b4-diagnosis-2026-08-03.md`; `docs/handoff.md` release notes             |
| 3   | **Choose the caption route if wanted** (Claude CLI (OAuth) or an Anthropic API key). A team that never chooses keeps today's behaviour. Do this **only after both containers serve the new image**. `API_KEY` needs an enabled `anthropic` COPY row first, or captions fail closed. | `/team`               | team admin    | `docs/handoff.md`, 024 item                                                              |
| 4   | **Re-issue MCP/ACP keys if used.** Keys are hashed `bstk_` rows; the old env-list keys no longer work, and plaintext is shown once at creation.                                                                                                                                     | `/team`               | team admin    | `CLAUDE.md` (Team tenancy); `docs/mcp-acp-guide.md`                                      |
| 5   | **Connect personal tokens** (own Claude token, optional image generation key). Not needed for scheduled runs.                                                                                                                                                                       | `/settings`           | each user     | `CLAUDE.md`                                                                              |
| 6   | **Revoke the pasted OAuth token** (section 5.2).                                                                                                                                                                                                                                    | Claude account        | product owner | `CLAUDE.md`                                                                              |
| 7   | Optional: close the Hearts Academy colour drift and look at one real upgrade (007 operator step).                                                                                                                                                                                   | `/admin/brandkits`    | team admin    | `docs/handoff.md`, 007 section                                                           |

**Even with a team token, a scheduled post can still end without an AI background** until step 2 is done, because the image provider falls to the default row (`docs/scheduler-b4-diagnosis-2026-08-03.md`).

**Social publishing** (Instagram, LinkedIn) still needs credentials registered per team at `/team`, Social Channels. It was listed as an outstanding prod test (`CLAUDE.md`); setup is in `docs/social-publishing-setup.md`.

---

## 8. Checklist

"Blocking" means the next step in the order should not start until it is done.

| #   | Item                                                                                                                       | Owner                      | Blocking?                                           | How to verify                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | Create Coolify API token (`deploy` + `read`, Admin/Owner)                                                                  | DevOps                     | Yes, blocks all deploys                             | The two `curl` POSTs in section 3 return a `deployment_uuid`; the deployments GET returns 200           |
| 2   | Set `COOLIFY_API_TOKEN` GitHub secret                                                                                      | DevOps                     | Yes                                                 | `gh workflow run docker-publish.yml --ref main`: both redeploy lines `HTTP 200 (ok)`; Verify step green |
| 3   | `/api/health` returns the `main` commit                                                                                    | DevOps                     | Yes                                                 | `curl -s https://studio.bistecglobal.com/api/health`                                                    |
| 4   | Scheduler start command is `node dist/scheduler/worker.js` (or the cause the log line shows)                               | DevOps                     | Yes for scheduled posts; not for the release        | Logs show `[scheduler] starting, poll interval: 60000 ms`                                               |
| 5   | Scheduler `.env` identical to the app's, including `DATABASE_URL`                                                          | DevOps                     | Yes for scheduled posts                             | Compare both resources' env in Coolify                                                                  |
| 6   | "Scheduler offline" banner clear                                                                                           | DevOps                     | Yes for scheduled posts                             | Campaign queue panel shows no banner within about a minute of the first tick                            |
| 7   | Team Claude token set for Bistec and Hearts Academy                                                                        | team admin                 | Yes for scheduled and MCP runs; not for the release | Worker log "all teams have a Claude token configured"; `/team` shows connected                          |
| 8   | MinIO to silo (backup, rollback tag, change `image:`, redeploy)                                                            | DevOps                     | Recommended before the release; security-urgent     | Logs show `Silo Object Storage Server`; healthcheck green; thumbnails and logos load                    |
| 9   | Revoke the OAuth token pasted on 2026-10-06; mint a new one                                                                | product owner              | No (security-urgent)                                | Owner confirms in writing                                                                               |
| 10  | `CLAUDE_CLI_MODEL` unset or valid on **both** resources                                                                    | DevOps                     | Yes (a bad value stops the boot)                    | Value is `haiku`, `sonnet`, `opus` or a current model ID; preflight prints `environment ok`             |
| 11  | Required env set on both resources (`TOKEN_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, non-default MinIO keys); no `MOCK_*`     | DevOps                     | Yes                                                 | Preflight line `[preflight] environment ok` in both resources' boot logs                                |
| 12  | `pg_dump` of prod, stored off the prod server; restore tested on a scratch database                                        | DevOps                     | **Yes, blocks the merge**                           | Dump file exists; test restore succeeds                                                                 |
| 13  | Legacy-count query run; `legacy` recorded; `in_flight = 0` immediately before deploy                                       | DevOps                     | **Yes, blocks the merge**                           | The two numbers written down; re-run just before the deploy                                             |
| 14  | Recovery plan read (restore dump + previous SHA; the `migrate resolve` command for a failed carry-over)                    | DevOps                     | **Yes, blocks the merge**                           | Previous SHA and GHCR tag `sha-<commit>` noted                                                          |
| 15  | Migration list produced (22 at `caf0c0b`)                                                                                  | DevOps                     | No                                                  | `git diff --name-only origin/main origin/v2 -- prisma/migrations \| grep migration.sql \| wc -l`        |
| 16  | External `copyText` callers confirmed none                                                                                 | team admin / product owner | No (a check)                                        | `/team` API keys and last use                                                                           |
| 17  | Go-ahead to merge `v2` into `main`                                                                                         | product owner              | **Yes**                                             | Written go-ahead; DevOps does not merge                                                                 |
| 18  | After deploy: `LegacyCaptionArchive` = `legacy`; `DraftCaption` = 3 x `legacy`                                             | DevOps                     | Yes (before users create drafts)                    | The two SQL counts in section 6.4                                                                       |
| 19  | After deploy: banner clear; `/admin/insights` retention tick recent; one converted draft opens; no held entries unexpected | DevOps + product owner     | Yes (verification)                                  | Section 6.4, items 2 to 5                                                                               |
| 20  | Mark IMAGE provider default on each team                                                                                   | team admin                 | No                                                  | `/team` shows the default state                                                                         |
| 21  | Choose caption route (optional); re-issue MCP/ACP keys if used                                                             | team admin                 | No                                                  | `/team`                                                                                                 |

---

## Things this document could not verify

- **No access to Coolify, GHCR or prod.** Everything about prod's current state (resource start commands, env values, MinIO image, token ownership) comes from the repo docs, dated 2026-07 to 2026-10, and may have changed.
- **Prod's `DESIGN_PROVIDER`** is stated as CLI mode in `CLAUDE.md` but is not visible in any file you can check; confirm it on the resources.
- **The Postgres restore procedure** is not written anywhere in the repo; only the dump command is. Section 6.5 says to test it first.
- **The in-container `migrate resolve` form** (section 6.3) is derived from the entrypoint, not from a documented command.
- **Whether the prod MinIO service has already been switched to silo.** `docs/minio-silo-migration.md` says open (2026-09-27); `docker-compose.yml` in the repo already pins silo, but that file is not prod's Coolify config.
- `docs/coolify-token-rotation.md` discusses a "Phase 0 not merged" branch; that is stale, because `main` already has the fixed workflow. Its `sha-09a38b71` for prod's running image is probably still true, because no deploy has succeeded since: `git log 09a38b71..origin/main` is one commit (PR #42). Confirm it in Coolify, **resource, Deployments**; `/api/health` does not exist on that image.
