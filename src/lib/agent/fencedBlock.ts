// One extractor for a model's fenced JSON block (```tag ... ```). The LAST
// block wins, and the three failure reasons are told apart so a caller can
// log "no block" differently from "bad JSON" (007 FR-04). Pure.
import type { z } from 'zod'

export type FencedResult<T> =
  { ok: true; data: T } | { ok: false; reason: 'missing' | 'invalid-json' | 'schema' }

export function extractFencedJson<S extends z.ZodTypeAny>(
  text: string,
  tag: string,
  schema: S,
): FencedResult<z.output<S>> {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const fence = new RegExp('```' + escaped + '\\s*\\n([\\s\\S]*?)```', 'g')
  let match: RegExpExecArray | null = null
  for (const m of text.matchAll(fence)) match = m
  const raw = match?.[1]?.trim()
  if (!raw) return { ok: false, reason: 'missing' }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'invalid-json' }
  }
  const parsed = schema.safeParse(json)
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, reason: 'schema' }
}
