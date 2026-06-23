import type { APIRequestContext } from '@playwright/test'

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3001'

// ── Module-level session (legacy API) ──────────────────────────────────────
// A single shared cookie populated by login(). Fine for suites that act as one
// user (e.g. admin-only flows). For multi-user RBAC/IDOR tests use loginAs(),
// which returns an isolated client with its own cookie jar.
let sessionCookie = ''

function parseSessionCookie(setCookie: string): string {
  const match = setCookie.match(/better-auth\.session_token=([^;]+)/)
  return match ? `better-auth.session_token=${match[1]}` : ''
}

export async function login(
  request: APIRequestContext,
  email = 'admin@bisteccare.lk',
  password = 'BistecStudio2026!',
) {
  const res = await request.post(`${BASE}/api/auth/sign-in/email`, {
    data: { email, password },
  })
  const cookie = parseSessionCookie(res.headers()['set-cookie'] ?? '')
  if (cookie) sessionCookie = cookie
  return res
}

export function authHeaders(): Record<string, string> {
  return sessionCookie ? { Cookie: sessionCookie } : {}
}

export async function post(request: APIRequestContext, path: string, body?: unknown) {
  return request.post(`${BASE}${path}`, { data: body, headers: { ...authHeaders() } })
}

export async function get(request: APIRequestContext, path: string) {
  return request.get(`${BASE}${path}`, { headers: { ...authHeaders() } })
}

export async function patch(request: APIRequestContext, path: string, body?: unknown) {
  return request.patch(`${BASE}${path}`, { data: body, headers: { ...authHeaders() } })
}

export async function del(request: APIRequestContext, path: string) {
  return request.delete(`${BASE}${path}`, { headers: { ...authHeaders() } })
}

// ── Isolated-session client (preferred for new / multi-user tests) ──────────
// Each loginAs() carries its own cookie, so admin-vs-editor tests can hold two
// authenticated sessions at once without clobbering a shared module variable.
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
}

export async function loginAs(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<ApiClient> {
  const res = await request.post(`${BASE}/api/auth/sign-in/email`, {
    data: { email, password },
  })
  const cookie = parseSessionCookie(res.headers()['set-cookie'] ?? '')
  const headers = cookie ? { Cookie: cookie } : {}
  return {
    cookie,
    post: (path, body) => request.post(`${BASE}${path}`, { data: body, headers: { ...headers } }),
    get: (path) => request.get(`${BASE}${path}`, { headers: { ...headers } }),
    patch: (path, body) => request.patch(`${BASE}${path}`, { data: body, headers: { ...headers } }),
    del: (path) => request.delete(`${BASE}${path}`, { headers: { ...headers } }),
    // Playwright sets the multipart boundary content-type itself — do not force JSON here.
    multipart: (path, multipart) =>
      request.post(`${BASE}${path}`, { multipart: multipart as never, headers: { ...headers } }),
  }
}
