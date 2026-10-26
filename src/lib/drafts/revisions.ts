import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { PROMPT_VERSION } from '@/lib/agent/prompts/shared'
import { INSTRUCTION_CLASS_KEYS } from '@/lib/agent/instructionClasses'
import { getFontSetId } from '@/lib/renderer/fontSet'
import { claimWhere, DraftClaimLostError, type DraftClaim } from '@/lib/drafts/claim'
import type { DraftNotApplied } from '@/lib/api-types'
import type { BackgroundSkipFields } from '@/lib/drafts/backgroundNotice'
import type { ImageSourceWrite } from '@/lib/drafts/imageSourceFields'
import type { ResolvedModel } from '@/lib/models/resolve'
import { compositionStampSchema, parseCompositionStamp, type CompositionStamp } from '@/lib/designData'
import { parsePostStyleStamp, postStyleStampSchema, type PostStyleStamp } from '@/lib/postStyles'
import { parseRenderedText, renderedTextColumn, stampFromCheck, type RenderedText } from '@/lib/renderedText/stamp'
import { designHeadline } from '@/lib/captions/headline'
import type { HeadlineCheck } from '@/lib/renderedText/vocab'
import { parseRenderNotes, renderNotesFrom, renderNotesSchema, type RenderNotes } from '@/lib/fonts/renderNotes'
import type { ApplyFailure } from '@/lib/applyText/vocab'
import { canonicalCompositeHtml } from '@/lib/composite/insert'
import { CompositePlacementError, CompositeRenderError, type CompositeRender } from '@/lib/composite/render'

// ── The revision chain vs. rejected renders (change 004 Phase 2, T15/T16) ────
// DraftRevision holds two kinds of row. COMMITTED rows are the chain: numbered
// 1..N (contiguous per draft), the only rows Draft.currentRevisionNumber can
// point at. REJECTED rows are refine renders that failed verification twice —
// retained for diagnosis and "Use anyway" (FR-13/14a) but NOT part of the chain.
// A rejected row has a NULL revisionNumber and a non-null rejectedAt, and a DB
// CHECK constraint makes those the same statement.
//
// That representation makes most leaks structurally impossible (the pointer and
// restore's [rev] are integers, so they can never match a NULL number), but one
// is not: Postgres sorts NULLs FIRST under ORDER BY … DESC, so an unfiltered
// "latest revision" query returns the rejected row. Hence the rule: every read
// of the chain goes through the helpers below, which apply COMMITTED_REVISION.
// Never query prisma.draftRevision for chain rows directly. The only reads that
// legitimately see rejected rows are ones that target them explicitly (T19's
// adopt, by row id) and the draft hard-delete, which must remove every row.

// ── Render stamps (change 004 F3, AC-04/FR-22) ──────────────────────────────
// Which prompt version produced a render's HTML and which installed font set
// rasterized its PNG. Draft.promptVersion/fontSet describe the draft's CURRENT
// render; every DraftRevision row carries the stamp of ITS render, so restore
// and "Use anyway" — which reinstate an older render — copy that row's stamp
// back onto the draft instead of leaving (or writing) the current values. A
// pre-F3 row has no stamp: it is copied as null, because unknown is honest and
// a stale value is not.
//
// 008 FR-08 / D4: the stamp also names the model whose output the HTML is
// (`model`: the arg that crossed the boundary) and the refused value the
// resolver substituted away from (`modelSubstitutedFrom`), so every revision
// writer that carries promptVersion carries the model too. A DraftRevision row
// takes the stamp through revisionStampFields; a Draft write goes through
// draftStampFields, because the draft's columns are designModel /
// designModelSubstitutedFrom.
//
// 009 FR-12: it also carries the composition stamp (the image style asked for,
// the one applied, why not, the observations), one JSON value on both tables.
// null is "unknown" (a pre-009 row, or a writer that never knew), as for the
// model.
//
// 027 FR-05: it also carries the post-style stamp ({ key, version, revision }),
// one JSON value on both tables. null is "no style" (a pre-027 row, or a brief
// with no style) or unknown, as for the composition.
//
// 030 FR-04: it also carries the rendered-text stamp (the headline the real
// render visibly painted, or why that could not be confirmed), one JSON value
// on both tables. null is "unknown" (a pre-030 row), as for the composition.
// A render writer builds it from its render's check (stampFromCheck); a restore
// or an adopt carries the row's own.
//
// 031 FR-24: it also carries the render note ({ fontsMissing }: the post-font
// families the render could not load), one JSON value on both tables, written
// exactly where renderedText is. null is "no check, or nothing missing" (and a
// pre-031 row). A render writer builds it from its render (renderNotesFrom); a
// restore or an adopt carries the row's own.
export interface RenderStamp {
  promptVersion: string | null
  fontSet: string | null
  model: string | null
  modelSubstitutedFrom: string | null
  composition: CompositionStamp | null
  postStyle: PostStyleStamp | null
  renderedText: RenderedText | null
  renderNotes: RenderNotes | null
}

// The model half of a RenderStamp, as stored. A render made now takes it from
// its ResolvedModel (modelStampOf); a write that keeps a model's HTML — an
// inline edit, an Override — carries a stored one forward (A6).
export interface ModelStamp {
  model: string | null
  modelSubstitutedFrom: string | null
}

const NO_MODEL: ModelStamp = { model: null, modelSubstitutedFrom: null }

// A ResolvedModel as a stamp: the arg that crossed the boundary and the refused
// value. A ModelStamp passes through; null is "unknown" (the 004 rule).
export function modelStampOf(model: ResolvedModel | ModelStamp | null | undefined): ModelStamp {
  if (!model) return NO_MODEL
  if ('arg' in model) return { model: model.arg, modelSubstitutedFrom: model.substitutedFrom }
  return { model: model.model ?? null, modelSubstitutedFrom: model.modelSubstitutedFrom ?? null }
}

// The draft's CURRENT design stamp, carried forward by a write whose HTML is
// still that model's output (008 A6: an inline edit).
export function draftModelStamp(draft: {
  designModel?: string | null
  designModelSubstitutedFrom?: string | null
}): ModelStamp {
  return {
    model: draft.designModel ?? null,
    modelSubstitutedFrom: draft.designModelSubstitutedFrom ?? null,
  }
}

