import Link from 'next/link'
import { Users } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { FOCUS, SECTION_HEAD } from '@/components/ui/atoms'

// The dashboard for a signed-in user who resolves to no team (016 FR-09). A
// fresh system has no team at all (016 FR-08), so the super admin is the one
// who creates the first: they get a link to /admin/teams. Everyone else is
// told to ask a super admin, as before. A bezel card, as GateNotice draws it
// (021 design.md §4.3), with the card head and a muted body.
export function NoTeamNotice({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  return (
    <Panel bezel className="mx-auto mt-12 max-w-md p-8 text-center">
      <Users size={28} strokeWidth={1.6} aria-hidden className="mx-auto mb-3 text-fg-muted" />
      {isSuperAdmin ? (
        <>
          <h2 className={`${SECTION_HEAD} text-fg`}>No teams yet</h2>
          <p className="mt-2 text-ui-sm text-fg-muted">
            Create the first team, then add yourself and others to it to start creating posts.
          </p>
          {/* The primary pill (§8.2, the study's .btn-pri), drawn on a link. */}
          <Link
            href="/admin/teams"
            className={`mt-5 inline-flex h-control-md items-center justify-center gap-2 whitespace-nowrap rounded-ui-pill bg-accent px-5 text-ui-sm font-semibold text-accent-fg shadow-raised transition-transform duration-fast ease-standard active:scale-[0.98] motion-reduce:active:scale-100 ${FOCUS}`}
          >
            Create a team
          </Link>
        </>
      ) : (
        <>
          <h2 className={`${SECTION_HEAD} text-fg`}>
            You&rsquo;re not in a team yet
          </h2>
          <p className="mt-2 text-ui-sm text-fg-muted">
            Ask a super admin to add you to a team before you can create or view posts.
          </p>
        </>
      )}
    </Panel>
  )
}
