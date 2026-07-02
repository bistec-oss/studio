'use client'

import React, { createContext, useCallback, useContext, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

// Promise-based styled replacement for window.confirm():
//
//   const confirm = useConfirm()
//   if (!(await confirm({ title: 'Delete this project?' }))) return
//
// Mount <ConfirmProvider> once (AppShell does) — it renders the Modal-based
// dialog and resolves the pending promise on Confirm / Cancel / Escape /
// backdrop click.

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Style the confirm button for destructive actions (default true — most confirms here are deletes). */
  danger?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext)
  if (!confirm) {
    throw new Error('useConfirm must be used within a <ConfirmProvider>')
  }
  return confirm
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolverRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      // If a confirm is somehow already pending, treat it as cancelled.
      resolverRef.current?.(false)
      resolverRef.current = resolve
      setOptions(opts)
    })
  }, [])

  function settle(value: boolean) {
    resolverRef.current?.(value)
    resolverRef.current = null
    setOptions(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <Modal
          open
          onClose={() => settle(false)}
          title={options.title}
          size="sm"
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => settle(false)}>
                {options.cancelLabel ?? 'Cancel'}
              </Button>
              <Button
                variant={options.danger === false ? 'primary' : 'danger'}
                size="sm"
                onClick={() => settle(true)}
                autoFocus
              >
                {options.confirmLabel ?? 'Confirm'}
              </Button>
            </>
          }
        >
          {options.description && (
            <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
              {options.description}
            </p>
          )}
        </Modal>
      )}
    </ConfirmContext.Provider>
  )
}