// The stamp of a render made NOW. `model` is the ResolvedModel that wrote its
// HTML, or the stored stamp a write carries forward (A6). Resolve it once per
// render and write the same value to the draft and the revision row. null = no
// model is known for this render; history reads it as "unknown", the 004 rule.
// 009: `composition` has no default, so a caller that forgets it is a type
// error: pass the run's stamp, a carried one, or null for "unknown".
// 030: `renderedText` is the same, required: the stamp built from the render's
// own check (stampFromCheck), a carried one, or null.
// 027: `postStyle` is the same, required for the same reason: the run's stamp
// (briefPostStyleStamp), a carried one (draftPostStyleStamp), or null.
// 031: `renderNotes` is the same, required: the note built from the render's
// own font check (renderNotesFrom), a carried one, or null.
export function currentRenderStamp(
  model: ResolvedModel | ModelStamp | null,
  composition: CompositionStamp | null,
  postStyle: PostStyleStamp | null,
  renderedText: RenderedText | null,
  renderNotes: RenderNotes | null,
): RenderStamp {
  return {
    promptVersion: PROMPT_VERSION,
    fontSet: getFontSetId(),
    ...modelStampOf(model),
    composition,
    postStyle,
    renderedText,
    renderNotes,
  }
}

// The render note as a Json column value: SQL NULL when there is none,
// otherwise the value, validated by its schema at every write.
export function renderNotesColumn(notes: RenderNotes | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return notes ? (renderNotesSchema.parse(notes) as Prisma.InputJsonValue) : Prisma.DbNull
}

// The draft's CURRENT post-style stamp (027), carried forward by a write that
// keeps the render (refine, inline edit, override, adopt, restore). A stored
// value that no longer parses is null: unknown is honest.
export function draftPostStyleStamp(draft: { postStyle?: unknown }): PostStyleStamp | null {
  return parsePostStyleStamp(draft.postStyle)
}

// The post-style stamp as a Json column value: SQL NULL when there is none,
// otherwise the value, validated by its schema at every write.
export function postStyleColumn(stamp: PostStyleStamp | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return stamp ? (postStyleStampSchema.parse(stamp) as Prisma.InputJsonValue) : Prisma.DbNull
}

// The draft's CURRENT composition stamp (009), carried forward by a write whose
// HTML is still the render that stamp describes (an inline edit, an Override, a
// refine that keeps the image). A stored value that no longer parses is null:
// unknown is honest.
export function draftCompositionStamp(draft: { composition?: unknown }): CompositionStamp | null {
  return parseCompositionStamp(draft.composition)
}

// The composition stamp as a Json column value: SQL NULL (not a JSON null) when
// there is none, otherwise the value, validated by its schema and invariants at
// every write.
export function toJsonColumn(composition: CompositionStamp | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return composition ? (compositionStampSchema.parse(composition) as Prisma.InputJsonValue) : Prisma.DbNull
}

// A RenderStamp as DraftRevision columns: the four existing fields plus the
// composition column. It replaces the `...stamp` spread at every revision writer.
export function revisionStampFields(stamp: RenderStamp): {
  promptVersion: string | null
  fontSet: string | null
  model: string | null
  modelSubstitutedFrom: string | null
  composition: Prisma.InputJsonValue | typeof Prisma.DbNull
  postStyle: Prisma.InputJsonValue | typeof Prisma.DbNull
  renderedText: Prisma.InputJsonValue | typeof Prisma.DbNull
  renderNotes: Prisma.InputJsonValue | typeof Prisma.DbNull
} {
  return {
    promptVersion: stamp.promptVersion,
    fontSet: stamp.fontSet,
    model: stamp.model,
    modelSubstitutedFrom: stamp.modelSubstitutedFrom,
    composition: toJsonColumn(stamp.composition),
    postStyle: postStyleColumn(stamp.postStyle),
    renderedText: renderedTextColumn(stamp.renderedText),
    renderNotes: renderNotesColumn(stamp.renderNotes),
  }
}

// A RenderStamp as Draft columns (008 D4): Draft.designModel mirrors the
// current revision's DraftRevision.model.
export function draftStampFields(stamp: RenderStamp): {
  promptVersion: string | null
  fontSet: string | null
  designModel: string | null
  designModelSubstitutedFrom: string | null
  composition: Prisma.InputJsonValue | typeof Prisma.DbNull
  postStyle: Prisma.InputJsonValue | typeof Prisma.DbNull
  renderedText: Prisma.InputJsonValue | typeof Prisma.DbNull
  renderNotes: Prisma.InputJsonValue | typeof Prisma.DbNull
} {
  return {
    promptVersion: stamp.promptVersion,
    fontSet: stamp.fontSet,
    designModel: stamp.model,
    designModelSubstitutedFrom: stamp.modelSubstitutedFrom,
    composition: toJsonColumn(stamp.composition),
    postStyle: postStyleColumn(stamp.postStyle),
    renderedText: renderedTextColumn(stamp.renderedText),
    renderNotes: renderNotesColumn(stamp.renderNotes),
  }
}

// The stamp a restore gives the draft. Normally the revision's stored PNG is
// reused, so the stamp is the row's own (null on a legacy row). A legacy row
// with no stored PNG is re-rendered by the restore route: the HTML is still
// the row's (its prompt version), but the pixels come from the font set
// installed now. The model is always the row's own (008 A6): the HTML is
// still that model's output, whatever font set rasterizes it.
export function restoredRenderStamp(
  revision: {
    promptVersion?: string | null
    fontSet?: string | null
    model?: string | null
    modelSubstitutedFrom?: string | null
    composition?: unknown
    renderedText?: unknown
    renderNotes?: unknown
  },
  rerendered: boolean,
  // 027: the draft's CURRENT post-style stamp, carried (a restore moves the
  // render pointer; it does not re-run the rules). Required, so a caller must
  // choose.
  postStyle: PostStyleStamp | null,
): RenderStamp {
  return {
    promptVersion: revision.promptVersion ?? null,
    fontSet: rerendered ? getFontSetId() : (revision.fontSet ?? null),
    model: revision.model ?? null,
    modelSubstitutedFrom: revision.modelSubstitutedFrom ?? null,
    // 009: the row's own stamp (null on a legacy row, or one that no longer parses).
    composition: parseCompositionStamp(revision.composition),
    postStyle,
    // 030: the row's own stamp, also when re-rendered (FR-04): a row old enough
    // to need a re-render predates 030, so this is null there.
    renderedText: parseRenderedText(revision.renderedText),
    // 031: the row's own note. A legacy row re-rendered here predates 031, so
    // this is null there, as for renderedText.
    renderNotes: parseRenderNotes(revision.renderNotes),
  }
}

