'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, BookOpen, FolderOpen, Megaphone, Menu, X } from 'lucide-react'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/',          icon: <LayoutDashboard size={18} /> },
  { label: 'Library',   href: '/library',   icon: <BookOpen size={18} /> },
  { label: 'Projects',  href: '/projects',  icon: <FolderOpen size={18} /> },
  { label: 'Brief',     href: '/brief',     icon: <Megaphone size={18} /> },
]

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
  return (
    <aside className="glass-panel flex flex-col h-full w-64 p-4 gap-1 rounded-none">
      {/* Logo / brand */}
      <div className="flex items-center justify-between mb-6 px-1">
        <span className="font-semibold text-base tracking-tight text-light-text dark:text-dark-text">
          bistec-studio
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden p-1.5 rounded-lg text-light-text-muted dark:text-dark-text-muted hover:bg-primary/10"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map(item => (
          <NavLink key={item.href} item={item} onClick={onClose} />
        ))}
      </nav>

      {/* Bottom glow blob */}
      <div className="glow-blob w-48 h-48 -bottom-12 -left-8 opacity-60" />
    </aside>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
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
          <span className="font-semibold text-base tracking-tight text-light-text dark:text-dark-text">
            bistec-studio
          </span>
        </div>

        <ThemeToggle />
      </header>

      {/* Body below app bar */}
      <div className="flex flex-1 pt-16">
        {/* Desktop sidebar */}
        <div className="hidden md:flex w-64 fixed left-0 top-16 bottom-0">
          <Sidebar />
        </div>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <>
            <div
              className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="fixed left-0 top-0 bottom-0 z-50 w-64 md:hidden">
              <Sidebar onClose={() => setSidebarOpen(false)} />
            </div>
          </>
        )}

        {/* Main content */}
        <main className="flex-1 md:ml-64 overflow-y-auto">
          <div className="max-w-canvas mx-auto px-4 md:px-8 py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
