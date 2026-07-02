'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ColorSwatch } from './shared'

// ─── Color Palette Editor ─────────────────────────────────────────────────────

interface ColorEditorProps {
  colors: string[]
  onChange: (c: string[]) => void
}

export function ColorEditor({ colors, onChange }: ColorEditorProps) {
  const [input, setInput] = useState('')
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
          <div key={c} className="flex items-center gap-1.5 glass-input rounded-lg px-2 py-1">
            <ColorSwatch color={c} />
            <span className="font-mono text-xs text-light-text dark:text-dark-text">{c}</span>
            <button
              onClick={() => onChange(colors.filter(x => x !== c))}
              aria-label={`Remove color ${c}`}
              className="text-light-text-muted dark:text-dark-text-muted hover:text-red-500 ml-1"
            >×</button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="#1A2B3C"
          className="glass-input rounded-xl px-3 py-2 text-sm w-36 text-light-text dark:text-dark-text"
        />
        <Button variant="secondary" size="sm" onClick={add}>Add</Button>
      </div>
    </div>
  )
}
