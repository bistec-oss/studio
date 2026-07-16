# Social Publishing Setup — LinkedIn + Instagram

Step-by-step guide to connecting real social accounts and understanding the posting
sequence. Written 2026-07-16, after the scheduler worker was runtime-verified end-to-end
in CLI mode and the Cloudflare-tunnel image path was proven with a real external fetch
(HTTP 200 on a presigned export through `trycloudflare.com`).

> **Just testing scheduler mechanics?** You don't need any of this — run the worker with
> `MOCK_SOCIAL=true` and publishes resolve deterministically without touching a real
> platform (`src/lib/testHooks.ts` seam, dormant in prod).

---

## 1. How publishing works (30-second architecture)

- **One worker process** (`src/scheduler/worker.ts`) runs two independent 60s poll loops:
  - **generation** (`generationRunner.ts`) — claims due `ScheduledGeneration` entries, runs
    the full brief→draft pipeline, then (per `postAction`) creates `Post` rows.
  - **scheduler** (`jobRunner.ts`) — claims due `SCHEDULED` `Post` rows and publishes them.
  - Both claims are `FOR UPDATE SKIP LOCKED` + lease, so multiple worker replicas are safe.
- **One publish service** (`src/lib/publish/publishDraft.ts`) owns the channel map. Every
  surface (publish dialog, scheduler tick, ACP) goes through it.
- **Credential resolution, per publish:** encrypted `ChannelToken` DB row (set in
  Admin → Settings) → env-var fallback. The DB row **always wins**; no restart needed
  after changing it (read per publish).
- **The image handoff differs per channel — this drives the whole setup below:**

  | Channel       | How the platform gets the image                                                                                               | Local-dev implication                                                                         |
  | ------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
  | **LinkedIn**  | The app fetches the presigned export URL **itself** and uploads the bytes (`assets?action=registerUpload` → PUT → `ugcPosts`) | Works from `localhost` as-is ✅                                                               |
  | **Instagram** | The app hands the URL to the Graph API; **Facebook's servers fetch it**                                                       | `localhost:9000` is unreachable to Meta — the export URL must be publicly fetchable (→ §4) ❌ |

- Both platforms' tokens live **~60 days** — expect to rotate them (see §6).

---

## 2. LinkedIn account setup

Posts go out **as an Organization** (`author: urn:li:organization:<id>`), never as a
personal profile.

**Prerequisite:** a LinkedIn **Company Page** where you are a super admin.

