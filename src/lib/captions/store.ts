// The caption store (012 FR-02/FR-10, design §6): the only module that reads
// or writes DraftCaption rows. Every reader gets captions through
// loadDraftCaptions, which returns one row per registry channel.
//
// What to write is decided by a pure module (actionTargets.ts for a caption
// write's settle). This file only issues the queries.

import type { CaptionStatus, Channel, Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { CAPTION_CHANNELS, type CaptionTarget } from '@/lib/channels'
import type { FieldResult } from '@/lib/captions/extract'
import { settleCaptionRow, type CaptionStamp } from '@/lib/captions/actionTargets'
import { resolveCaptionForPublish, type CaptionResolution } from '@/lib/captions/resolve'
import { claimData, claimWhere, logLostClaim, newClaimId, type DraftClaim } from '@/lib/drafts/claim'
import { refreshFactsCheck } from '@/lib/factsCheck/refresh'
import { postStyleColumn } from '@/lib/drafts/revisions'
import type { PostStyleStamp } from '@/lib/postStyles'

export interface CaptionRow {
  channel: Channel
  text: string
  status: CaptionStatus
  failureReason: string | null
  updatedAt: Date
  /** 008 FR-08: the model whose output this row's text is (null = unknown / none). */
  model: string | null
  modelSubstitutedFrom: string | null
  /** 024 FR-04: the credential route that wrote this row's text (null = before 024, or none). */
  route: string | null
}

export interface DraftCaptions {
  /** One per registry channel, in registry order. */
  captions: CaptionRow[]
}

const ROW_SELECT = {
  channel: true,
  text: true,
  status: true,
  failureReason: true,
  updatedAt: true,
  model: true,
  modelSubstitutedFrom: true,
  route: true,
} satisfies Prisma.DraftCaptionSelect

// ── Reading ─────────────────────────────────────────────────────────────────

function orderByRegistry(rows: CaptionRow[]): CaptionRow[] {
  return CAPTION_CHANNELS.flatMap(({ channel }) => rows.filter((r) => r.channel === channel))
}

function findRows(draftId: string, db: PrismaClient): Promise<CaptionRow[]> {
  return db.draftCaption.findMany({ where: { draftId }, select: ROW_SELECT })
}

// The only way to read a draft's captions. Returns null when the draft does
// not exist; callers have already checked access to it.
export async function loadDraftCaptions(
  draftId: string,
  db: PrismaClient = prisma,
): Promise<DraftCaptions | null> {
  const draft = await db.draft.findUnique({
    where: { id: draftId },
    select: { captions: { select: ROW_SELECT } },
  })
  if (!draft) return null

  // A registry channel the draft lacks (a channel added after the draft was
  // created) gets an empty READY row, so every reader sees one per channel.
  let rows = draft.captions
  const missing = CAPTION_CHANNELS.filter((s) => !rows.some((r) => r.channel === s.channel))
  if (missing.length > 0) {
    await db.draftCaption.createMany({
      data: missing.map((s) => ({ draftId, channel: s.channel, text: '', status: 'READY' as const })),
      skipDuplicates: true,
    })
    rows = await findRows(draftId, db)
  }
  return { captions: orderByRegistry(rows) }
}

// ── Publishing (FR-14) ──────────────────────────────────────────────────────

// The publish-time decision for one channel: the draft's row for it, through
// the loader, run through the pure resolver. A missing draft has no row, so it
// is refused like one.
export async function loadCaptionForPublish(
  draftId: string,
  channel: Channel,
  db: PrismaClient = prisma,
): Promise<CaptionResolution> {
  const loaded = await loadDraftCaptions(draftId, db)
  return resolveCaptionForPublish(channel, loaded?.captions.find((r) => r.channel === channel))
}

// The text the posts routes show for a post's channel, or '' (FR-13).
export async function loadCaptionText(
  draftId: string,
  channel: Channel,
  db: PrismaClient = prisma,
): Promise<string> {
  const loaded = await loadDraftCaptions(draftId, db)
  return loaded?.captions.find((r) => r.channel === channel)?.text ?? ''
}

// loadCaptionText for a page of posts in one query (017 FR-06): the text keyed
// `${draftId}/${channel}`. A missing row reads as '', the value loadCaptionText
// returns for it; the fill is left to the single-draft readers.
export async function loadCaptionTexts(
  posts: readonly { draftId: string; channel: Channel }[],
  db: PrismaClient = prisma,
): Promise<Map<string, string>> {
  const draftIds = [...new Set(posts.map((p) => p.draftId))]
  const rows =
    draftIds.length === 0
      ? []
      : await db.draftCaption.findMany({
          where: { draftId: { in: draftIds } },
          select: { draftId: true, channel: true, text: true },
        })
  const byKey = new Map(rows.map((r) => [`${r.draftId}/${r.channel}`, r.text]))
  return new Map(posts.map((p) => [`${p.draftId}/${p.channel}`, byKey.get(`${p.draftId}/${p.channel}`) ?? '']))
}

// ── Writers ─────────────────────────────────────────────────────────────────

// 027 FR-11: after a write that changes the stored captions or headline, the
// draft's facts check is recomputed from what is stored now. Best-effort and
// never throws (refreshFactsCheck swallows its own errors), so the caller's
// result is unchanged; a client the caller was given is used for the reads.
async function refreshAfterWrite(draftId: string, db: PrismaClient): Promise<void> {
  try {
    await refreshFactsCheck(draftId, db === prisma ? {} : { db })
  } catch (err) {
    // refreshFactsCheck already swallows its own errors; this is the backstop.
    console.error(`[facts-check] draft ${draftId}: refresh failed:`, err)
  }
}

// The caption stamp (008 FR-08) is defined beside the pure settle rule.
export type { CaptionStamp }

export interface GenerationCaptionData {
  channel: Channel
  text: string
  status: 'READY' | 'FAILED'
  failureReason: string | null
  model: string | null
  modelSubstitutedFrom: string | null
  route: string | null
}

// The row values a generation's caption result gives each registry channel it
// covers: validated text → READY, stamped with the model that wrote it; a
// failed field → FAILED with no text (failed model output is never stored) and
// no stamp — a stamp names the model whose output is the row's text, and a
// text-less row has none (008 FR-08). Regenerate settling is settleCaptionRow,
// which keeps good text, and its stamp, on a failed regenerate (A7).
export function captionRowsFromFields(
  fields: Partial<Record<CaptionTarget, FieldResult>>,
  stamp: CaptionStamp,
): GenerationCaptionData[] {
  return CAPTION_CHANNELS.flatMap<GenerationCaptionData>(({ channel }) => {
    const field = fields[channel]
    if (!field) return []
    return field.ok
      ? [
          {
            channel,
            text: field.text,
            status: 'READY',
            failureReason: null,
            model: stamp.model,
            modelSubstitutedFrom: stamp.substitutedFrom,
            route: stamp.route,
          },
        ]
      : [
          {
            channel,
            text: '',
            status: 'FAILED',
            failureReason: field.reason,
            model: null,
            modelSubstitutedFrom: null,
            route: null,
          },
        ]
  })
}

// The headline's stamp fields (008 FR-08), written with a validated headline only.
export function headlineStampFields(stamp: CaptionStamp): {
  headlineModel: string
  headlineModelSubstitutedFrom: string | null
  headlineRoute: string | null
} {
  return {
    headlineModel: stamp.model,
    headlineModelSubstitutedFrom: stamp.substitutedFrom,
    headlineRoute: stamp.route,
  }
}

// The async generation's write (design §4): every channel's row and the
// headline (when it validated) in one transaction, each with its 008 stamp.
// Row writes are guarded on PENDING, the state createPendingDraft and retry
// leave them in.
export async function saveGenerationCaptions(
  draftId: string,
  fields: Partial<Record<CaptionTarget, FieldResult>>,
  stamp: CaptionStamp,
): Promise<void> {
  const headline = fields.HEADLINE
  await prisma.$transaction([
    ...captionRowsFromFields(fields, stamp).map(({ channel, ...data }) =>
      prisma.draftCaption.updateMany({ where: { draftId, channel, status: 'PENDING' }, data }),
    ),
    ...(headline?.ok
      ? [
          prisma.draft.updateMany({
            where: { id: draftId },
            data: { headline: headline.text, ...headlineStampFields(stamp) },
          }),
        ]
      : []),
  ])
  // 027 FR-11: the interactive generation's check, after the write (the
  // scheduled path computes its check in the draft's own create).
  await refreshAfterWrite(draftId, prisma)
}

// Claim the draft-level caption action (A2, design §5): REGENERATE_COPY,
// guarded on no action in flight, and the target rows marked PENDING in the
// same transaction. Returns the claim (action and fresh token, 019) or null when
// another action holds the draft (the caller answers 409). Released by
// startDraftAction as today.
//
// The rows must exist: call loadDraftCaptions first, so a channel the draft
// lacks gets its row before it is claimed. Otherwise the PENDING update finds
// nothing and the settle has no row to write.
export async function claimCaptionAction(
  draftId: string,
  targets: readonly CaptionTarget[],
  db: PrismaClient = prisma,
): Promise<DraftClaim | null> {
  const channels = targetChannels(targets)
  const claim: DraftClaim = { action: 'REGENERATE_COPY', claimId: newClaimId() }
  return db.$transaction(async (tx) => {
    const { count } = await tx.draft.updateMany({
      where: { id: draftId, pendingAction: null },
      data: claimData(claim),
    })
    if (count !== 1) return null
    if (channels.length > 0) {
      await tx.draftCaption.updateMany({
        where: { draftId, channel: { in: channels } },
        data: { status: 'PENDING' },
      })
    }
    return claim
  })
}

function targetChannels(targets: readonly CaptionTarget[]): Channel[] {
  return targets.filter((t): t is Channel => t !== 'HEADLINE')
}

// Settle the PENDING rows (all of the draft's, or only `channels`) per
// settleCaptionRow. Each write is guarded on PENDING, so a row an edit or a
// newer write already settled is left alone, and a deleted draft is a no-op.
// A caption action's reply stamp is written on the rows whose field validated
// only; with none (the stale sweep, a failed run) no stamp field is written,
// so a row keeps the stamp of the text it keeps (008 FR-08).
async function settlePendingRows(
  tx: Prisma.TransactionClient,
  draftId: string,
  channels: Channel[] | null,
  fieldFor: (channel: Channel) => FieldResult,
  stamp: CaptionStamp | null = null,
): Promise<void> {
  const rows = await tx.draftCaption.findMany({
    where: { draftId, status: 'PENDING', ...(channels ? { channel: { in: channels } } : {}) },
    select: { channel: true, text: true },
  })
  for (const row of rows) {
    await tx.draftCaption.updateMany({
      where: { draftId, channel: row.channel, status: 'PENDING' },
      data: settleCaptionRow(row, fieldFor(row.channel), stamp),
    })
  }
}

// 030 FR-15: whether the settle wrote the headline, and the value it replaced,
// so the caller can emit draft.headline_edited outside the transaction.
export interface SettleResult {
  headlineWritten: boolean
  headlineBefore: string | null
}

// A caption action's write (FR-11, design §5): each target row per its field
// result, and the headline when it was requested and validated, in one
// transaction. It opens with a write to the draft row guarded on the claim (the
// lock order claimCaptionAction takes: draft row, then caption rows), so a run
// the stale sweep already cleared, or a newer claim superseded, writes nothing
// and logs once (019). The headline write carries the same guard. A failed
// headline leaves the column unchanged; the caller reports it.
//
// 008 FR-08: `stamp` is the reply's model (writeCaptions). It goes on each
// target whose field validated — the row's model, or headlineModel in the
// headline's guarded write — and never on a failed one, which keeps its stamp
// with its text (A7). The failure settles (onError, an unstarted run) pass none.
//
// 027 FR-05/FR-11: `postStyle` is the stamp of the run, written to
// Draft.postStyle in the claim-guarded draft write (the copy ran under that
// version); undefined, as in every failure settle, leaves it alone. When the
// claim held, the facts check is recomputed after the transaction.
export async function settleCaptionAction(
  draftId: string,
  claim: DraftClaim,
  targets: readonly CaptionTarget[],
  fields: Partial<Record<CaptionTarget, FieldResult>>,
  stamp: CaptionStamp | null = null,
  db: PrismaClient = prisma,
  postStyle?: PostStyleStamp | null,
): Promise<SettleResult> {
  const headline = targets.includes('HEADLINE') ? fields.HEADLINE : undefined
  let settled = false
  const result: SettleResult = { headlineWritten: false, headlineBefore: null }
  await db.$transaction(async (tx) => {
    const { count } = await tx.draft.updateMany({
      where: { id: draftId, ...claimWhere(claim) },
      data: {
        updatedAt: new Date(),
        ...(postStyle !== undefined ? { postStyle: postStyleColumn(postStyle) } : {}),
      },
    })
    if (count === 0) {
      logLostClaim(draftId, claim)
      return
    }
    settled = true
    await settlePendingRows(
      tx,
      draftId,
      targetChannels(targets),
      (channel) => fields[channel] ?? { ok: false, reason: 'missing' },
      stamp,
    )
    if (headline?.ok) {
      // 030 FR-15: the value before, read in the same transaction.
      const before = await tx.draft.findUnique({ where: { id: draftId }, select: { headline: true } })
      const wrote = await tx.draft.updateMany({
        where: { id: draftId, ...claimWhere(claim) },
        data: { headline: headline.text, ...(stamp ? headlineStampFields(stamp) : {}) },
      })
      result.headlineWritten = wrote.count === 1
      result.headlineBefore = before?.headline ?? null
    }
  })
  if (settled) await refreshAfterWrite(draftId, db)
  return result
}

// The stale sweep's caption half (FR-11): an interrupted generation or caption
// action leaves rows PENDING with nothing writing them. They settle as a failed
// write with the sweep's reason, keeping any text they had (A7).
export async function settlePendingCaptions(
  draftId: string,
  reason: string,
  db: PrismaClient = prisma,
): Promise<void> {
  await db.$transaction((tx) => settlePendingRows(tx, draftId, null, () => ({ ok: false, reason })))
}

// A user's edit to one caption (FR-12): stored exactly as typed, READY, the
// failure cleared. Refused (false) while the row is PENDING, so an edit never
// races the write that claimed it.
export async function saveCaptionEdit(
  draftId: string,
  channel: Channel,
  text: string,
  db: PrismaClient = prisma,
): Promise<boolean> {
  const { count } = await db.draftCaption.updateMany({
    where: { draftId, channel, status: { not: 'PENDING' } },
    data: { text, status: 'READY', failureReason: null },
  })
  if (count === 1) await refreshAfterWrite(draftId, db)
  return count === 1
}

// A user's edit to the headline (FR-12). Refused (false) while a caption
// action holds the draft or a generation is running, since either may be
// writing the headline.
export async function saveHeadlineEdit(
  draftId: string,
  headline: string,
  db: PrismaClient = prisma,
): Promise<boolean> {
  const { count } = await db.draft.updateMany({
    where: {
      id: draftId,
      status: { not: 'IN_PROGRESS' },
      OR: [{ pendingAction: null }, { pendingAction: { not: 'REGENERATE_COPY' } }],
    },
    data: { headline },
  })
  if (count === 1) await refreshAfterWrite(draftId, db)
  return count === 1
}
