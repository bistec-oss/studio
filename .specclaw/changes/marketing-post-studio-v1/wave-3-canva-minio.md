# Wave 3 — Canva MCP Client + MinIO Storage

**Change:** marketing-post-studio-v1
**Wave:** 3 of 6
**Tasks:** T09, T10
**Estimate:** 1–2 days
**Prerequisite:** Wave 1 complete (T01, T02).

## Objective

Build the two infrastructure clients that everything else depends on: the Canva MCP client (with transaction safety and Claude-powered element resolver) and the MinIO object storage client. These are pure library modules with no UI.

---

## Tasks

### T09 — Canva MCP client with transaction guard + element resolver

- **Files:** `src/lib/canva/client.ts`, `src/lib/canva/types.ts`, `src/lib/canva/elementResolver.ts`
- **Estimate:** medium
- **Depends:** T01
- **Notes:** Two deliverables.

  **1. `client.ts` — typed MCP wrapper**

  Wraps all Canva MCP tool calls behind a typed client. Exported methods:
  ```typescript
  listBrandKits(): Promise<BrandKit[]>
  createFromTemplate(templateId: string): Promise<{ designId: string }>
  uploadAsset(url: string): Promise<{ assetId: string }>
  getDesignContent(designId: string): Promise<ElementTree>
  getAssets(brandKitId: string): Promise<Asset[]>
  withEditingTransaction(designId: string, ops: EditingOperation[]): Promise<void>
  exportDesign(designId: string): Promise<{ downloadUrl: string }>
  searchBrandTemplates(brandKitId: string): Promise<CanvaTemplate[]>
  ```

  `withEditingTransaction` is the **only** way callers can open an editing session — raw `start-editing-transaction`, `commit-editing-transaction`, and `cancel-editing-transaction` are not exported. The method wraps in `try/finally`: always calls `cancel` if `commit` was never reached (NFR-11). This is enforced structurally, not by convention.

  **2. `elementResolver.ts` — Claude-powered element targeting**

  After `getDesignContent` returns the element tree, `resolveEditingOperations(elementTree, intent)` calls Claude (Anthropic SDK, `claude-sonnet-4-6`) with:
  - The element tree as JSON
  - The edit intent (text slots + image slots, each with a human-readable role: "headline", "background image", "person photo", etc.)

  Claude reads the layer names and element types from the tree and returns matched element IDs for each role. The function assembles the final `replace_text` and `update_fill` operations ready to pass to `perform-editing-operations`.

  Throws `ElementNotFoundError` if any requested slot cannot be confidently matched — surfaces the problem immediately rather than producing a silently broken design.

  **No element IDs are hardcoded or pre-mapped per template.** Template designers just need to use descriptive layer names in Canva.

---

### T10 — MinIO storage client

- **Files:** `src/lib/storage/minio.ts`
- **Estimate:** small
- **Depends:** T02
- **Notes:** Wraps `@aws-sdk/client-s3` (MinIO is S3-compatible; only the endpoint differs).

  Exported methods:
  ```typescript
  uploadObject(buffer: Buffer, bucket: string, key: string): Promise<string>
  // returns pre-signed GET URL (7-day expiry for generated-images, permanent for exported-designs)

  getPresignedUrl(bucket: string, key: string): Promise<string>
  ```

  Config from env vars:
  - `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`
  - `MINIO_BUCKET_IMAGES`, `MINIO_BUCKET_EXPORTS`, `MINIO_BUCKET_BRANDKITS`

  Creates buckets on startup if they do not exist. Used by image generation, design export, and brand kit artifact routes.

---

## Parallelism within Wave 3

T09 and T10 have no dependency on each other — they can run in parallel.

```
T01 ──┬── T09 (Canva MCP client)
      └── T10 (MinIO client)  ← also needs T02
T02 ───── T10
```

---

## Canva MCP tools used (reference)

| Tool | Used by |
|---|---|
| `list-brand-kits` | settings UI (admin) |
| `search-brand-templates` | settings UI — template picker (admin) |
| `create-design-from-brand-template` | Path A assembly (T13) |
| `upload-asset-from-url` | Path A + Path B assembly |
| `get-design-content` | Path A (element resolver), Path B (orchestrator) |
| `get-assets` | Path B orchestrator |
| `start/perform/commit/cancel-editing-transaction` | wrapped by `withEditingTransaction` |
| `export-design` | export route (T15) |

---

## Wave 3 Complete When

- [ ] `withEditingTransaction` correctly calls `cancel` when an operation throws mid-transaction
- [ ] `resolveEditingOperations` returns correct element IDs for a test design with known layer names
- [ ] `ElementNotFoundError` is thrown when a slot has no matching element
- [ ] `uploadObject` successfully uploads a buffer to MinIO and returns a valid pre-signed URL
- [ ] MinIO buckets are auto-created on cold start