1. Go to [developer.linkedin.com/apps](https://developer.linkedin.com/apps) → **Create app**.
2. Associate the app with your Company Page. LinkedIn verifies this by generating a link
   a page admin must click (app → Settings → Verify).
3. **Products** tab → request **Community Management API**. This is the product that
   grants the `w_organization_social` scope the publisher needs. Approval ranges from
   instant (development tier) to a review for full org posting.
4. **Generate the access token:** app → Auth tab → **OAuth 2.0 Token Generator** (under
   Token tools) → select scope `w_organization_social` → sign in as the page admin →
   copy the token. ⚠️ Lifetime ~60 days.
5. **Find the Organization ID:** open your company page as admin — the URL contains
   `/company/<number>/admin/`. The **number alone** is the ID (the code builds the
   `urn:li:organization:` URN around it — do not paste the URN).

You now have the two values the app needs: **Access token** + **Organization ID**.

---

## 3. Instagram account setup

**Prerequisites:** an Instagram **Business or Creator** account, linked to a **Facebook
Page** (Instagram app → Settings → Business tools → connect a Page).

1. Go to [developers.facebook.com](https://developers.facebook.com) → **Create App** →
   type **Business**.
2. In the app dashboard, add the **Instagram Graph API** product.
3. **Generate a token:** Tools → **Graph API Explorer** → select your app → _Generate
   Access Token_ with scopes:
   `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`.
4. **Exchange it for a long-lived token** (~60 days): Tools → _Access Token Debugger_ →
   paste the token → **Extend Access Token** (or call
   `GET /oauth/access_token?grant_type=fb_exchange_token&client_id=…&client_secret=…&fb_exchange_token=…`).
5. **Find the Business Account ID** (this is NOT your page id) — in Graph API Explorer:
   1. `GET /me/accounts` → copy your Page's `id`.
   2. `GET /<page-id>?fields=instagram_business_account` → the returned `id` is the value
      the app wants.

You now have: **Access token** + **Business Account ID**.

> While the Meta app is in **Development mode**, only accounts with a role on the app
> (admin/developer/tester) can be published to. That's fine for internal use — add the
> marketing team's IG account owner as a tester, or switch the app to Live mode later.

---

## 4. Making exports reachable by Instagram

Instagram is the only channel that needs this section.

### Why `MINIO_ENDPOINT` (not just `MINIO_PUBLIC_ENDPOINT`) must change

The export PNG lives in the **private** EXPORTS bucket and is presigned per read
(`resolveExportUrl` → `getPresignedUrl`, `src/lib/storage/minio.ts`). S3 v4 signatures
are **host-bound**, and the signing client is built on `MINIO_ENDPOINT` — so the URL is
only valid on that exact host. Rewriting the host after signing breaks the signature.
Therefore the publicly reachable host must be `MINIO_ENDPOINT` itself.

### Local dev: Cloudflare quick tunnel (verified 2026-07-16)

A quick tunnel makes `localhost:9000` reachable via an ephemeral public URL **without
opening any inbound port** — `cloudflared` dials out to Cloudflare's edge. This does NOT
violate the "never publicly expose MinIO :9000" invariant in `docs/cold-start.md` §3
(no public bind), but be aware the two public-read buckets (`generated-images`,
`brand-kits`) are world-readable through the tunnel while it's up.

1. **Install** (once): `winget install Cloudflare.cloudflared`
   (lands at `C:\Program Files (x86)\cloudflared\cloudflared.exe`).
2. **Start the tunnel** in a terminal you keep open (any directory):

   ```powershell
   & "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:9000
   ```

   After ~5s it prints `https://<four-random-words>.trycloudflare.com`.
   **Closing the terminal kills the tunnel and the URL is gone forever** — every restart
   mints a different URL.

3. **Point `.env` at it** — the split matters:

   ```bash
   MINIO_ENDPOINT=https://<your-words>.trycloudflare.com   # presigned URLs sign against this host
   MINIO_PUBLIC_ENDPOINT=http://localhost:9000             # embedded asset URLs stay local
   ```

   Keeping `MINIO_PUBLIC_ENDPOINT` local means background images embedded into stored
   draft HTML keep `localhost` URLs and **don't rot when the tunnel dies**. Both hosts are
   auto-added to the Puppeteer render allowlist (`puppeteer.ts`).

4. **Restart** the worker (and `next dev` if running) — env is read at startup.
5. **Verify** before burning a real publish: sign any existing draft's `exportUrl`
   against the tunnel endpoint and `curl` it — expect `200` + `image/png`.
   (A `530` means the tunnel process is dead, not MinIO.)
6. **Revert when done testing:** restore the two `.env` lines
   (`MINIO_ENDPOINT=http://localhost:9000`, remove/ignore `MINIO_PUBLIC_ENDPOINT`) and
   restart the worker. Leaving `.env` pointed at a dead tunnel breaks all storage ops.

> A stable hostname (no re-pointing per session) requires a **named tunnel**: free
> Cloudflare account + your own domain, `cloudflared tunnel create` + a `config.yml`
> ingress to `http://localhost:9000`, optionally installed as a Windows service. Do this
> if Instagram testing becomes routine.

### Production / VPS

Same host-binding logic: `MINIO_ENDPOINT` must be a host Meta's servers can reach.
Options, in order of preference:

- Serve MinIO on an internal-only host and set `MINIO_ENDPOINT` to a **private reverse
  proxy hostname that is publicly resolvable and forwards only path-prefix
  `/exported-designs/`** to MinIO — presigned URLs work, public buckets stay unreachable.
- Or a permanent named Cloudflare tunnel with the same path restriction (Cloudflare
  Access cannot gate it — Meta's fetch can't do SSO).
- **Never** bind `:9000` itself to a public interface (see the security invariant in
  `docs/cold-start.md` §3).

---

## 5. Wiring credentials into the app

Two options — the DB row wins over env if both exist:

**Option A — Admin UI (preferred: encrypted at rest, no restarts):**
`npm run dev` → log in as an admin → **`/admin/settings`** → **Social Channels** tab →
fill the channel card → Save.

| Card      | Field 1 (`token`) | Field 2 (`metadata`)          |
| --------- | ----------------- | ----------------------------- |
| LinkedIn  | Access token      | Organization ID (number only) |
| Instagram | Access token      | Business Account ID           |

Stored AES-256-GCM encrypted in `ChannelToken` (one row per channel, upserted).
Disconnect via the card's remove button (`DELETE /api/admin/channels/[channel]`).

**Option B — env fallback** (`.env`, requires worker/app restart):

```bash
INSTAGRAM_ACCESS_TOKEN=…
INSTAGRAM_BUSINESS_ACCOUNT_ID=…
LINKEDIN_ACCESS_TOKEN=…
LINKEDIN_ORGANIZATION_ID=…
```

---

## 6. The posting sequence

### Running the worker (required for anything scheduled)

- **Local dev:** `npx tsx --env-file=.env src/scheduler/worker.ts` (keep it running
  alongside `next dev`). Startup prints both loop banners; in CLI mode it also states
  which Claude credential scheduled generations will use.
- **Production:** `docker compose up -d scheduler` — the compose service runs the
  esbuild-bundled `dist/scheduler/worker.js` with `restart: unless-stopped`.

### Path 1 — publish an existing draft (publish dialog)

1. Draft page or library → **Publish** → pick channel(s), optionally a schedule time.
2. `POST /api/posts` per channel:
   - **No time / past time** → publishes **inline** (PENDING → PUBLISHED/FAILED); the
     worker is not involved.
   - **Future time** → creates a `SCHEDULED` `Post` row; the worker claims it within one
     60s poll of `scheduledAt` and publishes.
3. Duplicate guard: a live post (PENDING/SCHEDULED/PUBLISHING/PUBLISHED) for the same
   (draft, channel) → `409`. FAILED/CANCELLED rows don't block re-publishing.

### Path 2 — fully scheduled pipeline (campaign queue)

1. Campaign page → planned-posts queue (manually, or accept a ` ```schedule ` block from
   the briefing chat) → each entry has `generateAt` + a post action.
2. At `generateAt`, the worker's **generation loop** claims the entry, creates the Brief,
   and runs the full pipeline (copy → background → design → render → export).
   Runtime-verified in CLI mode: ~135s end-to-end.
3. On success, `postAction` decides what happens next:
   - **HOLD** — draft lands in the library for human review; publish later via Path 1.
   - **SCHEDULE_PUBLISH** — creates `SCHEDULED` `Post` rows for `publishAt` (admin-only).
   - **PUBLISH_NOW** — creates `SCHEDULED` rows due immediately; the publish loop picks
     them up within one poll (admin-only).
4. The **publish loop** then claims each due row: signs the export key → channel publish
   → `PUBLISHED` (with `platformId`) or retry.

### Failure & retry behaviour (automatic, no babysitting)

|                        | Generation loop                             | Publish loop                         |
| ---------------------- | ------------------------------------------- | ------------------------------------ |
| Retries                | 3                                           | 5                                    |
| Backoff                | 20/40/60 min                                | 2/4/8/16/32 min (cap 60)             |
| Lease (crash recovery) | 15 min                                      | 5 min                                |
| Terminal state         | `FAILED` + `errorReason` on the queue entry | `FAILED` + `errorReason` on the Post |

A FAILED post can be re-published from the UI; a FAILED queue entry has a rerun route
(`POST /api/campaigns/[id]/queue/[gid]/rerun`).

---

## 7. Troubleshooting

| Symptom                                                                         | Cause / fix                                                                                                                                  |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `Instagram/LinkedIn credentials not configured — set them in Admin → Settings…` | No `ChannelToken` row and env vars empty. Wire §5.                                                                                           |
| Instagram: `Failed to create media container` mentioning the image URL          | Meta couldn't fetch the export — tunnel dead, `.env` pointing at an old tunnel URL, or `MINIO_ENDPOINT` still `localhost`. Re-run §4 step 5. |
| `530` fetching through the tunnel                                               | The `cloudflared` process is gone (terminal closed). Restart it — and remember the URL changes.                                              |
| `draft export missing` as errorReason                                           | The draft lost its export between scheduling and the tick (e.g. deleted). Regenerate/re-export.                                              |
| Publishes fail ~60 days after setup                                             | Token expired (both platforms). Regenerate (§2 step 4 / §3 step 4) and re-save in `/admin/settings`.                                         |
| Worker logs `P1001` tick errors                                                 | DB unreachable (containers down). The loops survive and self-recover; fix the containers.                                                    |
| Everything 500s incl. login (prod server)                                       | `minioadmin` MinIO creds rejected by the prod env gate — see `docs/cold-start.md` §2.                                                        |