// The one definition of "a row of the revision chain". Both conditions are
// stated even though the CHECK constraint makes them equivalent, so the filter
// holds on its own terms and a row that somehow had one without the other is
// still excluded.
export const COMMITTED_REVISION = {
  rejectedAt: null,
  revisionNumber: { not: null },
} satisfies Prisma.DraftRevisionWhereInput

export function committedRevisionWhere(draftId: string): Prisma.DraftRevisionWhereInput {
  return { draftId, ...COMMITTED_REVISION }
}

// A committed revision's number is never null; the type says so after the filter.
function numbered<R extends { revisionNumber: number | null }>(
  rows: R[],
): Array<R & { revisionNumber: number }> {
  return rows.filter((r): r is R & { revisionNumber: number } => r.revisionNumber !== null)
}

// The version-switch list (newest first). Rows are re-checked after the query
// as belt-and-braces: a null number can never reach the client.
export async function listCommittedRevisions(draftId: string) {
  const rows = await prisma.draftRevision.findMany({
    where: committedRevisionWhere(draftId),
    orderBy: { revisionNumber: 'desc' },
    select: {
      id: true,
      revisionNumber: true,
      instruction: true,
      exportUrl: true,
      createdAt: true,
      // 008 FR-16: the model whose output the revision's HTML is (additive).
      model: true,
      // 008 FR-20: the refused value it replaced, for the Versions sheet's
      // "(substituted)" (additive).
      modelSubstitutedFrom: true,
    },
  })
  return numbered(rows)
}

// Restore / Undo target lookup: only a committed row with exactly this number.
export async function findCommittedRevision(draftId: string, revisionNumber: number) {
  return prisma.draftRevision.findFirst({
    where: { ...committedRevisionWhere(draftId), revisionNumber },
  })
}

// The next chain number, computed from committed rows only — a rejected row
// never consumes a number, so the chain stays contiguous (TC-REG-H7a).
export async function nextRevisionNumber(
  tx: Prisma.TransactionClient,
  draftId: string,
): Promise<number> {
  const last = await tx.draftRevision.findFirst({
    where: committedRevisionWhere(draftId),
    orderBy: { revisionNumber: 'desc' },
    select: { revisionNumber: true },
  })
  return (last?.revisionNumber ?? 0) + 1
}

// Allocates the next revisionNumber for a draft and runs `body` inside a
// transaction with it. The @@unique([draftId, revisionNumber]) constraint
// serializes concurrent refines; each loser recomputes and retries on P2002.
// The budget must cover the worst case (every other in-flight refine commits
// first), so it is sized generously — a small budget (e.g. 4) 500s under
// ~10-way concurrency (see TC-REG-H7a). One implementation for refine and
// regenerate-design so their retry budgets can never drift again.
const MAX_ATTEMPTS = 12

// How long an interactive transaction may wait for a pool connection before
// Prisma gives up with P2028 "Unable to start a transaction in the given time".
// Prisma's default is 2000 ms, which is SHORTER than opening one new pool
// connection can take: on the Windows dev/test host a new connection to
// "localhost" costs ~2.1 s (the engine tries ::1 first; Postgres is published
// on 127.0.0.1 only), so a commit issued while a burst of concurrent requests
// grows the pool threw P2028 AFTER the 202 — the TC-REG-H7a "202 winner with
// no revision" (T17 fix round 1; reproduced deterministically outside the app).
// 10 s matches the engine's own pool_timeout for ordinary queries, so a
// transaction is never the first thing to give up under the same load.
export const TX_MAX_WAIT_MS = 10_000
export const TX_OPTIONS = { maxWait: TX_MAX_WAIT_MS } as const

export async function withNextRevisionNumber<T>(
  draftId: string,
  body: (tx: Prisma.TransactionClient, revisionNumber: number) => Promise<T>
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => body(tx, await nextRevisionNumber(tx, draftId)),
        TX_OPTIONS,
      )
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        attempt < MAX_ATTEMPTS
      ) {
        continue // revision number collided — recompute and retry
      }
      throw err
    }
  }
}

