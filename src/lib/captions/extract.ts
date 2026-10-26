// Extracts the caption fields out of a model's raw caption reply (012 FR-08).
//
// The prompt asks for exactly one JSON object and nothing else, but a prompt
// rule is not an invariant (the extractHtmlDocument lesson): replies arrive
// with chat preambles, code fences, trailing sign-offs and literal newlines
// inside long string values. So the object is cut out here and each field is
// validated on its own, never trusted to arrive clean. Anything ambiguous fails
// closed: two caption-shaped objects (a brief echoing planted JSON next to the
// real answer) or a key nobody asked for rejects the whole reply.
//
// Pure — no I/O. The text around the object is returned as `discarded` for the
// caller to log; this module never logs.

import { CAPTION_CHANNELS, captionLength, captionSpec, type CaptionTarget } from '@/lib/channels'
import { validateHeadline } from '@/lib/captions/headline'

export type FieldResult = { ok: true; text: string } | { ok: false; reason: string }

export type ExtractResult =
  | { ok: true; fields: Partial<Record<CaptionTarget, FieldResult>>; discarded: string }
  | { ok: false; reason: 'no-object' | 'multiple-objects' | 'unknown-keys'; discarded: string }

const HEADLINE_KEY = 'headline'

// Every key a caption object can carry. A parsed object with none of them is
// not a caption candidate (e.g. a `{"note": 1}` in the preamble) and is ignored.
const CAPTION_KEYS = new Set<string>([HEADLINE_KEY, ...CAPTION_CHANNELS.map((s) => s.jsonKey)])

// The JSON keys a set of targets asks for, in reply order: the headline first,
// then the channels in registry order. The prompt lists exactly these.
export function captionReplyKeys(targets: readonly CaptionTarget[]): string[] {
  const keys = targets.includes('HEADLINE') ? [HEADLINE_KEY] : []
  for (const spec of CAPTION_CHANNELS) {
    if (targets.includes(spec.channel)) keys.push(spec.jsonKey)
  }
  return keys
}

interface Span {
  start: number // index of `{` in raw
  end: number // index just past the matching `}` in raw
  json: string // the span with raw control characters inside strings escaped
}

const CONTROL_ESCAPES: Record<string, string> = { '\n': '\\n', '\r': '\\r', '\t': '\\t' }

// Every balanced top-level `{…}` span. String-aware inside a span, so braces in
// a value don't count; prose outside a span is not, because prose quotes and
// apostrophes don't pair. An unclosed span (a truncated reply) yields nothing.
function scanSpans(raw: string): Span[] {
  const spans: Span[] = []
  let depth = 0
  let inString = false
  let escape = false
  let start = 0
  let json = ''

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (depth === 0) {
      if (ch === '{') {
        depth = 1
        start = i
        json = ch
      }
      continue
    }
    if (inString) {
      if (escape) {
        escape = false
        json += ch
      } else if (ch === '\\') {
        escape = true
        json += ch
      } else if (ch === '"') {
        inString = false
        json += ch
      } else {
        json += CONTROL_ESCAPES[ch] ?? ch
      }
      continue
    }
    json += ch
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) spans.push({ start, end: i + 1, json })
  }
  return spans
}

function parseCandidate(json: string): Record<string, unknown> | null {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const obj = value as Record<string, unknown>
  return Object.keys(obj).some((k) => CAPTION_KEYS.has(k)) ? obj : null
}

const count = (n: number) => n.toLocaleString('en-US')

function captionField(target: Exclude<CaptionTarget, 'HEADLINE'>, value: unknown): FieldResult {
  if (typeof value !== 'string') return { ok: false, reason: 'not-a-string' }
  const spec = captionSpec(target)
  // Trim last, so a value that normalises to nothing (`**`) is caught as empty.
  const text = spec.normalise(value.replaceAll('\r\n', '\n')).trim()
  if (!text) return { ok: false, reason: 'empty' }
  const length = captionLength(text)
  if (spec.hardLimit !== null && length > spec.hardLimit) {
    return { ok: false, reason: `over-limit (${count(length)} / ${count(spec.hardLimit)})` }
  }
  return { ok: true, text }
}

export function extractCaptionReply(raw: string, targets: readonly CaptionTarget[]): ExtractResult {
  const candidates = scanSpans(raw).flatMap((span) => {
    const obj = parseCandidate(span.json)
    return obj ? [{ span, obj }] : []
  })

  if (candidates.length === 0) return { ok: false, reason: 'no-object', discarded: raw.trim() }
  if (candidates.length > 1) return { ok: false, reason: 'multiple-objects', discarded: raw.trim() }

  const { span, obj } = candidates[0]
  const requested = new Set(captionReplyKeys(targets))
  if (Object.keys(obj).some((k) => !requested.has(k))) {
    return { ok: false, reason: 'unknown-keys', discarded: raw.trim() }
  }

  const fields: Partial<Record<CaptionTarget, FieldResult>> = {}
  for (const target of targets) {
    const key = target === 'HEADLINE' ? HEADLINE_KEY : captionSpec(target).jsonKey
    if (!Object.hasOwn(obj, key)) {
      fields[target] = { ok: false, reason: 'missing' }
    } else if (target === 'HEADLINE') {
      const value = obj[key]
      fields[target] =
        typeof value === 'string' ? validateHeadline(value) : { ok: false, reason: 'not-a-string' }
    } else {
      fields[target] = captionField(target, obj[key])
    }
  }

  const discarded = `${raw.slice(0, span.start)}\n${raw.slice(span.end)}`.trim()
  return { ok: true, fields, discarded }
}
