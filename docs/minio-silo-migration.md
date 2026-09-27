# MinIO → silo migration: rollout handoff

**For:** whoever administers `https://coolify.bistecglobal.com`
**Raised:** 2026-09-27
**Status:** 🔴 open. Until this is done, prod is running an image that can no longer be re-pulled from any registry, and every release before 2026-04-11 carries a known auth-bypass CVE.

## What happened

MinIO's community images were withdrawn everywhere we could pull them:

- Docker Hub deleted `docker.io/minio/minio` on 2026-09-11.
- `quay.io/minio/minio` — the fallback registry this project switched to — has refused anonymous pulls since 2026-09-24.

Prod's `docker-compose.yml` pins `quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z`. That pin still runs today (the running container isn't affected by a registry going dark), but it can no longer be **pulled** — a fresh host, a volume-less redeploy, or losing the local image cache would leave prod unable to start MinIO at all.

The chosen replacement is **pgsty/silo**, a maintained drop-in fork, pinned by digest:

```
pgsty/silo:RELEASE.2026-09-16T00-00-00Z@sha256:635197cb9f36d01bee221d34d1c7d7960f6a95c48b0b6c01d99cd13bdae51a46
```

Already verified (not by you, this section is FYI): silo reads data written by MinIO RELEASE.2025-09-07 (buckets, objects, anonymous/public bucket policy) and MinIO RELEASE.2025-09-07 reads data silo wrote — rollback works either direction. The full mock E2E suite passed against silo (180/4/0). The image's entrypoint translates `server /data --console-address ":9001"` argv to the `silo` binary, so the compose file's `command:` needs no change. The image ships `curl` and `mc`, so both a curl healthcheck and Coolify's `mc ready local` healthcheck keep working. All `MINIO_*` env vars are unchanged, and the console on :9001 loads as before.

## Why it's urgent

Every MinIO release before 2026-04-11 — which includes the release prod runs today — carries **CVE-2026-40344**: an auth-bypass in the Snowball auto-extract handler, CVSS 8.2, exploitable with only a known access key. This app's presigned URLs put the access key directly in the `X-Amz-Credential` query parameter of every image/export link the browser ever sees, so "a known access key" is not a hard bar to clear here. silo fixes this CVE.

## Before you start

- You need shell access to the Coolify host (not just the Coolify UI) for the backup/rollback-tag steps.
- Budget a minute or two of MinIO downtime for the redeploy in step 4 — the app and scheduler containers depend on MinIO's healthcheck, so uploads/renders will queue or briefly fail during the restart.
- Confirm you have at least the free disk space of the current data volume for the backup in step 3.

## Steps

1. **Record the running image and volume**, so you know exactly what you're changing and can find it again:

   ```sh
   docker inspect minio-ahhurs4f46a66uva7tx3ayam --format '{{.Config.Image}} {{.Image}} {{json .Mounts}}'
   ```

   (This is the prod container name at time of writing. If it differs on your host, find the right one via Coolify → the MinIO service → its container/logs panel.) Note the image id and the volume name/mount from the output — both are needed below.

2. **Keep a rollback image**, tagged locally so it survives even if the registry copy becomes unpullable later:

   ```sh
   docker tag <image id from step 1> local/minio-rollback:pre-silo
   ```

3. **Back up the data volume** before touching anything:

   ```sh
   docker run --rm -v <volume from step 1>:/data:ro -v /root/backups:/b alpine \
     tar czf /b/minio-$(date +%F).tgz -C /data .
   ```

4. **Switch the image in Coolify.** Coolify → the MinIO service → **Edit Compose** → change only the `image:` line to the pinned silo reference below. Leave `command`, `environment`, `volumes`, and `healthcheck` exactly as they are — none of them need to change.

   ```
   pgsty/silo:RELEASE.2026-09-16T00-00-00Z@sha256:635197cb9f36d01bee221d34d1c7d7960f6a95c48b0b6c01d99cd13bdae51a46
   ```

   **Save**, then **Redeploy**. Expect a minute or two of MinIO downtime while the new image is pulled and the container restarts against the existing volume.

5. **Verify:**
   - The service's logs show `Silo Object Storage Server` and `RELEASE.2026-09-16` near the top.
   - The healthcheck goes green in the Coolify UI (same `mc ready local` check as before — nothing new to configure).
   - The console still opens at its usual domain/port (:9001).
   - In the app itself: library thumbnails load (these are presigned EXPORTS reads), brand-kit logos load (these are public-bucket reads), and one image upload or a real generation completes end to end.

6. **Rollback, if anything above fails:** Coolify → the MinIO service → Edit Compose → set `image:` back to `local/minio-rollback:pre-silo` → Redeploy. Data is compatible both ways — no volume changes are needed to roll back, because nothing in step 4 touched the volume.

## For developers

Local dev containers pick this up the normal way — no manual steps beyond a pull:

```sh
docker compose pull minio && docker compose up -d minio
```

Existing local data works unchanged; silo reads the same on-disk format MinIO wrote.

## Later

Pulling from a third-party registry is what got us here twice now. Once this rollout is stable, mirror the pinned image to our own registry — `ghcr.io/bistec-oss/silo` — so the project stops depending on `pgsty`'s registry staying up, the same way `ghcr.io/bistec-oss/studio` already avoids depending on someone else's.
