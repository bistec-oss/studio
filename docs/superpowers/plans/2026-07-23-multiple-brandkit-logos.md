# Multiple Logos Per Brand Kit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a brand kit hold several labeled logos (variants + distinct brand marks), with one primary, and feed all of them to the design agent as `label → URL` so it can pick the right one.

**Architecture:** No schema change — a logo is a `BrandKitArtifact` with `type='LOGO'` whose `name` is the label. `BrandKit.logoUrl` stays as the **primary** pointer (default/fallback/backward-compat). Generation receives the labeled list through the shared `buildBrandKitSystemContext` (Path A + Path B). Pure helpers decide primary-on-upload, primary-reassignment-on-delete, and build the labeled list.

**Tech Stack:** Next.js 16 (App Router, `withTeamAdmin`), Prisma/PostgreSQL, MinIO (`BUCKET_BRANDKITS`), React 19 client components, Vitest (unit), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-07-23-multiple-brandkit-logos-design.md`

## Global Constraints

- **No schema change, no migration, no new env var.** A logo = `BrandKitArtifact{ type:'LOGO', name:<label>, feedToAI:true }`.
- **`BrandKit.logoUrl` is the single primary pointer.** Primary = "the LOGO artifact whose `url === kit.logoUrl`". A legacy kit with only `logoUrl` (no matching artifact) still shows one unlabeled primary.
- **`data:`-URI logos are never emitted into prompts** (existing incident guard) — the list builder excludes them.
- **`PROMPT_VERSION` bumps** because the brand-context wording changes (`src/lib/agent/prompts/shared.ts`).
- **All routes stay `withTeamAdmin`** and team-scoped exactly as today (kit lookup rejects a foreign-team kit with 404).
- **First logo auto-becomes primary; later uploads must NOT clobber the primary.**
- Run gates from repo root: `npm run test:unit`, `npm run lint`, `npm run build`. E2E: `npm run test:e2e:db` → `npm run test:e2e:serve` (port 3001) → `npm run test:e2e:mock`.

---

## File Structure

- `src/lib/brandkit/logos.ts` — **create.** Pure helpers + the `LogoEntry` type: `buildLogoList`, `shouldBecomePrimary`, `pickNextPrimaryUrl`.
- `src/lib/brandkit/resolve.ts` — **modify.** Add `logos: LogoEntry[]` to `ResolvedBrandKit`; include LOGO artifacts in the query; populate via `buildLogoList`.
- `src/lib/brandkit/systemContext.ts` — **modify.** Replace the single `Logo URL:` line with the labeled logo block.
- `src/lib/agent/prompts/shared.ts` — **modify.** Bump `PROMPT_VERSION`.
- `src/app/api/admin/brandkits/[id]/artifacts/route.ts` — **modify.** LOGO upload sets `logoUrl` only when there is no primary yet.
- `src/app/api/admin/brandkits/[id]/artifacts/[aid]/route.ts` — **modify.** Deleting the primary reassigns `logoUrl` to a remaining logo (or `null`). (`name` PATCH already supported — no change.)
- `src/app/api/admin/brandkits/[id]/route.ts` — **modify.** `PATCH { logoUrl }` guard: a non-null `logoUrl` must match a LOGO artifact of this kit ("set primary").
- `src/components/admin/brandkits/KitDetail.tsx` — **modify.** Replace the single logo slot with an add/label/set-primary/delete gallery.
- `tests/unit/brandKitLogos.test.ts` — **create.** Unit tests for the three helpers.
- `tests/unit/systemContext.test.ts` — **modify.** Rewrite logo assertions to the new labeled block.
- `tests/e2e/brand-kit.test.ts` — **modify.** Add cases: second-logo-doesn't-clobber-primary, set-primary via PATCH, primary reassignment on delete.

---

### Task 1: Pure logo helpers

Three dependency-free functions plus the shared `LogoEntry` type. This is the whole "which logo is primary / how do we list them" policy, isolated and fully unit-tested.

**Files:**

- Create: `src/lib/brandkit/logos.ts`
- Test: `tests/unit/brandKitLogos.test.ts`

**Interfaces:**

- Produces:
  - `interface LogoEntry { label: string; url: string; primary: boolean }`
  - `buildLogoList(logoArtifacts: { name: string; url: string }[], logoUrl: string | null): LogoEntry[]` — maps LOGO artifacts to entries (label = `name`), excludes `data:` URLs, marks `primary` where `url === logoUrl`, prepends an unlabeled `"Primary logo"` entry when `logoUrl` is a non-`data:` URL not present among the artifacts (legacy kit), and returns primary-first (stable order otherwise).
  - `shouldBecomePrimary(existingLogoCount: number, logoUrl: string | null): boolean` — `true` iff there are no other logos AND no primary set yet (`existingLogoCount === 0 && !logoUrl`).
  - `pickNextPrimaryUrl(remainingLogoUrls: string[]): string | null` — the next primary after a delete: first non-`data:` URL, else first URL, else `null`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/brandKitLogos.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildLogoList, shouldBecomePrimary, pickNextPrimaryUrl } from '@/lib/brandkit/logos'

describe('buildLogoList', () => {
  it('lists all logos, primary first and marked', () => {
    const list = buildLogoList(
      [
        { name: 'Full colour', url: 'https://cdn/x/colour.png' },
        { name: 'Reversed white', url: 'https://cdn/x/white.png' },
      ],
      'https://cdn/x/white.png',
    )
    expect(list).toEqual([
      { label: 'Reversed white', url: 'https://cdn/x/white.png', primary: true },
      { label: 'Full colour', url: 'https://cdn/x/colour.png', primary: false },
    ])
  })

  it('returns [] when there are no logos and no logoUrl', () => {
    expect(buildLogoList([], null)).toEqual([])
  })

  it('excludes data: URLs entirely', () => {
    const list = buildLogoList(
      [
        { name: 'Inline', url: 'data:image/png;base64,AAAA' },
        { name: 'Real', url: 'https://cdn/x/r.png' },
      ],
      'https://cdn/x/r.png',
    )
    expect(list).toEqual([{ label: 'Real', url: 'https://cdn/x/r.png', primary: true }])
  })

  it('adds an unlabeled primary for a legacy logoUrl with no matching artifact', () => {
    const list = buildLogoList([], 'https://cdn/x/legacy.png')
    expect(list).toEqual([
      { label: 'Primary logo', url: 'https://cdn/x/legacy.png', primary: true },
    ])
  })

  it('ignores a data: logoUrl (never a primary in prompts)', () => {
    expect(buildLogoList([], 'data:image/png;base64,AAAA')).toEqual([])
  })
})

describe('shouldBecomePrimary', () => {
  it('is true for the first logo with no primary set', () => {
    expect(shouldBecomePrimary(0, null)).toBe(true)
  })
  it('is false when a primary already exists', () => {
    expect(shouldBecomePrimary(0, 'https://cdn/x/p.png')).toBe(false)
  })
  it('is false when other logos already exist', () => {
    expect(shouldBecomePrimary(2, null)).toBe(false)
  })
})

describe('pickNextPrimaryUrl', () => {
  it('returns null when nothing remains', () => {
    expect(pickNextPrimaryUrl([])).toBeNull()
  })
  it('prefers the first non-data URL', () => {
    expect(pickNextPrimaryUrl(['data:image/png;base64,AA', 'https://cdn/x/a.png'])).toBe(
      'https://cdn/x/a.png',
    )
  })
  it('falls back to the first URL when all are data:', () => {
    expect(pickNextPrimaryUrl(['data:image/png;base64,AA'])).toBe('data:image/png;base64,AA')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- brandKitLogos`
