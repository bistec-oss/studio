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
