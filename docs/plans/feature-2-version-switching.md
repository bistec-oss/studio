# F2 — Version switching (redo + fast switch)

## Goal

Fix two problems: (a) after reverting to an older version there's no way forward ("redo"),
and (b) switching versions is slow.

## Locked decisions

- **Free jump to any version** — keep every version forever; a "current version" pointer on
  `Draft` decides which one is active. Reverting just moves the pointer; nothing is lost.
- **Instant switching** — stop re-rendering on switch; point the draft at the revision's
  already-stored PNG.
- Record a **v1 revision on initial generation** (today the first revision only exists after
  the first edit, so there's nothing to jump back to initially).

## Root causes (from exploration)

- No "redo" because restore mutates the live draft in place with no position pointer; history
  is a flat append-only log.
- Slow because restore re-runs a **full Puppeteer render + MinIO re-upload on every switch**,
  even though each `DraftRevision` already has its own stored PNG (`exportUrl`) that it ignores.

## Confirmed root cause (build-time findings)

- **No pointer:** `Draft.htmlContent/exportUrl` (live state) is separate from the append-only
  `DraftRevision` log; nothing records which revision is active.
- **Incomplete log, opposite semantics:** initial gen (`generateDraft.ts`) records NO revision;
  `refine` (`commitRevision`) appends a revision = the _new_ state; `regenerate-design`
  snapshots the _previous_ state then overwrites live with a new design that is **never**
  recorded → Undo loses the regenerated design. This is the "can't go forward" bug.
- **Slow:** `revisions/[rev]/restore` re-runs Puppeteer + re-uploads, though every
  `DraftRevision.exportUrl` already holds the rendered PNG key.

## Fix — files to change

- `prisma/schema.prisma` — add `currentRevisionNumber Int?` to `Draft`. **New migration**
  - best-effort backfill (existing drafts → max(revisionNumber)).
- `src/lib/agent/generateDraft.ts` — after `draft.create`, append **v1** revision
  (`instruction: 'Original design'`, snapshot html + exportUrl) and set `currentRevisionNumber = 1`.
- `src/app/api/drafts/[id]/refine/route.ts` (`commitRevision`) — set `currentRevisionNumber` to
  the new revision number (already appends the new state).
- `src/app/api/drafts/[id]/regenerate-design/route.ts` — stop snapshotting "the previous"; the
  previous is already the current revision. Append the **new** design as a revision, set pointer;
  `previousRevisionNumber` = the pointer before regen (legacy guard: if null but htmlContent
  exists, snapshot the live state first so Undo still works).
- `src/app/api/drafts/[id]/revisions/[rev]/restore/route.ts` — set `currentRevisionNumber`,
  copy the revision's `htmlSnapshot`/`exportUrl` onto the draft, **reuse the stored PNG**
  (only re-render if that revision's exportUrl is empty — legacy fallback). No Puppeteer on the hot path.
- `src/app/api/drafts/[id]/route.ts` (GET) — expose `currentRevisionNumber`.
- `src/app/(app)/drafts/[id]/page.tsx` — highlight the current revision, relabel restore →
  "jump to this version" for any non-current revision (works forward + back), show a "Current" badge.

## Steps

1. Schema: add pointer + migration; backfill `currentRevisionId` to the latest revision for
   existing drafts (data migration or lazy default).
2. Record v1 revision at generation.
3. Rewrite restore to pointer-move + PNG reuse (no render).
4. Update version UI for free jump + current-version highlight.

## Verify / test

- `tsc`, `lint`, `test:unit`.
- Real check: generate a draft → refine (creates v2) → jump back to v1 (instant, correct
  image) → jump **forward** to v2 (works) → confirm no Puppeteer render fires on switch
  (watch logs / timing).

## Risks / notes

- Existing drafts have no v1 revision — backfill or tolerate a null pointer gracefully.
- Ensure publish/export uses the **current** revision's PNG after a switch.