Expected: FAIL — `Cannot find module '@/lib/brandkit/logos'`.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/brandkit/logos.ts`:

```ts
// A logo is a BrandKitArtifact type='LOGO' (name = label). BrandKit.logoUrl is
// the primary pointer. These pure helpers own the "which logo is primary / how
// do we present them to the model" policy — no DB, no side effects.

export interface LogoEntry {
  label: string
  url: string
  primary: boolean
}

const isDataUrl = (u: string) => u.startsWith('data:')

// Build the labeled logo list for prompts. data: URLs are excluded (incident
// guard). A legacy kit whose logoUrl matches no artifact still yields one
// unlabeled primary. Primary-first, otherwise input order preserved.
export function buildLogoList(
  logoArtifacts: { name: string; url: string }[],
  logoUrl: string | null,
): LogoEntry[] {
  const primaryUrl = logoUrl && !isDataUrl(logoUrl) ? logoUrl : null
  const entries: LogoEntry[] = []
  const seen = new Set<string>()

  for (const a of logoArtifacts) {
    if (isDataUrl(a.url)) continue
    entries.push({ label: a.name || 'Logo', url: a.url, primary: a.url === primaryUrl })
    seen.add(a.url)
  }
  if (primaryUrl && !seen.has(primaryUrl)) {
    entries.unshift({ label: 'Primary logo', url: primaryUrl, primary: true })
  }

  // Stable primary-first sort (Array.prototype.sort is stable in modern V8).
  return entries.slice().sort((x, y) => (x.primary === y.primary ? 0 : x.primary ? -1 : 1))
}

