'use client'

import React from 'react'
import { Toaster } from 'sonner'
import { useTheme } from '@/components/theme/ThemeProvider'

// App-wide toast outlet, styled to match the Frozen Light glass theme and
// following the active light/dark theme. Fire toasts anywhere on the client
// via `import { toast } from 'sonner'`.
export function ToastProvider() {
  const { theme } = useTheme()

  const glass: React.CSSProperties =
    theme === 'dark'
      ? {
          background: 'rgba(15, 23, 42, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          color: '#f8fafc',
        }
      : {
          background: 'rgba(255, 255, 255, 0.75)',
          border: '1px solid rgba(15, 23, 42, 0.08)',
          color: '#0f172a',
        }

  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      closeButton
      toastOptions={{
        style: {
          ...glass,
          borderRadius: '0.75rem',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          boxShadow:
            theme === 'dark' ? '0 4px 30px rgba(0, 0, 0, 0.2)' : '0 4px 30px rgba(0, 0, 0, 0.06)',
        },
      }}
    />
  )
}
