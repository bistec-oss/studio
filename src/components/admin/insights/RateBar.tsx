import React from 'react'
import { pct } from './format'

// A rate as a bar and a number (no charting library: none is installed). The
// number is always visible text, so the bar is never the only carrier; the bar
// itself is decorative.
export function RateBar({ rate, testId }: { rate: number | null; testId?: string }) {
  const width = rate === null ? 0 : Math.max(0, Math.min(1, rate)) * 100
  return (
    <div className="flex items-center justify-end gap-2">
      <div aria-hidden className="h-1.5 w-16 flex-shrink-0 overflow-hidden rounded-ui-pill bg-canvas ring-1 ring-inset ring-line-subtle">
        <div className="h-full rounded-ui-pill bg-accent" style={{ width: `${width}%` }} />
      </div>
      <span data-testid={testId} className="w-14 text-right tabular-nums">
        {pct(rate)}
      </span>
    </div>
  )
}
