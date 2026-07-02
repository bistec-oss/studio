'use client'

import React, { useEffect, useRef, useState } from 'react'
import { GOOGLE_FONTS, googleFontsUrl } from './googleFonts'

// ─── Font Editor ─────────────────────────────────────────────────────────────
// Includes an inline Google Fonts combobox (search + keyboard nav) — there is
// no separate combobox subcomponent in the source; the search/select UI is
// part of FontEditor itself.

interface FontEntry {
  name: string
  url: string
}

interface FontEditorProps {
  fonts: FontEntry[]
  onChange: (f: FontEntry[]) => void
}

export function FontEditor({ fonts, onChange }: FontEditorProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const listboxId = React.useId()

  const matches = query.trim()
    ? GOOGLE_FONTS.filter(f => f.toLowerCase().includes(query.toLowerCase()) && !fonts.find(x => x.name === f))
    : []
  const visible = matches.slice(0, 8)
  const expanded = open && visible.length > 0

  function add(name: string) {
    onChange([...fonts, { name, url: googleFontsUrl(name) }])
    setQuery('')
    setOpen(false)
    setHighlighted(0)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!expanded) {
      if (e.key === 'ArrowDown' && visible.length > 0) {
        e.preventDefault()
        setOpen(true)
        setHighlighted(0)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted(h => (h + 1) % visible.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(h => (h - 1 + visible.length) % visible.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = visible[highlighted]
      if (pick) add(pick)
    }
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {fonts.map(f => (
          <div key={f.name} className="flex items-center gap-1.5 glass-input rounded-lg px-2 py-1">
            <span className="text-sm text-light-text dark:text-dark-text">{f.name}</span>
            <button
              onClick={() => onChange(fonts.filter(x => x.name !== f.name))}
              aria-label={`Remove font ${f.name}`}
              className="text-light-text-muted dark:text-dark-text-muted hover:text-red-500 ml-1"
            >×</button>
          </div>
        ))}
      </div>
      <div ref={ref} className="relative">
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); setHighlighted(0) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={expanded ? `${listboxId}-option-${highlighted}` : undefined}
          placeholder="Search Google Fonts…"
          className="glass-input rounded-xl px-3 py-2 text-sm w-full text-light-text dark:text-dark-text"
        />
        {expanded && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Google Fonts matches"
            className="absolute z-20 mt-1 w-full glass-panel rounded-xl border border-white/10 shadow-lg max-h-48 overflow-y-auto"
          >
            {visible.map((name, i) => (
              <li
                key={name}
                id={`${listboxId}-option-${i}`}
                role="option"
                aria-selected={i === highlighted}
              >
                <button
                  tabIndex={-1}
                  onMouseDown={e => { e.preventDefault(); add(name) }}
                  onMouseEnter={() => setHighlighted(i)}
                  className={`w-full text-left px-3 py-2 text-sm text-light-text dark:text-dark-text transition-colors ${
                    i === highlighted ? 'bg-primary/10 dark:bg-primary-light/10' : ''
                  }`}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
