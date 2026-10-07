'use client'

import React, { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  Loader2,
  MousePointerClick,
  RefreshCw,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassInput } from '@/components/ui/GlassInput'
import type { ElementEditKind } from '@/lib/drafts/inlineEdit'
import {
  cssColorToHex,
  type ElementLocator,
  type ElementNavDirection,
} from '@/components/drafts/inlineElementEdit'

// The side panel for element mode in InlineEditModal (change 004 T24). It
// holds no request logic: every Apply goes up through onApply, and every
// navigation goes up through onNavigate. The modal sends one request at a time
// and handles the reply.
//
// Keyboard (fix round 1): "Select the whole design" starts at <body>. Parent,
// first child, previous and next walk the stored-HTML tree from there. After
// an Apply or a navigation the panel remounts (key = selection id), so the
// control that was used gets focus back (`focusId`). The focus waits until
// that control is enabled again.

export interface ElementSelection {
  // Increments per selection. It keys the panel so the fields reset.
  id: number
  // The live element in the editor iframe, used for the highlight.
  el: Element
  // Snapshotted at selection time, before anything could change the DOM.
  locator: ElementLocator
  // Lower-case tag name, for display.
  tag: string
  canText: boolean
  canStyle: boolean
  // Which neighbours exist in the same tree the locator uses.
  nav: Record<ElementNavDirection, boolean>
  initial: { text: string; color: string; background: string; fontSize: string }
  // The control to focus once this selection's panel is enabled; null for a
  // mouse selection, which must not steal focus from the canvas.
  focusId: string | null
}

export type ElementNotice =
  | { kind: 'stale'; message: string }
  | { kind: 'busy'; message: string }
  | { kind: 'unsupported'; message: string }

interface ElementEditPanelProps {
  selection: ElementSelection | null
  // True while a request or a reload is in flight, or while the draft is busy.
  disabled: boolean
  // The kind of the request in flight, which gets the spinner.
  inFlight: ElementEditKind | null
  fieldError: { kind: ElementEditKind; message: string } | null
  notice: ElementNotice | null
  // Focus "Select the whole design" once it is enabled (after a stale reload
  // cleared the selection).
  focusStart: boolean
  onApply: (kind: ElementEditKind, value: string) => void
  onSelectBody: () => void
  onNavigate: (dir: ElementNavDirection) => void
  onClearSelection: () => void
  onCheckAgain: () => void
  onUseWholeDocument: () => void
}

const LABEL = 'text-sm font-medium text-light-text dark:text-dark-text'
const MUTED = 'text-xs text-light-text-muted dark:text-dark-text-muted'

// Focus the element matching `selector` inside `root` once `disabled` is false,
// at most once per mount. A disabled target falls back to `fallback`.
function useFocusWhenEnabled(
  root: React.RefObject<HTMLElement | null>,
  selector: string | null,
  fallback: string | null,
  disabled: boolean,
) {
  const done = useRef(false)
  useEffect(() => {
    if (done.current || disabled || !selector || !root.current) return
    done.current = true
    const pick = (s: string | null) => (s ? root.current?.querySelector<HTMLElement>(s) ?? null : null)
    const target = pick(selector)
    const usable = target && !(target as HTMLButtonElement).disabled ? target : pick(fallback)
    usable?.focus()
  }, [root, selector, fallback, disabled])
}

export function ElementEditPanel({
  selection,
  disabled,
  inFlight,
  fieldError,
  notice,
  focusStart,
  onApply,
  onSelectBody,
  onNavigate,
  onClearSelection,
  onCheckAgain,
  onUseWholeDocument,
}: ElementEditPanelProps) {
  return (
    <aside
      aria-label="Element editor"
      className="flex flex-col gap-4 rounded-xl glass-popover p-4 overflow-y-auto"
    >
      {notice && (
        <NoticeBanner notice={notice} onCheckAgain={onCheckAgain} onUseWholeDocument={onUseWholeDocument} />
      )}

      {selection ? (
        <SelectionFields
          key={selection.id}
          selection={selection}
          disabled={disabled}
          inFlight={inFlight}
          fieldError={fieldError}
          onApply={onApply}
          onNavigate={onNavigate}
          onClearSelection={onClearSelection}
        />
      ) : (
        <EmptyState disabled={disabled} focusStart={focusStart} onSelectBody={onSelectBody} />
      )}
    </aside>
  )
}

