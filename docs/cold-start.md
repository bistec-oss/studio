# bistec-studio — Cold-Start Testing Setup

Everything that must be true **before** `npm run dev` will run and the app will actually work.
Follow this top-to-bottom on a fresh machine or after `docker compose down -v` / a clean clone.

> **Always run the preflight check first (§0).** Most "it doesn't work" reports are a missing
> `.env`, a stopped container, or un-applied migrations — not a code bug.

---

## 0. Preflight — verify the working environment

Run these and confirm each before starting the dev server. If any fails, fix it in the matching section below.

```bash
node --version          # expect v20.6+ (needed for --env-file); repo tested on v24
docker ps               # expect bistec_studio_postgres AND a minio container, both Up
test -f .env && echo ".env present" || echo "MISSING .env"
npx prisma migrate status   # expect "Database schema is up to date!"
```

Quick connectivity probes (host → containers):

```bash
# Postgres reachable on 5432?
node --env-file=.env -e "const{PrismaClient}=require('@prisma/client');new PrismaClient().\$queryRaw\`SELECT 1\`.then(()=>console.log('DB OK')).catch(e=>{console.error('DB FAIL',e.message);process.exit(1)})"

# MinIO reachable on 9000? (must be PUBLISHED to host for host-side dev — see §3 gotcha)
curl -sf http://localhost:9000/minio/health/live && echo "MinIO OK" || echo "MinIO UNREACHABLE on :9000"
```

