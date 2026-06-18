# Wave 5 — Publishing, Scheduling & Asset Library

**Change:** marketing-post-studio-v1
**Wave:** 5 of 6
**Tasks:** T16, T17, T18, T19
**Estimate:** 3–4 days
**Prerequisite:** Wave 4 complete (T11–T15 at minimum T15 export route).

## Objective

Wire up social publishing to Instagram and LinkedIn, build the schedule-for-later queue and background worker, and ship the asset library UI so users can browse finished posts and their publish history.

---

## Tasks

### T16 — Social channel publishers

- **Files:** `src/lib/publishers/instagram.ts`, `src/lib/publishers/linkedin.ts`, `src/lib/publishers/index.ts`
- **Estimate:** medium
- **Depends:** T03
- **FR references:** FR-30, FR-31, NFR-7

  Pure library modules — no HTTP routes here; routes are in T17.

  **`instagram.ts`** — wraps the Instagram Graph API (Business Account):
  - `publish(post: Post, exportUrl: string)`: uploads the MinIO export URL to Instagram as a container → publishes the container
  - Uses `INSTAGRAM_ACCESS_TOKEN` + `INSTAGRAM_ACCOUNT_ID` from env
  - On API error: sets `Post.status = FAILED`, writes `Post.errorReason`

  **`linkedin.ts`** — wraps the LinkedIn Marketing API (Company Page):
  - `publish(post: Post, exportUrl: string)`: creates a UGC post with image asset
  - Uses `LINKEDIN_ACCESS_TOKEN` + `LINKEDIN_ORGANIZATION_ID` from env
  - Same error pattern as Instagram

  **`index.ts`** — publisher registry: maps channel enum value → publisher instance. New channels added here only.

  **Token storage (NFR-7):** `INSTAGRAM_ACCESS_TOKEN` and `LINKEDIN_ACCESS_TOKEN` are stored encrypted at rest in the database (`AvailableProvider` or a dedicated `ChannelToken` table). `TOKEN_ENCRYPTION_KEY` env var is the AES-256 key. Tokens are decrypted in memory only at publish time.

---

### T17 — Publish + schedule API routes

- **Files:** `src/app/api/posts/route.ts`, `src/app/api/posts/[id]/route.ts`, `src/app/api/posts/[id]/publish/route.ts`
- **Estimate:** small
- **Depends:** T16, T15
- **FR references:** FR-27 through FR-31

  **`POST /api/posts`** `{ draftId, channel, scheduledAt? }`
  - Creates `Post` row linked to `Draft`
  - If `scheduledAt` is null or in the past: publishes immediately via `publishers[channel].publish()`
  - If `scheduledAt` is future: sets `Post.status = SCHEDULED` — picked up by worker (T18)
  - Returns `{ postId, status }`

  **`GET /api/posts`** — list posts for the current user's drafts (paginated)

  **`GET /api/posts/[id]`** — get single post + status

  **`DELETE /api/posts/[id]`** — cancel a scheduled post (sets status = CANCELLED if `scheduledAt` is still future; else 409)

  **`POST /api/posts/[id]/publish`** — retry a FAILED post manually

  Role check: publishing (immediate or scheduled) requires `role = ADMIN` (FR-28).

---

### T18 — Scheduler worker

- **Files:** `src/worker.ts`, `src/lib/scheduler/jobRunner.ts`
- **Estimate:** medium
- **Depends:** T16, T17
- **FR references:** FR-32, NFR-5

  `worker.ts` is the entry point for the `scheduler` Docker service (runs alongside the Next.js `app` service in `docker-compose.yml`). It runs in a tight poll loop:

  ```
  every 60 seconds:
    1. Query `Post` WHERE status = SCHEDULED AND scheduledAt <= now()
    2. For each row: call publishers[post.channel].publish(post, draft.exportUrl)
    3. On success: set status = PUBLISHED, publishedAt = now(), platformId = returned ID
    4. On error: set status = FAILED, errorReason = error message
  ```

  **Concurrency:** Processes posts sequentially within each tick to avoid duplicate publish race (safe for v1 volumes). Each tick is a DB transaction — if the process crashes mid-tick, the remaining posts remain SCHEDULED and are retried on the next tick.

  **No external queue required for v1.** The DB row serves as the queue. A message queue (SQS, BullMQ) can replace this if volume demands it — the publisher interface doesn't change.

  Worker runs with the same `DATABASE_URL` and publisher credentials as the app. Dockerfile CMD is overridden in compose via `command: node -r ts-node/register src/worker.ts`.

---

### T19 — Asset library UI

- **Files:** `src/app/(app)/library/page.tsx`, `src/components/library/PostCard.tsx`, `src/components/library/PublishHistoryDrawer.tsx`
- **Estimate:** medium
- **Depends:** T25, T17
- **FR references:** FR-33 through FR-36

  **Library page** (`/library`) — paginated grid of finished `Draft` rows with status = READY.

  Each `PostCard` shows:
  - Thumbnail (MinIO export URL)
  - Brief topic + channel badges
  - Brand kit name
  - Status chip: READY / PUBLISHED / SCHEDULED / FAILED
  - "Publish" or "Schedule" button (admin only) → opens publish dialog
  - "View Post" button (opens publish history drawer)

  **Publish dialog** — inline form: channel multi-select + optional scheduled date/time picker → calls `POST /api/posts`.

  **PublishHistoryDrawer** — slides in from right; lists all `Post` rows for the draft:
  - Channel, status, scheduledAt / publishedAt, platformId (link to live post), errorReason if FAILED
  - "Retry" button on FAILED posts → calls `POST /api/posts/[id]/publish`

  Filtering: tabs for All / READY / SCHEDULED / PUBLISHED / FAILED. Search by topic.

---

## Parallelism within Wave 5

T16 (publishers) and T17 (routes) form a dependency chain. T18 needs both. T19 needs T17 for its API calls.

```
T15 ──── T16 (publishers)
               └── T17 (publish routes)
                        ├── T18 (scheduler worker)
                        └── T19 (library UI) ← also needs T25
```

T18 and T19 can be built in parallel once T17 is done.

---

## Social API prerequisites (out of scope for code, but blockers)

Before T16 can be tested end-to-end:
- **Instagram:** Meta Business app created, Instagram Graph API with `instagram_basic`, `instagram_content_publish` permissions, app review approved, access token generated.
- **LinkedIn:** LinkedIn app with `w_member_social` or `w_organization_social` permission, organization ID confirmed.

These are credential/approval tasks, not code tasks — track separately.

---

## Wave 5 Complete When

- [ ] `publish()` successfully posts to a test Instagram Business account
- [ ] `publish()` successfully posts to a test LinkedIn company page
- [ ] Immediate publish (`scheduledAt` null) resolves within the same API request
- [ ] Scheduled post (future `scheduledAt`) stays SCHEDULED until worker tick fires
- [ ] Worker processes due posts and updates status → PUBLISHED
- [ ] Worker sets FAILED + errorReason on API error; post is retryable
- [ ] Library grid shows all READY drafts with correct status chips
- [ ] Admin can publish from library; non-admin publish button is hidden/disabled
- [ ] Publish history drawer shows correct channel + status per post row
