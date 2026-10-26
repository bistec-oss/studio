// 031 T15 (AC-40, FR-36): every APPLY_FAILURES / APPLY_FIELDS / APPLY_METHODS
// value must be carryable by the event, and 'apply' by headline_edited.via.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DraftAction } from '@prisma/client'
import { CATALOGUE } from '@/lib/analytics/catalogue'
import { APPLY_FAILURES, APPLY_FIELDS, APPLY_METHODS } from '@/lib/applyText/vocab'
import { applyFailureNotice } from '@/lib/applyText/noticeText'

const schema = CATALOGUE['draft.text_applied'].schema

describe('draft.text_applied coverage', () => {
  it('carries every failure value', () => {
    for (const failure of APPLY_FAILURES) {
      expect(schema.safeParse({ field: 'headline', method: 'splice', failure }).success, failure).toBe(true)
    }
  })
  it('carries every field and method, with no failure on success', () => {
    for (const field of APPLY_FIELDS) {
      for (const method of APPLY_METHODS) {
        expect(schema.safeParse({ field, method }).success).toBe(true)
      }
    }
  })
  it('rejects a value outside the vocabularies, and strips stray text', () => {
    expect(schema.safeParse({ field: 'headline', method: 'splice', failure: 'nope' }).success).toBe(false)
    const parsed = schema.parse({ field: 'headline', method: 'splice', text: 'Secret headline' })
    expect(JSON.stringify(parsed)).not.toContain('Secret')
  })
  it('has the ok and failed outcomes, from the web source only', () => {
    expect(CATALOGUE['draft.text_applied'].outcomes).toEqual(['ok', 'failed'])
    expect(CATALOGUE['draft.text_applied'].source).toEqual(['web'])
  })
  it("headline_edited accepts via 'apply' with the schemaVersion unchanged", () => {
    const ok = CATALOGUE['draft.headline_edited'].schema.safeParse({
      via: 'apply',
      state: 'fresh',
      scheduledPending: false,
    })
    expect(ok.success).toBe(true)
    expect(CATALOGUE['draft.headline_edited'].schemaVersion).toBe(1)
  })
  it('the draft action APPLY_TEXT is carried by the settled and swept events', () => {
    expect(Object.values(DraftAction)).toContain('APPLY_TEXT')
    expect(CATALOGUE['draft_action.settled'].schema.safeParse({ action: 'APPLY_TEXT' }).success).toBe(true)
    expect(CATALOGUE['draft_action.swept'].schema.safeParse({ action: 'APPLY_TEXT' }).success).toBe(true)
  })
  it('imports the vocabularies instead of copying them', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/analytics/catalogue.ts'), 'utf8')
    expect(src).toContain("from '@/lib/applyText/vocab'")
    // 'conflict' is also a draft-action outcome, so it may be quoted for that reason.
    for (const f of APPLY_FAILURES.filter((x) => x !== 'conflict')) expect(src.includes(`'${f}'`), f).toBe(false)
  })
  it('every failure has a sentence', () => {
    for (const f of APPLY_FAILURES) expect(applyFailureNotice(f).length, f).toBeGreaterThan(10)
  })
})