export interface CommitRevisionArgs {
  // 031 FR-40: runs after the render, before the upload; a non-null code throws
  // RenderRejectedError and nothing is uploaded or written.
  acceptRender?: (r: RenderResult) => ApplyFailure | null
  // 031 FR-40: the expected headline; when set the check and the stamp are for
  // this text instead of the draft's stored headline.
  checkText?: string
  // 031 FR-40: passed to the render as `absent`.
  absentText?: string
  draftId: string
  instruction: string
  html: string
  width: number
  height: number
  exportKey?: string
  backgroundImageUrl?: string | null
  // 005 FR-07: the refine's background-skip write (refineSkipFields), stored
  // in the same final draft write as backgroundImageUrl. Undefined (every
  // other caller, and a refine whose background step has nothing to report:
  // NO_PROVIDER, since refine resolves first and then never decides, or
  // NOT_NEEDED, or DECISION_ERROR) leaves the draft's
  // backgroundSkipReason/backgroundSkipDetail unchanged.
  backgroundSkip?: BackgroundSkipFields
  // 031 FR-13: the refine's image-source write (refineImageSource), in the same
  // final draft write. Undefined leaves the draft's imageSource unchanged.
  imageSource?: ImageSourceWrite
  // "Use anyway" (T19, FR-14a): the id of the rejected DraftRevision row being
  // adopted. When set, it is stamped adoptedAt + adoptedRevisionNumber
  // atomically INSIDE this same transaction, after the chain insert and
  // BEFORE discardNotAppliedRender runs — the ordering hazard from T17's
  // report (discardNotAppliedRender skips rows with adoptedAt already set, so
  // stamping first is what keeps the just-adopted row from also being marked
  // discardedAt a moment later). See writeRevision's LOCK ORDER note.
  // The guarded UPDATE (adoptedAt IS NULL AND discardedAt IS NULL) doubles as
  // adopt's single-flight mechanism: a second concurrent adopt of the same
  // row loses the race here and the whole commit aborts with
  // AdoptConflictError. No Draft.pendingAction/DraftAction value describes
  // "adopt a stored render" honestly, so adopt never claims that field —
  // this conditional UPDATE is the guard instead, the same shape as the
  // P2002 retry commitDraftRevision already uses for the revision-number
  // race. The final Draft write is itself guarded: it re-checks
  // pendingAction IS NULL and that this row is still the live not-applied
  // pointer in the same atomic step (fix round 1, Minor 1; folded into the
  // final write in fix round 2).
  adoptRejectedRevisionId?: string
  // Compare-and-swap on the revision pointer (change 004 T23 fix round 1,
  // amended Ruling W5-B — element-mode inline edits only). When set, the
  // commit happens only if Draft.currentRevisionNumber is STILL this value
  // AND no action has claimed the draft (pendingAction IS NULL — fix round 2),
  // checked by the transaction's final, guarded draft write; otherwise the
  // transaction rolls back (no revision row, no htmlContent change) and
  // RevisionConflictError is thrown, carrying the claimed action if that was
  // the cause. null means "the draft has no pointer yet" (a legacy draft).
  // Omitted (the default — whole-document inline edit, refine, override,
  // adopt): no check, behaviour unchanged. (Refine commits while it holds its
  // OWN pendingAction claim, which is why only this path adds that condition.)
  //
  // Why it is needed: the caller computed `html` from the draft it read
  // BEFORE this function rendered the PNG (1–2 s in real Chromium). Another
  // commit landing in that window would otherwise be silently overwritten —
  // with element mode's many small edits per session, a real lost update.
  expectedRevisionNumber?: number | null
  // 019: the claim of the draft action making this commit (the refine's
  // verified commit). The final draft write is guarded on it, so a run the
  // sweep cleared cannot land a revision over a newer claim: a miss throws
  // DraftClaimLostError and the transaction rolls back. Valid on the plain
  // commit only — it cannot be combined with expectedRevisionNumber or
  // adoptRejectedRevisionId, which have their own guards (a programming error).
  claim?: DraftClaim
  // 008 FR-08 / A6: the model whose output `html` is — the refine's
  // ResolvedModel, or a stored stamp carried forward (an inline edit carries
  // the draft's designModel; an Override, pendingConflict's model). Omitted
  // reads as unknown (null). Ignored by an adopt, which carries the rejected
  // row's own stamp.
  model?: ResolvedModel | ModelStamp | null
  // 009 FR-12: the composition stamp of the render `html` is. Required, so a
  // writer that forgets it is a type error: an inline edit and an Override pass
  // the draft's current stamp, the refine's verified commit the carried stamp
  // (or refineReplacedStamp), a fresh render its own. null = unknown. Ignored
  // by an adopt, which carries the rejected row's own stamp.
  composition: CompositionStamp | null
  // 027 FR-05: the post-style stamp of the render `html` is. Required for the
  // same reason: every writer passes the draft's current stamp (a carry-forward)
  // or the run's own. An adopt carries the draft's current stamp too (the
  // rejected row's composition and model are still its own). null = no style.
  postStyle: PostStyleStamp | null
}

// Thrown (and never retried — only P2002 is) when the expectedRevisionNumber
// commit is refused: another commit (or a restore) moved the pointer after
// the caller read the document, or a refine/regenerate claimed the draft
// (pendingAction) meanwhile. The transaction is rolled back, so nothing it
// wrote survives. `pendingAction` says which: the claimed action (the
// element-mode route answers 409 draft-busy), or null (the pointer moved —
// 409 element-stale).
export class RevisionConflictError extends Error {
  constructor(readonly pendingAction: string | null = null) {
    super(
      pendingAction
        ? 'Another action claimed the draft while this edit was being prepared'
        : 'The draft changed since this edit was prepared',
    )
    this.name = 'RevisionConflictError'
  }
}

// Thrown (and never retried — only P2002 is) when adoptRejectedRevisionId's
// guarded UPDATE touches 0 rows: the row was already adopted/discarded, or
// was never a rejected row of this draft. The caller (the adopt route) maps
// this to a 409.
export class AdoptConflictError extends Error {
  constructor() {
    super('This render is no longer available to adopt')
    this.name = 'AdoptConflictError'
  }
}

// Removes an export this call uploaded and knows no row references. Best-effort:
// a failed removal is logged and never masks the failure that led here.
async function removeUnusedExport(key: string, why: string) {
  try {
    const { deleteObject, BUCKET_EXPORTS } = await import('@/lib/storage/minio')
    await deleteObject(BUCKET_EXPORTS, key)
  } catch (cleanupErr) {
    console.error(`[revisions] could not remove the unused export ${key} after ${why}:`, cleanupErr)
  }
}

// 031 FR-02: the one lost-claim cleanup. A DraftClaimLostError or a
// RevisionConflictError is a throw that rolled the write back, so the export
// this run uploaded (never a key read from a row) is unused.
// Any other error leaves the object in place: the commit may have landed.
export async function discardOnLostClaim(err: unknown, uploadedKey: string | null, _why: string): Promise<void> {
  if (!uploadedKey) return
  if (!(err instanceof DraftClaimLostError || err instanceof RevisionConflictError)) return
  await removeUnusedExport(uploadedKey, err instanceof DraftClaimLostError ? 'a lost claim' : 'a revision conflict')
}

// 025 FR-16: the render argument for a stamp. null for a stamp with no
// composites (no DB read). For a composite stamp it reads the draft's team and
// the screenshot once; any failure to read or place it is a
// CompositePlacementError ("could not be placed; nothing was changed").
export async function compositeRenderForDraft(
  draftId: string,
  composition: CompositionStamp | null,
  canvas: { width: number; height: number },
): Promise<CompositeRender | null> {
  if (!composition?.composites?.[0]) return null
  try {
    const { compositeRenderForCanvas } = await import('@/lib/composite/assets')
    const owner = await prisma.draft.findUnique({ where: { id: draftId }, select: { teamId: true } })
    if (!owner) throw new CompositeRenderError('composite-source-missing', 'the draft was not found')
    return await compositeRenderForCanvas(composition, owner.teamId, canvas)
  } catch (err) {
    throw new CompositePlacementError(err)
  }
}

// What one render returns: the PNG and, when a headline was given, its check.
export interface RenderResult {
  png: Buffer
  headlineCheck: HeadlineCheck | null
  // 031 FR-24: the post-font families the render could not load.
  fontsMissing: string[]
  // 031 FR-40: painted candidates across the `absent` texts; null when the check failed.
  absentPainted: number | null
}

