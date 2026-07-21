# Team Tenancy — Design

**Date:** 2026-07-21
**Status:** Approved design, pre-implementation
**Origin:** Conversation reworking the projects/campaigns authorization model. Scope grew deliberately: the approved target is full multi-tenancy by team, not a projects/campaigns-only tweak.

## 1. Problem

Today the app is a single shared workspace with flat roles (`SUPER_ADMIN > ADMIN > EDITOR`):

- Any signed-in user can create projects/campaigns; only global admins can edit/delete them; nothing records who created what.
- Every user sees every project, campaign, and brand kit; the dashboard shows all users' recent drafts and publish activity.
- All AI/social credentials are global: `OPENAI_API_KEY` (env), `CLAUDE_CODE_OAUTH_TOKEN` (env, shared fallback), `ChannelToken` (one row per channel), `BISTEC_API_KEYS` (env, machine callers).

The team wants to run separate groups (internally and per client) with their **own** credentials, members, and content — invisible to other teams.

## 2. Decisions (all confirmed with the user)

| #   | Decision                                                                                                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Full tenant**: every resource is partitioned by team — projects, campaigns, brand kits, briefs, drafts, posts, queues, documents, providers, channel tokens, API keys.                                                                                                |
| D2  | **Multi-team membership + switcher**: a user can belong to several teams; a sidebar switcher selects the active team.                                                                                                                                                   |
| D3  | **Per-team roles**: the membership row carries `ADMIN` or `EDITOR`. Global `ADMIN` disappears; `SUPER_ADMIN` stays global (manages teams and users, passes every gate).                                                                                                 |
| D4  | **All credentials per team, encrypted in DB**: OpenAI key, LinkedIn/Instagram tokens, team Claude token. **No env fallback anywhere, including dev.** `OPENAI_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, `BISTEC_API_KEYS` are removed from `.env*` and `src/lib/env.ts`.     |
| D5  | **In-team authz**: team admins create and manage projects/campaigns/kits and team settings; editors consume them.                                                                                                                                                       |
| D6  | **Visibility rule**: the person is the boundary; the project/campaign is the sharing container. An editor sees their own content plus anything under a team campaign/project. Team admins see all team content. Brief autosaves stay owner-only with no admin override. |
| D7  | **Enforcement approach**: explicit `teamId` columns + team-aware auth wrapper (not Prisma middleware, not Postgres RLS). Guardrail: a dedicated cross-tenant E2E isolation suite.                                                                                       |
| D8  | **Fresh-session behavior**: multi-team users with no remembered team get an explicit team-picker screen after login. Single-team users are auto-assigned.                                                                                                               |
| D9  | **Migration**: a default team "Bistec" absorbs all existing users and data.                                                                                                                                                                                             |
| D10 | **Personal settings**: change password, own Claude token, own OpenAI key (overrides team's for that user's generations). Team credentials live in a team-admin-gated team settings page.                                                                                |
| D11 | **Copy provider**: copy generation is Claude and resolves personal token → team token, never env (same chain as design generation).                                                                                                                                     |

## 3. Data model

### New tables

```prisma
enum TeamRole { ADMIN EDITOR }

model Team {
  id                   String   @id @default(cuid())
  name                 String   @unique
  isDeleted            Boolean  @default(false)
  deletedAt            DateTime?
  createdAt            DateTime @default(now())
  // Team Claude token (scheduler + member fallback), AES-256-GCM via src/lib/crypto.ts
  encryptedClaudeToken String?
  claudeKeyPrefix      String?
  memberships          TeamMembership[]
}

model TeamMembership {
  id        String   @id @default(cuid())
  teamId    String
  userId    String
  role      TeamRole
  createdAt DateTime @default(now())
  @@unique([teamId, userId])
  @@index([userId])
}

// Personal OpenAI key, mirrors UserClaudeToken (encrypted + masked prefix, 1 row/user)
model UserOpenAiKey {
  id           String   @id @default(cuid())
  userId       String   @unique
  encryptedKey String
  keyPrefix    String
  status       String   // VALID | INVALID, same lifecycle as UserClaudeToken
  createdAt    DateTime @default(now())
}

