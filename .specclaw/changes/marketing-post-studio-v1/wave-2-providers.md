# Wave 2 — Provider Abstraction Layer

**Change:** marketing-post-studio-v1
**Wave:** 2 of 6
**Tasks:** T05, T06, T07, T08
**Estimate:** 1 day
**Prerequisite:** Wave 1 complete (T01).

## Objective

Define the stable AI provider interfaces and wire up the initial OpenAI implementations. This layer is the architectural firewall between the frontend/API routes and any specific AI model — swapping or adding a model later touches only this layer.

**Model versioning policy:** Always use the latest available model. New providers must default to their latest image generation model. Currently: image = `gpt-image-2`, copy = GPT-4o mini.

---

## Tasks

### T05 — Define provider interfaces

- **Files:** `src/providers/interfaces/CopyProvider.ts`, `src/providers/interfaces/ImageProvider.ts`, `src/providers/interfaces/DesignOrchestrator.ts`
- **Estimate:** small
- **Depends:** T01
- **Notes:** Three TypeScript interfaces — these are the stable contract. All future AI models plug in here.

  ```typescript
  // CopyProvider
  generateCopy(brief: Brief): Promise<string>

  // ImageProvider
  generateImage(brief: Brief, prompt?: string): Promise<{ url: string }>
  // prompt: determined at runtime by the Claude agent (derived from the brief)
  // not a mandatory pre-step — called on-demand by the agent only when raster imagery is needed

  // DesignOrchestrator
  orchestrate(brief: Brief, brandKitId: string): Promise<{ exportUrl: string, htmlContent: string }>
  ```

  The `DesignOrchestrator` is not user-selectable — it is env-configured only. Copy and image providers are user-selectable at brief time.

---

### T06 — OpenAI copy provider implementation

- **Files:** `src/providers/implementations/copy/openai.ts`
- **Estimate:** small
- **Depends:** T05
- **Notes:** Implements `CopyProvider`. Calls OpenAI Chat Completions (GPT-4o mini). Channel-aware system prompt — Instagram caption format vs LinkedIn post format (FR-8). Returns copy string.

---

### T07 — OpenAI image provider implementation

- **Files:** `src/providers/implementations/image/openai.ts`
- **Estimate:** small
- **Depends:** T05
- **Notes:** Implements `ImageProvider`. Calls `gpt-image-2` via OpenAI Images API. Accepts optional `prompt` parameter — if provided (passed by the agent at runtime), uses it; otherwise derives from `brief.topic + brief.description`. Returns image URL. Handles moderation rejection (EC-2) by throwing a typed `ModerationError`. This provider is called on-demand when the Claude design agent invokes the `generateImage` tool — not as a mandatory pipeline pre-step.

---

### T08 — Provider registry

- **Files:** `src/providers/registry.ts`
- **Estimate:** small
- **Depends:** T06, T07
- **Notes:** Resolves the active provider for a given slot using this order:
  1. `providerKey` passed from the Brief record (user's choice at brief time)
  2. `AvailableProvider` row with `isDefault=true` for that slot
  3. Env var fallback (`COPY_PROVIDER` / `IMAGE_PROVIDER`)

  Throws if the resolved key has no registered implementation. **This is the only file that needs updating when a new model is registered** — add a new implementation in `implementations/`, register its key here, admin enables it in settings.

  **Orchestrator resolution** (separate from copy/image — env-only, not user-selectable):
  - `DESIGN_PROVIDER=cli` → `ClaudeCliOrchestrator` (test mode, no API key)
  - `DESIGN_PROVIDER=claude-html` or unset → `ClaudeHtmlOrchestrator` (production)

  Register both orchestrator implementations in `registry.ts` so the factory
  can resolve either. The `DesignOrchestrator` slot is never exposed to users —
  this switch is purely for the deployment/dev environment.

---

## Parallelism within Wave 2

```
T05 (interfaces)
  ├── T06 (copy impl)
  └── T07 (image impl)
       └── T08 (registry) — after T06 + T07
```

T06 and T07 run in parallel once T05 is done.

---

## Adding a new AI provider (reference)

1. Create `src/providers/implementations/image/[name].ts` implementing `ImageProvider`
2. Register it in `registry.ts` under its key
3. Admin enables it in the settings UI (`AvailableProvider` row) → appears in brief UI immediately
4. No frontend changes, no API contract changes

---

## Test mode — no API key required

`ClaudeCliOrchestrator` (`src/providers/implementations/orchestrator/claude-cli.ts`)
is a minimal `DesignOrchestrator` implementation for local development and testing
when no Anthropic API key is available.

It calls the Claude Code CLI via subprocess (`claude -p "<prompt>"`) and parses the
first ` ```html ` block from stdout as the design output. The tool-use loop, Puppeteer
rendering, and MinIO upload are all skipped — `exportUrl` is returned as an empty
string. The generated `htmlContent` is still saved to the DB so the rest of the app
flow (draft page, library, publish) can be exercised.

**Enable:** set `DESIGN_PROVIDER=cli` in `.env` or `.env.local`.
**Disable:** remove the var or set `DESIGN_PROVIDER=claude-html`.

This is a development convenience only — it must not be set in any production
environment. Document it in `.env.example` with a clear comment.

---

## Wave 2 Complete When

- [ ] All three interfaces are defined and exported
- [ ] `generateCopy` returns a non-empty string for a test brief
- [ ] `generateImage` returns a valid URL for a test brief
- [ ] Registry resolves the correct provider for COPY and IMAGE slots
- [ ] `ModerationError` is thrown for a flagged image prompt
