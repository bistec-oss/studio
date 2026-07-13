# Feature build plans — 2026-07-13 planning session

Six features scoped in the 2026-07-13 planning conversation. All decisions are locked
(recovered from a lost session; see each plan for the specifics).

## Build order & status

| Order | Feature                                           | Plan                                                                           | Status                                                                                                                                                   |
| ----- | ------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | **F3 — Post sizes → 1:1, 4:5, 9:16**              | [feature-3-post-sizes.md](feature-3-post-sizes.md)                             | ✅ Built 2026-07-13 (tsc/lint/137 unit/build green; migration not yet DB-applied)                                                                        |
| 2     | **F2 — Version switching (redo + speed)**         | [feature-2-version-switching.md](feature-2-version-switching.md)               | ✅ Built + behaviorally verified 2026-07-13 (tsc/lint/137 unit/build green; migrations applied to test DB; new E2E proves back+forward jump)             |
| 3     | **F1 — Async generation + skeleton loader**       | [feature-1-async-generation.md](feature-1-async-generation.md)                 | ✅ Built + behaviorally verified 2026-07-13 (tsc/lint/137 unit/build green; full E2E 113 pass incl. new async+retry suite; migration applied to test DB) |
| 4     | **F4 — Chat-driven auto-scheduling**              | [feature-4-chat-auto-scheduling.md](feature-4-chat-auto-scheduling.md)         | ✅ Built + behaviorally verified 2026-07-13 (tsc/lint/141 unit/build green; full E2E 116 pass incl. 3 new F4 cases; no migration)                        |
| 5     | **F5 — Conversational brand-kit from references** | [feature-5-brandkit-from-references.md](feature-5-brandkit-from-references.md) | ✅ Built 2026-07-13 (tsc/lint/146 unit/build green; full E2E 119 pass incl. 3 F5 cases; mock-verified — live vision not yet run)                         |
| 6     | **F6 — Upload image → Path A template**           | [feature-6-image-to-template.md](feature-6-image-to-template.md)               | ✅ Built 2026-07-13 (tsc/lint/148 unit/build green; full E2E 122 pass incl. 3 F6 cases; mock-verified — live vision not yet run)                         |

Numbering (F1–F6) is the order features were raised; the **Order** column is the
recommended build sequence (low-risk foundations first, vision features last).

## Working agreement

- Build **one feature at a time**, in the order above.
- After each feature: run **tsc + lint + `npm run test:unit`** and a real behavior/render
  check where relevant; report results.
- **Stop and wait for approval** before starting the next feature.
- Plans for later features (F4/F5/F6) are refined just before their build, since earlier
  features inform them.

## Cross-cutting decisions (apply everywhere)

- **Path A keeps goal + tone** — they drive the copy text, not the premade design.
- **Brand kits support multiple logos** — as `BrandKitArtifact type=LOGO` rows, with
  `BrandKit.logoUrl` remaining the primary/default.
- **CLI-vision is proven** (spike 2026-07-13): headless `claude -p --allowedTools Read`
  reads a temp-file image as real vision content under the OAuth token. F5 & F6 rely on this.
  Colors from vision are approximate → **sample palettes programmatically**, use vision for
  layout/style/tone.
