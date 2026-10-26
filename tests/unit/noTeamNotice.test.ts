import { describe, it, expect } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NoTeamNotice } from '@/components/dashboard/NoTeamNotice'

// 016 AC-09 (FR-09): the dashboard for a user who resolves to no team. A
// fresh system has no team, so the super admin is pointed at /admin/teams to
// create the first one; everyone else keeps the pre-016 message unchanged.
// Plain createElement, so this stays a .test.ts file with no JSX.

describe('NoTeamNotice', () => {
  it('tells a super admin there are no teams yet and links to /admin/teams', () => {
    const html = renderToStaticMarkup(h(NoTeamNotice, { isSuperAdmin: true }))
    expect(html).toContain('>No teams yet</h2>')
    expect(html).toMatch(/<a [^>]*href="\/admin\/teams"[^>]*>Create a team<\/a>/)
    expect(html).not.toContain('Ask a super admin')
  })

  it('keeps the unchanged message, with no link, for everyone else', () => {
    const html = renderToStaticMarkup(h(NoTeamNotice, { isSuperAdmin: false }))
    expect(html).toContain(
      '<h2 class="text-ui-lg font-semibold leading-snug tracking-[-0.01em] text-fg">You’re not in a team yet</h2>',
    )
    expect(html).toContain(
      '<p class="mt-2 text-ui-sm text-fg-muted">Ask a super admin to add you to a team before you can create or view posts.</p>',
    )
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('/admin/teams')
  })
})
