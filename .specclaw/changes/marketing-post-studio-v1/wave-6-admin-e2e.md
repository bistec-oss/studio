# Wave 6 — Admin Settings, Draft Refinement & End-to-End Tests

**Change:** marketing-post-studio-v1
**Wave:** 6 of 6
**Tasks:** T20, T21, T22, T27
**Estimate:** 3–4 days
**Prerequisite:** All prior waves complete.

## Objective

Ship the remaining admin surface (provider settings with API key registration + auto-detect, social channel token management), the draft refinement UI (copy edit, image regen, template swap, AGUI chat panel with undo), and full end-to-end test coverage that validates both generation paths, provider registration, and AGUI refinement.

---

## Tasks

### T20 — Admin provider settings UI

- **Files:** `src/app/settings/providers/page.tsx`, `src/app/api/admin/providers/route.ts`, `src/app/api/admin/providers/[id]/route.ts`, `src/app/api/admin/channels/route.ts`
- **Estimate:** medium
- **Depends:** T08 (registry), T25
- **FR references:** FR-31, FR-32, FR-32a–FR-32d, NFR-7

  **Provider registration flow** (within Settings → Providers tab):
  - Admin enters an API key into a text field and hits "Register"
  - Server inspects the key prefix: `sk-ant-` → Anthropic, `sk-` → OpenAI, known others auto-detected
  - If recognized: provider name + label auto-populated in the form for admin to confirm
  - If unrecognized: admin manually enters provider name and label — no block
  - Key validated against the provider's API server-side before saving
  - On success: provider appears in the list showing only the key prefix (e.g. `sk-ant-a•••••••`) — full key never shown again
  - Admin assigns to slot (COPY / IMAGE / both), sets enabled + default flags
  - Brief UI model selector shows registered label and provider name (e.g. "Claude 3.5 Sonnet (Anthropic)")

  **Provider list**: toggle `isEnabled` (removes from brief wizard immediately), set `isDefault`, update label, delete provider row.

  **Social channel token tab** (unchanged):
  - Instagram: paste access token + account ID → encrypted + stored → "Connected" badge
  - LinkedIn: paste access token + organization ID → encrypted + stored → "Connected" badge
  - Token values are never displayed after save — only "Connected" / "Not connected" state
  - Revoke button → clears stored token

  **`POST /api/admin/providers`** — body: `{ slot, apiKey, providerName?, label }` → validate key → encrypt → create row  
  **`PATCH /api/admin/providers/[id]`** — toggle isEnabled / isDefault / update label  
  **`DELETE /api/admin/providers/[id]`** — remove provider  
  **`POST /api/admin/channels`** — store encrypted social token  
  **`DELETE /api/admin/channels/[channel]`** — revoke token

---

### T21 — Draft refinement UI + AGUI backend

- **Files:** `src/app/(app)/drafts/[id]/page.tsx`, `src/components/draft/CopyEditor.tsx`, `src/components/draft/ImagePanel.tsx`, `src/components/draft/TemplateSwapper.tsx`, `src/components/draft/RefinementPanel.tsx`, `src/app/api/drafts/[id]/refine/route.ts`, `src/app/api/drafts/[id]/revisions/route.ts`, `src/app/api/drafts/[id]/revisions/[rev]/restore/route.ts`
- **Estimate:** large
- **Depends:** T13, T14, T15, T25, T27
- **FR references:** FR-15, FR-16, FR-33, FR-33a–FR-33e

  The draft detail page — opened after generation completes or from the library.

  **Layout:** two-column on desktop: left = copy editor + AGUI panel; right = design preview + image + export controls.

  **CopyEditor** — inline textarea pre-filled with `Draft.copyText`. Edits saved via `PATCH /api/drafts/[id]` `{ copyText }`. Character count per channel (Instagram: 2200, LinkedIn: 3000).

  **ImagePanel** — shows current generated image. "Regenerate" button calls `POST /api/generate/image` → replaces `Draft.imageUrl`. Spinner during generation. Hidden for Path B (orchestrator owns image).

  **TemplateSwapper** (Path A only) — lists `BrandKitTemplate` rows linked to the brand kit. Selecting triggers re-run of `POST /api/generate/assemble-a` with new `templateId`.

  **RefinementPanel (AGUI)** — chat-style interface below the copy editor:
  - Instruction input (text field + send button)
  - AI reply area — shows the AI's response streamed back
  - If the AI detects a brand kit conflict, reply explains it and waits — no edit is applied until user sends "override"
  - Revision history list — each committed edit shown as a row with its instruction text and a "Restore" button
  - Restore calls `POST /api/drafts/[id]/revisions/[rev]/restore` → re-applies element tree snapshot via fresh editing transaction

  **Backend — `POST /api/drafts/[id]/refine`:**
  1. Load draft + brief + resolved brand kit
  2. Call `canvaClient.getDesignContent(canvaDesignId)` → current element tree
  3. Call active AI provider (resolved from `brief.copyProviderKey` for Path A; orchestrator model for Path B) with: instruction + element tree + brand kit voice prompt
  4. AI determines required Canva MCP operations and checks brand kit compliance
  5. If conflict: return `{ reply: "<explanation>" }` — no edit applied
  6. If "override" instruction: skip compliance check, proceed to step 7
  7. Apply `withEditingTransaction(resolvedOps)` → commit
  8. Create `DraftRevision` row (instruction, elementTreeSnapshot, revisionNumber)
  9. Return `{ reply, revisionId }`

  **Export button** — calls `POST /api/generate/export`. Shows "Re-export" if export exists. Spinner + toast.

  **Publish button** — opens publish dialog. Admin only.

  **Status banner** — `Draft.status` with guidance ("Ready to export", "Export needed after edits", etc.)

