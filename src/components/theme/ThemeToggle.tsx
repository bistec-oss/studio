'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from './ThemeProvider'
import { FOCUS, ICON } from '@/components/ui/atoms'

// The theme toggle (021 A8, the study's .theme-btn): two icon segments, sun and
// moon, on a canvas pill track, in a group named "Theme". Each button is named
// by its aria-label, "Light" or "Dark" (with a matching title), and
// `aria-pressed` carries the state. The current segment is --surface-2 with the
// panel shadow. That highlight keys on the `.dark` class (themeInitScript sets
// it before paint), not on React state, so it is right from the first frame;
// `aria-pressed` follows React state, which the provider settles in its mount
// effect.
//
// The segments are --control-sm squares (014 FR-07), so the track is
// --control-md tall: 2 px off the study's 32 × 30 segments.
export function ThemeToggle() {
  const { theme, toggle } = useTheme()

  const segment = `
    inline-flex h-control-sm w-control-sm items-center justify-center rounded-ui-pill
    transition-[background-color,color,box-shadow] duration-base ease-standard ${FOCUS}
  `

  return (
    <div role="group" aria-label="Theme" className="inline-flex gap-0.5 p-[3px] rounded-ui-pill bg-canvas">
      <button
        type="button"
        aria-label="Light"
        title="Light"
        aria-pressed={theme === 'light'}
        onClick={() => theme !== 'light' && toggle()}
        className={`${segment} bg-surface-raised text-fg shadow-panel dark:bg-transparent dark:text-fg-muted dark:shadow-none dark:hover:text-fg`}
      >
        <Sun {...ICON} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Dark"
        title="Dark"
        aria-pressed={theme === 'dark'}
        onClick={() => theme !== 'dark' && toggle()}
        className={`${segment} text-fg-muted hover:text-fg dark:bg-surface-raised dark:text-fg dark:shadow-panel`}
      >
        <Moon {...ICON} aria-hidden="true" />
      </button>
    </div>
  )
}
