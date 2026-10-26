'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import {
  BookOpen,
  Building2,
  FolderOpen,
  LineChart,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Palette,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { Logo } from '@/components/Logo'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'
import { ClaudeTokenPrompt } from '@/components/settings/ClaudeTokenPrompt'
import { TeamSwitcher } from '@/components/layout/TeamSwitcher'
import { CreatePostButton } from '@/components/layout/CreatePostButton'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { authClient } from '@/lib/auth-client'
import { EYEBROW, FOCUS, ICON } from '@/components/ui/atoms'

// The nav draws an icon before each label (021 A9, the study's .nav). The
// icons are decorative (aria-hidden): each link's name is its label.
interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  adminOnly?: boolean
  superAdminOnly?: boolean
}

interface NavSection {
  label: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Create',
    items: [
      { label: 'Dashboard', href: '/',         icon: LayoutDashboard },
      { label: 'Library',   href: '/library',  icon: BookOpen },
    ],
  },
  {
    label: 'Organize',
    items: [
      { label: 'Projects',  href: '/projects',  icon: FolderOpen },
      { label: 'Campaigns', href: '/campaigns', icon: Megaphone },
    ],
  },
  {
    label: 'Admin',
    items: [
      { label: 'Brand kits',    href: '/admin/brandkits', icon: Palette,   adminOnly: true },
      { label: 'Team settings', href: '/team',            icon: Building2, adminOnly: true },
      { label: 'Users',         href: '/admin/users',     icon: Users,     superAdminOnly: true },
      { label: 'Teams',         href: '/admin/teams',     icon: Building2, superAdminOnly: true },
      { label: 'Insights',      href: '/admin/insights',  icon: LineChart, superAdminOnly: true },
    ],
  },
]

// Pinned to the sidebar's bottom area, above Sign out.
const SETTINGS_ITEM: NavItem = { label: 'Settings', href: '/settings', icon: UserCog }

// A nav item (021 design.md §5, the study's .nav a): an icon and the label at
// 13 px / 500 in --fg-muted, the canvas on hover. Shared by the links and the
// Sign out button.
const NAV_ITEM =
  'flex items-center gap-[11px] px-2.5 py-2 rounded-ui-sm text-left text-ui-sm font-medium ' +
  'transition-colors duration-fast ease-standard ' +
  FOCUS

// The current page (the study's .nav a[aria-current]): --surface-2 with the
// panel shadow and a --line-subtle hairline ring.
const NAV_CURRENT = 'bg-surface-raised text-fg shadow-panel ring-1 ring-inset ring-line-subtle'
const NAV_IDLE = 'text-fg-muted hover:bg-canvas hover:text-fg'

// The header's menu button and the mobile sidebar's close button: a round
// --control-md target, so not the --control-sm ui ICON_BUTTON.
const SHELL_ICON_BUTTON =
  'inline-flex items-center justify-center h-control-md w-control-md rounded-ui-pill text-fg-muted ' +
  'hover:bg-canvas hover:text-fg transition-colors duration-fast ease-standard ' +
  FOCUS

function NavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const pathname = usePathname()
  const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))

  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={`${NAV_ITEM} ${isActive ? NAV_CURRENT : NAV_IDLE}`}
    >
      <item.icon {...ICON} aria-hidden="true" />
      {item.label}
    </Link>
  )
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  // Hide admin-only entries from non-admins (server-side enforcement lives in
  // the /admin layout — this is just honest navigation). `adminOnly` now
  // gates on team-admin (per-team role, super admins pass every gate too);
  // `superAdminOnly` is unchanged — those items are platform-wide (Users,
  // and the Task 17 Teams admin screen), not team-scoped.
  const { isTeamAdmin, isSuperAdmin } = useCurrentUser()
  const [signingOut, setSigningOut] = useState(false)
  const sections = NAV_SECTIONS
    .map(section => ({
      ...section,
      items: section.items.filter(
        item => (!item.adminOnly || isTeamAdmin) && (!item.superAdminOnly || isSuperAdmin)
      ),
    }))
    .filter(section => section.items.length > 0)

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await authClient.signOut()
    } finally {
      // Full reload clears all client-side caches (React Query etc.).
      window.location.href = '/login'
    }
  }

  // The sidebar island (021 design.md §5, the study's .side): opaque
  // --surface-1 at radius-lg with the panel shadow (011 FR-08: no alpha, no
  // backdrop-filter). It fills its slot: the desktop band or the mobile
  // dialog places and sizes it.
  return (
    <aside className="flex flex-col gap-[18px] h-full w-full p-3 overflow-y-auto bg-surface text-fg rounded-ui-lg shadow-panel">
      {onClose && (
        <div className="flex items-center justify-end -mb-2.5">
          <button onClick={onClose} aria-label="Close sidebar" className={`md:hidden ${SHELL_ICON_BUTTON}`}>
            <X {...ICON} aria-hidden="true" />
          </button>
        </div>
      )}

      <TeamSwitcher />

      <nav className="flex flex-col gap-[18px]">
        {sections.map(section => (
          <div key={section.label} className="flex flex-col gap-0.5">
            <div className={`px-2.5 pb-1 ${EYEBROW}`}>
              {section.label}
            </div>
            {section.items.map(item => (
              <NavLink key={item.href} item={item} onClick={onClose} />
            ))}
          </div>
        ))}
      </nav>

      {/* Settings + Sign out, pinned to the bottom of the island above a
          --line-subtle rule (the study's .side-foot). */}
      <div className="mt-auto flex flex-col gap-0.5 pt-2.5 border-t border-line-subtle">
        <NavLink item={SETTINGS_ITEM} onClick={onClose} />
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className={`${NAV_ITEM} ${NAV_IDLE} disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <LogOut {...ICON} aria-hidden="true" />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </aside>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { teamChoiceRequired } = useCurrentUser()
  const pathname = usePathname()
  const router = useRouter()
  // Hidden on the wizard (/brief) and on the draft page, whose own actions sit
  // in the bottom-right corner (020).
  const hideCreatePost = pathname === '/brief' || pathname.startsWith('/drafts/')

  // Bounce to the chooser when /api/me reports no resolved active team —
  // but never from the chooser itself, or picking a team there would
  // instantly redirect back before the click's POST even lands.
  useEffect(() => {
    if (teamChoiceRequired && pathname !== '/choose-team') {
      router.replace('/choose-team')
    }
  }, [teamChoiceRequired, pathname, router])

  return (
    <ConfirmProvider>
      <div className="min-h-screen flex flex-col bg-canvas text-fg">
        {/* The header island (021 design.md §5, the study's .hdr): opaque
            --surface-2, 56 px tall, inset 12 px, radius-lg, the panel shadow.
            It sits on an 80 px --canvas band, so content scrolling beneath
            never shows in the 12 px gutter. The band is presentational; the
            island is the banner. */}
        <div className="fixed top-0 inset-x-0 z-40 h-20 bg-canvas">
          <header className="absolute inset-x-3 top-3 h-14 flex items-center justify-between pl-[18px] pr-2.5 bg-surface-raised rounded-ui-lg shadow-panel">
            <div className="flex items-center gap-2">
              {/* Mobile menu button */}
              <button
                onClick={() => setSidebarOpen(true)}
                className={`md:hidden -ml-2 ${SHELL_ICON_BUTTON}`}
                aria-label="Open sidebar"
              >
                <Menu {...ICON} aria-hidden="true" />
              </button>
              <Logo height={32} />
            </div>

            <ThemeToggle />
          </header>
        </div>

        {/* Body below the header band */}
        <div className="flex flex-1 pt-20">
          {/* Desktop sidebar: a 244 px island on a 268 px --canvas band,
              12 px in from the left and the bottom. */}
          <div className="hidden md:block w-[268px] fixed left-0 top-20 bottom-0 z-30 bg-canvas px-3 pb-3">
            <Sidebar />
          </div>

          {/* Mobile sidebar overlay: Radix Dialog provides the focus trap,
              Escape-to-close, and aria-modal. The same island floats 12 px in;
              the scrim is the one translucent layer: --scrim at 0.3, no blur. */}
          <Dialog.Root open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-scrim/30 md:hidden" />
              <Dialog.Content className="fixed left-3 top-3 bottom-3 z-50 w-[244px] md:hidden focus:outline-none">
                <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                <Sidebar onClose={() => setSidebarOpen(false)} />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>

          {/* Main content (021 design.md §5, the study's .main): content
              starts 90 px down (the 80 px band plus 10 px), 20 px right of the
              sidebar band and 28 px from the right edge on wide screens (16 px
              at 375), with 140 px at the bottom, clear of the Create post
              button. */}
          <main className="flex-1 min-w-0 md:ml-[268px] overflow-y-auto">
            <div className="max-w-canvas mx-auto px-4 md:pl-5 md:pr-7 pt-[10px] pb-[140px]">
              {/* CLI mode only: nudge users without a (valid) personal Claude token */}
              <ClaudeTokenPrompt />
              {children}
            </div>
          </main>
        </div>

        {/* Floating Create post shortcut, hidden on the wizard it opens and on
            the draft page, whose own actions (refine Send) sit in that corner.
            usePathname() carries no query string, so /brief?resume=… matches too. */}
        {!hideCreatePost && <CreatePostButton />}
      </div>
    </ConfirmProvider>
  )
}
