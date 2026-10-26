'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { ColorSwatch } from './shared'
import { COMPACT_FIELD, FOCUS } from '@/components/ui/atoms'

// ─── Color Palette Editor ─────────────────────────────────────────────────────

interface ColorEditorProps {
  colors: string[]
  onChange: (c: string[]) => void
}

export function ColorEditor({ colors, onChange }: ColorEditorProps) {
  const [input, setInput] = useState('')
  const inputId = React.useId()
  const add = () => {
    const val = input.trim()
    if (val && /^#[0-9a-fA-F]{3,8}$/.test(val) && !colors.includes(val)) {
      onChange([...colors, val])
      setInput('')
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {colors.map(c => (
          <div key={c} className="flex items-center gap-1.5 rounded-ui-pill bg-canvas py-0.5 pl-1 pr-0.5 ring-1 ring-inset ring-line-subtle">
            <ColorSwatch color={c} />
            <span className="font-mono text-ui-xs text-fg">{c}</span>
            <button
              type="button"
              onClick={() => onChange(colors.filter(x => x !== c))}
              aria-label={`Remove color ${c}`}
              className={`inline-flex h-6 w-6 items-center justify-center rounded-ui-pill text-fg-muted transition-colors duration-fast ease-standard hover:bg-surface-raised hover:text-status-failed ${FOCUS}`}
            >×</button>
          </div>
        ))}
      </div>
      {/* The field is named by a visible label (014 FR-12); the hex
          placeholder is an example value, not its name. */}
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={inputId}>Add color</FieldLabel>
        <div className="flex flex-wrap gap-2">
          <input
            id={inputId}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            placeholder="#1A2B3C"
            className={`${COMPACT_FIELD} w-36`}
          />
          <Button variant="secondary" size="sm" onClick={add}>Add</Button>
        </div>
      </div>
    </div>
  )
}
