import { prisma } from '@/lib/prisma'
import { BUCKET_IMAGES, deleteObject } from '@/lib/storage/minio'
import {
  BRIEF_DRAFT_CAP,
  BRIEF_DRAFT_TTL_MS,
  briefDraftPayloadSchema,
  briefImageKeyFromUrl,
  isTrivialBriefDraft,
  briefDraftPayloadTooLarge,
  type BriefDraftPayload,
} from '@/lib/brief/briefDraftPayload'

// ─── BriefDraft lifecycle service ────────────────────────────────────────────
// Single owner of the unfinished-brief rules: 7-day lazy TTL sweep (F1's
// stale-IN_PROGRESS precedent — no worker loop), the 5-per-user cap with
// oldest-eviction, and MinIO image cleanup. Routes and the dashboard both call
// through here so the rules can't drift. Everything is strictly owner-scoped —
// no admin override (unfinished briefs are private working state).

export interface BriefDraftRow {
  id: string
  topic: string
  updatedAt: Date
  payload: BriefDraftPayload
}

// Best-effort deletion of a draft's uploaded images. Only keys under the
// owner's briefs/<userId>/ prefix are ever touched (briefImageKeyFromUrl
// returns null for anything else); MinIO failures are logged, never thrown —
// image cleanup must not block row deletion (NFR-3).
export async function deleteBriefDraftImages(
  userId: string,
  payload: BriefDraftPayload,
): Promise<void> {
  for (const image of payload.images) {
    const key = briefImageKeyFromUrl(image.url, BUCKET_IMAGES, userId)
    if (!key) continue
    try {
      await deleteObject(BUCKET_IMAGES, key)
    } catch (e) {
      console.error(`[briefDrafts] failed to delete image ${key}:`, (e as Error).message)
    }
  }
}

// Parse a stored payload; null means "treat the row as missing" (schema drift
// or manual tampering) — callers delete such rows rather than half-restoring.
function parsePayload(raw: unknown): BriefDraftPayload | null {
  const result = briefDraftPayloadSchema.safeParse(raw)
  return result.success ? result.data : null
}

async function deleteRowWithImages(row: { id: string; userId: string; payload: unknown }) {
  const payload = parsePayload(row.payload)
  if (payload) await deleteBriefDraftImages(row.userId, payload)
  await prisma.briefDraft.deleteMany({ where: { id: row.id } })
}

// Lazy TTL sweep: drop this user's expired (or unparsable) rows, images
// included. Runs on every list read (dashboard); per-user so one user's
// backlog never does another user's I/O.
export async function sweepExpiredBriefDrafts(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - BRIEF_DRAFT_TTL_MS)
  const expired = await prisma.briefDraft.findMany({
    where: { userId, updatedAt: { lt: cutoff } },
  })
  for (const row of expired) await deleteRowWithImages(row)
}

// Newest-first list for the dashboard. Sweeps first; silently drops (and
// deletes) rows whose payload no longer parses. teamId is an optional extra
// scope (the API route passes the caller's active team; the dashboard's
// personal call omits it — these rows are strictly owner-scoped either way).
export async function listBriefDrafts(userId: string, teamId?: string): Promise<BriefDraftRow[]> {
  await sweepExpiredBriefDrafts(userId)
  const rows = await prisma.briefDraft.findMany({
    where: { userId, ...(teamId ? { teamId } : {}) },
    orderBy: { updatedAt: 'desc' },
  })
  const out: BriefDraftRow[] = []
  for (const row of rows) {
    const payload = parsePayload(row.payload)
    if (!payload) {
      await deleteRowWithImages(row)
      continue
    }
    out.push({ id: row.id, topic: row.topic, updatedAt: row.updatedAt, payload })
  }
  return out
}

export async function getBriefDraft(userId: string, id: string): Promise<BriefDraftRow | null> {
  const row = await prisma.briefDraft.findFirst({ where: { id, userId } })
  if (!row) return null
  const payload = parsePayload(row.payload)
  if (!payload) {
    await deleteRowWithImages(row)
    return null
  }
  return { id: row.id, topic: row.topic, updatedAt: row.updatedAt, payload }
}

export type SaveBriefDraftResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'not_found' | 'trivial' | 'too_large' }

// Upsert the working state. An explicit id targets an existing OWNED row —
// a missing/foreign id is not_found (NOT create: a late autosave after
// Generate deleted the row must not resurrect it). Creation past the cap
// evicts the user's oldest row, images included (FR-3).
export async function saveBriefDraft(
  userId: string,
  id: string | undefined,
  payload: BriefDraftPayload,
  // Caller's active team (withTeamAuth, Task 7/8). Only used on the create
  // path below — an existing row's team association is never touched by an
  // autosave update. teamId is now NOT NULL on BriefDraft (Task 15).
  teamId: string,
): Promise<SaveBriefDraftResult> {
  if (isTrivialBriefDraft(payload)) return { ok: false, reason: 'trivial' }
  if (briefDraftPayloadTooLarge(payload)) return { ok: false, reason: 'too_large' }
  const topic = payload.topic.trim()

  if (id) {
    const updated = await prisma.briefDraft.updateMany({
      where: { id, userId },
      data: { payload, topic },
    })
    if (updated.count === 0) return { ok: false, reason: 'not_found' }
    return { ok: true, id }
  }

  const existing = await prisma.briefDraft.findMany({
    where: { userId },
    orderBy: { updatedAt: 'asc' },
  })
  // Evict oldest first so the create below never exceeds the cap.
  for (const row of existing.slice(0, Math.max(0, existing.length - (BRIEF_DRAFT_CAP - 1)))) {
    await deleteRowWithImages(row)
  }

  const created = await prisma.briefDraft.create({
    data: { userId, topic, payload, teamId },
  })
  return { ok: true, id: created.id }
}

// keepImages: Generate-success deletion must NOT remove images — the created
// Brief.briefImages now references them (FR-7). Returns false when the row
// isn't this user's (routes surface that as 404).
export async function deleteBriefDraft(
  userId: string,
  id: string,
  opts: { keepImages?: boolean } = {},
): Promise<boolean> {
  const row = await prisma.briefDraft.findFirst({ where: { id, userId } })
  if (!row) return false
  if (opts.keepImages) {
    await prisma.briefDraft.deleteMany({ where: { id: row.id } })
  } else {
    await deleteRowWithImages(row)
  }
  return true
}
