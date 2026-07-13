# F3 — Post sizes → 1:1, 4:5, 9:16

## Goal

Offer three post sizes instead of two: **1:1** (1080×1080), **4:5** (1080×1350),
**9:16** (1080×1920).

## Locked decisions

- Existing `PORTRAIT` (already 1080×1350 = 4:5) is **relabeled to "4:5"** — pure label
  fix, **no data backfill**. The enum value name stays `PORTRAIT`.
- Add **one** new enum value for 9:16 → `STORY` (1080×1920).
- 9:16 publishes to the **same feed channels** for now — no separate Stories pipeline.

## Files to change

- `prisma/schema.prisma` — add `STORY` to `enum AspectRatio`. **New migration**
  (`ALTER TYPE "AspectRatio" ADD VALUE 'STORY'`).
- `src/lib/aspectRatio.ts` (single source of truth):
  - `ASPECT_DIMENSIONS.STORY = { width: 1080, height: 1920 }`
  - `ASPECT_LABELS`: `PORTRAIT → '4:5 Portrait'`, `STORY → '9:16 Story'`
  - `ASPECT_VALUES` += `'STORY'`; `isAspectRatio` accepts `'STORY'`
  - `aspectClassFor`: `PORTRAIT → 'aspect-[4/5]'`, `STORY → 'aspect-[9/16]'`
- Size pickers / validators (add the third option, drop hardcoded two-size assumptions):
  - `src/components/brief/SizeDesignStep.tsx` (brief wizard picker)
  - `src/components/campaigns/QueueEntryModal.tsx` (scheduling picker)
  - `src/components/admin/brandkits/KitDetail.tsx` + `src/app/api/admin/brandkits/[id]/templates/route.ts` (template create + badge)
  - zod enums / size consumers: `src/app/api/briefs/route.ts`, `src/lib/campaign/queue.ts`,
    `src/lib/agent/background.ts` (image size for the new ratio)
- Tests: `tests/unit/aspectRatio.test.ts`, `tests/unit/queueSchema.test.ts` — extend for 3 sizes.

## Steps

1. Prisma: add `STORY`, generate migration, `prisma generate`.
2. Update `aspectRatio.ts` (dims, labels, values, classes).
3. Sweep the pickers/validators above; grep `PORTRAIT|SQUARE|aspect-\[3/4\]` for any missed spot.
4. Update unit tests for three sizes.

## Verify / test

- `npx tsc --noEmit`, `npm run lint`, `npm run test:unit` (aspectRatio + queueSchema green).
- Real check: generate (or mock-render) a **9:16** post and confirm the canvas is 1080×1920
  and the preview tile uses `aspect-[9/16]`; confirm a 4:5 post still renders 1080×1350 and
  the label reads "4:5".

## Risks / notes

- The migration is the only not-trivially-reversible step. Postgres enum `ADD VALUE` cannot
  run inside a transaction with other statements — keep it in its own migration.
- Legacy rows: unchanged (`PORTRAIT` value preserved). `dimensionsFor(null)` still falls back
  to SQUARE.
