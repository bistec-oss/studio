// 031 FR-49 / AC-44: the OP-031 pass rule (the 028 rule: the first two counted attempts both kept
// and accepted), the cap of four ledger lines, and the runner's slot-set guard. Pure, no network.
import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as lc from '../../scripts/look-check/lookCheck.mjs'

const SLOT = 'spotlight@2:SQUARE'
const r = (attempt: number, over: Record<string, unknown> = {}) => ({
  slot: SLOT, attempt, styleKept: true, accepted: null, render: `r${attempt}.png`, ...over,
})
const ledger = (n: number) => Array.from({ length: n }, (_, i) => ({ slot: SLOT, attempt: i + 1 }))

describe('OP-031 constants', () => {
  it('one slot, a cap of 4 and 2 counted attempts', () => {
    expect(lc.OP031_SLOTS).toEqual([SLOT])
    expect(lc.OP031_CAP).toBe(4)
    expect(lc.OP031_COUNTED).toBe(2)
    expect(lc.parseVersionedSlot(SLOT)).toEqual({ key: 'spotlight', version: 2, size: 'SQUARE' })
    expect(lc.parseVersionedSlot('spotlight:SQUARE')).toBeNull()
  })
})

describe('op031Verdict (AC-44)', () => {
  it('passes on two kept and accepted attempts', () => {
    expect(lc.op031Verdict([r(1, { accepted: true }), r(2, { accepted: true })])).toEqual({ passed: true, status: 'pass', counted: 2 })
  })
  it('is pending with no result, one accepted, or a kept render awaiting the verdict', () => {
    expect(lc.op031Verdict([]).status).toBe('pending')
    expect(lc.op031Verdict([r(1, { accepted: true })]).status).toBe('pending')
    expect(lc.op031Verdict([r(1, { accepted: true }), r(2)]).status).toBe('pending')
  })
  it('fails on a fallback among the first two counted', () => {
    expect(lc.op031Verdict([r(1, { styleKept: false, fallbackReason: 'busy', accepted: null })]).status).toBe('fail')
    expect(lc.op031Verdict([r(1, { accepted: true }), r(2, { styleKept: false, fallbackReason: 'busy' })]).status).toBe('fail')
  })
  it('fails on a reject among the first two counted', () => {
    expect(lc.op031Verdict([r(1, { accepted: false })]).status).toBe('fail')
    expect(lc.op031Verdict([r(1, { accepted: true }), r(2, { accepted: false })]).status).toBe('fail')
  })
  it('an infra attempt is not counted: it neither passes nor fails, and the next two decide', () => {
    const infra = r(1, { styleKept: false, render: null, error: 'probe 502', infra: true })
    expect(lc.op031Verdict([infra]).counted).toBe(0)
    expect(lc.op031Verdict([infra, r(2, { accepted: true }), r(3, { accepted: true })]).status).toBe('pass')
    expect(lc.op031Verdict([infra, r(2, { styleKept: false, fallbackReason: 'busy' })]).status).toBe('fail')
  })
  it('only the first two counted attempts decide: a later fallback cannot undo a pass', () => {
    const rows = [r(1, { accepted: true }), r(2, { accepted: true }), r(3, { styleKept: false })]
    expect(lc.op031Verdict(rows).status).toBe('pass')
  })
  it('a re-recorded attempt replaces the earlier row, and a recheck overrides the live styleKept', () => {
    expect(lc.op031Verdict([r(1, { accepted: false }), r(1, { accepted: true }), r(2, { accepted: true })]).status).toBe('pass')
    expect(lc.op031Verdict([r(1, { accepted: true, recheck: { styleKept: false } })]).status).toBe('fail')
  })
  it('ignores rows of another slot', () => {
    expect(lc.op031Verdict([{ slot: 'spotlight:SQUARE', attempt: 1, styleKept: false }]).status).toBe('pending')
  })
})