### T27 — Prisma migration: DraftRevision + AvailableProvider schema update

- **Files:** `prisma/schema.prisma`, `prisma/migrations/`
- **Estimate:** small
- **Depends:** T03
- **FR references:** FR-32c, FR-33a

  Add `DraftRevision` model. Update `AvailableProvider` with `providerName`, `keyPrefix`, `encryptedApiKey` fields. Run `prisma migrate dev`. Must be complete before T21 backend work begins.

---

### T22 — End-to-end tests

- **Files:** `tests/e2e/path-a.test.ts`, `tests/e2e/path-b.test.ts`, `tests/e2e/publish.test.ts`, `tests/e2e/brand-kit.test.ts`, `tests/e2e/provider-registration.test.ts`, `tests/e2e/agui-refinement.test.ts`
- **Estimate:** large
- **Depends:** All prior tasks
- **FR references:** all functional requirements (smoke coverage)
- **Test runner:** Playwright (recommended) or Vitest + Supertest for route-level tests

  **`path-a.test.ts`**
  - Create a brand kit with a Canva kit + linked template + imagePrompt
  - Submit a brief selecting Path A + that template
  - Assert: draft row created with non-null `copyText`, `imageUrl`, `canvaDesignId`
  - Assert: `withEditingTransaction` committed without error
  - Assert: export produces a non-null `exportUrl`
  - Assert: `ElementNotFoundError` case returns 422 with failing slot name

  **`path-b.test.ts`**
  - Submit a brief selecting Path B + 1 reference image
  - Assert: GPT-4o orchestrator completes (canvaDesignId non-null)
  - Assert: draft created with status PENDING_EXPORT → READY after export

  **`publish.test.ts`**
  - Immediate publish: `POST /api/posts` with `scheduledAt = null` → status = PUBLISHED
  - Scheduled publish: `POST /api/posts` with future `scheduledAt` → status = SCHEDULED → worker tick → PUBLISHED
  - FAILED post retry: mock publisher failure → status = FAILED → `POST /api/posts/[id]/publish` → PUBLISHED

  **`brand-kit.test.ts`**
  - Create kit → linked templates persist
  - Edit kit (pencil flow) → imagePrompt updated on template row
  - Add prompt version → active version promoted
  - Artifact upload → MinIO key stored, feedToAI toggle persists
  - Soft delete → kit excluded from brief picker

  **`provider-registration.test.ts`**
  - Register provider with `sk-ant-` prefix → providerName auto-populated as "Anthropic", no manual entry required
  - Register provider with `sk-` prefix → auto-populated as "OpenAI"
  - Register provider with unknown prefix → admin supplies name manually, proceeds without block
  - Invalid key → API validation fails → 422, row not created
  - Registered provider appears in brief model selector with correct label + provider name
  - Full API key never returned in any GET response — only keyPrefix shown
  - Disable provider → removed from `GET /api/providers/available` immediately

  **`agui-refinement.test.ts`**
  - Submit refinement instruction → Canva MCP edit applied → `DraftRevision` row created
  - Submit instruction that violates brand kit → reply returned, no edit applied, no revision created
  - Send "override" after conflict warning → edit applied, revision created
  - Restore prior revision → element tree snapshot re-applied via fresh editing transaction
  - Undo panel shows revision history in order

  **Test infrastructure:** tests run against `docker-compose.test.yml` (same services, isolated DB + MinIO). Canva MCP calls mocked at the client layer (`src/lib/canva/client.ts` swapped for a fixture implementation via env flag `CANVA_MOCK=true`). Social publisher calls mocked similarly. AI provider calls (including AGUI refinement) mocked via a fixture that returns deterministic responses.

---

## Parallelism within Wave 6

T27 must run first (schema migration). T20 and T21 can then run in parallel. T22 must come last.

```
(all waves) ── T27 (schema migration) ──┬── T20 (provider registration UI)
                                        ├── T21 (draft refinement + AGUI)
                                        └── (T20 + T21 done) ── T22 (E2E tests)
```

---

## Definition of Done for v1

Wave 6 completion = **v1 feature complete**. The following must all pass before the milestone is called done:

- [ ] Schema migration (T27) applies cleanly — `DraftRevision` and updated `AvailableProvider` fields present
- [ ] Provider registration: known key prefix auto-detected; unknown prefix allows manual entry; invalid key rejected before save; full key never returned in any response
- [ ] Provider settings: enable/disable/default toggle works; brief wizard immediately reflects changes
- [ ] Brief model selector shows provider name + label as registered (e.g. "Claude 3.5 Sonnet (Anthropic)")
- [ ] Social token stored encrypted; never returned in plaintext; revoke clears it
- [ ] Copy editor saves; changes reflected in re-export
- [ ] Image regeneration replaces imageUrl; export re-runs
- [ ] Template swap (Path A) re-runs assembly with new template; draft in place
- [ ] AGUI instruction applies Canva MCP edit, creates DraftRevision, design preview updates
- [ ] AGUI brand kit conflict returns warning reply with no edit applied; "override" forces apply
- [ ] Undo restores prior revision via fresh editing transaction
- [ ] Export button produces downloadable PNG/JPG at a stable MinIO URL
- [ ] All 6 E2E test suites pass in CI (mock Canva + mock publishers + mock AI)
- [ ] Dark/light theme tested on all screens — no unthemed surfaces
- [ ] Admin-only actions (publish, provider settings, brand kits) return 403 for editor role
