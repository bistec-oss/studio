# F5 — Conversational brand-kit creation from references

> Refine this plan just before build. Depends on the CLI-vision mechanism (spike PASSED 2026-07-13).

## Goal

Create/enrich a brand kit by uploading reference images/posts and chatting with the AI, which
extracts the brand **voice + visual style** — mirroring the campaign briefing-assistant pattern.

## Locked decisions

- **Must work in CLI mode too** — proven feasible: write image to a temp file, spawn
  `claude -p --allowedTools Read`, reference the path; the Read tool ingests real pixels.
- Auto-fill **all four**: voice prompt (text), **sampled** color palette, font guesses, tone/style summary.
- Font guesses are **suggestions the admin confirms** — never auto-committed.
- **Extract style only** — no template derivation (that's F6 / a later phase).
- Admin-only (brand kits live under `/admin`).

## Current state (from exploration)

- **Zero vision plumbing today** — all Anthropic calls are text-only; images only ever passed
  as URLs in text. This feature adds the first real vision path.
- `ArtifactType` already has `REFERENCE_IMAGE` and `EXAMPLE_POST`; artifacts upload to a bucket
  with a `feedToAI` flag — storing references is solved.
- Voice today is a **one-shot** generate/improve (`voiceDraft.ts`), not conversational.

## Approach

- New brand-kit assistant chat mirroring `briefingAssistant.ts` (chat + grounding + an "apply"
  fenced convention, e.g. ` ```brandkit `).
- **Vision call:** new CLI-mode variant of the CLI runner that writes uploaded images to temp
  files and passes `--allowedTools Read` (+ cleanup). API-mode variant uses SDK image blocks.
- **Colors:** sample programmatically from the images (reliable) — not via vision.
- **Voice / tone / fonts:** from the vision model; fonts surfaced as confirm-only suggestions.
- Store uploads as `REFERENCE_IMAGE` / `EXAMPLE_POST` artifacts (`feedToAI=true`).
- UI: reference upload + chat + before/after apply, under `/admin/brandkits`.

## Files (confirm at build)

- `src/lib/agent/claudeCli.ts` (vision-capable variant) + API-mode image path
- `src/lib/brandkit/assistant.ts` (new, mirrors briefingAssistant)
- `src/app/api/admin/brandkits/[id]/assistant/...` (new routes)
- color sampling util (new); `src/components/admin/brandkits/*` (chat + apply UI)

## Verify / test

- `tsc`, `lint`, `test:unit`; a real vision run in **both** API and CLI modes on a sample image;
  E2E with a MOCK_AI vision seam.

## Risks / notes

- Vision colors are approximate → always sample programmatically for the palette.
- Keep prompt/image sizes within CLI limits; the Read tool auto-resizes large images.
- Add a MOCK seam so E2E doesn't need a live vision call.
