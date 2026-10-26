'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/apiFetch'
import type { FontFamily } from '@/lib/fonts/types'
import { inputClasses, fieldEdge } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { FOCUS, TAG } from '@/components/ui/atoms'
import { FieldLabel } from '@/components/ui/FieldLabel'

// ─── Font Editor ─────────────────────────────────────────────────────────────
// Includes an inline font combobox (search + keyboard nav) — there is no
// separate combobox subcomponent; the search/select UI is part of FontEditor.
// 031 FR-25: the families come from GET /api/fonts (searched on the server);
// the browser holds no font list.

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
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const listboxId = React.useId()
  const inputId = React.useId()

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200)
    return () => clearTimeout(t)
  }, [query])

  const { data } = useQuery({
    queryKey: ['fonts', debounced],
    queryFn: () =>
      apiFetch<{ snapshotDate: string; families: FontFamily[] }>('/api/fonts?q=' + encodeURIComponent(debounced)),
    enabled: debounced.length > 0,
    staleTime: 5 * 60_000,
  })
  const visible = (debounced ? (data?.families ?? []) : [])
    .filter(f => !fonts.find(x => x.name === f.family))
    .slice(0, 8)
  const expanded = open && visible.length > 0

  function add(name: string) {
    // The server computes the request URL on save; a new entry's url is a placeholder.
    onChange([...fonts, { name, url: '' }])
    setQuery('')
    setDebounced('')
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
      if (pick) add(pick.family)
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
        {fonts.map((f, i) => (
          <div key={f.name} className="flex max-w-full items-center gap-1.5 rounded-ui-pill bg-canvas py-0.5 pl-3 pr-0.5 ring-1 ring-inset ring-line-subtle">
            <span className="min-w-0 break-words text-ui-sm text-fg">{f.name}</span>
            {i < 2 && <span className={TAG}>{i === 0 ? 'Heading' : 'Body'}</span>}
            <button
              type="button"
              onClick={() => onChange(fonts.filter(x => x.name !== f.name))}
              aria-label={`Remove font ${f.name}`}
              className={`inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-ui-pill text-fg-muted transition-colors duration-fast ease-standard hover:bg-surface-raised hover:text-status-failed ${FOCUS}`}
            >×</button>
          </div>
        ))}
      </div>
      {/* The combobox is named by a visible label (014 FR-12), outside the
          relative wrapper that positions the listbox under the field. */}
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={inputId}>Search Google Fonts</FieldLabel>
        <div ref={ref} className="relative">
          <input
            id={inputId}
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
            className={cn(inputClasses, fieldEdge())}
          />
          {expanded && (
            <ul
              id={listboxId}
              role="listbox"
              aria-label="Google Fonts matches"
              className="surface-raised absolute z-20 mt-1 max-h-48 w-full overflow-y-auto p-1.5"
            >
              {visible.map((f, i) => (
                <li
                  key={f.family}
                  id={`${listboxId}-option-${i}`}
                  role="option"
                  aria-selected={i === highlighted}
                >
                  <button
                    tabIndex={-1}
                    onMouseDown={e => { e.preventDefault(); add(f.family) }}
                    onMouseEnter={() => setHighlighted(i)}
                    className={`flex w-full items-center gap-2 rounded-ui-sm px-2.5 py-2 text-left text-ui-sm text-fg transition-colors duration-fast ease-standard ${
                      i === highlighted ? 'bg-canvas' : ''
                    }`}
                  >
                    <span>{f.family}</span>
                    <span className={TAG}>{f.category}</span>
                    {f.delisted && <span className={TAG}>No longer on Google Fonts</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
