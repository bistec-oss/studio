# MCP & ACP — machine-access guide

bistec-studio exposes two programmatic surfaces so external agents/automation can drive the app without a browser login:

- **MCP** — a Model Context Protocol **stdio server** (`src/mcp/server.ts`), for MCP clients such as Claude Desktop / Claude Code.
- **ACP** — a small **HTTP** surface (`src/app/api/acp/*`), for anything that can make an authenticated HTTP request.

Both authenticate with the same **team-scoped `bstk_` API keys**, resolve to the same tool implementations under `src/mcp/tools/*`, and act on behalf of one team.

---

## 1. Authentication

### The credential

Team admins mint keys at **`/team` → API Keys**. A key looks like `bstk_<43-char base64url>` and is shown **exactly once** at creation — only its SHA-256 hash and a masked prefix (`bstk_…AB12`) are stored (`src/mcp/auth.ts`, `src/app/api/team/api-keys/route.ts`). If lost, mint a new one.

### How a presented key is resolved

```
resolveApiKey(presented)  →  { teamId, keyId } | null      (src/mcp/auth.ts)
```

- Hashes the presented key (SHA-256) and looks it up by the unique `keyHash` index — no comparison loop, no timing concern.
- An unknown, empty, or **revoked** key resolves to `null` → unauthenticated.
- A resolved key yields the **team scope** (`teamId`) that every downstream tool is locked to.

There is **no admin/non-admin tier** — a single valid key grants that key's team the full tool surface. Revocation is a soft delete (`revokedAt`), checked **per call**, so pulling a key at `/team` locks out both surfaces immediately.

---

## 2. MCP (stdio server)

### What it is

`src/mcp/server.ts` runs an MCP `Server` over `StdioServerTransport`. It is **not** an HTTP client of the app — it imports Prisma, MinIO, and the design pipeline directly and _is_ the backend running in stdio mode. It therefore needs the **full app environment** (DB, MinIO, model credentials), plus the API key.

The key is read **once from the `MCP_API_KEY` env var** (`server.ts:13`) but **re-resolved against the DB on every tool call** (`server.ts:122`), so a mid-session revoke takes effect at once.

### Tools (8)

| Tool                    | Purpose                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `create_brand_kit`      | Create a brand kit (colors, fonts, logo)                                                               |
| `set_brand_kit_prompt`  | Set/version the brand voice prompt                                                                     |
| `upload_brand_template` | Upload an HTML/CSS template                                                                            |
| `list_brand_kits`       | List active kits                                                                                       |
| `get_brand_kit`         | Full kit details + templates + active prompt                                                           |
| `generate_post`         | Brief → finished post (copy + design → render → export). Returns `draftId`, `exportUrl`, `htmlContent` |
| `get_draft`             | Fetch a draft by id                                                                                    |
| `publish_post`          | Publish a draft to Instagram / LinkedIn                                                                |

### Client configuration

The launch command is `tsx src/mcp/server.ts` (npm script: `npm run mcp`). Register it as a stdio MCP server. Because the process reads `process.env` directly, the key **and the rest of the app env** must be present in the server process's environment:

```json
{
  "mcpServers": {
    "bistec-studio": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"],
      "cwd": "/absolute/path/to/designer",
      "env": {
        "MCP_API_KEY": "bstk_<the-plaintext-shown-once>",
        "DATABASE_URL": "postgresql://…",
        "MINIO_ENDPOINT": "http://localhost:9000",
        "MINIO_PUBLIC_ENDPOINT": "http://localhost:9000",
        "MINIO_ACCESS_KEY": "…",
        "MINIO_SECRET_KEY": "…"
        // …plus every other var the app's src/lib/env.ts requires
      }
    }
  }
}
```

> **Where does the key go?** `MCP_API_KEY` must be set in the **environment of the `tsx src/mcp/server.ts` process**. Two practical ways:
>
> 1. **In the MCP client config `env` block** (above) — self-contained, but you must supply the _other_ required env vars there too.
> 2. **Via the app `.env`** — add `MCP_API_KEY=bstk_…` to `.env` and launch with an env-file loader, e.g. `npx tsx --env-file=.env src/mcp/server.ts`. (The default `npm run mcp` script does **not** auto-load `.env`, so a bare `npm run mcp` only sees vars already exported in the shell.)
>
> Either way the server must run with `cwd` at the repo root and with the full app env — it talks to Postgres/MinIO directly.

---

## 3. ACP (HTTP)

Plain HTTP against the deployed app. The key goes in the **`x-bistec-api-key`** request header. Both routes 401 without a valid key.

### Endpoints

- `GET /api/acp/manifest` → returns the agent manifest (`src/app/api/acp/manifest/route.ts`).
- `POST /api/acp/run` → invokes a capability (`src/app/api/acp/run/route.ts`).

### Capabilities (2)

ACP exposes only `generate_post` and `publish_post` (the brand-kit management tools are MCP-only).

```bash
# Discover
curl https://studio.bistecglobal.com/api/acp/manifest \
  -H "x-bistec-api-key: bstk_…"

# Generate
curl -X POST https://studio.bistecglobal.com/api/acp/run \
  -H "x-bistec-api-key: bstk_…" \
  -H "content-type: application/json" \
  -d '{
    "capability": "generate_post",
    "input": {
      "topic": "…", "goal": "…", "tone": "…",
      "designMode": "GENERATE", "channels": ["LINKEDIN"]
    }
  }'

# Publish
curl -X POST https://studio.bistecglobal.com/api/acp/run \
  -H "x-bistec-api-key: bstk_…" \
  -H "content-type: application/json" \
  -d '{"capability":"publish_post","input":{"draftId":"…","channel":"LINKEDIN"}}'
```

