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
