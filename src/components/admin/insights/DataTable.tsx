import React from 'react'
import { SCROLL_FOCUS, TABLE_HEAD_ROW } from '@/components/ui/atoms'

export interface Column<T> {
  key: string
  header: string
  align?: 'left' | 'right'
  cell: (row: T) => React.ReactNode
}

interface DataTableProps<T> {
  /** The scroll region's accessible name (DESIGN_SYSTEM.md §8.15). */
  label: string
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  rowTestId?: (row: T) => string
  empty?: string
  minWidth?: number
}

// A ruled data table (§8.15): sentence-case muted heads, --line-subtle rows,
// numbers right-aligned in tabular figures. It scrolls inside its own labelled,
// focusable region, so a wide table never widens the page at 390 px.
export function DataTable<T>({
  label,
  columns,
  rows,
  rowKey,
  rowTestId,
  empty = 'No events in this range.',
  minWidth = 480,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return <p className="text-ui-sm text-fg-muted">{empty}</p>
  }
  return (
    <div tabIndex={0} role="region" aria-label={label} className={`relative overflow-x-auto ${SCROLL_FOCUS}`}>
      <table className="w-full text-ui-sm" style={{ minWidth }}>
        <thead>
          <tr className={TABLE_HEAD_ROW}>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`py-2 pr-3 font-semibold ${c.align === 'right' ? 'text-right' : ''}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              data-testid={rowTestId?.(r)}
              className="border-b border-line-subtle last:border-b-0"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`py-2 pr-3 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}
                >
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
