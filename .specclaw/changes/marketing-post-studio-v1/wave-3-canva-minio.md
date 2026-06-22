# Wave 3 — HTML Renderer + Claude Design Agent + MinIO Storage

**Change:** marketing-post-studio-v1
**Wave:** 3 of 6
**Tasks:** T09, T10
**Estimate:** 1–2 days
**Prerequisite:** Wave 1 complete (T01, T02).

## Objective

Build the two infrastructure modules that everything else depends on: the HTML renderer + Claude design agent (which together power both generation paths) and the MinIO object storage client. These are pure library modules with no UI.

---

## Tasks

### T09 — HTML renderer + Claude design agent

- **Files:** `src/lib/renderer/puppeteer.ts`, `src/lib/agent/designAgent.ts`, `src/lib/agent/tools.ts`, `src/lib/agent/types.ts`
- **Estimate:** medium
- **Depends:** T01, T10
- **Notes:** Two deliverables.

  **1. `puppeteer.ts` — headless Chromium renderer**

  Exports a single function:
  ```typescript
  renderHtmlToPng(html: string, width: number, height: number): Promise<Buffer>
  ```

  Implementation details:
  - Uses `puppeteer-core` with a pinned Chromium version (locked in `package.json`)
  - `deviceScaleFactor: 2` for retina-quality output (e.g. 1080×1080 logical → 2160×2160 physical pixels)
  - `page.setContent(html, { waitUntil: 'networkidle0' })` — waits for all network activity to settle before screenshot so web fonts and remote images render correctly
  - Viewport set to `{ width, height, deviceScaleFactor: 2 }`
  - Returns PNG buffer; caller is responsible for uploading to MinIO

  **2. `designAgent.ts` — Claude tool-use agent loop**

  Exports:
  ```typescript
  runDesignAgent(options: DesignAgentOptions): Promise<DesignAgentResult>
  ```

  Types in `types.ts`:
  ```typescript
  interface DesignAgentOptions {
    systemPrompt: string        // caller sets mode: template-fill or freeform
    userMessage: string         // instruction or initial design brief
    briefId: string             // used by getBrandKitContext tool
    tools: AgentTool[]          // subset of available tools for this mode
    maxToolCalls?: number       // default 15 (EC-12)
  }

  interface DesignAgentResult {
    htmlContent: string         // final HTML produced by agent
    exportUrl: string           // MinIO pre-signed URL from last renderHtml call
    toolCallCount: number
  }
  ```

  Loop logic (standard Anthropic SDK tool-use pattern):
  1. Send messages to Claude (claude-sonnet-4-6) via Anthropic SDK
  2. Inspect response — if no `tool_use` blocks, return final result
  3. For each `tool_use` block: execute the matching tool function, collect result
  4. Append `tool_result` blocks and loop
  5. Hard limit: 15 total tool calls — if exceeded, halt and throw `AgentToolLimitError`

  Tools implemented in `tools.ts`:

  | Tool | Signature | Behaviour |
  |---|---|---|
  | `generateImage` | `(prompt: string, brandKitId: string) → { url: string }` | Calls active `ImageProvider` → uploads buffer to MinIO `generated-images` → returns pre-signed URL |
  | `renderHtml` | `(html: string, width: number, height: number) → { url: string }` | Calls `renderHtmlToPng` → uploads PNG buffer to MinIO `exported-designs` → returns pre-signed URL |
  | `getBrandKitContext` | `(briefId: string) → BrandKitContext` | Resolves brand kit via campaign → project → system default chain; returns `{ colors, fonts, logoUrl, voicePrompt, artifactUrls }` |

  On any tool error: agent halted immediately, `DesignAgentResult` is not returned — caller receives the error with brief record preserved.

  **CLI proxy path:** when `DESIGN_PROVIDER=cli`, `runDesignAgent` is never called —
  `ClaudeCliOrchestrator` handles the request entirely via a single CLI subprocess
  call. T09 does not need to implement CLI mode; it only needs to ensure
  `runDesignAgent` is not imported/executed in that path. The registry in T08 handles
  the dispatch before the orchestrator layer reaches `designAgent.ts`.

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

T09 depends on T10 (the `renderHtml` and `generateImage` tools upload to MinIO). T10 has no dependency on T09 and can start immediately after T02.

```
T01 ──── T09 (HTML renderer + Claude agent)  ← also needs T10
T02 ──── T10 (MinIO client)
T10 ──── T09
```

---

## Wave 3 Complete When

- [ ] `renderHtmlToPng` returns a valid PNG buffer for a simple HTML fixture at 1080×1080 logical (2160×2160 physical)
- [ ] PNG dimensions and `deviceScaleFactor` verified with an image inspection assertion
- [ ] `runDesignAgent` in template-fill mode returns `htmlContent` and `exportUrl` for a test brief with a fixture template
- [ ] `runDesignAgent` in freeform mode returns `htmlContent` and `exportUrl` for a test brief with no template
- [ ] Agent halts and throws `AgentToolLimitError` when 15-tool-call limit is reached
- [ ] `getBrandKitContext` resolves correctly through campaign → project → system default chain
- [ ] `renderHtml` tool uploads PNG to MinIO and returns a valid pre-signed URL
- [ ] `generateImage` tool uploads generated image to MinIO and returns a valid pre-signed URL
- [ ] `uploadObject` successfully uploads a buffer to MinIO and returns a valid pre-signed URL
- [ ] MinIO buckets are auto-created on cold start
- [ ] `DESIGN_PROVIDER=cli` causes `ClaudeCliOrchestrator` to be resolved instead of `ClaudeHtmlOrchestrator` (no API call, no Puppeteer, returns `htmlContent` + empty `exportUrl`)
