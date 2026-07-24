# Multiple logos per brand kit — design

**Date:** 2026-07-23
**Status:** approved (brainstorm), pending implementation plan
**Branch:** `feat/multiple-brandkit-logos`

## Problem

A brand kit supports exactly **one** logo today:

- `BrandKit.logoUrl` is a single nullable string.
- The UI (`KitDetail.tsx`) has one logo slot — uploading "Replace"s it; the generic Artifacts uploader hard-codes `REFERENCE_IMAGE`/`REFERENCE_DOC`, never `LOGO`.
- `buildBrandKitSystemContext` (shared by Path A + Path B) emits a single `Logo URL:` line from `kit.logoUrl`. Path B additionally feeds `feedToAI` artifact **URLs with no labels** (`pathB.ts:35`), so even the LOGO artifacts a script can already create are unlabeled to the model.

Teams need **multiple logos** on a kit, covering two cases at once:

1. **Variants** of one mark — full-colour, reversed-white, mono, icon-only.
2. **Distinct brand logos** — e.g. BISTEC Global plus a sub-brand/product logo that may appear together or separately.

The AI should be given all logos **with descriptive labels** and choose the variant that fits each design; one logo remains the **primary** default.

## Goals

- Store several logos per kit, each with a human-readable label.
- One logo is the **primary** (default/fallback; backward-compatible with `logoUrl`).
- Generation receives every logo as `label → URL`, primary marked, so the agent can pick the right one.
- UI to add/label/delete logos and set the primary.

## Non-goals

- Per-brief/per-post logo selection (the AI chooses; deferred).
- A dedicated logo table or schema migration.
- Changing how fonts/colors/reference artifacts work.

## Approach (chosen: reuse `BrandKitArtifact type=LOGO`)

Considered: (A) reuse `BrandKitArtifact type='LOGO'`; (B) a new `logos` JSON array on `BrandKit`; (C) a new `BrandKitLogo` table. **Chosen A** — no migration, reuses existing upload/artifact/delete routes, and matches the pattern the Hearts Academy kit already uses (3 LOGO artifacts). B and C add a migration and split logo storage without buying anything here.

### Data model — no schema change

- A logo is a `BrandKitArtifact` with `type='LOGO'`. Its `name` holds the descriptive **label** (e.g. `"BISTEC — reversed white (dark bg)"`).
- `BrandKit.logoUrl` remains the **primary** logo's URL — the default/fallback and backward-compat pointer. Primary is defined as "the LOGO artifact whose `url === kit.logoUrl`"; if `logoUrl` matches no artifact (legacy kit with only the denormalized field), the bare `logoUrl` is still shown/used as an unlabeled primary.
- LOGO artifacts default `feedToAI=true` so Path B receives their image URLs (existing mechanism).

### API — existing routes, small tweaks

1. **Add a logo:** `POST /api/admin/brandkits/[id]/artifacts` with `type=LOGO`, `name=<label>`, `feedToAI=true`. Change the LOGO branch (`artifacts/route.ts:105-107`): set `kit.logoUrl` **only when the kit has no primary yet** (no existing LOGO artifact and empty `logoUrl`) — i.e. the _first_ logo auto-becomes primary; later uploads no longer clobber the primary. Extract this "should this upload become primary?" decision into a pure helper for unit testing.
2. **Set primary:** `PATCH /api/admin/brandkits/[id]` `{ logoUrl }` (already exists; `KitDetail.handleLogoUpload` uses it). The UI's "Set as primary" PATCHes `logoUrl` to the chosen artifact's `url`. Guard: the URL must belong to a LOGO artifact of this kit.
3. **Edit label:** `PATCH /api/admin/brandkits/[id]/artifacts/[artifactId]` — add `name` to the patchable fields (currently only `feedToAI`).
4. **Delete a logo:** existing `DELETE …/artifacts/[artifactId]`. If the deleted artifact was the primary (`url === kit.logoUrl`), reassign `logoUrl` to another remaining LOGO artifact (or `null` if none) in the same transaction.

### Generation — labeled logo list in the shared context

`buildBrandKitSystemContext` **replaces** the single `Logo URL:` line with a labeled list (primary first, primary marked). `data:` URIs are still filtered out (existing guard). Example:

```
- Logos (pick the variant that fits the design; use the primary if unsure):
    • [primary] BISTEC — full colour: https://…/bistec-colour.png
    • BISTEC — reversed white (dark backgrounds): https://…/bistec-white.png
    • Hearts Academy — transparent: https://…/hearts.png
```

When a kit has no logos: `- Logos: none`.

Resolution: `ResolvedBrandKit` gains a `logos: { label: string; url: string; primary: boolean }[]` field, populated from the kit's LOGO artifacts (primary — matching `logoUrl` — sorted first; `data:` URLs excluded). `resolveBrandKit` already loads the kit; it will include LOGO artifacts. `logoUrl` stays on `ResolvedBrandKit` for any remaining consumers. Path B's `feedToAI` artifact-URL feed is unchanged (logos already flow there); the new labels come from the shared context block, which Path B also includes.

### UI (`KitDetail.tsx`) — logo gallery

Replace the single logo slot with a **gallery**:

- Each logo: thumbnail + inline-editable label + a "primary" star (exactly one active; clicking sets primary) + delete.
- An **"Add logo"** button (repeatable) uploads via `uploadAsset` → `POST …/artifacts` `type=LOGO`, label defaulting to the filename (editable after). First upload auto-primary.
- Empty state: "No logos yet."

No change to the Colors/Fonts/Artifacts/Prompt sections. The generic Artifacts uploader still produces `REFERENCE_IMAGE`/`REFERENCE_DOC` as today.

## Testing (TDD)

- **Unit:**
  - Context builder lists all logos, primary first and marked; `none` when empty; `data:` URLs excluded.
  - Pure "should this upload become the primary?" helper (true iff no existing primary).
  - Primary reassignment on delete (pure helper: given remaining logos + deleted url, pick next primary or null).
  - Label PATCH accepts `name`.
- **E2E (mock):** upload two LOGO artifacts to a kit → set the second as primary → GET kit shows both with labels and correct primary → (assert via the context builder unit, since generation is mocked) both labels present.

## Risks / notes

- Backward compat: legacy kits with only `logoUrl` and no LOGO artifact still render one unlabeled primary logo everywhere.
- `data:`-URI logos remain filtered from prompts (existing incident guard) — unaffected.
- No new env vars, no migration. `PROMPT_VERSION` bumps because the brand-context wording changes.