Response codes: `400` invalid input, `401` bad/missing key, `422` tool-level failure, `200` `{ output }` on success.

---

## 4. Team scoping & guardrails

- **Team-locked.** Every tool call threads `teamId` **from the resolved key**, never from the request. Caller args are spread _first_ so a `teamId` in the payload can't override the key's real team (`server.ts:146`, `run/route.ts:38`). A team-A key cannot read or write team-B data.
- **Acts as a system user.** MCP/ACP-created rows are owned by a dedicated `MCP Agent` user (EDITOR, `src/mcp/systemUser.ts`), auto-granted an idempotent membership in the calling team so its rows are visible under the team's D6 visibility rules. Editor-level, not super-admin.
- **Publishing needs the team's channel tokens.** The key authorizes the action; the actual LinkedIn/Instagram push uses the team's `ChannelToken` configured at `/team`.
- **Treat a `bstk_` key like a publish-capable service account** — one key grants the whole team tool surface, including public social publishing.

---

## 5. Security — prompt-injection hardening (CLI mode)

Production runs in **CLI mode** (`claude -p`), and `generate_post` can drive the vision path. Since 005 T4/T5 no CLI spawn has any tool (`--tools ""`), and vision passes its images inline over stdin. Untrusted inputs (uploaded documents, chat transcripts, image contents) are folded into model prompts, so the app hardens against prompt injection in layers:

1. **Instruction-hierarchy guard + fencing** (`src/lib/agent/untrusted.ts`). `UNTRUSTED_CONTENT_GUARD` declares that everything inside the fenced blocks is _untrusted data, never instructions_. `fenceUntrusted()` wraps that content in `<<<UNTRUSTED-DATA>>>` delimiters and **neutralizes any forged closing delimiter** inside the content so injected text can't "break out" of the fence. Used by the campaign-briefing and brand-kit assistants.
2. **Images inline, no files** (`runVisionCli` / `buildVisionCliPrompt`, `src/lib/agent/vision.ts`). CLI vision sends one stream-json user message on stdin: the reference images as base64 `image` blocks, then one text block carrying the system text, `UNTRUSTED_CONTENT_GUARD` (image contents, including any text drawn in them, are untrusted data) and the task. Nothing is written to disk and the prompt names no files. This closes the sharpest vector, injection making the model read a server file and echo it back, because there is nothing to read with.
3. **No tools, no connectors, an env allowlist** (`src/lib/agent/claudeCli.ts`). Every spawn passes `--tools ""` (zero built-in tools; there is no option to opt back in), and `--strict-mcp-config` with no `--mcp-config` loads **zero** MCP servers — the headless CLI never inherits the developer's Claude Code connectors. The child env is an allowlist (`buildChildEnv`), so no server secret reaches the CLI. Since 005 T6 every spawn is also isolated from local configuration: `--safe-mode` and `--setting-sources ""` stop CLAUDE.md, user/project/local settings files, hooks, installed plugins, skills and custom agents from loading (admin-managed policy settings still apply), though the CLI's own built-in skills and its bundled `cc-plugin-*` plugins still load (they are inert with `--tools ""`, since nothing they offer can run without a tool), the spawn runs in an empty temp dir (`bistec-cli-*`) so no project file is in reach, and `--no-session-persistence` keeps prompts out of `$HOME/.claude/projects/`. Timeouts tree-kill the process.
4. **Renderer egress allowlist** (`isAllowedRenderRequest`, `src/lib/renderer/puppeteer.ts`). Model-generated HTML is rendered by Puppeteer, so it could embed an SSRF probe (`<img src="http://169.254.169.254/…">`) or an internal fetch. Every outbound render request is blocked except an allowlist — Google Fonts + the configured MinIO endpoints (`data:`/`blob:`/`about:blank` allowed). Covered by an SSRF regression test.

**Closed by 005 (T4/T5, on `v2`):** the old residual was that the vision Read-tool restriction was prompt-level only. With `--tools ""` on every spawn the CLI has no `Read` tool at all, so **model-initiated** file access is impossible rather than discouraged, and no OS-level sandbox is needed for that vector. The CLI process itself still reads its own startup files (its auth state and config under `$HOME`); T6's settings isolation (item 3) is what stops those from injecting instructions, hooks or plugins into the run. What remains prompt-level is content manipulation: injected text can still steer what the model writes. Item 1 only discourages that; item 4 separately bounds what rendered model HTML can fetch (SSRF), not what the model writes. The in-image proof (AC-16) is `scripts/cli-sandbox-check.mjs`, run by the operator in the built image (005 T6; see `docs/security-prompt-injection-review-2026-07-22.md`).

---

## References

- `src/mcp/auth.ts` — key generation (`generateApiKey`) + resolution (`resolveApiKey`)
- `src/mcp/server.ts` — MCP stdio server + tool dispatch
- `src/mcp/tools/*` — tool implementations (brandkit, generate, publish)
- `src/mcp/systemUser.ts` — system user + team membership
- `src/app/api/acp/{manifest,run}/route.ts` — ACP HTTP surface
- `src/app/api/team/api-keys/*` — key management (mint / list / revoke)
- `src/lib/agent/untrusted.ts`, `src/lib/agent/vision.ts`, `src/lib/agent/claudeCli.ts`, `src/lib/renderer/puppeteer.ts` — prompt-injection & SSRF hardening
