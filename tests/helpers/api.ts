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

export interface LoginOptions {
  // Which team to make active (matched against /api/me's `teams[].name`).
  // Defaults to 'Bistec' when the account belongs to it (preserves every
  // pre-team-tenancy test's assumption of operating inside Bistec without
  // having to touch them); falls back to the account's first team otherwise
  // (e.g. a ClientX-only account). Ignored when skipTeamSelect is set.
  team?: string
  // Skip the active-team dance entirely — used by the handful of cases that
  // specifically assert the pre-choice 409 team-choice-required contract.
  skipTeamSelect?: boolean
}

// Team tenancy: team-scoped routes (withTeamAuth) need an active-team cookie
// once a user belongs to 0 or 2+ teams — and, importantly, a SUPER ADMIN's
// resolution counts ALL live teams (not just their own memberships), so a
// super admin's single-team auto-select silently stops working the moment a
// second team exists anywhere in the database. Rather than have every
// existing E2E case learn about teams, loginAs resolves and sets the active
// team cookie right after sign-in, so every pre-existing call site (which
// never passes `team`) keeps landing in "Bistec" — the team the whole
// pre-team-tenancy catalog was written against.
async function selectActiveTeam(
  ctx: Awaited<ReturnType<typeof apiRequest.newContext>>,
  opts: LoginOptions,
): Promise<void> {
  if (opts.skipTeamSelect) return
  const me = await (await ctx.get('/api/me')).json()
  const teams: { id: string; name: string }[] = me.teams ?? []
  if (teams.length === 0) return // teamless account — nothing to select
  const target = opts.team
    ? teams.find((t) => t.name === opts.team)
    : (teams.find((t) => t.name === 'Bistec') ?? teams[0])
  if (!target) {
    throw new Error(
      `loginAs: requested team "${opts.team}" not found among this user's teams (${teams.map((t) => t.name).join(', ') || 'none'})`,
    )
  }
  const res = await ctx.post('/api/me/active-team', { data: { teamId: target.id } })
  if (!res.ok()) {
    throw new Error(`loginAs: POST /api/me/active-team failed (${res.status()}) for team ${target.id}`)
  }
}

export async function loginAs(
  _request: APIRequestContext,
  email: string,
  password: string,
  opts: LoginOptions = {},
): Promise<ApiClient> {
  // Fresh, isolated context (own cookie jar). baseURL lets us use relative paths.
  const ctx = await apiRequest.newContext({ baseURL: BASE })
  const res = await ctx.post('/api/auth/sign-in/email', { data: { email, password } })
  const cookie = parseSessionCookie(res.headers()['set-cookie'] ?? '')
  // The session cookie is now in ctx's jar — sent automatically on every call.
  await selectActiveTeam(ctx, opts)
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

// ── Team-tenancy test helpers ────────────────────────────────────────────────

// Look up a team's id by name via the super-admin /api/admin/teams listing.
export async function findTeamIdByName(sa: ApiClient, name: string): Promise<string> {
  const teams = await (await sa.get('/api/admin/teams')).json()
  const team = (teams as { id: string; name: string }[]).find((t) => t.name === name)
  if (!team) throw new Error(`findTeamIdByName: team "${name}" not found`)
  return team.id
}

// Add (or update the role of) a user's membership in a team, via the
// super-admin /api/admin/teams/[id]/members API — the same path a real
// super-admin uses to grant a newly-created platform account team access
// (creating a user via /api/admin/users does NOT itself grant any team
// membership; that is a deliberate separate step).
export async function addTeamMember(
  sa: ApiClient,
  teamId: string,
  userId: string,
  role: 'ADMIN' | 'EDITOR' = 'EDITOR',
): Promise<void> {
  const res = await sa.post(`/api/admin/teams/${teamId}/members`, { userId, role })
  if (!res.ok()) {
    throw new Error(`addTeamMember: failed (${res.status()}) team=${teamId} user=${userId}`)
  }
}
