# Team Tenancy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert bistec-studio into a full multi-tenant app partitioned by Team, per the approved spec `docs/superpowers/specs/2026-07-21-team-tenancy-design.md`.

**Architecture:** Explicit `teamId` columns on every tenant table + a team-aware auth wrapper (`withTeamAuth`/`withTeamAdmin`) that resolves the active team from a membership-validated cookie. Credentials (Claude token, OpenAI key, social tokens, machine API keys) move to encrypted/hashed DB rows scoped per team or per user; every env credential tier is deleted. A default team "Bistec" absorbs existing data via an idempotent backfill script between two migrations.

**Tech Stack:** Next.js 16, TypeScript, Prisma 5 + PostgreSQL, better-auth (username plugin), vitest (unit, `tests/unit`), Playwright (E2E, `tests/e2e`), AES-256-GCM via `src/lib/crypto.ts`.

## Global Constraints

- **ALL work happens on branch `feature/team-tenancy`, created from `main` in Task 1. Never commit to `main`. `main` must stay deployable throughout.**
- Old wrappers (`withAdmin`, role-based `withAuth` opts) remain functional until Task 18 deletes them — every task's commit must leave `npx tsc --noEmit`, `npm run lint`, and `npm run test:unit` green.
- Roles: every role check goes through `hasRole()` (`src/lib/roles.ts`) — never compare role strings. New team-role checks compare the Prisma `TeamRole` enum values `'ADMIN' | 'EDITOR'` directly (it is a closed 2-value enum, not hierarchical).
- Encryption: only via `encrypt`/`decrypt` from `src/lib/crypto.ts`. Masked prefixes follow the existing pattern `` `…${value.slice(-4)}` ``.
- Env vars deleted at the end (Task 18): `OPENAI_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, `BISTEC_API_KEYS`, `BISTEC_ADMIN_API_KEYS`, `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_ORGANIZATION_ID`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ACCOUNT_ID`. `ANTHROPIC_API_KEY` (API-mode) and `MCP_API_KEY` (the key a stdio MCP client presents) survive.
- Visibility rule (spec D6, §4): an editor sees `{ teamId }` AND (owned-by-me OR brief has non-null `campaignId`). Team admins / super admins see `{ teamId }`. Brief autosaves stay owner-only, no admin override.
- Mock seams (`MOCK_AI`, `MOCK_PUPPETEER`, `MOCK_SOCIAL`) must keep working — they short-circuit before credential lookup.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- `.env.test` keeps `DESIGN_PROVIDER=claude-html` (CLI mode bypasses `MOCK_AI`).

---

### Task 1: Branch + Migration A (new tables, nullable teamId columns)

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_team_tenancy_a/` (generated)

**Interfaces:**

- Produces: Prisma models `Team`, `TeamMembership`, `UserOpenAiKey`, `ApiKey`, enum `TeamRole`; nullable `teamId String?` on 12 existing models. All later tasks depend on these names exactly.

- [ ] **Step 1: Create the branch**

```bash
git checkout main
git pull
git checkout -b feature/team-tenancy
```

- [ ] **Step 2: Add new models to `prisma/schema.prisma`** (append after the `User`-adjacent models, around line 210):

```prisma
enum TeamRole {
  ADMIN
  EDITOR
}

model Team {
  id                   String           @id @default(cuid())
  name                 String           @unique
  isDeleted            Boolean          @default(false)
  deletedAt            DateTime?
  createdAt            DateTime         @default(now())
  // Team Claude token (scheduler + member fallback), AES-256-GCM via src/lib/crypto.ts
  encryptedClaudeToken String?
  claudeKeyPrefix      String?
  memberships          TeamMembership[]
}

model TeamMembership {
  id        String   @id @default(cuid())
  teamId    String
  team      Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  role      TeamRole
  createdAt DateTime @default(now())

  @@unique([teamId, userId])
  @@index([userId])
}

// Personal OpenAI key, mirrors UserClaudeToken (encrypted + masked prefix, 1 row/user)
model UserOpenAiKey {
  id           String   @id @default(cuid())
  userId       String   @unique
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  encryptedKey String
  keyPrefix    String
  status       String   @default("ACTIVE") // ACTIVE | INVALID
  createdAt    DateTime @default(now())
}

// Machine-caller keys for MCP/ACP, replaces env BISTEC_API_KEYS.
// Stored hashed (never read back); the plaintext is shown once at creation.
model ApiKey {
  id        String    @id @default(cuid())
  teamId    String
  label     String
  keyHash   String    @unique
  keyPrefix String
  createdAt DateTime  @default(now())
  revokedAt DateTime?

  @@index([teamId])
}
```

Add the back-relations on `model User`: `teamMemberships TeamMembership[]` and `openAiKey UserOpenAiKey?`.

- [ ] **Step 3: Add nullable `teamId String?` + `@@index([teamId])` to these 12 models** (scalar column, no relation field — tenancy filters are flat; FK integrity is not needed for soft-deleted teams): `Project`, `Campaign`, `BrandKit`, `Brief`, `Draft`, `Post`, `ScheduledGeneration`, `BriefDraft`, `CampaignDocument`, `BrandKitDocument`, `AvailableProvider`, `ChannelToken`. Do **not** touch `BrandKitTemplate`/`BrandKitArtifact` (they inherit through their kit). Do **not** change the unique constraints yet (that is Migration B, Task 15).

- [ ] **Step 4: Generate and apply the migration**

```bash
npx prisma migrate dev --name team_tenancy_a
npx prisma generate
```

Expected: migration created and applied; client regenerates.

- [ ] **Step 5: Verify gates**

```bash
npx tsc --noEmit
npm run test:unit
```

Expected: both pass (nothing consumes the new models yet).

- [ ] **Step 6: Commit**

```bash
git add prisma
git commit -m "feat(teams): schema — Team, TeamMembership, UserOpenAiKey, ApiKey, nullable teamId columns"
```

---

### Task 2: Team context resolution (`resolveActiveTeam`)

**Files:**

- Create: `src/lib/authz/teamContext.ts`
- Test: `tests/unit/teamContext.test.ts`

**Interfaces:**

- Consumes: Prisma models from Task 1.
- Produces:
  - `type TeamResolution = { kind: 'ok'; teamId: string; teamRole: TeamRole } | { kind: 'choice-required' } | { kind: 'no-team' }`
  - `resolveActiveTeam(userId: string, cookieTeamId: string | null, isSuperAdmin: boolean): Promise<TeamResolution>`
  - `const ACTIVE_TEAM_COOKIE = 'bistec-active-team'`

- [ ] **Step 1: Write the failing tests** (`tests/unit/teamContext.test.ts`) — mock prisma the way `tests/unit/generationRunner.test.ts` does (`vi.mock('@/lib/prisma', ...)`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  membershipFindMany: vi.fn(),
  teamFindFirst: vi.fn(),
  teamFindMany: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    teamMembership: { findMany: mocks.membershipFindMany },
    team: { findFirst: mocks.teamFindFirst, findMany: mocks.teamFindMany },
  },
}))

import { resolveActiveTeam } from '@/lib/authz/teamContext'

describe('resolveActiveTeam', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns no-team when the user has zero memberships', async () => {
    mocks.membershipFindMany.mockResolvedValue([])
    expect(await resolveActiveTeam('u1', null, false)).toEqual({ kind: 'no-team' })
  })

  it('auto-selects a single membership without a cookie', async () => {
    mocks.membershipFindMany.mockResolvedValue([{ teamId: 't1', role: 'EDITOR' }])
    expect(await resolveActiveTeam('u1', null, false)).toEqual({
      kind: 'ok',
      teamId: 't1',
      teamRole: 'EDITOR',
    })
  })

  it('honors a cookie that matches a membership', async () => {
    mocks.membershipFindMany.mockResolvedValue([
      { teamId: 't1', role: 'EDITOR' },
      { teamId: 't2', role: 'ADMIN' },
    ])
    expect(await resolveActiveTeam('u1', 't2', false)).toEqual({
      kind: 'ok',
      teamId: 't2',
      teamRole: 'ADMIN',
    })
  })

  it('requires a choice for multi-team users with no/invalid cookie', async () => {
    mocks.membershipFindMany.mockResolvedValue([
      { teamId: 't1', role: 'EDITOR' },
      { teamId: 't2', role: 'ADMIN' },
    ])
    expect(await resolveActiveTeam('u1', null, false)).toEqual({ kind: 'choice-required' })
    expect(await resolveActiveTeam('u1', 't-gone', false)).toEqual({ kind: 'choice-required' })
  })

  it('super admin: cookie selects any live team as ADMIN', async () => {
    mocks.teamFindFirst.mockResolvedValue({ id: 't9' })
    expect(await resolveActiveTeam('sa', 't9', true)).toEqual({
      kind: 'ok',
      teamId: 't9',
      teamRole: 'ADMIN',
    })
  })

  it('super admin: no cookie → single team auto, multiple → choice, none → no-team', async () => {
    mocks.teamFindFirst.mockResolvedValue(null)
    mocks.teamFindMany.mockResolvedValue([{ id: 't1' }])
    expect(await resolveActiveTeam('sa', null, true)).toEqual({
      kind: 'ok',
      teamId: 't1',
      teamRole: 'ADMIN',
    })
    mocks.teamFindMany.mockResolvedValue([{ id: 't1' }, { id: 't2' }])
    expect(await resolveActiveTeam('sa', null, true)).toEqual({ kind: 'choice-required' })
    mocks.teamFindMany.mockResolvedValue([])
    expect(await resolveActiveTeam('sa', null, true)).toEqual({ kind: 'no-team' })
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/unit/teamContext.test.ts
```