describe('planNextOp031 (the cap)', () => {
  it('runs the first attempt on an empty ledger, numbered by ledger lines', () => {
    expect(lc.planNextOp031([], [])).toEqual({ ok: true, attempt: 1 })
    expect(lc.planNextOp031(ledger(1), [r(1, { styleKept: false, render: null, infra: true })])).toEqual({ ok: true, attempt: 2 })
  })
  it('refuses a fifth ledger line, even with no verdict yet', () => {
    expect(lc.planNextOp031(ledger(4), [])).toEqual({ ok: false, reason: 'cap' })
    expect(lc.planNextOp031(ledger(5), [])).toEqual({ ok: false, reason: 'cap' })
  })
  it('an infra attempt still uses a ledger line, so four infra errors end the check undecided', () => {
    const infra = (n: number) => r(n, { styleKept: false, render: null, infra: true })
    expect(lc.planNextOp031(ledger(3), [infra(1), infra(2), infra(3)])).toEqual({ ok: true, attempt: 4 })
    expect(lc.planNextOp031(ledger(4), [infra(1), infra(2), infra(3), infra(4)])).toEqual({ ok: false, reason: 'cap' })
    expect(lc.op031Verdict([infra(1), infra(2), infra(3), infra(4)]).status).toBe('pending')
  })
  it('refuses once decided, and while a kept render awaits the user', () => {
    expect(lc.planNextOp031(ledger(2), [r(1, { accepted: true }), r(2, { accepted: true })]).reason).toBe('already-passed')
    expect(lc.planNextOp031(ledger(1), [r(1, { styleKept: false })]).reason).toBe('decided-fail')
    expect(lc.planNextOp031(ledger(1), [r(1)]).reason).toBe('awaiting-verdict')
  })
})

describe('the runner (no network: --dry-run and a refused --out)', () => {
  const run = (out: string, extra: string[] = ['--dry-run']) =>
    spawnSync(process.execPath, ['scripts/look-check/run-look-check.mjs', '--probe', '--slot-set', 'op031', '--out', out, ...extra], { encoding: 'utf8' })
  const dir = () => mkdtempSync(join(tmpdir(), 'op031-'))

  it('--dry-run shows the slot, version 2 and the cap of 4, and reaches no network', () => {
    const text = execFileSync(process.execPath, ['scripts/look-check/run-look-check.mjs', '--probe', '--slot-set', 'op031', '--out', dir(), '--dry-run'], { encoding: 'utf8' })
    expect(text).toContain('of cap 4')
    expect(text).toContain('slots: spotlight@2:SQUARE')
    expect(text).toContain('contract version 2')
    expect(text).toContain('spotlight@2:SQUARE: would run attempt 1')
  })
  it('refuses an --out whose ledger holds slots of another slot set', () => {
    const out = dir()
    writeFileSync(join(out, 'ledger.jsonl'), JSON.stringify({ slot: 'device-screen:SQUARE', attempt: 1 }) + '\n')
    const res = run(out)
    expect(res.status).toBe(1)
    expect(res.stderr).toContain('another slot set')
  })
  it('a full ledger refuses the fifth line', () => {
    const out = dir()
    writeFileSync(join(out, 'ledger.jsonl'), ledger(4).map((e) => JSON.stringify(e)).join('\n') + '\n')
    expect(run(out).stdout).toContain('spotlight@2:SQUARE: refused: cap')
  })
  it('--slot-set is only for --probe and only "op031"', () => {
    expect(spawnSync(process.execPath, ['scripts/look-check/run-look-check.mjs', '--slot-set', 'op031', '--out', dir(), '--dry-run'], { encoding: 'utf8' }).status).toBe(1)
    expect(spawnSync(process.execPath, ['scripts/look-check/run-look-check.mjs', '--probe', '--slot-set', 'nope', '--out', dir(), '--dry-run'], { encoding: 'utf8' }).status).toBe(1)
  })
})
