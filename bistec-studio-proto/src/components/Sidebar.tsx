'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, FileText, Palette, Settings, Sparkles, Menu, X, BookImage, FolderKanban } from 'lucide-react'

const navItems = [
  { section: 'Create' },
  { href: '/', icon: LayoutGrid, label: 'Dashboard', tourId: 'tour-nav-dashboard' },
  { href: '/brief/new', icon: FileText, label: 'New Brief', tourId: 'tour-nav-brief' },
  { section: 'Organize' },
  { href: '/projects', icon: FolderKanban, label: 'Projects', tourId: 'tour-nav-projects' },
  { href: '/library', icon: BookImage, label: 'Library', tourId: 'tour-nav-library' },
  { section: 'Admin' },
  { href: '/admin/brandkits', icon: Palette, label: 'Brand Kits', tourId: 'tour-nav-brandkits' },
  { href: '/admin/settings', icon: Settings, label: 'AI Providers', tourId: 'tour-nav-settings' },
]

function isItemActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

function BrandMark({ compact }: { compact?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 via-blue-600 to-violet-600 flex items-center justify-center shadow-md shadow-blue-500/20">
          <Sparkles size={15} className="text-white" />
        </div>
        <span className="font-display font-extrabold text-lg tracking-[0.12em] bg-gradient-to-r from-blue-600 via-blue-700 to-violet-700 bg-clip-text text-transparent">
          bistec-studio
        </span>
      </div>
      {!compact && (
        <div className="mt-1.5 text-[0.58rem] tracking-[0.22em] uppercase text-slate-400 pl-[42px]">Marketing Suite</div>
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
            <div key={i} className="px-3 pt-4 pb-1.5 text-[0.58rem] font-bold tracking-[0.14em] uppercase text-slate-400">
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
                ? 'bg-blue-50 text-blue-700 border-l-blue-500 shadow-sm'
                : 'text-slate-500 border-l-transparent hover:bg-slate-100 hover:text-slate-700 hover:border-l-slate-300'
            }`}
          >
            <Icon size={17} className={`transition-all ${isActive ? 'opacity-100 text-blue-600' : 'opacity-50'}`} />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function UserFooter() {
  return (
    <div className="p-4 border-t border-slate-200 flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-violet-600 flex items-center justify-center text-xs font-bold text-white shadow-md shadow-blue-500/20">
        DD
      </div>
      <div>
        <div className="text-[0.8rem] font-semibold leading-tight text-slate-800">Damian De Cruz</div>
        <div className="text-[0.62rem] text-slate-400 tracking-wide">Administrator</div>
      </div>
      <div className="ml-auto w-2 h-2 rounded-full bg-emerald-500 animate-pulse-dot" />
    </div>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => { setOpen(false) }, [pathname])

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 h-14 flex-shrink-0 bg-surface-1 border-b border-slate-200 shadow-sm">
        <BrandMark compact />
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="p-2 -mr-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-[300]">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-fade-in" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-white border-r border-slate-200 flex flex-col overflow-y-auto shadow-xl">
            <div className="px-5 pt-5 pb-4 flex items-start justify-between">
              <BrandMark />
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
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
      <aside className="hidden md:flex bg-surface-1 border-r border-slate-200 flex-col h-screen overflow-y-auto relative shadow-[1px_0_0_0_rgba(0,0,0,0.04)]">
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-blue-500/[0.03] to-transparent pointer-events-none" />
        <div className="px-5 pt-6 pb-7 relative">
          <BrandMark />
        </div>
        <Nav pathname={pathname} withTourIds />
        <UserFooter />
      </aside>
    </>
  )
}