// Should a freshly-uploaded LOGO auto-become the primary? Only the FIRST one —
// when there is no other logo and no primary set yet.
export function shouldBecomePrimary(existingLogoCount: number, logoUrl: string | null): boolean {
  return existingLogoCount === 0 && !logoUrl
}

// After deleting the current primary, choose the next primary from what remains
// (prefer a usable non-data URL), or null when no logos remain.
export function pickNextPrimaryUrl(remainingLogoUrls: string[]): string | null {
  return remainingLogoUrls.find((u) => !isDataUrl(u)) ?? remainingLogoUrls[0] ?? null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- brandKitLogos`
Expected: PASS (all three describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/brandkit/logos.ts tests/unit/brandKitLogos.test.ts
git commit -m "feat: pure brand-kit logo helpers (list, primary policy)"
```

---

### Task 2: Resolve LOGO artifacts + labeled logo block in the shared context

Thread the logo list into `ResolvedBrandKit` and render it in `buildBrandKitSystemContext` (shared by Path A + Path B). Bump `PROMPT_VERSION`.

**Files:**

- Modify: `src/lib/brandkit/resolve.ts`
- Modify: `src/lib/brandkit/systemContext.ts`
- Modify: `src/lib/agent/prompts/shared.ts`
- Test: `tests/unit/systemContext.test.ts` (rewrite logo assertions)

**Interfaces:**

- Consumes: `buildLogoList`, `LogoEntry` (Task 1).
- Produces: `ResolvedBrandKit.logos: LogoEntry[]` (populated at resolve time); `buildBrandKitSystemContext` emits the labeled block.

- [ ] **Step 1: Rewrite the systemContext unit tests (failing)**

Replace the body of `tests/unit/systemContext.test.ts` with:

```ts
import { describe, it, expect } from 'vitest'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import { buildBrandKitSystemContext } from '@/lib/brandkit/systemContext'

const base: ResolvedBrandKit = {
  id: 'kit-1',
  name: 'Bistec',
  colors: ['#0f2d4e', '#ff5a1f'],
  fonts: [{ name: 'Inter', url: 'https://fonts.example.com/inter.woff2' }],
  logoUrl: 'https://cdn.example.com/logo.svg',
  logos: [
    { label: 'Full colour', url: 'https://cdn.example.com/logo.svg', primary: true },
    { label: 'Reversed white', url: 'https://cdn.example.com/white.svg', primary: false },
  ],
  voicePrompt: 'Warm, confident, human.',
  source: 'system',
}

describe('buildBrandKitSystemContext', () => {
  it('lists all logos, primary marked, with labels and URLs', () => {
    const context = buildBrandKitSystemContext(base)
    expect(context).toContain('[primary] Full colour: https://cdn.example.com/logo.svg')
    expect(context).toContain('Reversed white: https://cdn.example.com/white.svg')
    expect(context).toContain('#0f2d4e')
    expect(context).toContain('Inter (https://fonts.example.com/inter.woff2)')
    expect(context).toContain('Warm, confident, human.')
  })

  it('renders "Logos: none" when there are no logos', () => {
    const context = buildBrandKitSystemContext({ ...base, logos: [], logoUrl: null })
    expect(context).toContain('Logos: none')
  })

  it('never emits a data: URI (excluded upstream in the list)', () => {
    const context = buildBrandKitSystemContext({ ...base, logos: [], logoUrl: null })
    expect(context).not.toContain('data:')
  })

  it('handles a null kit with fallbacks throughout', () => {
    const context = buildBrandKitSystemContext(null)
    expect(context).toContain('Colors: none specified')
    expect(context).toContain('Fonts: system fonts')
    expect(context).toContain('Logos: none')
    expect(context).toContain('Brand voice: not specified')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit -- systemContext`
Expected: FAIL — `logos` is not a property of `ResolvedBrandKit` (type error) and the new strings aren't emitted.

- [ ] **Step 3: Add `logos` to `ResolvedBrandKit` and populate it**

In `src/lib/brandkit/resolve.ts`:

Update the imports at the top:

```ts
import { prisma } from '@/lib/prisma'
import type { BrandKit, BrandKitPrompt, BrandKitArtifact } from '@prisma/client'
import { buildLogoList, type LogoEntry } from '@/lib/brandkit/logos'
```

Change the `KitWithPrompts` type and add `logos` to the interface:

```ts
type KitWithPrompts = BrandKit & { prompts: BrandKitPrompt[]; artifacts?: BrandKitArtifact[] }

export type BrandKitSource = 'explicit' | 'campaign' | 'project' | 'system'

export interface ResolvedBrandKit {
  id: string
  name: string
  colors: string[]
  fonts: Array<{ name: string; url: string }>
  logoUrl: string | null
  logos: LogoEntry[]
  voicePrompt: string | null
  source: BrandKitSource
}
```

Populate `logos` in `normalise`:

```ts
function normalise(kit: KitWithPrompts, source: BrandKitSource): ResolvedBrandKit {
  return {
    id: kit.id,
    name: kit.name,
    colors: Array.isArray(kit.colors) ? (kit.colors as string[]) : [],
    fonts: Array.isArray(kit.fonts) ? (kit.fonts as Array<{ name: string; url: string }>) : [],
    logoUrl: kit.logoUrl ?? null,
    logos: buildLogoList(
      (kit.artifacts ?? []).map((a) => ({ name: a.name, url: a.url })),
      kit.logoUrl ?? null,
    ),
    voicePrompt: kit.prompts[0]?.content ?? null,
    source,
  }
}
```

Include LOGO artifacts in the shared query fragment:

```ts
const PROMPT_INCLUDE = {
  prompts: { where: { isActive: true }, take: 1 },
  artifacts: { where: { type: 'LOGO' as const }, orderBy: { createdAt: 'asc' as const } },
} as const
```

(No other change to `resolveBrandKit` — every tier already uses `PROMPT_INCLUDE`.)

- [ ] **Step 4: Rewrite the logo line in `buildBrandKitSystemContext`**

Replace the entire body of `src/lib/brandkit/systemContext.ts`:

```ts
import type { ResolvedBrandKit } from './resolve'

// The labeled logo block: primary first and marked, so the design agent can pick
// the variant that fits (and fall back to the primary). data: URIs are already
// excluded upstream (buildLogoList) — base64 must never reach a prompt.
function logoBlock(kit: ResolvedBrandKit | null): string {
  const logos = kit?.logos ?? []
  if (logos.length === 0) return '- Logos: none'
  const lines = logos
    .map((l) => `    • ${l.primary ? '[primary] ' : ''}${l.label}: ${l.url}`)
    .join('\n')
  return `- Logos (pick the variant that fits the design; use the primary if unsure):\n${lines}`
}

export function buildBrandKitSystemContext(kit: ResolvedBrandKit | null): string {
  const colors = kit?.colors.join(', ') || 'none specified'
  const fonts = kit?.fonts.length
    ? kit.fonts.map((f) => `${f.name} (${f.url})`).join(', ')
    : 'system fonts'
  const voicePrompt = kit?.voicePrompt ?? 'not specified'
  return `Brand guidelines:\n- Colors: ${colors}\n- Fonts: ${fonts}\n${logoBlock(kit)}\n- Brand voice: ${voicePrompt}`
}
```

- [ ] **Step 5: Bump `PROMPT_VERSION`**

In `src/lib/agent/prompts/shared.ts`, change:

```ts
export const PROMPT_VERSION = '2026-07-17.1'
```

to:

```ts
export const PROMPT_VERSION = '2026-07-23.1'
```

- [ ] **Step 6: Run the affected unit tests**

Run: `npm run test:unit -- systemContext resolveBrandKit prompts`
Expected: PASS. `resolveBrandKit.test.ts` mocks return kit objects without an `artifacts` key — `kit.artifacts ?? []` keeps `logos: []` for those, so those tests are unaffected. If `prompts.test.ts` asserts the old `PROMPT_VERSION` string, update that assertion to `2026-07-23.1`.

- [ ] **Step 7: Full unit run + typecheck**

Run: `npm run test:unit && npx tsc --noEmit`
Expected: all unit tests pass; no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/brandkit/resolve.ts src/lib/brandkit/systemContext.ts src/lib/agent/prompts/shared.ts tests/unit/systemContext.test.ts
git commit -m "feat: feed labeled logo list to the design agent (primary marked)"
```

---

### Task 3: API — first-only-primary on upload, reassignment on delete, set-primary guard

Make the routes match the multi-logo semantics. (The artifact `name` PATCH is already supported by `[aid]/route.ts` — no change needed for label editing.)

**Files:**

- Modify: `src/app/api/admin/brandkits/[id]/artifacts/route.ts:105-107` (LOGO branch)
- Modify: `src/app/api/admin/brandkits/[id]/artifacts/[aid]/route.ts:61-74` (DELETE LOGO branch)
- Modify: `src/app/api/admin/brandkits/[id]/route.ts` (PATCH `logoUrl` guard)
- Test: `tests/e2e/brand-kit.test.ts` (add cases)

**Interfaces:**

- Consumes: `shouldBecomePrimary`, `pickNextPrimaryUrl` (Task 1).
- Produces: no new exports (route behavior change only).

- [ ] **Step 1: Add failing e2e cases**

In `tests/e2e/brand-kit.test.ts`, add these tests inside the `test.describe('Brand kit management', …)` block (after TC-BK-06, near line 184). They reuse the file's existing `PNG_1x1` constant and `api` client:

```ts
// TC-BK-10 — a SECOND logo upload does not clobber the primary.
test('second LOGO upload keeps the first as primary', async () => {
  const kit = await (await api.post('/api/admin/brandkits', { name: 'Multi Logo Kit' })).json()

  const first = await (
    await api.multipart(`/api/admin/brandkits/${kit.id}/artifacts`, {
      file: { name: 'primary.png', mimeType: 'image/png', buffer: PNG_1x1 },
      type: 'LOGO',
    })
  ).json()
  const second = await (
    await api.multipart(`/api/admin/brandkits/${kit.id}/artifacts`, {
      file: { name: 'secondary.png', mimeType: 'image/png', buffer: PNG_1x1 },
      type: 'LOGO',
    })
  ).json()

  const detail = await (await api.get(`/api/admin/brandkits/${kit.id}`)).json()
  // First upload became + stayed primary; both LOGO artifacts are present.
  expect(detail.logoUrl).toBe(first.url)
  const logoTypes = detail.artifacts.filter((a: { type: string }) => a.type === 'LOGO')
  expect(logoTypes.map((a: { url: string }) => a.url).sort()).toEqual(
    [first.url, second.url].sort(),
  )
})

// TC-BK-11 — set primary via PATCH logoUrl (must match a LOGO artifact).
test('set-primary PATCH accepts a LOGO artifact url and rejects a foreign url', async () => {
  const kit = await (await api.post('/api/admin/brandkits', { name: 'Set Primary Kit' })).json()
  const first = await (
    await api.multipart(`/api/admin/brandkits/${kit.id}/artifacts`, {
      file: { name: 'a.png', mimeType: 'image/png', buffer: PNG_1x1 },
      type: 'LOGO',
    })
  ).json()
  const second = await (
    await api.multipart(`/api/admin/brandkits/${kit.id}/artifacts`, {
      file: { name: 'b.png', mimeType: 'image/png', buffer: PNG_1x1 },
      type: 'LOGO',
    })
  ).json()

  const ok = await api.patch(`/api/admin/brandkits/${kit.id}`, { logoUrl: second.url })
  expect(ok.status()).toBe(200)
  const detail = await (await api.get(`/api/admin/brandkits/${kit.id}`)).json()
  expect(detail.logoUrl).toBe(second.url)

  // A URL that is not a LOGO artifact of this kit is rejected.
  const bad = await api.patch(`/api/admin/brandkits/${kit.id}`, {
    logoUrl: 'https://evil.example.com/x.png',
  })
  expect(bad.status()).toBe(400)
  void first
})

// TC-BK-12 — deleting the primary reassigns to a remaining logo (not null).
test('deleting the primary reassigns logoUrl to a remaining logo', async () => {
  const kit = await (await api.post('/api/admin/brandkits', { name: 'Reassign Kit' })).json()
  const first = await (
    await api.multipart(`/api/admin/brandkits/${kit.id}/artifacts`, {
      file: { name: 'a.png', mimeType: 'image/png', buffer: PNG_1x1 },
      type: 'LOGO',
    })
  ).json()
  const second = await (
    await api.multipart(`/api/admin/brandkits/${kit.id}/artifacts`, {
      file: { name: 'b.png', mimeType: 'image/png', buffer: PNG_1x1 },
      type: 'LOGO',
    })
  ).json()

  // first is primary; delete it → logoUrl reassigns to second (still present).
  const del = await api.del(`/api/admin/brandkits/${kit.id}/artifacts/${first.id}`)
  expect(del.status()).toBe(204)
  const detail = await (await api.get(`/api/admin/brandkits/${kit.id}`)).json()
  expect(detail.logoUrl).toBe(second.url)
})
```

- [ ] **Step 2: Run the new e2e cases to verify they fail**

With the mock stack served on :3001:
Run: `npx cross-env TEST_BASE_URL=http://localhost:3001 MOCK_AI=true MOCK_PUPPETEER=true MOCK_SOCIAL=true playwright test tests/e2e/brand-kit.test.ts -g "TC-BK-1"`
Expected: FAIL — TC-BK-10 (second upload clobbers primary today), TC-BK-11 (no guard yet), TC-BK-12 (delete currently nulls logoUrl).

- [ ] **Step 3: LOGO upload sets primary only when there is none yet**

In `src/app/api/admin/brandkits/[id]/artifacts/route.ts`, add the import:

```ts
import { shouldBecomePrimary } from '@/lib/brandkit/logos'
```

Replace the LOGO branch (lines 105-107) inside the `$transaction`:

```ts
if (type === 'LOGO') {
  // First logo auto-becomes primary; later uploads must not clobber it.
  const fresh = await tx.brandKit.findUnique({
    where: { id: params.id },
    select: { logoUrl: true },
  })
  const existingLogoCount = await tx.brandKitArtifact.count({
    where: { brandKitId: params.id, type: 'LOGO', id: { not: created.id } },
  })
  if (shouldBecomePrimary(existingLogoCount, fresh?.logoUrl ?? null)) {
    await tx.brandKit.update({ where: { id: params.id }, data: { logoUrl: url } })
  }
}
```

- [ ] **Step 4: DELETE reassigns the primary instead of nulling it**

In `src/app/api/admin/brandkits/[id]/artifacts/[aid]/route.ts`, add the import:

```ts
import { pickNextPrimaryUrl } from '@/lib/brandkit/logos'
```

Replace the LOGO clause inside the delete transaction (the `if (artifact.type === 'LOGO' && kit.logoUrl === artifact.url)` block, lines ~64-66):

```ts
if (artifact.type === 'LOGO' && kit.logoUrl === artifact.url) {
  // The primary was deleted — reassign to a remaining LOGO (or null).
  const remaining = await tx.brandKitArtifact.findMany({
    where: { brandKitId: params.id, type: 'LOGO' },
    orderBy: { createdAt: 'asc' },
    select: { url: true },
  })
  const next = pickNextPrimaryUrl(remaining.map((r) => r.url))
  await tx.brandKit.update({ where: { id: params.id }, data: { logoUrl: next } })
}
```

(The artifact is already deleted earlier in the same transaction, so `remaining` excludes it. When nothing remains, `pickNextPrimaryUrl` returns `null` — TC-BK-06's single-logo delete still clears `logoUrl`.)

- [ ] **Step 5: PATCH `logoUrl` guard — must match a LOGO artifact ("set primary")**

In `src/app/api/admin/brandkits/[id]/route.ts`, inside the `PATCH` handler, after `const { name, colors, fonts, logoUrl, isDefault } = body.data` and **before** the `$transaction`, add:

```ts
// Setting the primary logo must reference an existing LOGO artifact of this
// kit (clearing with null is always allowed). The gallery's "Set as primary"
// PATCHes an artifact URL that necessarily exists; this rejects a stray URL.
if (logoUrl) {
  const match = await prisma.brandKitArtifact.findFirst({
    where: { brandKitId: params.id, type: 'LOGO', url: logoUrl },
    select: { id: true },
  })
  if (!match) {
    return NextResponse.json(
      { error: 'logoUrl must match a LOGO artifact of this kit' },
      { status: 400 },
    )
  }
}
```

- [ ] **Step 6: Run the new e2e cases to verify they pass**

Restart `test:e2e:serve` (Next must pick up the route changes), then:
Run: `npx cross-env TEST_BASE_URL=http://localhost:3001 MOCK_AI=true MOCK_PUPPETEER=true MOCK_SOCIAL=true playwright test tests/e2e/brand-kit.test.ts`
Expected: PASS — the full brand-kit suite, including TC-BK-05/06 (unchanged single-logo behavior) and the new TC-BK-10/11/12.

- [ ] **Step 7: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no type errors; lint clean (7 pre-existing warnings OK).

- [ ] **Step 8: Commit**

```bash
git add "src/app/api/admin/brandkits/[id]/artifacts/route.ts" "src/app/api/admin/brandkits/[id]/artifacts/[aid]/route.ts" "src/app/api/admin/brandkits/[id]/route.ts" tests/e2e/brand-kit.test.ts
git commit -m "feat: multi-logo API — first-only-primary, delete-reassign, set-primary guard"
```

---

### Task 4: KitDetail logo gallery

Replace the single logo slot with a gallery: add (repeatable), inline-edit label, set-primary (star), delete. First add auto-primary. No change to Colors/Fonts/Templates/Prompt/Artifacts.

**Files:**

- Modify: `src/components/admin/brandkits/KitDetail.tsx`

**Interfaces:**

- Consumes: existing `uploadAsset`? No — logos go through `POST …/artifacts` (multipart) so the LOGO artifact is created. Uses `apiFetch`, `kit.artifacts`, `kit.logoUrl`, `useConfirm`.
- Produces: no exports (component internals only).

- [ ] **Step 1: Replace the Logo section markup + handlers**

In `src/components/admin/brandkits/KitDetail.tsx`:

Add `Star`, `Trash2`, `Plus` are already imported; ensure `Star` is used for primary. The import list already includes `Plus, Pencil, Trash2, Star, Upload, …`.

Add handlers next to the existing logo/artifact handlers (replace `handleLogoUpload` and its `fileRef` usage). Insert these functions in the component body (near `handleArtifactUpload`):

```tsx
async function handleAddLogo(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (fileRef.current) fileRef.current.value = ''
  if (!file) return
  try {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('type', 'LOGO')
    fd.append('name', file.name.replace(/\.[^.]+$/, '')) // filename as default label
    fd.append('feedToAI', 'true')
    await apiFetch(`/api/admin/brandkits/${kit.id}/artifacts`, { method: 'POST', body: fd })
    onRefresh()
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : 'Something went wrong')
  }
}

async function setPrimaryLogo(url: string) {
  try {
    await apiFetch(`/api/admin/brandkits/${kit.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logoUrl: url }),
    })
    onRefresh()
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : 'Something went wrong')
  }
}

