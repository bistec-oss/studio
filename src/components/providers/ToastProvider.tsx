'use client'

import React from 'react'
import { Toaster } from 'sonner'
import { FOCUS } from '@/components/ui/atoms'

// App-wide toast outlet. Fire toasts anywhere on the client via
// `import { toast } from 'sonner'`.
//
// Toasts (DESIGN_SYSTEM.md §8.8, the study's .toast): Sonner runs `unstyled`,
// so its own theme colours never fight the tokens, and each part takes token
// classes. The icon sits in a 30 px status disc on its 0.12 tint (021 A2).
// The tokens switch with `.dark` on <html>, so no theme prop is passed: Sonner
// keeps its default "light", which also keeps its dark-only close-button rule
// (not gated on `unstyled`) from repainting the button.
export function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      // Lift the stack clear of the floating Create post button (52 px tall,
      // 24 px from the bottom edge) with a 20 px gap, as the study places its
      // toast (021 design.md §4.3). Sonner goes full-width at <=600px, so the
      // mobile offset needs the same bottom clearance.
      offset={{ bottom: 96, right: 24 }}
      mobileOffset={{ bottom: 96 }}
      closeButton
      style={{ '--width': '340px' } as React.CSSProperties}
      toastOptions={{
        unstyled: true,
        classNames: {
          // The opaque overlay surface at radius-lg (DESIGN_SYSTEM.md §4.1),
          // rising in (globals.css: its fill mode hands the transform back to
          // Sonner's stacking once the entrance ends).
          toast:
            'surface-overlay rounded-ui-lg animate-rise w-full flex items-start gap-3 py-3.5 pl-4 pr-10 text-ui-sm text-fg',
          // The status disc: decorative, and not a control, so its 30 px is
          // not a --control-* height (014 FR-07).
          icon: 'grid size-[30px] flex-shrink-0 place-items-center rounded-full [&>svg]:h-4 [&>svg]:w-4',
          content: 'flex flex-col gap-0.5 min-w-0 pt-1',
          title: 'text-ui-sm font-semibold leading-snug text-fg',
          description: 'text-ui-xs text-fg-muted',
          closeButton: [
            'absolute top-3 right-3 inline-flex h-6 w-6 items-center justify-center rounded-ui-sm',
            'text-fg-muted hover:bg-canvas hover:text-fg',
            FOCUS,
          ].join(' '),
          success: '[&_[data-icon]]:bg-status-published/12 [&_[data-icon]]:text-status-published',
          error: '[&_[data-icon]]:bg-status-failed/12 [&_[data-icon]]:text-status-failed',
          warning: '[&_[data-icon]]:bg-status-scheduled/12 [&_[data-icon]]:text-status-scheduled',
          info: '[&_[data-icon]]:bg-canvas [&_[data-icon]]:text-fg-muted',
        },
      }}
    />
  )
}