Expected: FAIL — cannot resolve `@/lib/authz/teamContext`.

- [ ] **Step 3: Implement** `src/lib/authz/teamContext.ts`:

```ts
import { prisma } from '@/lib/prisma'
import type { TeamRole } from '@prisma/client'

export const ACTIVE_TEAM_COOKIE = 'bistec-active-team'

export type TeamResolution =
  | { kind: 'ok'; teamId: string; teamRole: TeamRole }
  | { kind: 'choice-required' }
  | { kind: 'no-team' }

// The active team is a server-validated choice, never a client claim: the
// cookie only wins when a live membership (or, for super admins, a live team)
// backs it. Multi-team users with no valid cookie must choose explicitly (D8).
export async function resolveActiveTeam(
  userId: string,
  cookieTeamId: string | null,
  isSuperAdmin: boolean,
): Promise<TeamResolution> {
  if (isSuperAdmin) {
    if (cookieTeamId) {
      const team = await prisma.team.findFirst({
        where: { id: cookieTeamId, isDeleted: false },
        select: { id: true },
      })
      if (team) return { kind: 'ok', teamId: team.id, teamRole: 'ADMIN' }
    }
    const teams = await prisma.team.findMany({
      where: { isDeleted: false },
      select: { id: true },
      take: 2,
    })
    if (teams.length === 1) return { kind: 'ok', teamId: teams[0].id, teamRole: 'ADMIN' }
    return teams.length === 0 ? { kind: 'no-team' } : { kind: 'choice-required' }
  }

  const memberships = await prisma.teamMembership.findMany({
    where: { userId, team: { isDeleted: false } },
    select: { teamId: true, role: true },
  })
  if (memberships.length === 0) return { kind: 'no-team' }
  if (cookieTeamId) {
    const hit = memberships.find((m) => m.teamId === cookieTeamId)
    if (hit) return { kind: 'ok', teamId: hit.teamId, teamRole: hit.role }
  }
  if (memberships.length === 1) {
    return { kind: 'ok', teamId: memberships[0].teamId, teamRole: memberships[0].role }
  }
  return { kind: 'choice-required' }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run tests/unit/teamContext.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/authz/teamContext.ts tests/unit/teamContext.test.ts
git commit -m "feat(teams): active-team resolution with cookie validation and picker semantics"
```

---

### Task 3: Team-aware wrappers (`withTeamAuth`, `withTeamAdmin`)

**Files:**

- Modify: `src/lib/api/handler.ts`

**Interfaces:**

- Consumes: `resolveActiveTeam`, `ACTIVE_TEAM_COOKIE` (Task 2); `getCurrentUser`, `hasRole` (`src/lib/auth.ts`).
- Produces (all later route tasks consume these exact shapes):
  - `interface TeamAuthedUser { userId: string; teamId: string; teamRole: TeamRole; isSuperAdmin: boolean }`
  - `withTeamAuth<P>(handler: (req, ctx: { params: P }, user: TeamAuthedUser) => Promise<NextResponse> | NextResponse)`
  - `withTeamAdmin<P>(handler)` — same, gated to `teamRole === 'ADMIN' || isSuperAdmin`
  - 409 body for unpicked team: `{ error: 'Choose a team', code: 'team-choice-required' }`
  - 403 body for teamless users: `{ error: 'You are not a member of any team' }`
- Old `withAuth`/`withAdmin`/`withSuperAdmin` stay untouched (deleted in Task 18).

- [ ] **Step 1: Add to `src/lib/api/handler.ts`** (below the existing `withSuperAdmin`):

```ts
import type { TeamRole } from '@prisma/client'
import { resolveActiveTeam, ACTIVE_TEAM_COOKIE } from '@/lib/authz/teamContext'

export interface TeamAuthedUser {
  userId: string
  teamId: string
  teamRole: TeamRole
  isSuperAdmin: boolean
}

type TeamAuthedHandler<P> = (
  req: NextRequest,
  ctx: RouteContext<P>,
  user: TeamAuthedUser,
) => Promise<NextResponse> | NextResponse

// Team-scoped twin of withAuth: resolves the active team (cookie validated
// against memberships) and refuses to run without one. Personal routes that
// must work with zero memberships (/api/me/*) keep plain withAuth.
export function withTeamAuth<P = Record<string, string>>(
  handler: TeamAuthedHandler<P>,
  opts: { teamRole?: 'ADMIN' } = {},
) {
  return async (req: NextRequest, ctx: IncomingRouteContext<P>): Promise<NextResponse> => {
    try {
      const user = await getCurrentUser()
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      const isSuperAdmin = hasRole(user.role, 'super_admin')
      const cookieTeamId = req.cookies.get(ACTIVE_TEAM_COOKIE)?.value ?? null
      const resolved = await resolveActiveTeam(user.userId, cookieTeamId, isSuperAdmin)
      if (resolved.kind === 'no-team') {
        return NextResponse.json({ error: 'You are not a member of any team' }, { status: 403 })
      }
      if (resolved.kind === 'choice-required') {
        return NextResponse.json(
          { error: 'Choose a team', code: 'team-choice-required' },
          { status: 409 },
        )
      }
      if (opts.teamRole === 'ADMIN' && resolved.teamRole !== 'ADMIN' && !isSuperAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      return await handler(
        req,
        { params: await ctx.params },
        {
          userId: user.userId,
          teamId: resolved.teamId,
          teamRole: resolved.teamRole,
          isSuperAdmin,
        },
      )
    } catch (err) {
      console.error(`[api] ${req.method} ${req.nextUrl.pathname} failed:`, err)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}

export function withTeamAdmin<P = Record<string, string>>(handler: TeamAuthedHandler<P>) {
  return withTeamAuth(handler, { teamRole: 'ADMIN' })
}
```

`hasRole` is exported from `@/lib/auth` — extend the existing import at the top of handler.ts.

- [ ] **Step 2: Gates + commit**

```bash
npx tsc --noEmit && npm run lint && npm run test:unit
git add src/lib/api/handler.ts
git commit -m "feat(teams): withTeamAuth/withTeamAdmin wrappers (409 team-choice-required contract)"
```

---

### Task 4: Active-team endpoint, expanded /api/me, client plumbing