// Machine-caller keys for MCP/ACP, replaces env BISTEC_API_KEYS.
// Stored hashed (not encrypted — never needs to be read back); value shown once at creation.
model ApiKey {
  id         String   @id @default(cuid())
  teamId     String
  label      String
  keyHash    String   @unique
  keyPrefix  String
  createdAt  DateTime @default(now())
  revokedAt  DateTime?
  @@index([teamId])
}
```

### Existing tables

- `teamId String` (non-null after migration, indexed) added to: `Project`, `Campaign`, `BrandKit`, `Brief`, `Draft`, `Post`, `ScheduledGeneration`, `BriefDraft`, `CampaignDocument`, `BrandKitDocument`, `AvailableProvider`, `ChannelToken`. Children carry it **denormalized** (a Draft has its own `teamId`, not only via its Brief) so every query is a flat indexed filter.
- `BrandKitTemplate` / `BrandKitArtifact` inherit through their kit (no own column).
- `AvailableProvider` unique constraint: `(slot, providerKey)` → `(teamId, slot, providerKey)`.
- `ChannelToken` unique constraint: `(channel)` → `(teamId, channel)`.
- `User.role`: only `SUPER_ADMIN` remains meaningful globally; `ADMIN`/`EDITOR` values become vestigial (authority comes from memberships).

## 4. Team context & auth plumbing

- **Active team**: `activeTeamId` cookie, set only by `POST /api/me/active-team` after verifying membership. Wrapper resolution per request: valid cookie+membership → that team; single membership → auto; multi-team + no valid cookie → the UI routes to the **team picker screen** (API returns 409 `team-choice-required`); zero memberships → 403 "no team" (super admins and `/api/me/*` exempt).
- **Wrapper**: `withAuth` hands handlers `{ userId, teamId, teamRole, isSuperAdmin }`. New `withTeamAdmin` = team role ADMIN or super admin. `withSuperAdmin` unchanged. A team-less `withAuth` variant serves `/api/me/*` (must work with zero memberships). ~40 call sites updated mechanically; handler bodies keep their shape.
- **Visibility helper** `visibleContentWhere(user)` (single source, `src/lib/authz/visibility.ts`):
  - team admin / super admin → `{ teamId }`
  - editor → `{ teamId }` AND (owned by me OR team-shared). **"Team-shared" is defined precisely as: the item's brief has a non-null `campaignId`** (campaigns are the sharing container; projects share transitively by containing campaigns — matching D6). Ownership resolves per model: Brief by `userId`, Draft via `brief.userId`, Post by its own `userId`. The helper exports per-model where-shapes so routes can't improvise the rule. Used by library, dashboard, posts. **This also fixes the current dashboard leak** (global stats + all-users Recent Drafts).
- **Per-item access** (draft/brief/post by id): owner, or item sits under a team campaign/project, or team admin, or super admin → else 403/404. Extends `forbiddenIfNotOwner`.

## 5. Credential resolution (three seams, no other code paths touch keys)

| Credential                             | Chain                                                                                                         | Seam                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Claude (copy + design, API & CLI mode) | personal `UserClaudeToken` → team `encryptedClaudeToken` → hard error "no Claude credential for team <name>"  | `src/lib/agent/claudeAuth.ts` (ALS context gains team) |
| OpenAI (background images)             | personal `UserOpenAiKey` → team IMAGE `AvailableProvider` → skip background image (pipeline already degrades) | `resolveImageProvider` / `background.ts`               |
| Social publish                         | team `ChannelToken` by `(post.teamId, channel)`                                                               | `publishDraft.ts`, `linkedin.ts`, `instagram.ts`       |

Env tiers (`OPENAI_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, dev logged-in-session fallback for CLI spawns) are **deleted**. `MOCK_AI` / `MOCK_SOCIAL` E2E seams are unaffected (they short-circuit before key lookup).

## 6. Headless surfaces

- **Scheduler worker**: `ScheduledGeneration` and `Post` rows carry `teamId`; each claimed job resolves that team's credentials. No ambient "current team". Missing credentials → per-job failure with a clear reason, never a worker crash.
- **MCP/ACP**: authenticate against the `ApiKey` table (hash compare); the request's team = the key's team. Keys are created/revoked in team settings by team admins, value shown once. `BISTEC_API_KEYS` env dies in the same change.

## 7. Route-gate matrix

| Surface                                                                                                                                                | Gate                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Projects / campaigns / brand kits / templates create-edit-delete; briefing writes; campaign & kit documents; queue auto-publish actions; team settings | `withTeamAdmin`                                           |
| Briefs, drafts, posts, library, dashboard, queue HOLD planning, refine/regenerate                                                                      | `withAuth` + `visibleContentWhere` / per-item rule        |
| Brief autosaves (`BriefDraft`)                                                                                                                         | owner-only within team, **no admin override** (unchanged) |
| Teams CRUD, membership assignment, user management                                                                                                     | `withSuperAdmin`                                          |
| `/api/me/*` (password, own tokens, active team)                                                                                                        | team-less `withAuth`                                      |

## 8. UI

- **Sidebar team switcher** above nav groups (static label for single-team users). Switch → endpoint → invalidate all React Query caches.
- **Team picker screen** post-login (D8).
- **`/settings` (personal)**: Change password card (better-auth change-password: current + new ×2), own Claude token card (existing), own OpenAI key card (same paste→validate→mask pattern).
- **Team settings page** (team-admin): provider keys (existing providers UI, team-scoped), social channel connections (moves out of global `/admin/settings`), team Claude token, API keys (create/revoke, shown once).
- **`/admin/teams`** (super-admin): create/rename/soft-delete teams; assign users with per-team role. `/admin/users` keeps account create/deactivate/password-reset; its role toggle is replaced by membership management.
- Sidebar Admin section gates on `teamRole === 'ADMIN'` (Brandkits, Team settings) or super admin (Users, Teams).
- Dashboard/library/pickers: no visual redesign; queries become team-scoped so dropdowns automatically show only the active team's rows.

## 9. Migration & rollout

1. **Migration A**: create `Team`, `TeamMembership`, `UserOpenAiKey`, `ApiKey`; add **nullable** `teamId` columns + indexes.
2. **Data script** (idempotent, `--dry-run` like `fix-data-uri-logos.mjs`): create team "Bistec"; memberships for all users (ADMIN/SUPER_ADMIN → team ADMIN, EDITOR → EDITOR); stamp `teamId` on every row; move `AvailableProvider`/`ChannelToken` rows into it.
3. **Migration B**: flip `teamId` to non-null; swap unique constraints.
4. **Ops per machine**: paste current OpenAI key into team settings; set team Claude token; re-issue MCP/ACP keys; then delete `OPENAI_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, `BISTEC_API_KEYS` from `.env*` **and** from `src/lib/env.ts` (env validation then rejects them as unknown, so they cannot silently linger).

## 10. Testing

- **Unit**: wrapper team resolution (cookie / single / multi-no-cookie 409 / none 403); `visibleContentWhere` shapes; credential chains (personal → team → error/skip); `withTeamAdmin`; ApiKey hash auth.
- **E2E — cross-tenant isolation suite** (the D7 guardrail): seed two teams; assert every list route returns nothing across the boundary; every by-id route 404/403s across it; switcher changes listings; editor vs team-admin visibility inside one team (uncategorized private, under-campaign shared); scheduler job uses its own team's mock credentials; team A's API key cannot touch team B.
- **E2E — regressions**: §O token flows, password change, team picker flow, dashboard no longer shows foreign-team (or foreign-editor-uncategorized) activity.
- Mock seams (`MOCK_AI`, `MOCK_PUPPETEER`, `MOCK_SOCIAL`) unchanged.

## 11. Out of scope

- Cross-team sharing of brand kits or templates (each team gets its own; duplicate manually if needed).
- Per-project/per-campaign member ACLs inside a team (the team is the finest sharing grain besides personal ownership).
- Billing/usage attribution per team.
- Postgres RLS or Prisma middleware enforcement (explicitly rejected in favor of D7).