// 031 FR-40: Apply's refusal at the render. Thrown before the upload, so
// nothing is uploaded or written.
export class RenderRejectedError extends Error {
  constructor(public readonly code: ApplyFailure) {
    super(`render rejected: ${code}`)
    this.name = 'RenderRejectedError'
  }
}

// The on-image headline a render of this draft is checked against: the stored
// headline, else the brief topic (designHeadline, the one rule). One read.
async function draftHeadlineText(draftId: string): Promise<string> {
  const row = await prisma.draft.findUnique({
    where: { id: draftId },
    select: { headline: true, brief: { select: { topic: true } } },
  })
  return designHeadline({ headline: row?.headline ?? null }, { topic: row?.brief?.topic ?? '' }).text
}

// Renders `html` for a draft with this stamp; a failed composite check is a
// CompositePlacementError and any other error passes through.
export async function renderDraftHtml(
  draftId: string,
  html: string,
  composition: CompositionStamp | null,
  width: number,
  height: number,
  // 030: the headline to check against the render, or null for a render that
  // stamps nothing (restore's re-render, the export).
  headline: string | null,
  // 031 FR-40: texts that must not be painted (Apply's old headline).
  absent?: string[],
): Promise<RenderResult> {
  const composites = await compositeRenderForDraft(draftId, composition, { width, height })
  const { renderPost } = await import('@/lib/renderer/puppeteer')
  try {
    return await renderPost(html, width, height, composites, headline === null ? null : { headline, ...(absent?.length ? { absent } : {}) })
  } catch (err) {
    if (err instanceof CompositeRenderError) throw new CompositePlacementError(err)
    throw err
  }
}

