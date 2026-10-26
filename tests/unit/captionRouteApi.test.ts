// 024 FR-08 / AC-09 / AC-10 / AC-12 (parity half): GET and PUT
// /api/team/caption-route, with prisma faked. The wrappers are spied, the state
// mapping is exact, the writes target only the session team, and no key, prefix
// or ciphertext can appear in a response. The last block pins that
// resolveAnthropicApiKey and the selector's API_KEY row decrypt the same key.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ZodType } from 'zod'

const h = vi.hoisted(() => ({
  mode: 'api' as 'api' | 'cli',
  setting: null as null | 'CLI' | 'API_KEY',
  rows: [] as Array<Record<string, unknown>>,
  teamFindUnique: vi.fn(),
  teamUpdate: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  authWrapped: vi.fn(),
  adminWrapped: vi.fn(),
  serverKey: undefined as string | undefined,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    team: { findUnique: h.teamFindUnique, update: h.teamUpdate },
    availableProvider: { findMany: h.findMany, findFirst: h.findFirst },
  },
}))
vi.mock('@/lib/agent/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/agent/config')>()),
  isCliMode: () => h.mode === 'cli',
  pipelineMode: () => h.mode,
}))
vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/env')>()
  return {
    ...actual,
    env: {
      ...actual.env,
      get ANTHROPIC_API_KEY() {
        return h.serverKey
      },
      OPENAI_API_KEY: undefined,
    },
  }
})
vi.mock('@/providers/implementations/copy/anthropic', () => ({
  AnthropicCopyProvider: class {
    constructor(
      public apiKey: string,
      public route: string = 'API_KEY',
    ) {}
  },
}))
vi.mock('@/lib/api/handler', async () => {
  const { NextResponse } = await import('next/server')
  const wrap =
    (spy: () => void) =>
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) => {
      spy()
      return (req: unknown, ctx?: { params: unknown }) =>
        handler(req, { params: ctx?.params }, { userId: 'u1', teamId: 'team-A' })
    }
  const parseBody = async (req: Request, schema: ZodType) => {
    const parsed = schema.safeParse(await req.json())
    if (parsed.success) return { data: parsed.data }
    return { response: NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 }) }
  }
  return { parseBody, withTeamAuth: wrap(h.authWrapped), withTeamAdmin: wrap(h.adminWrapped) }
})

process.env.TOKEN_ENCRYPTION_KEY = 'b'.repeat(64)

const { encrypt } = await import('@/lib/crypto')
const { GET, PUT } = await import('@/app/api/team/caption-route/route')
const { resolveCopyProvider, resolveAnthropicApiKey } = await import('@/providers/registry')

type Handler = (req: unknown, ctx?: unknown) => Promise<Response>
const get = () => (GET as unknown as Handler)({})
const put = (body: unknown) => (PUT as unknown as Handler)({ json: async () => body })

const ROW_KEY = 'sk-ant-row-plaintext'
function row(over: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    teamId: 'team-A',
    slot: 'COPY',
    providerKey: 'anthropic-1',
    providerName: 'anthropic',
    label: 'Claude (Anthropic)',
    keyPrefix: 'sk-ant-ro',
    isEnabled: true,
    isDefault: true,
    createdAt: new Date(0),
    encryptedApiKey: encrypt(ROW_KEY),
    ...over,
  }
}

// Every key in a JSON body, recursively.
function keysOf(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(keysOf)
  if (v && typeof v === 'object') {
    return Object.entries(v).flatMap(([k, x]) => [k, ...keysOf(x)])
  }
  return []
}

