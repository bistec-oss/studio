'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { LayoutDashboard, BookOpen, FolderOpen, Megaphone, Settings, UserCog, Users, Menu, X, LogOut } from 'lucide-react'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { Logo } from '@/components/Logo'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'
import { ClaudeTokenPrompt } from '@/components/settings/ClaudeTokenPrompt'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { authClient } from '@/lib/auth-client'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
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
      { label: 'Dashboard', href: '/',         icon: <LayoutDashboard size={18} /> },
      { label: 'Library',   href: '/library',  icon: <BookOpen size={18} /> },
    ],
  },
  {
    label: 'Organize',
    items: [
      { label: 'Projects',  href: '/projects',  icon: <FolderOpen size={18} /> },
      { label: 'Campaigns', href: '/campaigns', icon: <Megaphone size={18} /> },
    ],
  },
  {
    label: 'Admin',
    items: [
      { label: 'Brandkits', href: '/admin/brandkits', icon: <Settings size={18} />, adminOnly: true },
      { label: 'Users',     href: '/admin/users',     icon: <Users size={18} />, superAdminOnly: true },
    ],
  },
]

// Pinned to the sidebar's bottom area, above Sign out.
const SETTINGS_ITEM: NavItem = { label: 'Settings', href: '/settings', icon: <UserCog size={18} /> }

function NavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const pathname = usePathname()
  const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`
        flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150
        ${isActive
          ? 'bg-primary/10 dark:bg-primary-light/10 text-primary dark:text-primary-light border border-primary/20 dark:border-primary-light/20'
          : 'text-light-text-muted dark:text-dark-text-muted hover:bg-primary/5 dark:hover:bg-primary-light/5 hover:text-light-text dark:hover:text-dark-text border border-transparent'
        }
      `}
    >
      {item.icon}
      {item.label}
    </Link>
  )
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  // Hide admin-only entries from non-admins (server-side enforcement lives in
  // the /admin layout — this is just honest navigation).
  const { isAdmin, isSuperAdmin } = useCurrentUser()
  const [signingOut, setSigningOut] = useState(false)
  const sections = NAV_SECTIONS
    .map(section => ({
      ...section,
      items: section.items.filter(
        item => (!item.adminOnly || isAdmin) && (!item.superAdminOnly || isSuperAdmin)
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

  return (
    <aside className="glass-panel flex flex-col h-full w-64 p-4 gap-1 rounded-none">
      {onClose && (
        <div className="flex items-center justify-end mb-2 px-1">
          <button
            onClick={onClose}
            aria-label="Close sidebar"
            className="md:hidden p-1.5 rounded-lg text-light-text-muted dark:text-dark-text-muted hover:bg-primary/10"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <nav className="flex flex-col gap-4">
        {sections.map(section => (
          <div key={section.label} className="flex flex-col gap-1">
            <div className="px-3 pt-1 text-[11px] font-semibold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted">
              {section.label}
            </div>
            {section.items.map(item => (
              <NavLink key={item.href} item={item} onClick={onClose} />
            ))}
          </div>
        ))}
      </nav>

      {/* Settings + Sign out — pinned to the bottom of the panel */}
      <div className="mt-auto flex flex-col gap-1 pt-3 border-t border-light-text/10 dark:border-white/10">
        <NavLink item={SETTINGS_ITEM} onClick={onClose} />
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 text-light-text-muted dark:text-dark-text-muted hover:bg-primary/5 dark:hover:bg-primary-light/5 hover:text-light-text dark:hover:text-dark-text border border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <LogOut size={18} />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>

      {/* Bottom glow blob */}
      <div className="glow-blob w-48 h-48 -bottom-12 -left-8 opacity-60" />
    </aside>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <ConfirmProvider>
      <div
        className="min-h-screen flex flex-col"
        style={{ background: 'var(--background)' }}
      >
        {/* Top app bar */}
        <header className="glass fixed top-0 inset-x-0 z-40 h-16 flex items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 rounded-xl text-light-text-muted dark:text-dark-text-muted hover:bg-primary/10"
              aria-label="Open sidebar"
            >
              <Menu size={20} />
            </button>
            <Logo height={40} />
          </div>

          <ThemeToggle />
        </header>

        {/* Body below app bar */}
        <div className="flex flex-1 pt-16">
          {/* Desktop sidebar */}
          <div className="hidden md:flex w-64 fixed left-0 top-16 bottom-0">
            <Sidebar />
          </div>

          {/* Mobile sidebar overlay — Radix Dialog provides the focus trap,
              Escape-to-close, and aria-modal; the backdrop + slide-in styling
              match the previous hand-rolled markup. */}
          <Dialog.Root open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm md:hidden" />
              <Dialog.Content className="fixed left-0 top-0 bottom-0 z-50 w-64 md:hidden focus:outline-none">
                <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                <Sidebar onClose={() => setSidebarOpen(false)} />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>

          {/* Main content */}
          <main className="flex-1 md:ml-64 overflow-y-auto">
            <div className="max-w-canvas mx-auto px-4 md:px-8 py-6">
              {/* CLI mode only: nudge users without a (valid) personal Claude token */}
              <ClaudeTokenPrompt />
              {children}
            </div>
          </main>
        </div>
      </div>
    </ConfirmProvider>
  )
}
