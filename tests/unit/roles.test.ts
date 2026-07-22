// Role hierarchy: super_admin ≥ admin ≥ editor. Every server-side gate
// (withAuth/withTeamAuth/withTeamAdmin/withSuperAdmin, page layouts) routes
// through hasRole, so the matrix here is the RBAC source of truth.

import { describe, it, expect } from 'vitest'
import { hasRole, normalizeRole, type Role } from '@/lib/roles'

describe('hasRole', () => {
  const cases: Array<[Role, Role, boolean]> = [
    ['editor', 'editor', true],
    ['editor', 'admin', false],
    ['editor', 'super_admin', false],
    ['admin', 'editor', true],
    ['admin', 'admin', true],
    ['admin', 'super_admin', false],
    ['super_admin', 'editor', true],
    ['super_admin', 'admin', true],
    ['super_admin', 'super_admin', true],
  ]

  it.each(cases)('%s requesting %s → %s', (user, required, expected) => {
    expect(hasRole(user, required)).toBe(expected)
  })
})

describe('normalizeRole', () => {
  it('lowercases the DB enum values', () => {
    expect(normalizeRole('SUPER_ADMIN')).toBe('super_admin')
    expect(normalizeRole('ADMIN')).toBe('admin')
    expect(normalizeRole('EDITOR')).toBe('editor')
  })

  it('falls back to editor for unknown or missing values', () => {
    expect(normalizeRole(undefined)).toBe('editor')
    expect(normalizeRole('owner')).toBe('editor')
    expect(normalizeRole('')).toBe('editor')
  })
})