// Shared commit path for refine + inline-edit. Renders the HTML to a PNG when
// no export key is supplied (the override / inline-edit / verified-refine
// case), then allocates a revision number and writes the DraftRevision +
// updates the draft atomically (P2002 collision retry via
// withNextRevisionNumber). Returns the new revision id and the EXPORTS object
// key (unsigned). Always writes a COMMITTED row (a number, no rejectedAt) — a
// rejected render is never written through here. A commit is a successful
// change to the design, so it also clears any not-applied outcome and stamps
// the rejected render it referenced as discarded (discardNotAppliedRender).
export async function commitDraftRevision(
  args: CommitRevisionArgs,
): Promise<{ revisionId: string; exportKey: string; revisionNumber: number }> {
  const { draftId, instruction, width, height, backgroundImageUrl, backgroundSkip, imageSource, adoptRejectedRevisionId } = args
  const casExpected = args.expectedRevisionNumber
  const cas = casExpected !== undefined
  const claim = args.claim
  if (claim && (cas || adoptRejectedRevisionId)) {
    throw new Error('commitDraftRevision: claim cannot be combined with expectedRevisionNumber or adoptRejectedRevisionId')
  }

  // F3: the stamp of the render this commit makes current, resolved once and
  // written to both the new row and the draft. An adopt reinstates the
  // rejected render as-is, so it carries THAT render's stamp, read before the
  // transaction: a plain read takes no lock, so the lock order below is
  // unchanged, and the stamp columns are never updated after insert. An
  // unknown row reads as null here and the guard inside the transaction
  // refuses it. 008: a fresh commit's model is the caller's (args.model).
  // 030: a fresh commit's rendered-text stamp comes from the render's own check,
  // known only after the render below, so the composition (all the canonical
  // HTML needs) is settled first and the full stamp is built after the render.
  const adopted = adoptRejectedRevisionId
    ? await rejectedRenderStamp(draftId, adoptRejectedRevisionId, args.postStyle)
    : null
  const composition = adopted ? adopted.composition : args.composition

  // 025 FR-16: the stored document is canonical for this stamp (the one
  // composite element at the stamped rect, or none), whoever wrote it.
  const html = canonicalCompositeHtml(args.html, composition, { width, height })
  let stamp: RenderStamp | null = adopted

  let finalExportKey = args.exportKey
  // Set only when THIS call rendered + uploaded the export — the only object
  // it may remove again (a caller-supplied key belongs to someone else, e.g.
  // the rejected render an adopt reuses).
  let uploadedKey: string | null = null
  if (!finalExportKey) {
    const { uploadObject, exportKey, BUCKET_EXPORTS } = await import('@/lib/storage/minio')
    // 030: the headline is read before the render, so the check and the stamp
    // describe the same value (one indexed read, next to a 1 to 2 s render).
    const headline = args.checkText ?? (await draftHeadlineText(draftId))
    const rendered = await renderDraftHtml(
      draftId,
      html,
      composition,
      width,
      height,
      headline,
      args.absentText ? [args.absentText] : undefined,
    )
    if (args.acceptRender) {
      const refusal = args.acceptRender(rendered)
      if (refusal) throw new RenderRejectedError(refusal)
    }
    stamp = currentRenderStamp(
      args.model ?? null,
      args.composition,
      args.postStyle,
      stampFromCheck(headline, rendered.headlineCheck ?? 'not-checked'),
      renderNotesFrom(rendered.fontsMissing),
    )
    finalExportKey = exportKey('refine', draftId)
    await uploadObject(rendered.png, BUCKET_EXPORTS, finalExportKey, 'image/png')
    uploadedKey = finalExportKey
  }
  const committedExportKey: string = finalExportKey
  // A caller-supplied export with no adopt id: nothing here saw its pixels, so
  // the stamp carries no rendered text and no render note.
  const finalStamp: RenderStamp =
    stamp ?? currentRenderStamp(args.model ?? null, args.composition, args.postStyle, null, null)

  let revision: { id: string; revisionNumber: number }
  try {
    revision = await withNextRevisionNumber(draftId, (tx, revisionNumber) =>
      writeRevision(tx, revisionNumber),
    )
  } catch (err) {
    // A CAS miss or a lost claim is the one failure after the upload that is
    // KNOWN to have written nothing (the throw rolled the transaction back),
    // so the export it rendered can be removed without risking a committed row
    // that points at it. Every other failure keeps the pre-existing behaviour
    // (the object is left in place): after e.g. a dropped connection the commit
    // may in fact have landed. Best-effort — a failed removal is logged and
    // never masks the conflict.
    await discardOnLostClaim(err, uploadedKey, 'a lost claim')
    throw err
  }

  return { revisionId: revision.id, exportKey: committedExportKey, revisionNumber: revision.revisionNumber }

  // LOCK ORDER (fix round 2 — a draft-row-first guard deadlocked, 40P01 →
  // 500, against a concurrent writer). Every writer of the chain takes its
  // locks in ONE order:
  //   1. the revision insert (the (draftId, revisionNumber) unique-index slot;
  //      a concurrent insert of the same number waits here and then fails
  //      P2002, which withNextRevisionNumber retries with a fresh read);
  //   2. rejected-render rows (adopt's stamp, then discardNotAppliedRender);
  //   3. the draft row — ALWAYS the last write.
  // regenerate-design, recordRejectedRender and restore follow the same
  // order (index/rejected rows before the draft). So every guard on the draft
  // row — the element CAS and adopt's single-flight/superseded check — is
  // folded INTO that final write as its WHERE, never run as a leading touch:
  // a miss throws, and the throw rolls back the insert and stamps before it.
  async function writeRevision(tx: Prisma.TransactionClient, revisionNumber: number) {
    const created = await tx.draftRevision.create({
      data: {
        draftId,
        revisionNumber,
        instruction,
        htmlSnapshot: html,
        exportUrl: committedExportKey,
        ...revisionStampFields(finalStamp),
      },
      select: { id: true },
    })

    if (adoptRejectedRevisionId) {
      // The guarded UPDATE on the rejected row itself: every remaining
      // precondition (rejected, not yet adopted/discarded, has an export to
      // adopt — Ruling D) checked and stamped atomically. 0 rows touched
      // means a concurrent adopt/discard won the race, or the row never
      // qualified — either way, 409. It still runs BEFORE
      // discardNotAppliedRender (the T17 ordering hazard: discard skips rows
      // with adoptedAt set, so stamping first keeps the adopted row from also
      // being marked discarded).
      const guard = await tx.draftRevision.updateMany({
        where: {
          id: adoptRejectedRevisionId,
          draftId,
          rejectedAt: { not: null },
          adoptedAt: null,
          discardedAt: null,
          exportUrl: { not: null },
        },
        data: { adoptedAt: new Date(), adoptedRevisionNumber: revisionNumber },
      })
      if (guard.count !== 1) throw new AdoptConflictError()
    }

    await discardNotAppliedRender(tx, draftId)

    const data = {
      ...NOT_APPLIED_CLEARED,
      htmlContent: html,
      exportUrl: committedExportKey,
      currentRevisionNumber: revisionNumber,
      pendingConflict: Prisma.JsonNull,
      ...draftStampFields(finalStamp),
      ...(backgroundImageUrl ? { imageUrl: backgroundImageUrl } : {}),
      ...backgroundSkip,
      ...(imageSource !== undefined ? { imageSource } : {}),
    }

    if (!cas && !adoptRejectedRevisionId && !claim) {
      // The plain commit (whole-document inline edit, override): unchanged —
      // no guard.
      await tx.draft.update({ where: { id: draftId }, data })
      return { id: created.id, revisionNumber }
    }

    // The guarded final write. Its WHERE is evaluated by Postgres under the
    // row lock (a concurrent claimDraftAction / restore / commit on this row
    // either committed first — and is what the WHERE now sees — or waits for
    // this transaction), so each fact is checked and acted on atomically:
    //   - adopt (T19, FR-14a): pendingAction is STILL null (single-flight
    //     "like every other draft action") AND this row is STILL the draft's
    //     live not-applied pointer (never trust a value read earlier — T18's
    //     "never trust the FK alone"). Superseded or claimed → 409.
    //   - element CAS (T23, amended W5-B): the pointer is STILL the caller's
    //     base AND pendingAction is null — an element edit must not commit
    //     while a refine/regenerate claimed the draft during its render
    //     (fix round 2, Minor 3; the same condition adopt has).
    //   - claimed run (019, the refine's commit): the draft STILL carries this
    //     run's claim (action and token), instead of pendingAction null — the
    //     run holds its own claim. A swept or superseded run misses.
    const written = await tx.draft.updateMany({
      where: {
        id: draftId,
        ...(claim ? claimWhere(claim) : { pendingAction: null }),
        ...(adoptRejectedRevisionId ? { notAppliedRevisionId: adoptRejectedRevisionId } : {}),
        ...(cas ? { currentRevisionNumber: casExpected } : {}),
      },
      data,
    })
    if (written.count !== 1) {
      if (claim) throw new DraftClaimLostError()
      if (adoptRejectedRevisionId) throw new AdoptConflictError()
      // Which condition missed? One read in the same transaction, after the
      // UPDATE's own evaluation. Under READ COMMITTED it sees the same OR
      // NEWER committed state: a claim or release landing in between can flip
      // the answer (draft-busy ↔ element-stale), which is harmless — both are
      // 409 and nothing was written. An action is claimed → the caller
      // answers draft-busy; otherwise the pointer moved → element-stale. If
      // both, busy wins — it tells the user why.
      const now = await tx.draft.findUnique({ where: { id: draftId }, select: { pendingAction: true } })
      throw new RevisionConflictError(now?.pendingAction ?? null)
    }
    return { id: created.id, revisionNumber }
  }
}

// The adopted rejected row's own stamp (null on a pre-F3 row, or on a row
// that is not this draft's).
async function rejectedRenderStamp(
  draftId: string,
  revisionId: string,
  postStyle: PostStyleStamp | null,
): Promise<RenderStamp> {
  const row = await prisma.draftRevision.findFirst({
    where: { id: revisionId, draftId },
    select: {
      promptVersion: true,
      fontSet: true,
      model: true,
      modelSubstitutedFrom: true,
      composition: true,
      renderedText: true,
      renderNotes: true,
    },
  })
  return {
    promptVersion: row?.promptVersion ?? null,
    fontSet: row?.fontSet ?? null,
    model: row?.model ?? null,
    modelSubstitutedFrom: row?.modelSubstitutedFrom ?? null,
    composition: parseCompositionStamp(row?.composition),
    postStyle,
    renderedText: parseRenderedText(row?.renderedText),
    renderNotes: parseRenderNotes(row?.renderNotes),
  }
}

// ── Not-applied outcome + rejected renders (change 004 Phase 2, T17) ─────────
// A refine that fails verification twice (drafts/refineAttempt.ts) commits
// nothing — the pointer does not move and no chain row is appended (FR-12) —
// and is recorded here instead: ONE rejected row (NULL revisionNumber,
// rejectedAt set — the T15 CHECK constraints) carrying the last attempt's
// render and its diagnostics (FR-13), and the draft's not-applied outcome
// (notAppliedReason + notAppliedRevisionId — FR-14; T18 exposes it on the poll).
//
// Lifecycle: at most one rejected row is "live" per draft (the one the draft
// points at). Whenever the outcome is cleared (a commit, or any successful
// draft action — draftActions.completeDraftAction) or REPLACED (a newer
// not-applied refine), the row it referenced is stamped discardedAt, so a late
// "Use anyway" (T19) on it is a 409. An adopted row (adoptedAt set) is never
// re-stamped.

