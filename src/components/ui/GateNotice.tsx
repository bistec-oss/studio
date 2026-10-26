import React from 'react'
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { Panel } from './Panel'
import { FOCUS, SECTION_HEAD, TEXT_LINK } from './atoms'

// The "Requires …" gate shown to a role that can't use a page: /team,
// /admin/users, /admin/teams and the admin layout (021 design.md §4.3, §7).
// A bezel card with the icon, a card head and a muted body. No hooks, so the
// server-rendered admin layout can use it.
export function GateNotice({
  title,
  children,
  backLink,
}: {
  title: string
  children: React.ReactNode
  backLink?: boolean
}) {
  return (
    <Panel bezel className="mx-auto mt-12 max-w-md p-10 text-center">
      <ShieldAlert size={32} strokeWidth={1.6} aria-hidden className="mx-auto mb-3 text-fg-muted" />
      <h1 className={`mb-1 ${SECTION_HEAD}`}>{title}</h1>
      <p className={`text-ui-sm text-fg-muted ${backLink ? 'mb-4' : ''}`}>{children}</p>
      {backLink && (
        <Link href="/" className={`rounded-ui-sm text-ui-sm ${TEXT_LINK} ${FOCUS}`}>
          Back to Dashboard
        </Link>
      )}
    </Panel>
  )
}
