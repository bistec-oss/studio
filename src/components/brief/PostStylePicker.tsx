'use client'

import React from 'react'
import { Check } from 'lucide-react'
import { activeStyles, getStyle, type PostStyle } from '@/lib/postStyles'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { ICON } from '@/components/ui/atoms'
import { cardCls } from './cardCls'

// 027 FR-07: the post style, on step 1 above the size and design choices. A
// radio-card group (one tab stop, arrow keys move the choice) on the same cards
// as the size picker. A retired key that is already selected stays in the list,
// so a resumed brief still shows what it was started with.

interface PostStylePickerProps {
  value: string
  onChange: (key: string) => void
}

export function PostStylePicker({ value, onChange }: PostStylePickerProps) {
  const labelId = React.useId()
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({})

  const options: PostStyle[] = [...activeStyles()]
  const selected = getStyle(value)
  if (selected && !options.some(o => o.key === selected.key)) options.push(selected)

  function move(from: number, delta: number) {
    const next = options[(from + delta + options.length) % options.length]
    onChange(next.key)
    refs.current[next.key]?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      move(index, 1)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      move(index, -1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      move(0, 0)
    } else if (e.key === 'End') {
      e.preventDefault()
      move(options.length - 1, 0)
    }
  }

  // The tab stop is the selected card, or the first when nothing matches.
  const stopKey = options.some(o => o.key === value) ? value : options[0]?.key

  return (
    <div data-testid="post-style-section">
      <FieldLabel as="span" id={labelId} className="mb-2.5">Post style</FieldLabel>
      <p className="mb-3 text-ui-xs text-fg-muted">
        What kind of post this is. It sets the tone and the image style for you, and adds the rules for that
        kind of post. You can still change either below.
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        data-testid="post-style-picker"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {options.map((opt, i) => {
          const checked = opt.key === value
          return (
            <button
              key={opt.key}
              ref={el => {
                refs.current[opt.key] = el
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={opt.key === stopKey ? 0 : -1}
              onClick={() => onChange(opt.key)}
              onKeyDown={e => onKeyDown(e, i)}
              data-testid={`post-style-${opt.key}`}
              className={cardCls(checked, 'p-4')}
            >
              <div className="flex items-start gap-2">
                <span className="text-ui-base font-semibold leading-tight text-fg">
                  {opt.label}
                  {opt.status === 'retired' && <span className="font-normal text-fg-muted"> (retired)</span>}
                </span>
                {checked && <Check {...ICON} aria-hidden className="ml-auto flex-shrink-0 text-accent" />}
              </div>
              <div className="mt-1.5 text-ui-xs text-fg-muted">{opt.summary}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