// FR-02 vs FR-13: the instruction's classes are persisted HERE ONLY — on the
// rejected row's rejection JSON, never on a committed row (a CHECK constraint
// forbids it) and never as a column.
const classList = z.array(z.enum(INSTRUCTION_CLASS_KEYS))

export const refineAttemptDiagnosticsSchema = z.object({
  attempt: z.union([z.literal(1), z.literal(2)]),
  // What the reply held: a complete document, one cut off before </html>, or none.
  document: z.enum(['complete', 'truncated', 'none']),
  // As the model returned them (normalised by the envelope parser); [] when
  // there was no document.
  classes: classList,
  classificationDefaulted: z.boolean(),
  // After refineEnvelope.effectiveClasses: what was actually verified.
  effectiveClasses: classList,
  // Classes effectiveClasses downgraded to add. A replace/remove with an empty
  // supersedes counts as a miss (AC-10); a constrain with no target is simply
  // verified as add.
  downgraded: classList,
  supersedes: z.array(z.string()),
  constrains: z.array(z.object({ fragment: z.string(), direction: z.enum(['decrease', 'increase']).optional() })),
  // Inline-asset token reconciliation (T11 + Ruling C). skipped = no complete
  // document to reconcile.
  reconcile: z.object({
    kind: z.enum(['clean', 'intended-removal', 'preservation-miss', 'mismatch', 'skipped']),
    missing: z.array(z.string()),
    reason: z.string().optional(),
  }),
  // The verifier's verdict; skipped = the attempt already missed before
  // verification (no document, truncated, downgraded, token problem), so no
  // verification was spent on it.
  verdict: z.enum(['pass', 'miss', 'unavailable', 'skipped']),
  // Why the attempt was not accepted (empty for a pass).
  reasons: z.array(z.string()),
  // Verifier MODEL calls this attempt spent (0 for structural-only classes).
  verifierCalls: z.number().int().min(0).max(1),
})

export const rejectionDiagnosticsSchema = z.object({
  version: z.literal(1),
  // Hard caps (AC-15): at most 2 refine calls and 2 verifier model calls.
  refineCalls: z.number().int().min(1).max(2),
  verifierCalls: z.number().int().min(0).max(2),
  attempts: z.array(refineAttemptDiagnosticsSchema).min(1).max(2),
  // The final attempt's miss reasons — "the verifier's stated miss" (FR-13).
  reasons: z.array(z.string()),
  // The retained render: stored (exportUrl set), none (no usable document),
  // or render-failed (a usable document whose render/upload threw — logged).
  export: z.enum(['stored', 'none', 'render-failed']),
})

export type RefineAttemptDiagnostics = z.infer<typeof refineAttemptDiagnosticsSchema>
export type RejectionDiagnostics = z.infer<typeof rejectionDiagnosticsSchema>

// notAppliedReason is shown to the user (T18) — capped.
export const MAX_NOT_APPLIED_REASON = 500

// The Draft fields that carry no not-applied outcome.
export const NOT_APPLIED_CLEARED = { notAppliedReason: null, notAppliedRevisionId: null } as const

// Stamps the rejected render the draft's not-applied outcome references as
// discarded — unless it was adopted or already discarded. The caller clears
// (NOT_APPLIED_CLEARED) or replaces the draft's fields in the same
// transaction, AFTER this runs (the filter follows the draft's reference).
// Only rejected rows may carry discardedAt (CHECK constraint), and the filter
// says so too. One statement, no read, so it also fits a batch transaction —
// it runs on every draft-action completion (draftActions.completeDraftAction).
//
// `claim` (draft-action completion only): the stamp applies only while the
// draft STILL carries that claim (action and token), so a late settle from a swept run cannot
// discard a newer action's outcome.
export function discardNotAppliedRender(
  client: Prisma.TransactionClient,
  draftId: string,
  claim?: DraftClaim,
) {
  return client.draftRevision.updateMany({
    where: {
      draftId,
      rejectedAt: { not: null },
      adoptedAt: null,
      discardedAt: null,
      notAppliedOn: { some: { id: draftId, ...(claim ? claimWhere(claim) : {}) } },
    },
    data: { discardedAt: new Date() },
  })
}

// Thrown by restoreDraftToRevision when an action claimed the draft between the
// route's pre-check and the write; the route answers 409.
export class DraftBusyError extends Error {
  constructor() {
    super('Another action is already running on this draft')
    this.name = 'DraftBusyError'
  }
}

// The restore route's write: moves the revision pointer to an existing chain
// revision, gives the draft that revision's render stamp (F3: the route builds
// it with restoredRenderStamp) and clears any not-applied outcome (T18).
// Lock order as everywhere: rejected rows first, the draft row LAST. The draft write carries
// pendingAction: null in its WHERE (a late claim wins with 0 rows, and the
// transaction rolls back with a DraftBusyError).
export async function restoreDraftToRevision(
  draftId: string,
  revisionNumber: number,
  htmlSnapshot: string,
  exportKey: string,
  stamp: RenderStamp,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await discardNotAppliedRender(tx, draftId)
    const { count } = await tx.draft.updateMany({
      where: { id: draftId, pendingAction: null },
      data: {
        htmlContent: htmlSnapshot,
        exportUrl: exportKey,
        // Move the "current version" pointer: this is what makes reverting
        // reversible, since you can jump forward again to any other revision.
        currentRevisionNumber: revisionNumber,
        pendingConflict: Prisma.JsonNull,
        ...draftStampFields(stamp),
        ...NOT_APPLIED_CLEARED,
      },
    })
    if (count !== 1) throw new DraftBusyError()
  }, TX_OPTIONS)
}