function EmptyState({
  disabled,
  focusStart,
  onSelectBody,
}: {
  disabled: boolean
  focusStart: boolean
  onSelectBody: () => void
}) {
  const root = useRef<HTMLDivElement>(null)
  useFocusWhenEnabled(root, focusStart ? '[data-focus-id="start"]' : null, null, disabled)
  return (
    <div ref={root} className="flex flex-col items-center gap-2 py-8 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary-light/10 text-primary dark:text-primary-light">
        <MousePointerClick size={18} />
      </span>
      <p className="text-sm font-medium text-light-text dark:text-dark-text">Select an element</p>
      <p className={MUTED}>
        Click any part of the design to change its text, colour or size. Each change saves as a new
        revision. With the keyboard, start from the whole design and move with Parent, Child,
        Previous and Next.
      </p>
      <Button variant="secondary" size="sm" onClick={onSelectBody} disabled={disabled} data-focus-id="start">
        Select the whole design
      </Button>
    </div>
  )
}

function NoticeBanner({
  notice,
  onCheckAgain,
  onUseWholeDocument,
}: {
  notice: ElementNotice
  onCheckAgain: () => void
  onUseWholeDocument: () => void
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200"
    >
      <p className="flex items-start gap-2">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
        <span>{notice.message}</span>
      </p>
      {notice.kind === 'busy' && (
        <Button variant="secondary" size="sm" className="self-start" onClick={onCheckAgain}>
          <RefreshCw size={12} aria-hidden /> Check again
        </Button>
      )}
      {notice.kind === 'unsupported' && (
        <Button variant="secondary" size="sm" className="self-start" onClick={onUseWholeDocument}>
          Use the whole-document editor
        </Button>
      )}
    </div>
  )
}

const NAV: Array<{ dir: ElementNavDirection; label: string; short: string; Icon: typeof ArrowUpLeft }> = [
  { dir: 'parent', label: 'Select parent element', short: 'Parent', Icon: ArrowUpLeft },
  { dir: 'firstChild', label: 'Select first child element', short: 'Child', Icon: ArrowDownRight },
  { dir: 'previous', label: 'Select previous sibling element', short: 'Previous', Icon: ArrowLeft },
  { dir: 'next', label: 'Select next sibling element', short: 'Next', Icon: ArrowRight },
]

// Each Apply's input: focused instead when its Apply is disabled after a
// re-select (an unchanged text disables Apply text).
const INPUT_FOR: Record<ElementEditKind, string> = {
  text: '#element-text',
  color: '#element-color',
  backgroundColor: '#element-backgroundColor',
  fontSize: '#element-fontSize',
}

function SelectionFields({
  selection,
  disabled,
  inFlight,
  fieldError,
  onApply,
  onNavigate,
  onClearSelection,
}: Pick<
  ElementEditPanelProps,
  'disabled' | 'inFlight' | 'fieldError' | 'onApply' | 'onNavigate' | 'onClearSelection'
> & {
  selection: ElementSelection
}) {
  const [text, setText] = useState(selection.initial.text)
  const root = useRef<HTMLDivElement>(null)
  const errorFor = (kind: ElementEditKind) => (fieldError?.kind === kind ? fieldError.message : undefined)

  const focusId = selection.focusId
  const applyKind = focusId?.startsWith('apply-') ? (focusId.slice(6) as ElementEditKind) : null
  useFocusWhenEnabled(
    root,
    focusId ? `[data-focus-id="${focusId}"]` : null,
    applyKind ? INPUT_FOR[applyKind] : '[data-focus-id="heading"]',
    disabled,
  )

  return (
    <div ref={root} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3
            tabIndex={-1}
            data-focus-id="heading"
            aria-live="polite"
            className="flex min-w-0 items-center gap-2 text-sm font-semibold text-light-text dark:text-dark-text focus:outline-none"
          >
            Selected
            <span
              data-testid="element-tag"
              className="rounded-full border border-primary/20 dark:border-primary-light/25 bg-primary/10 dark:bg-primary-light/10 px-2 py-0.5 font-mono text-xs font-medium text-primary dark:text-primary-light"
            >
              &lt;{selection.tag}&gt;
            </span>
          </h3>
          <Button variant="ghost" size="sm" onClick={onClearSelection} aria-label="Clear selection">
            <X size={12} aria-hidden />
          </Button>
        </div>
        <div role="group" aria-label="Move the selection" className="grid grid-cols-2 gap-1">
          {NAV.map(({ dir, label, short, Icon }) => (
            <Button
              key={dir}
              variant="ghost"
              size="sm"
              aria-label={label}
              title={label}
              data-focus-id={`nav-${dir}`}
              disabled={!selection.nav[dir] || disabled}
              onClick={() => onNavigate(dir)}
            >
              <Icon size={12} className="shrink-0" aria-hidden /> {short}
            </Button>
          ))}
        </div>
      </div>

      {selection.canText ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="element-text" className={LABEL}>
            Text
          </label>
          <textarea
            id="element-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            disabled={disabled}
            className="glass-input w-full resize-y rounded-xl px-3 py-2 text-sm text-light-text dark:text-dark-text focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <FieldError message={errorFor('text')} />
          <ApplyButton
            focusId="apply-text"
            label="Apply text"
            busy={inFlight === 'text'}
            disabled={disabled || text === selection.initial.text}
            onClick={() => onApply('text', text)}
          />
        </div>
      ) : (
        <p className={MUTED}>
          This element contains other elements, so its text can&apos;t be replaced as one piece.
          Select the words themselves (Child), or use the whole-document editor.
        </p>
      )}

      {selection.canStyle && (
        <>
          <ColorField
            kind="color"
            label="Text colour"
            initial={selection.initial.color}
            disabled={disabled}
            busy={inFlight === 'color'}
            error={errorFor('color')}
            onApply={onApply}
          />
          <ColorField
            kind="backgroundColor"
            label="Background"
            initial={selection.initial.background}
            disabled={disabled}
            busy={inFlight === 'backgroundColor'}
            error={errorFor('backgroundColor')}
            onApply={onApply}
          />
          <SizeField
            initial={selection.initial.fontSize}
            disabled={disabled}
            busy={inFlight === 'fontSize'}
            error={errorFor('fontSize')}
            onApply={onApply}
          />
        </>
      )}
    </div>
  )
}

