import type { APIRequestContext } from '@playwright/test'

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3001'

// Session cookie populated by login() — carried across requests in the same test.
let sessionCookie = ''

export async function login(request: APIRequestContext, email = 'admin@bisteccare.lk', password = 'BistecStudio2026!') {
  const res = await request.post(`${BASE}/api/auth/sign-in/email`, {
    data: { email, password },
  })
  const setCookie = res.headers()['set-cookie'] ?? ''
  const match = setCookie.match(/better-auth\.session_token=([^;]+)/)
  if (match) sessionCookie = `better-auth.session_token=${match[1]}`
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