export interface RecordRejectedRenderArgs {
  draftId: string
  instruction: string
  // The last attempt's document with inline assets restored — rendered and
  // uploaded ONCE as the rejected render's export (the preview and "Use
  // anyway" source). null when that attempt left no usable document
  // (none / truncated / token mismatch).
  html: string | null
  // Kept as htmlSnapshot, for diagnosis only, when html is null: the model-
  // facing reply document (tokens intact), if there was one. Never rendered.
  unusableHtml?: string | null
  width: number
  height: number
  // Human-readable; shown to the user by T18 (capped here).
  reason: string
  diagnostics: Omit<RejectionDiagnostics, 'export'>
  // 008 FR-08: the model the rejected attempt ran (the refine's ResolvedModel),
  // so a later "Use anyway" reinstates the render with its model. Omitted
  // reads as unknown (null).
  model?: ResolvedModel | null
  // 009 FR-12: the composition stamp the attempt's render carries: the draft's
  // current one (a refine of the current design). null = unknown.
  composition: CompositionStamp | null
  // 027 FR-05: the draft's current post-style stamp (a refine keeps the rules
  // the draft was made under). null = no style.
  postStyle: PostStyleStamp | null
  // 019: the refine's claim. The discard and the final draft write are guarded
  // on it; a miss throws DraftClaimLostError and nothing is recorded.
  claim: DraftClaim
}

// Writes the not-applied outcome. A render/upload failure must not mask the
// outcome (Ruling D): it is logged and the row is recorded without an export
// (T19 409s an adopt of a row with no export).
//
// The diagnostics are validated FIRST, before anything is rendered or
// uploaded: diagnostics that break the schema (e.g. more calls than the AC-15
// caps allow) are a bug that must fail loudly, and failing after the upload
// would orphan the export object.
export async function recordRejectedRender(
  args: RecordRejectedRenderArgs,
): Promise<{ revisionId: string; exportKey: string | null }> {
  const { draftId, instruction, width, height, claim } = args
  const diagnostics = rejectionDiagnosticsSchema.omit({ export: true }).parse(args.diagnostics)
  // F3: the rejected row carries the stamp of ITS render, so a later "Use
  // anyway" can reinstate it. The draft's stamp is untouched: its current
  // render did not change. 008: with the attempt's model.
  // 030: the rendered-text stamp comes from the render's check when a render
  // happens; a row with no render (no usable document, or a render that failed)
  // is stamped not-checked.
  const headline = await draftHeadlineText(draftId)
  let stamp = currentRenderStamp(
    args.model ?? null,
    args.composition,
    args.postStyle,
    stampFromCheck(headline, 'not-checked'),
    null,
  )
  // 025 FR-16: canonical for the stamp, like a commit's. An unusable document
  // (no html) is kept as the model wrote it.
  const html = args.html ? canonicalCompositeHtml(args.html, stamp.composition, { width, height }) : args.html

  let exportKey: string | null = null
  let exported: RejectionDiagnostics['export'] = 'none'
  if (html) {
    try {
      const { uploadObject, exportKey: mintExportKey, BUCKET_EXPORTS } = await import('@/lib/storage/minio')
      const rendered = await renderDraftHtml(draftId, html, stamp.composition, width, height, headline)
      const key = mintExportKey('refine', draftId)
      await uploadObject(rendered.png, BUCKET_EXPORTS, key, 'image/png')
      stamp = {
        ...stamp,
        renderedText: stampFromCheck(headline, rendered.headlineCheck ?? 'not-checked'),
        renderNotes: renderNotesFrom(rendered.fontsMissing),
      }
      exportKey = key
      exported = 'stored'
    } catch (err) {
      console.error(`[refine] rejected render for draft ${draftId} could not be rendered/uploaded; recording it without an export:`, err)
      exported = 'render-failed'
    }
  }

  const rejection: RejectionDiagnostics = { ...diagnostics, export: exported }
  const reason =
    args.reason.length > MAX_NOT_APPLIED_REASON ? `${args.reason.slice(0, MAX_NOT_APPLIED_REASON - 1)}…` : args.reason

  let row: { id: string }
  try {
    row = await prisma.$transaction(async (tx) => {
      await discardNotAppliedRender(tx, draftId, claim)
      const created = await tx.draftRevision.create({
        data: {
          draftId,
          revisionNumber: null,
          rejectedAt: new Date(),
          instruction,
          htmlSnapshot: html ?? args.unusableHtml ?? '',
          exportUrl: exportKey,
          rejection: rejection as Prisma.InputJsonValue,
          ...revisionStampFields(stamp),
        },
        select: { id: true },
      })
      // The guarded final write, last as everywhere (see LOCK ORDER above): a
      // run whose claim was swept or superseded records nothing.
      const { count } = await tx.draft.updateMany({
        where: { id: draftId, ...claimWhere(claim) },
        data: { notAppliedReason: reason, notAppliedRevisionId: created.id },
      })
      if (count !== 1) throw new DraftClaimLostError()
      return created
    }, TX_OPTIONS)
  } catch (err) {
    // The throw rolled the row back, so the export uploaded above is unused.
    if (err instanceof DraftClaimLostError) await discardOnLostClaim(err, exportKey, 'a lost claim')
    throw err
  }

  return { revisionId: row.id, exportKey }
}

// ── The poll's notApplied field (T18, FR-14/AC-18, Ruling E) ────────────────
// Re-derives the outcome from the rejected row on every read instead of
// trusting Draft.notAppliedRevisionId as a bare pointer: the row must still
// match draftId + rejectedAt set + NOT discarded (the carried-in note from the
// task board — "never trust the FK alone"). If it doesn't, the outcome is
// gone as far as the client is concerned, even if the column hasn't been
// nulled out for some reason. Nothing off the row but instruction/export/time
// ever reaches this return value — no htmlSnapshot, no rejection JSON.
export async function resolveNotAppliedOutcome(draft: {
  id: string
  notAppliedReason: string | null
  notAppliedRevisionId: string | null
}): Promise<DraftNotApplied | null> {
  if (!draft.notAppliedReason || !draft.notAppliedRevisionId) return null

  const row = await prisma.draftRevision.findFirst({
    where: {
      id: draft.notAppliedRevisionId,
      draftId: draft.id,
      rejectedAt: { not: null },
      discardedAt: null,
    },
    select: { id: true, instruction: true, exportUrl: true, rejectedAt: true },
  })
  if (!row || !row.rejectedAt) return null

  const { resolveExportUrl } = await import('@/lib/storage/minio')
  return {
    reason: draft.notAppliedReason,
    instruction: row.instruction,
    revisionId: row.id,
    previewUrl: await resolveExportUrl(row.exportUrl),
    rejectedAt: row.rejectedAt.toISOString(),
  }
}