// A checkerboard for "no colour" (transparent, or not a colour the picker can
// show). It reads in both themes.
const NONE_SWATCH: React.CSSProperties = {
  backgroundImage: 'repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%)',
  backgroundSize: '8px 8px',
}

function ColorField({
  kind,
  label,
  initial,
  disabled,
  busy,
  error,
  onApply,
}: {
  kind: 'color' | 'backgroundColor'
  label: string
  initial: string
  disabled: boolean
  busy: boolean
  error: string | undefined
  onApply: (kind: ElementEditKind, value: string) => void
}) {
  const [value, setValue] = useState(initial)
  const id = `element-${kind}`
  // The swatch previews the typed value (hex or rgb()/rgba()), or "none". The
  // server's grammar is the authority on what is accepted.
  const hex = cssColorToHex(value)
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <span
          className="relative flex h-9 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-light-border dark:border-dark-border focus-within:ring-2 focus-within:ring-primary/50 dark:focus-within:ring-primary-light/50"
          style={hex ? { backgroundColor: hex } : NONE_SWATCH}
        >
          {!hex && (
            <span aria-hidden className="font-mono text-[9px] font-semibold text-slate-600">
              none
            </span>
          )}
          <input
            type="color"
            aria-label={`${label} picker${hex ? '' : ' (currently none)'}`}
            value={hex ?? '#000000'}
            onChange={(e) => setValue(e.target.value)}
            disabled={disabled}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
        </span>
        <div className="min-w-0 flex-1">
          <GlassInput
            id={id}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={hex ? '#0284c7 or rgb(2, 132, 199)' : 'none'}
            spellCheck={false}
            disabled={disabled}
            className="font-mono"
          />
        </div>
      </div>
      <FieldError message={error} />
      <ApplyButton
        focusId={`apply-${kind}`}
        label={`Apply ${label.toLowerCase()}`}
        busy={busy}
        disabled={disabled || !value.trim()}
        onClick={() => onApply(kind, value)}
      />
    </div>
  )
}

function SizeField({
  initial,
  disabled,
  busy,
  error,
  onApply,
}: {
  initial: string
  disabled: boolean
  busy: boolean
  error: string | undefined
  onApply: (kind: ElementEditKind, value: string) => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="element-fontSize" className={LABEL}>
        Font size
      </label>
      <GlassInput
        id="element-fontSize"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="48px"
        spellCheck={false}
        disabled={disabled}
        aria-describedby="element-fontSize-hint"
        className="font-mono"
      />
      <p id="element-fontSize-hint" className={MUTED}>
        px, pt, em, rem or %
      </p>
      <FieldError message={error} />
      <ApplyButton
        focusId="apply-fontSize"
        label="Apply font size"
        busy={busy}
        disabled={disabled || !value.trim()}
        onClick={() => onApply('fontSize', value)}
      />
    </div>
  )
}

function ApplyButton({
  focusId,
  label,
  busy,
  disabled,
  onClick,
}: {
  focusId: string
  label: string
  busy: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <Button
      variant="secondary"
      size="sm"
      className="self-start"
      onClick={onClick}
      disabled={disabled}
      data-focus-id={focusId}
      aria-busy={busy || undefined}
    >
      {busy && <Loader2 size={12} className="animate-spin" aria-hidden />}
      {label}
    </Button>
  )
}

function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null
  return (
    <p role="alert" className="text-xs text-red-600 dark:text-red-400">
      {message}
    </p>
  )
}
