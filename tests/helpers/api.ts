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
  patch(path: string, body?: unknown): ReturnType<APIRequestContext['patch']>
  del(path: string): ReturnType<APIRequestContext['delete']>
  multipart(
    path: string,
    multipart: Record<string, unknown>,
  ): ReturnType<APIRequestContext['post']>
  dispose(): Promise<void>
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
    patch: (path, body) => ctx.patch(path, { data: body }),
    del: (path) => ctx.delete(path),
    multipart: (path, multipart) => ctx.post(path, { multipart: multipart as never }),
    dispose: () => ctx.dispose(),
  }
}