beforeEach(() => {
  h.mode = 'api'
  h.setting = null
  h.rows = []
  h.serverKey = undefined
  h.teamFindUnique.mockReset().mockImplementation(async () => ({ captionRoute: h.setting }))
  h.teamUpdate
    .mockReset()
    .mockImplementation(async ({ data }: { data: { captionRoute: typeof h.setting } }) => {
      h.setting = data.captionRoute
      return { captionRoute: h.setting }
    })
  h.findMany.mockReset().mockImplementation(async () => h.rows)
  h.findFirst
    .mockReset()
    .mockImplementation(
      async ({ where }: { where: Record<string, unknown> }) =>
        h.rows.find((r) =>
          'id' in where
            ? r.id === where.id && r.teamId === where.teamId
            : r.teamId === where.teamId &&
              r.isDefault === where.isDefault &&
              r.isEnabled === where.isEnabled,
        ) ?? null,
    )
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

describe('the wrappers', () => {
  it('GET is withTeamAuth and PUT is withTeamAdmin', () => {
    expect(h.authWrapped).toHaveBeenCalledTimes(1)
    expect(h.adminWrapped).toHaveBeenCalledTimes(1)
  })
})

describe('GET /api/team/caption-route', () => {
  it('a team that never chose reads unset, with no-store', async () => {
    h.rows = [row({ providerName: 'openai', providerKey: 'openai-1' })]
    const res = await get()
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({
      setting: null,
      state: 'unset',
      effective: 'OTHER',
      servingProviderId: 'row-1',
      message: null,
      mode: 'api',
    })
  })

  it('API_KEY with an anthropic row is ready and names the serving row', async () => {
    h.setting = 'API_KEY'
    h.rows = [row()]
    expect(await (await get()).json()).toEqual({
      setting: 'API_KEY',
      state: 'ready',
      effective: 'API_KEY',
      servingProviderId: 'row-1',
      message: null,
      mode: 'api',
    })
  })

  it('API_KEY with no row is not-ready with the route-named message', async () => {
    h.setting = 'API_KEY'
    const body = await (await get()).json()
    expect(body).toMatchObject({
      state: 'not-ready',
      effective: null,
      servingProviderId: null,
      mode: 'api',
    })
    expect(body.message).toMatch(/API key route/)
  })

  it('CLI in an API-mode server is not-ready and says so; in CLI mode it is ready', async () => {
    h.setting = 'CLI'
    const notReady = await (await get()).json()
    expect(notReady.state).toBe('not-ready')
    expect(notReady.message).toMatch(/CLI route/)
    h.mode = 'cli'
    expect(await (await get()).json()).toMatchObject({
      state: 'ready',
      effective: 'CLI',
      servingProviderId: null,
      mode: 'cli',
    })
  })

  it('has exactly the six keys and no secret anywhere (AC-10)', async () => {
    h.setting = 'API_KEY'
    h.rows = [row()]
    const text = await (await get()).text()
    const body = JSON.parse(text)
    expect(Object.keys(body).sort()).toEqual([
      'effective',
      'message',
      'mode',
      'servingProviderId',
      'setting',
      'state',
    ])
    expect(keysOf(body).some((k) => /key|prefix|cipher|secret/i.test(k))).toBe(false)
    expect(text).not.toContain(ROW_KEY)
    expect(text).not.toContain('sk-ant')
    expect(text).not.toContain(String(h.rows[0].encryptedApiKey))
  })

  it('reads only the session team and never selects a key', async () => {
    h.rows = [row()]
    await get()
    expect(h.teamFindUnique).toHaveBeenCalledWith({
      where: { id: 'team-A' },
      select: { captionRoute: true },
    })
    for (const [arg] of h.findMany.mock.calls) {
      expect(arg.where.teamId).toBe('team-A')
      expect(arg.select).not.toHaveProperty('encryptedApiKey')
    }
  })
})

describe('PUT /api/team/caption-route', () => {
  it('saves a route for the session team and returns the new state', async () => {
    h.rows = [row()]
    const res = await put({ route: 'API_KEY' })
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(h.teamUpdate).toHaveBeenCalledTimes(1)
    expect(h.teamUpdate.mock.calls[0][0].where).toEqual({ id: 'team-A' })
    expect(h.teamUpdate.mock.calls[0][0].data).toEqual({ captionRoute: 'API_KEY' })
    expect(await res.json()).toMatchObject({
      setting: 'API_KEY',
      state: 'ready',
      servingProviderId: 'row-1',
    })
  })

  it('accepts API_KEY with no key registered (not-ready) and CLI in an API-mode server', async () => {
    expect(await (await put({ route: 'API_KEY' })).json()).toMatchObject({ state: 'not-ready' })
    expect(await (await put({ route: 'CLI' })).json()).toMatchObject({
      state: 'not-ready',
      mode: 'api',
    })
  })

  it('null clears the choice back to unset', async () => {
    h.setting = 'API_KEY'
    const res = await put({ route: null })
    expect(h.teamUpdate.mock.calls[0][0].data).toEqual({ captionRoute: null })
    expect(await res.json()).toMatchObject({ setting: null, state: 'unset' })
  })

  it('refuses an unknown route, an extra field (a team id included) and a missing route with 400, writing nothing', async () => {
    for (const bad of [{ route: 'MAGIC' }, { route: 'CLI', teamId: 'team-B' }, {}, { route: 'cli' }]) {
      expect((await put(bad)).status).toBe(400)
    }
    expect(h.teamUpdate).not.toHaveBeenCalled()
  })
})

describe('resolveAnthropicApiKey parity (AC-12)', () => {
  it("for a default enabled anthropic row, the selector's API_KEY row and resolveAnthropicApiKey decrypt the same key", async () => {
    h.setting = 'API_KEY'
    h.rows = [row()]
    const provider = (await resolveCopyProvider('team-A')) as unknown as { apiKey: string }
    const raw = await resolveAnthropicApiKey('team-A')
    expect(provider.apiKey).toBe(ROW_KEY)
    expect(raw).toBe(provider.apiKey)
  })
})
