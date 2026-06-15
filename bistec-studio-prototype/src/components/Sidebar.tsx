'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, PenLine, FolderOpen, Megaphone, BookImage, Settings, Sparkles, Menu, X } from 'lucide-react'

const navItems = [
  { section: 'Create' },
  { href: '/', icon: LayoutGrid, label: 'Dashboard', tourId: 'tour-nav-dashboard' },
  { href: '/brief', icon: PenLine, label: 'New Post', tourId: 'tour-nav-brief' },
  { section: 'Organise' },
  { href: '/projects', icon: FolderOpen, label: 'Projects', tourId: 'tour-nav-projects' },
  { href: '/campaigns', icon: Megaphone, label: 'Campaigns', tourId: 'tour-nav-campaigns' },
  { href: '/library', icon: BookImage, label: 'Library', tourId: 'tour-nav-library' },
  { section: 'Admin' },
  { href: '/settings', icon: Settings, label: 'Settings' },
]

function isItemActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

function BrandMark({ compact }: { compact?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 via-cyan-500 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <Sparkles size={16} className="text-white" />
        </div>
        <span className="font-display font-extrabold text-xl tracking-[0.15em] bg-gradient-to-r from-cyan-300 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
          BISTEC
        </span>
      </div>
      {!compact && (
        <div className="mt-1.5 text-[0.58rem] tracking-[0.25em] uppercase text-slate-600 pl-10">Studio — v1 Prototype</div>
      )}
    </div>
  )
}

function Nav({ pathname, withTourIds }: { pathname: string; withTourIds?: boolean }) {
  return (
    <nav className="flex-1 px-2 relative">
      {navItems.map((item, i) => {
        if ('section' in item) {
          return (
            <div key={i} className="px-3 pt-4 pb-1.5 text-[0.58rem] font-bold tracking-[0.14em] uppercase text-slate-600/80">
              {item.section}
            </div>
          )
        }
        const Icon = item.icon
        const isActive = isItemActive(item.href!, pathname)
        return (
          <Link
            key={item.href}
            href={item.href!}
            id={withTourIds ? item.tourId : undefined}
            className={`flex items-center gap-2.5 px-3 py-2 my-0.5 rounded-lg text-[0.82rem] font-medium border-l-2 transition-all duration-200 ${
              isActive
                ? 'bg-cyan-400/[0.08] text-cyan-400 border-l-cyan-400 shadow-[inset_0_0_20px_rgba(34,211,238,0.04)]'
                : 'text-slate-500 border-l-transparent hover:bg-white/[0.03] hover:text-slate-300 hover:border-l-white/10'
            }`}
          >
            <Icon size={17} className={`transition-all ${isActive ? 'opacity-100 drop-shadow-[0_0_6px_rgba(34,211,238,0.4)]' : 'opacity-50'}`} />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function UserFooter() {
  return (
    <div className="p-4 border-t border-white/[0.06] flex items-center gap-2.5 relative">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 via-cyan-500 to-blue-500 flex items-center justify-center text-xs font-bold text-white shadow-lg shadow-cyan-500/20">
        JD
      </div>
      <div>
        <div className="text-[0.8rem] font-semibold leading-tight">Jane Doe</div>
        <div className="text-[0.62rem] text-slate-600 tracking-wide">Administrator</div>
      </div>
      <div className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse-dot" />
    </div>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // close the drawer after navigating
  useEffect(() => { setOpen(false) }, [pathname])

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 h-14 flex-shrink-0 bg-surface-1 border-b border-white/[0.06]">
        <BrandMark compact />
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="p-2 -mr-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-colors"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-[300]">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-surface-1 border-r border-white/[0.06] flex flex-col overflow-y-auto">
            <div className="px-5 pt-5 pb-4 flex items-start justify-between">
              <BrandMark />
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.04] transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <Nav pathname={pathname} />
            <UserFooter />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex bg-surface-1 border-r border-white/[0.06] flex-col h-screen overflow-y-auto relative">
        {/* Subtle gradient accent at top */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-cyan-500/[0.03] to-transparent pointer-events-none" />
        <div className="px-5 pt-6 pb-7 relative">
          <BrandMark />
        </div>
        <Nav pathname={pathname} withTourIds />
        <UserFooter />
      </aside>
    </>
  )
}