async function renameLogo(artifactId: string, name: string) {
  try {
    await apiFetch(`/api/admin/brandkits/${kit.id}/artifacts/${artifactId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    onRefresh()
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : 'Something went wrong')
  }
}

async function deleteLogo(id: string) {
  if (!(await confirm({ title: 'Delete this logo?', confirmLabel: 'Delete' }))) return
  try {
    await apiFetch(`/api/admin/brandkits/${kit.id}/artifacts/${id}`, { method: 'DELETE' })
    onRefresh()
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : 'Something went wrong')
  }
}
```

Delete the old `handleLogoUpload` function (lines ~75-88). Keep the `fileRef` declaration (reused by the gallery's hidden input).

Replace the entire Logo `GlassPanel` block (lines ~248-267) with the gallery:

```tsx
{
  /* Logos */
}
;<GlassPanel className="p-4">
  <SectionHeader
    title="Logos"
    action={
      <>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAddLogo}
        />
        <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
          <Plus size={13} /> Add logo
        </Button>
      </>
    }
  />
  {kit.artifacts.filter((a) => a.type === 'LOGO').length === 0 ? (
    <span className="text-sm text-light-text-muted dark:text-dark-text-muted">No logos yet.</span>
  ) : (
    <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {kit.artifacts
        .filter((a) => a.type === 'LOGO')
        .map((logo) => {
          const isPrimary = logo.url === kit.logoUrl
          return (
            <li key={logo.id} className="glass-input rounded-xl p-3 flex flex-col gap-2">
              <div className="relative h-16 flex items-center justify-center rounded-lg bg-white/40 dark:bg-white/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logo.url}
                  alt={logo.name}
                  className="max-h-14 max-w-full object-contain"
                />
              </div>
              <input
                defaultValue={logo.name}
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v && v !== logo.name) renameLogo(logo.id, v)
                }}
                aria-label="Logo label"
                className="glass-input rounded-lg px-2 py-1 text-xs text-light-text dark:text-dark-text"
              />
              <div className="flex items-center justify-between">
                <button
                  onClick={() => !isPrimary && setPrimaryLogo(logo.url)}
                  aria-pressed={isPrimary}
                  title={isPrimary ? 'Primary logo' : 'Set as primary'}
                  className={`flex items-center gap-1 text-xs transition-colors ${isPrimary ? 'text-primary dark:text-primary-light' : 'text-light-text-muted dark:text-dark-text-muted hover:text-primary dark:hover:text-primary-light'}`}
                >
                  <Star size={14} className={isPrimary ? 'fill-current' : ''} />
                  {isPrimary ? 'Primary' : 'Set primary'}
                </button>
                <Button variant="ghost" size="sm" onClick={() => deleteLogo(logo.id)}>
                  <Trash2 size={13} />
                </Button>
              </div>
            </li>
          )
        })}
    </ul>
  )}
</GlassPanel>
```

**Note:** the generic Artifacts section still lists all artifacts including LOGO ones (unchanged). That's acceptable duplication for this pass; the gallery is the primary management surface. Do NOT change the Artifacts section.

- [ ] **Step 2: Typecheck, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: no type errors; lint clean (7 pre-existing warnings OK); production build succeeds.

- [ ] **Step 3: Manual browser check (mock stack or dev)**

Open a brand kit in `/admin/brandkits`: add two logos (first shows "Primary"), rename one via the label field (blur to save), click "Set primary" on the other (star moves), delete the primary (primary reassigns to the remaining logo). Verify the empty state reads "No logos yet."

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/brandkits/KitDetail.tsx
git commit -m "feat: brand-kit logo gallery (add/label/set-primary/delete)"
```

---

## Self-Review

- **Spec coverage:** store several labeled logos (Task 3 upload + Task 4 gallery, reusing `BrandKitArtifact type=LOGO`, `name`=label) ✓; one primary = `logoUrl` (Tasks 1-3) ✓; first-upload auto-primary + no clobber (`shouldBecomePrimary`, Task 3) ✓; set-primary via PATCH with guard (Task 3) ✓; label edit via existing `name` PATCH (Task 4 wires it; API already supported) ✓; delete reassigns primary (`pickNextPrimaryUrl`, Task 3) ✓; generation gets labeled `label→URL`, primary marked, `data:` excluded (Tasks 1-2) ✓; `ResolvedBrandKit.logos` populated from LOGO artifacts, primary-first (Task 2) ✓; `PROMPT_VERSION` bump (Task 2) ✓; legacy `logoUrl`-only kit still shows one unlabeled primary (`buildLogoList`, Task 1 test) ✓; unit + e2e per the spec's Testing section ✓. Non-goals (per-brief logo pick, new table/migration, font/color/reference changes) — untouched ✓.
- **Type consistency:** `LogoEntry`/`buildLogoList`/`shouldBecomePrimary`/`pickNextPrimaryUrl` signatures match between Task 1 (defs) and Tasks 2-3 (uses); `ResolvedBrandKit.logos: LogoEntry[]` defined in Task 2 and consumed by `buildBrandKitSystemContext` in the same task; `kit.artifacts` (typed `BrandKitArtifact[]` in `AdminBrandKitDetail`) drives the Task 4 gallery and each artifact exposes `id/name/type/url/feedToAI`.
- **Backward-compat check:** existing e2e TC-BK-05 (single LOGO upload sets `logoUrl`) and TC-BK-06 (deleting the only logo nulls `logoUrl`) remain valid under the new upload/delete logic — verified explicitly in Task 3, Step 6.
- **Regression watch:** the PATCH `logoUrl` guard (Task 3, Step 5) could reject any pre-existing e2e that PATCHes `logoUrl` to a non-artifact URL. The full brand-kit suite is run in Step 6; if another suite (e.g. team-isolation, team-settings) PATCHes an arbitrary `logoUrl`, adjust that test to upload a LOGO artifact first or to use `null`. Run `npm run test:e2e:mock` once end-to-end before finishing.
