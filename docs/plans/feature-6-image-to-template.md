# F6 — Upload image → Path A template

> Refine just before build. Shares the CLI-vision mechanism with F5 (spike PASSED 2026-07-13).

## Goal

On "Add template" in the admin brand-kit UI, let an admin upload an image and have the AI turn
it into a reusable Path A HTML template.

## Locked decisions

- AI produces **editable HTML with placeholder slots** (headline, body, logo, image area) —
  a true reusable Path-A template, not a static clone.
- After generation the HTML **opens in the existing HTML editor** to tweak, then save.
- Aspect ratio is **inferred from the image and snapped to the nearest** supported size
  (1:1 / 4:5 / 9:16), with admin override.
- The uploaded source image is **kept as a `REFERENCE_IMAGE` artifact** on the kit (provenance
  - re-generate later).

## Current state

- Path A templates are HTML stored on `BrandKitTemplate.htmlTemplate`, tagged with
  `aspectRatio`; the fill-agent later populates slots with copy. Admin template create lives in
  `KitDetail.tsx` + `POST /api/admin/brandkits/[id]/templates`.
- Same vision capability as F5 — inherits the CLI-mode Read-tool approach and its caveats.

## Approach

- Upload image → vision call (CLI Read-tool variant / API image blocks) with a prompt that
  produces slot-based HTML/CSS matching the image's layout + aesthetic.
- Detect image dimensions → `dimensionsFor` nearest match → prefill the size selector (override).
- Drop the generated HTML into the existing template textarea/editor for review, then save via
  the existing template-create flow.
- Store the source image as a `REFERENCE_IMAGE` artifact.

## Files (confirm at build)

- Vision runner variant (shared with F5)
- `src/components/admin/brandkits/KitDetail.tsx` (upload → generate → editor flow)
- `src/app/api/admin/brandkits/[id]/templates/route.ts` (accept generated HTML; store artifact)
- template-generation prompt builder (new, under `src/lib/agent/prompts/`)

## Verify / test

- `tsc`, `lint`, `test:unit`; real check: upload a sample post image → get slot-based HTML →
  edit → save → generate a Path A post from it → renders on-brand at the snapped size.

## Risks / notes

- Vision output HTML may be imperfect — the editor step is the safety net (keep it mandatory).
- Depends on F3 for the 9:16 size option if inferring a tall image.
- Placeholder-slot convention must match what the Path A fill-agent expects.