**Files:**

- Create: `src/app/api/me/active-team/route.ts`
- Modify: `src/app/api/me/route.ts`, `src/lib/api-types.ts`, `src/lib/hooks/useCurrentUser.ts`, `src/lib/apiFetch.ts`

**Interfaces:**

- Produces:
  - `POST /api/me/active-team` body `{ teamId: string }` → 200 `{ ok: true }` + sets `bistec-active-team` cookie (httpOnly, sameSite lax, path `/`); 403 if no membership (non-super-admin) or team missing.
  - `MeResponse` gains `teams: { id: string; name: string; role: TeamRole }[]`, `activeTeamId: string | null`, `teamRole: TeamRole | null`, `teamChoiceRequired: boolean`.
  - `useCurrentUser()` additionally returns `{ teams, activeTeamId, teamRole, isTeamAdmin }` (`isTeamAdmin = teamRole === 'ADMIN' || isSuperAdmin`).
  - `apiFetch` redirects to `/choose-team` on any 409 whose body has `code: 'team-choice-required'`.

- [ ] **Step 1: `src/app/api/me/active-team/route.ts`** (plain `withAuth` — must work pre-choice):

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withAuth, parseBody } from '@/lib/api/handler'
import { hasRole } from '@/lib/auth'
import { ACTIVE_TEAM_COOKIE } from '@/lib/authz/teamContext'

const schema = z.object({ teamId: z.string().min(1) })

export const POST = withAuth(async (req: NextRequest, _ctx, user) => {
  const body = await parseBody(req, schema)
  if (body.response) return body.response
  const { teamId } = body.data

  const allowed = hasRole(user.role, 'super_admin')
    ? await prisma.team.findFirst({ where: { id: teamId, isDeleted: false }, select: { id: true } })
    : await prisma.teamMembership.findFirst({
        where: { userId: user.userId, teamId, team: { isDeleted: false } },
        select: { id: true },
      })
  if (!allowed) return NextResponse.json({ error: 'Not a member of that team' }, { status: 403 })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(ACTIVE_TEAM_COOKIE, teamId, { httpOnly: true, sameSite: 'lax', path: '/' })
  return res
})
```

- [ ] **Step 2: Expand `GET /api/me`** (`src/app/api/me/route.ts`). Inside the existing handler, after the current fields, load memberships and resolution:

```ts
const isSuperAdmin = hasRole(user.role, 'super_admin')
const teams = isSuperAdmin
  ? (
      await prisma.team.findMany({ where: { isDeleted: false }, select: { id: true, name: true } })
    ).map((t) => ({ ...t, role: 'ADMIN' as const }))
  : (
      await prisma.teamMembership.findMany({
        where: { userId: user.userId, team: { isDeleted: false } },
        select: { role: true, team: { select: { id: true, name: true } } },
      })
    ).map((m) => ({ id: m.team.id, name: m.team.name, role: m.role }))
const cookieTeamId = req.cookies.get(ACTIVE_TEAM_COOKIE)?.value ?? null
const resolved = await resolveActiveTeam(user.userId, cookieTeamId, isSuperAdmin)
// spread into the response JSON:
// teams, activeTeamId: resolved.kind === 'ok' ? resolved.teamId : null,
// teamRole: resolved.kind === 'ok' ? resolved.teamRole : null,
// teamChoiceRequired: resolved.kind === 'choice-required'
```

Update `MeResponse` in `src/lib/api-types.ts` with the four new fields (types above).

- [ ] **Step 3: `useCurrentUser`** — surface `teams` (`data?.teams ?? []`), `activeTeamId`, `teamRole`, and `isTeamAdmin` (`teamRole === 'ADMIN' || isSuperAdmin`).

- [ ] **Step 4: `apiFetch` team-choice redirect** — in `src/lib/apiFetch.ts` where non-OK responses are turned into errors, add before the generic throw:

```ts
if (
  res.status === 409 &&
  body &&
  typeof body === 'object' &&
  (body as { code?: string }).code === 'team-choice-required'
) {
  if (typeof window !== 'undefined') window.location.href = '/choose-team'
}
```

- [ ] **Step 5: Gates + commit**

```bash
npx tsc --noEmit && npm run lint && npm run test:unit
git add src/app/api/me src/lib/api-types.ts src/lib/hooks/useCurrentUser.ts src/lib/apiFetch.ts
git commit -m "feat(teams): active-team endpoint, /api/me team fields, client 409 redirect"
```

---

### Task 5: Visibility helpers

**Files:**

- Create: `src/lib/authz/visibility.ts`
- Test: `tests/unit/visibility.test.ts`

**Interfaces:**

- Consumes: `TeamAuthedUser` (Task 3).
- Produces (single source of the D6 rule; routes must not improvise):
  - `briefVisibilityWhere(u: TeamAuthedUser)` → Prisma `Brief` where
  - `draftVisibilityWhere(u)` → Prisma `Draft` where
  - `postVisibilityWhere(u)` → Prisma `Post` where
  - `canAccessContent(u, item: { teamId: string | null; ownerId: string | null; campaignId: string | null }): boolean` — per-item twin used by by-id routes

- [ ] **Step 1: Failing tests** (`tests/unit/visibility.test.ts`; pure functions, no mocks):

```ts
import { describe, it, expect } from 'vitest'
import {
  briefVisibilityWhere,
  draftVisibilityWhere,
  postVisibilityWhere,
  canAccessContent,
} from '@/lib/authz/visibility'

const admin = { userId: 'a', teamId: 't1', teamRole: 'ADMIN' as const, isSuperAdmin: false }
const editor = { userId: 'e', teamId: 't1', teamRole: 'EDITOR' as const, isSuperAdmin: false }

describe('visibility where-shapes', () => {
  it('team admin sees the whole team', () => {
    expect(briefVisibilityWhere(admin)).toEqual({ teamId: 't1' })
    expect(draftVisibilityWhere(admin)).toEqual({ teamId: 't1' })
    expect(postVisibilityWhere(admin)).toEqual({ teamId: 't1' })
  })
  it('editor sees own things plus anything under a campaign', () => {
    expect(briefVisibilityWhere(editor)).toEqual({
      teamId: 't1',
      OR: [{ userId: 'e' }, { campaignId: { not: null } }],
    })
    expect(draftVisibilityWhere(editor)).toEqual({
      teamId: 't1',
      OR: [{ brief: { userId: 'e' } }, { brief: { campaignId: { not: null } } }],
    })
    expect(postVisibilityWhere(editor)).toEqual({
      teamId: 't1',
      OR: [{ userId: 'e' }, { draft: { brief: { campaignId: { not: null } } } }],
    })
  })
})

