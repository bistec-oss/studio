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
import { Input, fieldClasses, fieldEdge, fieldErrorClasses } from '@/components/ui/Input'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { Notice } from '@/components/ui/Notice'
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

const MUTED = 'text-ui-xs text-fg-muted'

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
      className="surface flex flex-col gap-4 overflow-y-auto p-4"
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
      <MousePointerClick size={18} strokeWidth={1.4} className="text-fg-muted" aria-hidden />
      <p className="text-ui-lg font-medium text-fg">Select an element</p>
      <p className={MUTED}>
        Click any part of the design to change its text, color or size. Each change saves as a new
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
    <Notice tone="warning" role="alert" className="flex flex-col gap-2 text-ui-xs">
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
    </Notice>
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
            className="flex min-w-0 items-center gap-2 text-ui-lg font-medium text-fg focus:outline-none"
          >
            Selected
            <span
              data-testid="element-tag"
              className="rounded-ui-sm border border-line px-2 py-0.5 font-mono text-ui-xs font-normal text-fg"
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
          <FieldLabel htmlFor="element-text">Text</FieldLabel>
          <textarea
            id="element-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            disabled={disabled}
            className={`${fieldClasses} ${fieldEdge()} resize-y text-ui-sm`}
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
            label="Text color"
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
// show), drawn in the theme's own paper and rule colours, so it reads in both.
const NONE_SWATCH: React.CSSProperties = {
  backgroundImage: 'repeating-conic-gradient(rgb(var(--line-subtle)) 0% 25%, rgb(var(--surface-2)) 0% 50%)',
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
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <span
          className="relative flex h-control-md w-10 shrink-0 items-center justify-center overflow-hidden rounded-ui-sm border border-line focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus"
          style={hex ? { backgroundColor: hex } : NONE_SWATCH}
        >
          {!hex && (
            <span aria-hidden className="text-ui-2xs font-semibold text-fg">
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
          <Input
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
      <FieldLabel htmlFor="element-fontSize">Font size</FieldLabel>
      <Input
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
    <p role="alert" className={fieldErrorClasses}>
      {message}
    </p>
  )
}
