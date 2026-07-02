'use client'

import React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Shared overlay for both the centered Modal and the right-side Drawer.
// Radix gives us focus trap, Escape-to-close, aria-modal, and return-focus
// for free — we only own the visual shell.
function Overlay({ className }: { className?: string }) {
  return (
    <Dialog.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-black/50',
        'data-[state=open]:animate-fade-in',
        className,
      )}
    />
  )
}

interface BaseProps {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  /** Hide the built-in header (title + close button) when a caller renders its own. */
  hideHeader?: boolean
}

// ─── Modal — centered dialog ────────────────────────────────────────────────

interface ModalProps extends BaseProps {
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_CLASSES: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  className,
  hideHeader,
  size = 'md',
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <Dialog.Portal>
        <Overlay />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'w-[calc(100%-2rem)]',
            SIZE_CLASSES[size],
            'glass-panel rounded-xl p-6',
            'animate-scale-in',
            'focus:outline-none',
            className,
          )}
        >
          {!hideHeader && (
            <div className="flex items-start justify-between gap-4 mb-4">
              <Dialog.Title className="text-lg font-semibold text-light-text dark:text-dark-text">
                {title}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  aria-label="Close"
                  className="text-light-text-muted dark:text-dark-text-muted hover:text-light-text dark:hover:text-dark-text transition-colors flex-shrink-0"
                >
                  <X size={18} />
                </button>
              </Dialog.Close>
            </div>
          )}
          {hideHeader && (
            // Dialog.Title is required for a11y even when the header is visually
            // hidden — callers rendering their own header still get a labelled dialog.
            <Dialog.Title className="sr-only">{title}</Dialog.Title>
          )}
          {children}
          {footer && <div className="flex gap-2 justify-end mt-5">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ─── Drawer — right-side sheet ──────────────────────────────────────────────

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  className,
  hideHeader,
}: BaseProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <Dialog.Portal>
        <Overlay className="backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            'fixed right-0 top-0 z-50 h-full w-full max-w-md',
            'glass-panel rounded-none border-l',
            'flex flex-col',
            'data-[state=open]:animate-slide-in',
            'focus:outline-none',
            className,
          )}
        >
          {!hideHeader && (
            <div className="flex items-center justify-between px-5 py-4 border-b border-light-border dark:border-dark-border flex-shrink-0">
              <Dialog.Title className="text-base font-semibold text-light-text dark:text-dark-text">
                {title}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  aria-label="Close"
                  className="p-1.5 rounded-lg text-light-text-muted dark:text-dark-text-muted hover:bg-primary/10 transition-colors"
                >
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>
          )}
          {hideHeader && <Dialog.Title className="sr-only">{title}</Dialog.Title>}
          <div className="flex-1 overflow-y-auto">{children}</div>
          {footer && (
            <div className="flex gap-2 justify-end px-5 py-4 border-t border-light-border dark:border-dark-border flex-shrink-0">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