> **⚠️ Admin credentials are PER-MACHINE.** Each dev machine has its own Postgres, so the
> `adminBTG` password is whatever was set **on that machine** — a password change on one
> machine (or a value you saw in a handoff note) does not carry over. Before starting the
> dev server, confirm you know **this machine's** admin password:
>
> - **Fresh setup:** choose it yourself — `SEED_ADMIN_PASSWORD=<your password> npm run db:seed`
>   (or let the seed script generate one; it prints it **once** — save it).
> - **Existing DB, password unknown:** reset it locally (super-admin accounts can't be reset
>   through the API — use better-auth's `ctx.password.hash` + `internalAdapter.updatePassword`
>   in a one-off script, or ask the machine's usual user).
>
> Don't burn time debugging "Invalid credentials" / assuming the app is broken — it's almost
> always the other machine's password.

If all four preflight lines and both probes pass, skip to §6 and start the server.

---

## 1. Prerequisites

| Tool                    | Version           | Notes                                                                                |
| ----------------------- | ----------------- | ------------------------------------------------------------------------------------ |
| Node.js                 | 20.6+ (24 tested) | `--env-file` flag required by seed scripts                                           |
| Docker + Compose        | recent            | Postgres + MinIO containers                                                          |
| npm deps                | —                 | `npm install` (postinstall builds Prisma engine)                                     |
| Chromium (Windows host) | any recent Chrome | `puppeteer-core` does NOT bundle Chromium — set `PUPPETEER_EXECUTABLE_PATH` (see §2) |

```bash
npm install
```

---

## 2. Create and fill `.env`

There is **no `.env` in the repo** (git-ignored). Copy the template and fill it:

```bash
cp .env.example .env
```

`.env.example` covers the app's own vars. **You must also add the Docker Compose vars below** — the compose file references `POSTGRES_DB/USER/PASSWORD` that the template omits (see §3 gotcha #1):

```bash
# --- Add these to .env (must match the credentials inside DATABASE_URL) ---
POSTGRES_DB=bistec_studio
POSTGRES_USER=bistec
POSTGRES_PASSWORD=bistec
```

Generate the two secrets (do not leave the placeholder values):

```bash
openssl rand -hex 32   # -> BETTER_AUTH_SECRET
openssl rand -hex 32   # -> TOKEN_ENCRYPTION_KEY
```

Windows local dev — point Puppeteer at your Chrome:

```bash
# Add to .env
PUPPETEER_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

**Minimum to boot and test the UI/DB:** `DATABASE_URL`, `BETTER_AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`, the MinIO block, and the `POSTGRES_*` vars.
**For real design generation:** also `ANTHROPIC_API_KEY` + `OPENAI_API_KEY`. To test **without** any AI key, set `DESIGN_PROVIDER=cli` (see §7).
Social tokens (`INSTAGRAM_*`, `LINKEDIN_*`) can stay blank until you test publishing.

---

## 3. Start the infrastructure containers

```bash
docker compose up -d postgres minio
docker ps   # confirm both are Up
```

### Known gotchas (these bite on a cold start)

1. **`POSTGRES_*` vars must be in `.env`.** `docker-compose.yml` interpolates `${POSTGRES_DB/USER/PASSWORD}` from `.env`; if absent, Postgres initializes with the wrong/empty credentials and `DATABASE_URL` (`bistec:bistec@.../bistec_studio`) won't connect. Set them as in §2.

2. **MinIO port 9000 is not published to the host by the committed compose file.** It only `expose`s 9000 (container-to-container) and maps the console to `127.0.0.1:9001`. A host-side `npm run dev` connects to `http://localhost:9000` and will fail. For host development, publish 9000 — either add `ports: ["9000:9000"]` to the `minio` service, or run it standalone:

   ```bash
   docker run -d --name bistec_studio_minio -p 9000:9000 -p 9001:9001 \
     -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
     -v minio_data:/data minio/minio server /data --console-address ":9001"
   ```

   (This matches the WSL2 `docker run` workaround noted in the handoff.) MinIO buckets are auto-created by the app on first use — no manual setup.

3. **MinIO credentials.** The server falls back to `minioadmin`/`minioadmin` by default, which matches `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` in `.env.example`. If you set custom `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`, update `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` to match.

> ### 🔒 Security invariant — never publicly expose MinIO port 9000 in production
>
> H10 made the `generated-images` and `brand-kits` buckets **anonymously public-read** (stable unsigned URLs). This is safe **only because** MinIO's port 9000 is never reachable from the public internet — the committed `docker-compose.yml` deliberately `expose`s 9000 internally (container-to-container) instead of publishing it, and binds the console to `127.0.0.1:9001`. The `-p 9000:9000` publishing in gotcha #2 above is a **host-dev convenience only**.
> **In production, MinIO must sit behind the app / on a private network — do not bind 9000 to a public interface and do not put it behind a public CDN/reverse proxy.** Doing so makes those two buckets world-readable across all users. If a deployment ever needs MinIO assets served publicly, switch those buckets to app-mediated signed reads (the pattern the private `EXPORTS` bucket already uses via `resolveExportUrl`) before exposing the port. (See `docs/handoff.md` → Security review for the full rationale.)

---

## 4. Apply migrations + generate the Prisma client

```bash
npx prisma migrate deploy   # applies committed migrations to the fresh DB
npx prisma generate         # regenerates the client (also runs on npm install)
npx prisma migrate status   # expect: "Database schema is up to date!"
```

---

## 5. Seed admin + default brand kit

```bash
npm run db:seed
```

Runs `scripts/seed-admin.mjs` then `scripts/seed-brandkit.mjs` (admin first so the brand
kit's `createdBy` resolves to a real admin id). Both are idempotent. Result:

- Admin login: username **`adminBTG`**. The initial password is **printed once by the seed script** (set `SEED_ADMIN_PASSWORD` beforehand to choose it; otherwise a random one is generated) — change it after first login. **The password is per-machine** (each dev machine has its own DB — see the §0 warning); the person setting up the machine picks and owns it. The account is a **SUPER_ADMIN** (can manage users at `/admin/users`); sign-in is by username since the username switch — the email `admin@bisteccare.lk` is internal (and still works in the login form as a legacy fallback). A password can be reset directly via better-auth's hash + `internalAdapter.updatePassword` (see `PATCH /api/admin/users/[id]` for the in-app flow; super-admin accounts must be reset via script/DB since the API refuses super-admin targets).
- Default **"Bistec"** brand kit: Glacier palette, Inter + JetBrains Mono (Google Fonts), active brand-voice prompt v1

Optional: seed a 3:4 portrait template on the default kit so Path A has a portrait option out of the box (the brief filters templates by the chosen size):

```bash
node --env-file=.env scripts/seed-portrait-template.mjs   # idempotent
```

---

## 6. Start the dev server

```bash
npm run dev   # http://localhost:3000
```

**Smoke test:**

1. Log in at `/` with the admin credentials above (username `adminBTG`).
2. Open `/admin/brandkits` → confirm the **"Bistec"** kit shows colors + fonts.
3. Open `/admin/users` → confirm the super-admin user management page renders.
4. (If AI keys set) Create a brief and generate a design end-to-end.

---

## 7. Test mode without an Anthropic API key

Set `DESIGN_PROVIDER=cli` in `.env` to route design generation through the local
Claude Code CLI (`claude -p`) instead of the Anthropic API. Brief flow, DB writes, and
draft pages all work; Puppeteer rendering, `generateImage`, and MinIO upload are skipped
(`exportUrl` is empty, preview shows a placeholder). Never use `cli` in production.

> **CLI model / credit cost:** by default the CLI model is **per-path** — Path A
> (template fill) runs on **haiku**, Path B (freeform) on **sonnet** (matching the API
> path). `CLAUDE_CLI_MODEL`, when set, is a **global override** that forces one model
> across every `claude -p` call (leave it unset to keep the split). `CLAUDE_CLI_MODEL=default`
> omits `--model` and falls back to the costly account default (Opus) — avoid. CLI mode
> consumes your logged-in Claude credits, so prefer the API path (or the mock E2E suite)
> for routine work.

For E2E tests with everything stubbed (no AI, no Puppeteer, no social):

```bash
npm run test:e2e:mock
```

---

## Teardown

```bash
docker compose down       # stop containers, keep data
docker compose down -v    # stop AND wipe volumes (next start = full cold start, re-seed needed)
```