describe('canAccessContent', () => {
  it('denies cross-team even for team admins', () => {
    expect(canAccessContent(admin, { teamId: 't2', ownerId: 'a', campaignId: null })).toBe(false)
  })
  it('editor: own yes, foreign-uncategorized no, foreign-under-campaign yes', () => {
    expect(canAccessContent(editor, { teamId: 't1', ownerId: 'e', campaignId: null })).toBe(true)
    expect(canAccessContent(editor, { teamId: 't1', ownerId: 'x', campaignId: null })).toBe(false)
    expect(canAccessContent(editor, { teamId: 't1', ownerId: 'x', campaignId: 'c1' })).toBe(true)
  })
  it('team admin sees all in-team; super admin sees all in active team', () => {
    expect(canAccessContent(admin, { teamId: 't1', ownerId: 'x', campaignId: null })).toBe(true)
    expect(
      canAccessContent(
        { ...editor, isSuperAdmin: true },
        { teamId: 't1', ownerId: 'x', campaignId: null },
      ),
    ).toBe(true)
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (`npx vitest run tests/unit/visibility.test.ts`).

- [ ] **Step 3: Implement** `src/lib/authz/visibility.ts`:

```ts
import type { TeamAuthedUser } from '@/lib/api/handler'

// Spec D6: the person is the boundary; the campaign is the sharing container.
// "Team-shared" is precisely: the item's brief has a non-null campaignId.
const isTeamWide = (u: TeamAuthedUser) => u.teamRole === 'ADMIN' || u.isSuperAdmin

export function briefVisibilityWhere(u: TeamAuthedUser) {
  if (isTeamWide(u)) return { teamId: u.teamId }
  return { teamId: u.teamId, OR: [{ userId: u.userId }, { campaignId: { not: null } }] }
}

export function draftVisibilityWhere(u: TeamAuthedUser) {
  if (isTeamWide(u)) return { teamId: u.teamId }
  return {
    teamId: u.teamId,
    OR: [{ brief: { userId: u.userId } }, { brief: { campaignId: { not: null } } }],
  }
}

export function postVisibilityWhere(u: TeamAuthedUser) {
  if (isTeamWide(u)) return { teamId: u.teamId }
  return {
    teamId: u.teamId,
    OR: [{ userId: u.userId }, { draft: { brief: { campaignId: { not: null } } } }],
  }
}

export function canAccessContent(
  u: TeamAuthedUser,
  item: { teamId: string | null; ownerId: string | null; campaignId: string | null },
): boolean {
  if (item.teamId !== u.teamId) return false
  if (isTeamWide(u)) return true
  return item.ownerId === u.userId || item.campaignId !== null
}
```

- [ ] **Step 4: Run — expect PASS**, then commit:

```bash
npx vitest run tests/unit/visibility.test.ts
git add src/lib/authz/visibility.ts tests/unit/visibility.test.ts
git commit -m "feat(teams): visibility where-shapes and per-item access rule (D6)"
```

---

### Task 6: Stamp `teamId` at every create site

**Files (modify):**

- `src/app/api/briefs/route.ts` (Brief create, ~line 146)
- `src/lib/agent/generateDraft.ts` (`createPendingDraft` — Draft create)
- `src/app/api/posts/route.ts` + `src/lib/publish/publishDraft.ts` (`createAndPublishPost` — Post creates)
- `src/app/api/campaigns/route.ts`, `src/app/api/projects/route.ts` (Campaign/Project creates)
- `src/app/api/admin/brandkits/route.ts` (BrandKit create)
- `src/lib/brief/briefDrafts.ts` (BriefDraft upsert)
- `src/app/api/campaigns/[id]/queue/route.ts` + `.../queue/batch/route.ts` (ScheduledGeneration creates)
- `src/app/api/campaigns/[id]/documents/route.ts`, `src/app/api/admin/brandkits/[id]/documents/route.ts` (document creates)
- `src/app/api/admin/providers/route.ts`, `src/app/api/admin/channels/route.ts` (provider/channel creates)

**Interfaces:**

- Consumes: routes still run under old wrappers this task — derive `teamId` from the **parent row** where one exists, else leave a `// TEAM-TENANCY: stamped by wrapper in Task 7/8` marker is FORBIDDEN; instead thread an explicit `teamId` parameter now:
  - `createPendingDraft(briefId, opts)` reads the brief — add `teamId: brief.teamId` to its `data`.
  - `createAndPublishPost(opts)` gains nothing — inside it, read `draft.teamId` (it already loads the draft) and set `teamId` on both Post `create` calls; same for the SCHEDULED path in `posts/route.ts` (`teamId: draft.teamId`).
  - Queue routes: `teamId: campaign.teamId` (both load the campaign already).
  - Documents: `teamId: campaign.teamId` / `kit.teamId`.
  - Top-level creates with no parent (Brief, Campaign, Project, BrandKit, BriefDraft, AvailableProvider, ChannelToken): accept `teamId: string | null` **parameter defaulted to `null`** for now; Task 7/8 pass the wrapper's `teamId`. For Brief specifically: `teamId` comes from the explicit brand-kit/campaign when present (`campaign.teamId ?? brandKit.teamId ?? null`) so generated data is consistent even before the wrapper flip.
- Produces: every row created after this task carries `teamId` whenever a team is derivable; the Task 15 backfill covers the rest.

- [ ] **Step 1: Apply the edits above.** Each is a one-to-three-line `data: { ..., teamId }` addition plus, where needed, a widened function signature. TypeScript will confirm every touched call site.

- [ ] **Step 2: Gates + commit**

```bash
npx tsc --noEmit && npm run lint && npm run test:unit
git add -A src/
git commit -m "feat(teams): stamp teamId at all create sites (parent-derived where possible)"
```

---

### Task 7: List routes + dashboard become team-scoped

**Files (modify):**

- `src/app/api/library/route.ts`, `src/app/api/posts/route.ts` (GET), `src/app/api/briefs/route.ts` (GET if present), `src/app/api/campaigns/route.ts` (GET+POST), `src/app/api/projects/route.ts` (GET+POST), `src/app/api/brandkits/route.ts`, `src/app/api/templates/route.ts`, `src/app/api/providers/available/route.ts`, `src/app/api/brief-drafts/route.ts`
- `src/app/(app)/page.tsx` (dashboard RSC)
- Create: `src/lib/authz/serverTeam.ts`

**Interfaces:**

- Consumes: `withTeamAuth` (Task 3), visibility helpers (Task 5).
- Produces: `resolveTeamForServerComponent(): Promise<{ user: { userId: string; role: Role }; team: TeamResolution } | null>` in `serverTeam.ts` — reads `cookies()` + `getCurrentUser()` for RSCs; dashboard redirects to `/choose-team` on `choice-required` and renders a "no team" notice on `no-team`.

- [ ] **Step 1: Swap wrappers and add filters.** For each API route above: change `withAuth(` → `withTeamAuth(`, change the handler's third param type usage from `user.role` checks to the new fields, and:
  - `library/route.ts`: replace the `hasRole`/ownership block (lines 67–71) with — always `where.AND = [...(where.AND ?? []), draftVisibilityWhere(user) as never]` (drop the old admin branch; the helper handles both).
  - `posts/route.ts` GET: `const where = postVisibilityWhere(user)` replacing the `hasRole` ternary at line 91.
  - `campaigns`/`projects`/`brandkits`/`templates`/`providers/available` GET: add `teamId: user.teamId` into the existing `where` (these are team-wide resources — no per-person scoping).
  - `campaigns`/`projects` POST: pass `teamId: user.teamId` into the Task 6 parameter and gate creation with `withTeamAdmin` (spec D5 — creation is team-admin-only now).
  - `briefs` POST: stays `withTeamAuth`; stamp `teamId: user.teamId`; add validation that a chosen `campaignId`/`brandKitId` row has `teamId === user.teamId` (404 otherwise, matching the existing not-found messages).
  - `brief-drafts`: `withTeamAuth`, add `teamId: user.teamId` to the where (owner filter stays — no admin override, spec D6).
- [ ] **Step 2: `src/lib/authz/serverTeam.ts`:**

```ts
import { cookies } from 'next/headers'
import { getCurrentUser, hasRole } from '@/lib/auth'
import { resolveActiveTeam, ACTIVE_TEAM_COOKIE, type TeamResolution } from '@/lib/authz/teamContext'

export async function resolveTeamForServerComponent(): Promise<{
  userId: string
  isSuperAdmin: boolean
  team: TeamResolution
} | null> {
  const user = await getCurrentUser()
  if (!user) return null
  const isSuperAdmin = hasRole(user.role, 'super_admin')
  const cookieTeamId = (await cookies()).get(ACTIVE_TEAM_COOKIE)?.value ?? null
  return {
    userId: user.userId,
    isSuperAdmin,
    team: await resolveActiveTeam(user.userId, cookieTeamId, isSuperAdmin),
  }
}
```

- [ ] **Step 3: Dashboard** (`src/app/(app)/page.tsx`): call the helper first; `redirect('/choose-team')` on `choice-required`; render an empty-state GlassPanel ("You're not in a team yet — ask a super admin") on `no-team`/null. Then scope every query: the four `count`/`findMany` calls (lines 42–68) get `where: { ...existing, teamId }`, and the Recent Drafts / activity queries switch to `draftVisibilityWhere`/`postVisibilityWhere` built from a `TeamAuthedUser` assembled from the resolution (teamRole from the resolution; this **fixes the dashboard leak**).

- [ ] **Step 4: Gates + commit**

```bash
npx tsc --noEmit && npm run lint && npm run test:unit
git add -A src/
git commit -m "feat(teams): team-scope list routes and dashboard; creation gates per D5"
```

---

### Task 8: `withAdmin` → `withTeamAdmin` sweep + per-item team checks

**Files (modify — the full withAdmin list minus global-admin surfaces):** all 29 route files from this list keep their handler bodies but swap the wrapper and add a team check on the loaded resource:
`drafts/[id]/route.ts` (DELETE), `admin/brandkits/**` (11 files), `campaigns/[id]/**` (documents ×2, briefing ×4, route.ts PATCH+DELETE), `projects/[id]/route.ts` (PATCH+DELETE), `posts/route.ts` (POST), `posts/[id]/route.ts`, `posts/[id]/publish/route.ts`, `admin/providers/route.ts` + `[id]/route.ts`, `admin/channels/route.ts` + `[channel]/route.ts`.
**Excluded (stay super-admin):** `admin/users/**`.

**Interfaces:**

- Consumes: `withTeamAdmin` (Task 3).
- Produces: the invariant _every mutation on a team resource verifies `resource.teamId === user.teamId` before acting_ (404 on mismatch — do not leak existence).

- [ ] **Step 1: For each file:** replace `withAdmin(` with `withTeamAdmin(` (import from the same module). Immediately after each `findUnique`/`findFirst` that loads the target resource, add:

```ts
if (!resource || resource.teamId !== user.teamId) {
  return NextResponse.json({ error: '<existing not-found message>' }, { status: 404 })
}
```

For `admin/brandkits/[id]/**` child routes (templates/artifacts/prompts/documents/upload/assistant), the check runs on the **kit** row (children inherit). For `admin/channels` + `admin/providers`, list handlers add `where: { teamId: user.teamId }` and creates stamp `teamId: user.teamId` (Task 6 parameter).

- [ ] **Step 2: Verification grep** — no team-scoped route may still use the old wrapper:

```bash
grep -rn "withAdmin(" src/app/api --include=route.ts | grep -v "admin/users"
```

Expected: empty output.

- [ ] **Step 3: Gates + commit**

```bash
npx tsc --noEmit && npm run lint && npm run test:unit
git add -A src/
git commit -m "feat(teams): withTeamAdmin sweep with per-item teamId verification"
```

---

### Task 9: Per-item access on briefs/drafts/posts (`canAccessContent`)

**Files (modify):** `src/app/api/drafts/[id]/route.ts` (GET), `drafts/[id]/{refine,retry,regenerate-copy,regenerate-design}/route.ts`, `drafts/[id]/revisions/route.ts` + `revisions/[rev]/restore/route.ts`, `posts/[id]/route.ts` (GET), `src/app/api/generate/{assemble-a,assemble-b,copy,image,export}/route.ts`, `src/lib/auth.ts` (`getDraftOwnerId` widened).

**Interfaces:**

- Consumes: `canAccessContent` (Task 5), `withTeamAuth`.
- Produces: `getDraftAccessInfo(draftId): Promise<{ teamId: string | null; ownerId: string; campaignId: string | null } | null>` in `src/lib/auth.ts`, replacing `getDraftOwnerId` usage in these routes (select `brief.userId`, `brief.campaignId`, `teamId`).

- [ ] **Step 1:** Add `getDraftAccessInfo` next to `getDraftOwnerId`; swap each route's wrapper to `withTeamAuth` and replace `forbiddenIfNotOwner(user, ownerId)` with:

```ts
const info = await getDraftAccessInfo(draftId)
if (!info || !canAccessContent(user, info)) {
  return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
}
```

(404 not 403 — cross-team must not leak existence. In-team-but-private keeps the existing 403 semantics only where tests assert it; check `tests/e2e` §K expectations and match them.)

- [ ] **Step 2: Gates + commit**

```bash
npx tsc --noEmit && npm run lint && npm run test:unit
git add -A src/
git commit -m "feat(teams): per-item access via canAccessContent on draft/post surfaces"
```

---

### Task 10: Claude credential chain (personal → team, env tier deleted)

**Files:**

- Modify: `src/lib/agent/userToken.ts`, `src/lib/agent/claudeCli.ts`, `src/lib/agent/claudeAuth.ts`
- Create: `src/app/api/team/claude-token/route.ts`
- Test: modify `tests/unit/claudeCliAuth.test.ts`, `tests/unit/userToken.test.ts`

**Interfaces:**

- Consumes: Team model (Task 1), `withTeamAdmin`.
- Produces:
  - `resolveClaudeAuth(userId: string | null, teamId: string): Promise<ClaudeCliAuth | null>` in `userToken.ts` — personal `UserClaudeToken` (when `userId` given, CLI mode, ACTIVE) → team `encryptedClaudeToken` → `null`.
  - `withClaudeAuth<T>(userId: string | null, teamId: string, fn: () => Promise<T>): Promise<T>` — replaces `withUserClaudeAuth` at ALL call sites (grep `withUserClaudeAuth`); old name deleted.
  - `runClaudeCliOnce` **requires** a token in CLI mode: chain is `tokenOverride ?? currentClaudeAuth()?.token`; when neither exists it throws `ClaudeCliError` with message `No Claude credential available — connect a personal token in Settings or set the team token in Team Settings` (the env + dev-session tiers at claudeCli.ts:181 are deleted).
  - `GET/PUT/DELETE /api/team/claude-token` (withTeamAdmin) — same contract as `/api/me/claude-token` (regex `^sk-ant-oat01-[A-Za-z0-9_-]{20,}$`, `validateClaudeToken` live ping, `encrypt()` + `…last4` prefix) but writes `team.encryptedClaudeToken`/`claudeKeyPrefix`.

- [ ] **Step 1: Write failing unit tests** — extend `tests/unit/userToken.test.ts`: `resolveClaudeAuth(null, teamId)` returns the team token when the team row has one; returns personal over team when both exist; returns null when neither. Extend `tests/unit/claudeCliAuth.test.ts`: `runClaudeCliOnce` (or its exported seam) throws the no-credential `ClaudeCliError` when ALS is empty and no override is passed. Follow the existing mock patterns in those files.

- [ ] **Step 2: Run — expect FAIL.** `npx vitest run tests/unit/userToken.test.ts tests/unit/claudeCliAuth.test.ts`

- [ ] **Step 3: Implement.** In `userToken.ts`, generalize `resolveClaudeAuthForUser` into `resolveClaudeAuth(userId, teamId)` (team tier decrypts `team.encryptedClaudeToken`; its `onAuthFailure` clears the team token columns and logs). `withClaudeAuth` wraps `runWithClaudeAuth(await resolveClaudeAuth(userId, teamId), fn)`. Update all `withUserClaudeAuth` call sites (grep; they are route handlers that now have `user.teamId` in scope). In `claudeCli.ts` delete the `env.CLAUDE_CODE_OAUTH_TOKEN` read and the implicit dev-session tier: always set `childEnv.CLAUDE_CODE_OAUTH_TOKEN` from the resolved token or throw. Keep the retry-once-on-auth-failure logic but retry against the **team** token (resolve with `userId: null`) instead of the env credential.

- [ ] **Step 4: Team token route** — copy `/api/me/claude-token/route.ts` structure; `withTeamAdmin`; storage on the Team row.

- [ ] **Step 5: Run tests — expect PASS**; full gates; commit:

```bash
npm run test:unit && npx tsc --noEmit && npm run lint
git add -A src/ tests/
git commit -m "feat(teams): Claude chain personal→team, env/dev-session tiers removed, team token API"
```

---

### Task 11: OpenAI keys (personal + team), image/copy resolution

**Files:**

- Create: `src/app/api/me/openai-key/route.ts`
- Modify: `src/providers/registry.ts`, `src/lib/agent/background.ts`, `src/app/api/generate/image/route.ts`
- Test: `tests/unit/imageProviderResolution.test.ts` (new), modify `tests/unit/background.test.ts`

**Interfaces:**

- Consumes: `UserOpenAiKey` model, `withAuth` (personal), Task 6 provider `teamId` stamping.
- Produces:
  - `resolveImageProvider(ctx: { teamId: string; userId?: string | null }, providerKey?: string): Promise<ImageProvider | null>` — order: personal `UserOpenAiKey` (ACTIVE) → explicit `providerKey` row scoped `{ teamId, slot: 'IMAGE' }` → team default row → **`null`** (no throw, no env).
  - `resolveCopyProvider` loses its `env.OPENAI_API_KEY` fallback (registry.ts:68); ANTHROPIC tier untouched.
  - `background.ts`: a `null` provider → log + skip background image (existing graceful-degrade path).
  - `GET/PUT/DELETE /api/me/openai-key` (plain `withAuth`): PUT validates shape `^sk-[A-Za-z0-9_-]{20,}$`, stores `encrypt(key)` + `…last4`; GET returns `{ connected, keyPrefix, status } | { connected: false }`; DELETE idempotent. (No live validation ping — OpenAI has no free validation endpoint; status flips to INVALID on first failed generation, mirroring `markUserTokenInvalid`.)

- [ ] **Step 1: Failing tests** — `tests/unit/imageProviderResolution.test.ts` mocks prisma: personal key wins over team default; team default used when no personal; returns null with neither; explicit providerKey must match teamId (foreign-team row is not found). `background.test.ts` gains a case: resolver returning null ⇒ background step skipped, pipeline continues.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** registry changes + the route (mirror `/api/me/claude-token` file structure), update `background.ts` and `generate/image/route.ts` call sites to pass `{ teamId: user.teamId, userId: user.userId }` (scheduler passes `{ teamId: gen.teamId, userId: null }` — wired in Task 14).

- [ ] **Step 4: PASS + gates + commit** — `git commit -m "feat(teams): OpenAI key personal→team→skip resolution; env fallback removed"`

---

### Task 12: Social channels per team

**Files:**

- Modify: `src/lib/social/linkedin.ts`, `src/lib/social/instagram.ts`, `src/lib/publish/publishDraft.ts`, `src/lib/scheduler/jobRunner.ts`
- Move: `src/app/api/admin/channels/*` → `src/app/api/team/channels/*` (same handlers, `withTeamAdmin`, team-scoped)
- Test: modify `tests/unit/channels.test.ts`

**Interfaces:**

- Produces:
  - `publish(exportUrl: string, copyText: string, teamId: string)` on both publisher modules; `resolveCredentials(teamId)` uses `prisma.channelToken.findFirst({ where: { teamId, channel: '...' } })` and **throws** `No <channel> credentials configured for this team` when absent (env fallbacks deleted).
  - `publishToChannel(channel, exportKey, copyText, teamId)` in `publishDraft.ts`; `createAndPublishPost` passes `draft.teamId`; `jobRunner.ts` passes `post.teamId`.
  - Routes: `GET /api/team/channels`, `POST /api/team/channels`, `DELETE /api/team/channels/[channel]` — old `/api/admin/channels*` paths deleted; the admin settings UI is repointed in Task 17.

- [ ] **Step 1: Failing tests** — update `tests/unit/channels.test.ts` for the team-scoped lookup + missing-credentials throw.
- [ ] **Step 2: Run — FAIL. Step 3: Implement. Step 4: PASS + gates.**
- [ ] **Step 5: Commit** — `git commit -m "feat(teams): per-team channel tokens; publisher env fallbacks removed"`

---

### Task 13: ApiKey table auth for MCP/ACP

**Files:**

- Modify: `src/mcp/auth.ts`, `src/app/api/acp/run/route.ts`, `src/app/api/acp/manifest/route.ts`, `src/mcp/server.ts`, `src/mcp/tools/generate.ts`, `src/mcp/tools/publish.ts`, `src/mcp/systemUser.ts`
- Create: `src/app/api/team/api-keys/route.ts`, `src/app/api/team/api-keys/[id]/route.ts`
- Test: `tests/unit/apiKeyAuth.test.ts` (new)

**Interfaces:**

- Produces:
  - `src/mcp/auth.ts`: `resolveApiKey(apiKey: string | null | undefined): Promise<{ teamId: string; keyId: string } | null>` — SHA-256 hex of the presented key compared to `ApiKey.keyHash`, `revokedAt: null` required. `generateApiKey(): { plaintext: string; keyHash: string; keyPrefix: string }` — plaintext format `bstk_` + 32 bytes base64url (`crypto.randomBytes`), prefix `` `bstk_…${plaintext.slice(-4)}` ``. Old `isValidKey`/`isAdminKey`/env parsing deleted.
  - ACP routes: `const key = await resolveApiKey(req.headers.get('x-bistec-api-key')); if (!key) 401` — `key.teamId` threads into tool dispatch.
  - MCP stdio server: `MCP_API_KEY` env stays as the **presented** credential; per-call `await resolveApiKey(API_KEY)` replaces both old checks (admin-tier distinction collapses — a valid team key grants the key's team scope).
  - Tools: `generate.ts` / `publish.ts` accept `teamId` and stamp it on created Brief/Post rows; `getSystemUserId()` additionally upserts a `TeamMembership { teamId, role: 'EDITOR' }` for the system user in the calling team (so visibility rules hold).
  - Key management: `GET /api/team/api-keys` (list: id/label/keyPrefix/createdAt/revokedAt), `POST` body `{ label }` → 201 `{ id, label, plaintext }` (**only time plaintext appears**), `DELETE /api/team/api-keys/[id]` → sets `revokedAt` (idempotent). All `withTeamAdmin`.

- [ ] **Step 1: Failing tests** — `apiKeyAuth.test.ts`: hash round-trip (`generateApiKey` → `resolveApiKey` finds it via mocked prisma), revoked key rejected, unknown key null, null/undefined input null.
- [ ] **Step 2: FAIL → implement → PASS. Step 3: gates.**
- [ ] **Step 4: Commit** — `git commit -m "feat(teams): DB-backed hashed API keys for MCP/ACP, team-bound machine callers"`

---

### Task 14: Scheduler runs with team credentials

**Files:**

- Modify: `src/lib/scheduler/generationRunner.ts`, `src/scheduler/worker.ts`
- Test: modify `tests/unit/generationRunner.test.ts`

**Interfaces:**

- Consumes: `withClaudeAuth(null, teamId, fn)` (Task 10), image ctx (Task 11), `publishToChannel(..., teamId)` (Task 12 — jobRunner already done there).
- Produces: each claimed `ScheduledGeneration` job wraps its generation in `withClaudeAuth(null, gen.teamId, ...)` (replacing the deliberate-shared-credential comment at generationRunner.ts:130–134); jobs whose team lacks credentials record the thrown no-credential message in `errorReason` via the existing retry/failure path — the worker never crashes. `worker.ts` startup drops the `CLAUDE_CODE_OAUTH_TOKEN` warning (31–43) and instead logs teams without a Claude token at startup (informational).

- [ ] **Step 1: Failing test** — generation job for a team with a token runs inside team auth (assert the mocked `withClaudeAuth` was called with `(null, 'team-1', fn)`); job for a credential-less team lands in the failure path with the no-credential message.
- [ ] **Step 2: FAIL → implement → PASS + gates.**
- [ ] **Step 3: Commit** — `git commit -m "feat(teams): scheduler resolves per-job team credentials"`

---

### Task 15: Backfill script + Migration B (non-null + constraint swaps)

**Files:**

- Create: `scripts/migrate-to-teams.mjs`
- Create: `prisma/migrations/<timestamp>_team_tenancy_b/` (generated)
- Modify: `prisma/schema.prisma`

**Interfaces:**

- Consumes: all columns exist (Task 1); all create sites stamp (Task 6) — no new NULLs are being written.
- Produces: zero `teamId IS NULL` rows; `teamId` non-null on all 12 models; `AvailableProvider @@unique([teamId, slot, providerKey])`; `ChannelToken @@unique([teamId, channel])` (drop `channel @unique`).

- [ ] **Step 1: Write `scripts/migrate-to-teams.mjs`** — idempotent, `--dry-run` flag, `node --env-file=.env scripts/migrate-to-teams.mjs` (mirror the structure of `scripts/fix-data-uri-logos.mjs`):

```js
// 1. upsert Team { name: 'Bistec' }
// 2. for every User: upsert TeamMembership — role 'ADMIN' if user.role is ADMIN
//    or SUPER_ADMIN, else 'EDITOR' (skip disabled users? NO — include them;
//    membership is inert while disabled)
// 3. for each of the 12 tables: updateMany({ where: { teamId: null }, data: { teamId } })
// 4. print per-table counts; with --dry-run, only SELECT count(*) WHERE teamId IS NULL
```

- [ ] **Step 2: Run it** — `node --env-file=.env scripts/migrate-to-teams.mjs --dry-run` then real run. Expected: counts match table sizes; second run reports all zeros (idempotent).

- [ ] **Step 3: Migration B** — edit schema: `teamId String?` → `teamId String` on all 12 models; swap the two unique constraints. Then:

```bash
npx prisma migrate dev --name team_tenancy_b --create-only
```

**Before applying, hand-edit the generated `migration.sql`** to embed the backfill ahead of the `SET NOT NULL` statements, so `npx prisma migrate deploy` is self-contained on every machine (a standalone script between A and B would break deploy elsewhere):

```sql
-- Backfill: default team absorbs all pre-team rows (idempotent)
INSERT INTO "Team" ("id", "name", "createdAt")
SELECT 'team_bistec_default', 'Bistec', now()
WHERE NOT EXISTS (SELECT 1 FROM "Team" WHERE "name" = 'Bistec');

INSERT INTO "TeamMembership" ("id", "teamId", "userId", "role", "createdAt")
SELECT 'tm_' || u."id", t."id", u."id",
       CASE WHEN u."role" IN ('ADMIN','SUPER_ADMIN') THEN 'ADMIN'::"TeamRole" ELSE 'EDITOR'::"TeamRole" END,
       now()
FROM "User" u CROSS JOIN (SELECT "id" FROM "Team" WHERE "name" = 'Bistec') t
ON CONFLICT ("teamId","userId") DO NOTHING;

UPDATE "Project" SET "teamId" = (SELECT "id" FROM "Team" WHERE "name" = 'Bistec') WHERE "teamId" IS NULL;
-- ...repeat the UPDATE for all 12 tables: Project, Campaign, BrandKit, Brief, Draft,
-- Post, ScheduledGeneration, BriefDraft, CampaignDocument, BrandKitDocument,
-- AvailableProvider, ChannelToken — each with the identical WHERE "teamId" IS NULL form.
```

Then apply with `npx prisma migrate dev`. The `scripts/migrate-to-teams.mjs` from Step 1 stays as the dry-run/inspection tool (its `--dry-run` counts what B will touch); running it before B is optional, not required.

- [ ] **Step 4: Gates + commit**

```bash
npx tsc --noEmit && npm run test:unit
git add prisma scripts/migrate-to-teams.mjs
git commit -m "feat(teams): backfill script + non-null teamId, per-team unique constraints"
```

---

### Task 16: UI — team switcher, choose-team page, nav gating

**Files:**

- Create: `src/components/layout/TeamSwitcher.tsx`, `src/app/(app)/choose-team/page.tsx`
- Modify: `src/components/layout/AppShell.tsx`

**Interfaces:**

- Consumes: `useCurrentUser().teams/activeTeamId/isTeamAdmin/teamChoiceRequired` (Task 4), `POST /api/me/active-team`.
- Produces: switcher at the top of the sidebar nav; nav `adminOnly` items gate on `isTeamAdmin` (Brandkits + the Task 17 Team Settings item), `superAdminOnly` unchanged (Users + the Task 17 Teams item).

- [ ] **Step 1: `TeamSwitcher.tsx`** — client component: reads `useCurrentUser()`; one team → static label row (team name, Users icon); several → button opening a Radix dropdown (reuse `Modal.tsx` patterns / existing Radix popover styling) listing teams with the active one checked; clicking: `await apiFetch('/api/me/active-team', { method: 'POST', body: JSON.stringify({ teamId }) })` → `queryClient.invalidateQueries()` (no key = everything) → `router.refresh()`.
- [ ] **Step 2: `choose-team/page.tsx`** — client page, centered GlassPanel listing `teams` as large buttons; on pick, same POST → `router.push('/')`. If `teams.length === 0`, render the "ask a super admin" empty state. (This page must not itself fire team-scoped queries.)
- [ ] **Step 3: AppShell** — render `<TeamSwitcher />` above `NAV_SECTIONS`; change the Sidebar filter (AppShell.tsx:85–87) to use `isTeamAdmin` for `adminOnly`. Also add a client-side effect in AppShell: if `useCurrentUser()` reports `teamChoiceRequired`, `router.replace('/choose-team')`.
- [ ] **Step 4: Gates + visual check** (`npm run dev`, log in, verify switcher renders; two-team state is exercised in Task 19's E2E). Commit — `git commit -m "feat(teams): team switcher, choose-team screen, team-admin nav gating"`

---

### Task 17: UI — personal settings (password + OpenAI key), team settings page, /admin/teams

**Files:**

- Create: `src/components/settings/ChangePasswordCard.tsx`, `src/components/settings/OpenAiKeyCard.tsx`, `src/app/(app)/team/page.tsx`, `src/components/team/TeamClaudeTokenCard.tsx`, `src/components/team/ApiKeysCard.tsx`, `src/app/(app)/admin/teams/page.tsx`, `src/app/api/admin/teams/route.ts`, `src/app/api/admin/teams/[id]/route.ts`, `src/app/api/admin/teams/[id]/members/route.ts`, `src/app/api/admin/teams/[id]/members/[userId]/route.ts`
- Modify: `src/app/(app)/settings/page.tsx`, `src/app/(app)/admin/settings/page.tsx`, `src/components/layout/AppShell.tsx` (two nav items)

**Interfaces:**

- Consumes: `/api/me/openai-key` (Task 11), `/api/team/claude-token` (Task 10), `/api/team/api-keys` (Task 13), `/api/team/channels` (Task 12).
- Produces:
  - `ChangePasswordCard` — three GlassInputs (current, new, confirm; min 8, match check) calling `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })` (better-auth client, available since `emailAndPassword` is enabled); success/error via sonner toasts.
  - `OpenAiKeyCard` — clone of `ClaudeTokenCard` against `/api/me/openai-key`.
  - `/team` page (gate: `isTeamAdmin`, mirror the admin/users super-admin gate pattern) with four sections: AI Providers (move the providers tab markup from `admin/settings/page.tsx`, now hitting the still-`/api/admin/providers` routes which are team-scoped since Task 8), Social Channels (`ChannelRow` repointed to `/api/team/channels`), `TeamClaudeTokenCard`, `ApiKeysCard` (list + create modal showing plaintext once with copy button + revoke with `useConfirm`).
  - `/admin/settings` page: remove the moved tabs; if nothing remains, delete the page and its nav reference entirely.
  - `/admin/teams` (super-admin, model on `admin/users/page.tsx`): teams table (name, member count, created), create/rename modals, soft-delete with confirm; per-team member panel — add user (Select of all users), role Select (ADMIN/EDITOR), remove.
  - Teams API (all `withSuperAdmin`): `GET/POST /api/admin/teams`, `PATCH/DELETE /api/admin/teams/[id]` (DELETE = soft-delete), `GET/POST /api/admin/teams/[id]/members` (POST body `{ userId, role }`, upsert), `PATCH/DELETE /api/admin/teams/[id]/members/[userId]` (PATCH body `{ role }`).
  - AppShell nav: Admin section gains `{ label: 'Team Settings', href: '/team', adminOnly: true }` and `{ label: 'Teams', href: '/admin/teams', superAdminOnly: true }`.

- [ ] **Step 1:** Build the two personal cards + wire into `/settings`. **Step 2:** Teams API routes. **Step 3:** `/team` page. **Step 4:** `/admin/teams` page + nav. Each step: `npx tsc --noEmit && npm run lint`, then one commit per step (`feat(teams): settings password+openai cards`, `feat(teams): teams admin API`, `feat(teams): team settings page`, `feat(teams): /admin/teams management UI`).

---

### Task 18: Env + legacy cleanup

**Files:**

- Modify: `src/lib/env.ts`, `.env.example`, `.env` (this machine), `.env.test`, `src/lib/api/handler.ts`, `docs/cold-start.md`
- Delete: `src/mcp/systemUser.ts` stays; nothing else deleted beyond code below.

**Interfaces:**

- Produces: `env.ts` no longer declares `OPENAI_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, `BISTEC_API_KEYS`, `BISTEC_ADMIN_API_KEYS`, `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_ORGANIZATION_ID`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ACCOUNT_ID`; the worker CLI-mode startup check (Task 14) already gone. Old `withAdmin` deleted from `handler.ts` once the verification grep is empty; `withAuth`'s `role` opt narrowed to `'super_admin'` only (`withSuperAdmin` keeps working; plain `withAuth` survives for `/api/me/*` + auth-adjacent routes).

- [ ] **Step 1:** Verification greps must all be empty before deleting anything:

```bash
grep -rn "env.OPENAI_API_KEY\|env.CLAUDE_CODE_OAUTH_TOKEN\|env.BISTEC_API_KEYS\|env.BISTEC_ADMIN_API_KEYS\|LINKEDIN_ACCESS_TOKEN\|INSTAGRAM_ACCESS_TOKEN" src/
grep -rn "withAdmin(" src/app/api --include=route.ts
grep -rn "withUserClaudeAuth" src/
```

- [ ] **Step 2:** Remove the schema entries, delete `withAdmin`, narrow the opts type, scrub `.env.example` (delete the 8 vars with a comment pointing to Team Settings), update `docs/cold-start.md` §2 (credentials now live in-app: personal at /settings, team at /team) and the E2E note (seeding creates teams — Task 19).
- [ ] **Step 3:** Full gates + commit — `git commit -m "feat(teams): remove env credential tiers and legacy admin wrapper"`

---

### Task 19: E2E — seeds + cross-tenant isolation suite

**Files:**

- Modify: `scripts/setup-test-db.mjs` (or its seed step), `tests/helpers/db.ts`
- Create: `tests/e2e/team-isolation.test.ts`, `tests/e2e/team-settings.test.ts`

**Interfaces:**

- Consumes: everything above, running against the mock server (`npm run test:e2e:db` → `test:e2e:serve` → `test:e2e:mock`).
- Produces: seed adds **two teams** — "Bistec" (admin `adminBTG` as team ADMIN + `editor` as team EDITOR) and "ClientX" (new seeded user `clientx.admin` / fixed test password, team ADMIN); each team gets one campaign, one brand kit, one brief+draft (editor-owned, uncategorized) and one brief+draft under the campaign.

- [ ] **Step 1: Seed changes** — extend the test-DB seed to create the fixture above (use the fixed test password `BistecStudio2026!`; reuse `scripts/seed-admin.mjs` user-creation pattern).
- [ ] **Step 2: `team-isolation.test.ts`** — the D7 guardrail, all via `loginAs` + raw `request` contexts:
  - Every list route (`/api/library`, `/api/posts`, `/api/campaigns`, `/api/projects`, `/api/brandkits`, `/api/templates`) as ClientX admin contains **zero** Bistec rows (assert by id absence, not counts).
  - Every by-id route across the boundary → 404 (draft, brief, campaign, project, kit; PATCH and DELETE too).
  - Editor visibility inside Bistec: sees own uncategorized draft + the under-campaign draft; does **not** see a second editor-owned uncategorized draft seeded for the admin; team admin sees all three.
  - Switcher: `POST /api/me/active-team` to a team the user isn't in → 403; multi-team user (add `adminBTG` to ClientX in-test via super-admin API) sees different `/api/library` results after switching cookies.
  - Multi-team user with no cookie → any team-scoped route returns 409 `team-choice-required`.
  - ApiKey: create a key for ClientX via `/api/team/api-keys`, call `/api/acp/manifest` with it (200) and confirm a generate dispatched with it stamps ClientX's teamId; the same key must not surface Bistec data.
  - Brief autosaves: Bistec team admin GET of the editor's brief-draft id → 404 (no admin override, unchanged rule).
- [ ] **Step 3: `team-settings.test.ts`** — team admin can PUT team claude token (mock validation seam) / channels / create+revoke api keys; team **editor** gets 403 on all of those; super admin can create a team and assign members via `/api/admin/teams`.
- [ ] **Step 4: Run the full E2E cycle**

```bash
npm run test:e2e:db
npm run test:e2e:serve   # separate terminal / background
npm run test:e2e:mock
```

Expected: new suites green AND the pre-existing catalog (§A–§Q) green — failures there mean a missed sweep site; fix forward within this task.

- [ ] **Step 5: Commit** — `git commit -m "test(teams): cross-tenant isolation + team settings E2E suites"`

---

### Task 20: Full gates, docs, merge prep

**Files:**

- Modify: `CLAUDE.md`, `docs/handoff.md`, `docs/e2e-test-plan.md` (add the new suites to the catalog)

- [ ] **Step 1: Full gate run**

```bash
npx tsc --noEmit && npm run lint && npm run test:unit && npm run build
npm run test:e2e:db && npm run test:e2e:mock   # with test server up
```

- [ ] **Step 2: Docs** — add a dated "Team tenancy" section at the top of `CLAUDE.md` outstanding-work and `docs/handoff.md` covering: deploy = plain `npx prisma migrate deploy` (migration B embeds the backfill — see Task 15 Step 3 — so no manual script step on other machines); env vars removed (the 8 from Global Constraints); post-deploy ops (set team credentials at `/team`, personal tokens at `/settings`, re-issue MCP/ACP keys at `/team`); and the new suites added to `docs/e2e-test-plan.md`'s catalog.
- [ ] **Step 3: Commit docs**, then present the branch for review/merge — do **not** merge to `main` without the user's go-ahead:

```bash
git add CLAUDE.md docs/
git commit -m "docs(teams): tenancy handoff, deploy sequence, E2E catalog update"
git log --oneline main..feature/team-tenancy
```

---

## Self-review notes (already applied)

- **Spec coverage:** D1→Tasks 1/6–9/15; D2→2/4/16; D3→1/3/17; D4→10–13/18; D5→7/8; D6→5/9/19; D7→3/19; D8→2/4/16; D9→15; D10→11/17; D11→10. Dashboard leak fix → Task 7. No uncovered spec section found.
- **Migration ordering flaw found and resolved:** a standalone backfill script between migrations A and B would break `prisma migrate deploy` on other machines — resolved directly in Task 15 Step 3 (backfill embedded in migration B's SQL via `--create-only` + hand edit; the .mjs script is kept as a dry-run inspection tool).
- **Type consistency:** `TeamAuthedUser` fields (`userId/teamId/teamRole/isSuperAdmin`) used identically in Tasks 3, 5, 7–9; `resolveClaudeAuth(userId | null, teamId)` consistent across Tasks 10/14; `resolveImageProvider(ctx, providerKey?)` consistent across 11/14; ApiKey contract consistent across 13/19.
