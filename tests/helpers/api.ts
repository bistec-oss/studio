import { request as apiRequest, type APIRequestContext } from '@playwright/test'

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3001'

function parseSessionCookie(setCookie: string): string {
  const match = setCookie.match(/better-auth\.session_token=([^;]+)/)
  return match ? `better-auth.session_token=${match[1]}` : ''
}

// ── Isolated-session client ──────────────────────────────────────────────────
// Each loginAs() spins up its OWN APIRequestContext with its own cookie jar, so
// admin-vs-editor tests can hold two authenticated sessions at once. The session
// cookie lives in that context's jar (set by the sign-in response), so we must
// NOT reuse the shared `request` fixture — its jar would leak the admin session
// and the wrong identity would win.
export interface ApiClient {
  cookie: string
  post(path: string, body?: unknown): ReturnType<APIRequestContext['post']>
  get(path: string): ReturnType<APIRequestContext['get']>
  put(path: string, body?: unknown): ReturnType<APIRequestContext['put']>
  patch(path: string, body?: unknown): ReturnType<APIRequestContext['patch']>
  del(path: string): ReturnType<APIRequestContext['delete']>
  multipart(
    path: string,
    multipart: Record<string, unknown>,
  ): ReturnType<APIRequestContext['post']>
  dispose(): Promise<void>
}

// Generation is ASYNC (F1): assemble-a/b return 202 { draftId } and the draft
// starts IN_PROGRESS, finishing (EXPORTED) or failing (FAILED) in the background.
// Poll the draft until it leaves IN_PROGRESS. Under MOCK_AI this resolves almost
// immediately; the generous budget covers a cold first render.
export async function waitForDraft(
  api: ApiClient,
  draftId: string,
  { timeoutMs = 30_000, intervalMs = 250 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const draft = await (await api.get(`/api/drafts/${draftId}`)).json()
    if (draft.status && draft.status !== 'IN_PROGRESS') return draft
    if (Date.now() > deadline) return draft // return whatever we have; caller asserts
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

// Draft ACTIONS are async too (§Q): regenerate-design / regenerate-copy /
// refine return 202 { ok: true } after claiming Draft.pendingAction, and the
// work runs in the background. Poll the draft until pendingAction settles back
// to null, then return the fresh draft — the caller asserts the outcome
// (new revision / new copy on success, pendingActionError on failure, conflict
// for a refine brand-kit conflict). The claim happens synchronously before the
// 202 returns, so polling immediately after the POST can never miss the run.
export async function waitForAction(
  api: ApiClient,
  draftId: string,
  { timeoutMs = 30_000, intervalMs = 250 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const draft = await (await api.get(`/api/drafts/${draftId}`)).json()
    if (draft.pendingAction == null) return draft // settled (or an error payload; caller asserts)
    if (Date.now() > deadline) return draft // return whatever we have; caller asserts
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

export async function loginAs(
  _request: APIRequestContext,
  email: string,
  password: string,
): Promise<ApiClient> {
  // Fresh, isolated context (own cookie jar). baseURL lets us use relative paths.
  const ctx = await apiRequest.newContext({ baseURL: BASE })
  const res = await ctx.post('/api/auth/sign-in/email', { data: { email, password } })
  const cookie = parseSessionCookie(res.headers()['set-cookie'] ?? '')
  // The session cookie is now in ctx's jar — sent automatically on every call.
  return {
    cookie,
    post: (path, body) => ctx.post(path, { data: body }),
    get: (path) => ctx.get(path),
    put: (path, body) => ctx.put(path, { data: body }),
    patch: (path, body) => ctx.patch(path, { data: body }),
    del: (path) => ctx.delete(path),
    multipart: (path, multipart) => ctx.post(path, { multipart: multipart as never }),
    dispose: () => ctx.dispose(),
  }
}
