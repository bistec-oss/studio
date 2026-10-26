import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as lc from '../../scripts/look-check/lookCheck.mjs'
import {
  SLOTS, capFor, parseLedger, attemptsFor, lastResult, slotPassed, planNext,
  totalLine, checkBase, parseVerdictArg,
} from '../../scripts/look-check/lookCheck.mjs'

type Verdicts = Record<string, { passed: boolean; slots: Record<string, string> }>
const verdicts = (r: unknown[]) => lc.lookVerdicts(r) as Verdicts
const cap = capFor(SLOTS)
const S = 'spotlight:SQUARE'
const line = (slot: string, attempt = 1) => JSON.stringify({ at: 't', runId: 'r', slot, attempt })
const res = (slot: string, over: Record<string, unknown> = {}) => ({
  slot, styleKept: true, accepted: null, error: null, ...over,
})

describe('look-check runner logic (AC-15)', () => {
  it('has 8 slots and a computed cap of 16', () => {
    expect(SLOTS).toHaveLength(8)
    expect(cap).toBe(16)
    expect(capFor([1, 2, 3])).toBe(6)
  })

  it('counts a ledger line with no result as an attempt', () => {
    const entries = parseLedger(line(S) + '\n')
    expect(attemptsFor(entries, S)).toBe(1)
    expect(planNext(entries, [], S, cap)).toEqual({ ok: true, attempt: 2 })
  })

  it('counts a result with error once (ledger line plus result is one attempt)', () => {
    const entries = parseLedger(line(S) + '\n')
    const results = [res(S, { styleKept: false, error: 'timeout' })]
    expect(attemptsFor(entries, S)).toBe(1)
    expect(planNext(entries, results, S, cap)).toEqual({ ok: true, attempt: 2 })
  })

  it('counts a malformed ledger line as an attempt and never drops it', () => {
    const entries = parseLedger(line('a:SQUARE') + '\n{"slot":"spotlight:SQUARE", broken\nnot json at all\n')
    expect(entries).toHaveLength(3)
    expect(attemptsFor(entries, S)).toBe(1)
    expect(entries.filter((e: { malformed?: boolean }) => e.malformed)).toHaveLength(2)
  })

  it('refuses at the cap, whichever slot', () => {
    const text = Array.from({ length: cap }, (_, i) => line(SLOTS[i % 8].slot)).join('\n')
    expect(planNext(parseLedger(text), [], 'spotlight:STORY', cap)).toEqual({ ok: false, reason: 'cap' })
  })

  it('refuses a third attempt on a slot', () => {
    const entries = parseLedger([line(S, 1), line(S, 2)].join('\n'))
    const results = [res(S, { styleKept: false })]
    expect(planNext(entries, results, S, cap)).toEqual({ ok: false, reason: 'max-attempts' })
  })

  it('refuses a re-run of a passed slot', () => {
    const entries = parseLedger(line(S))
    expect(planNext(entries, [res(S, { accepted: true })], S, cap)).toEqual({ ok: false, reason: 'already-passed' })
  })

  it('refuses a re-run of a slot with no verdict yet', () => {
    const entries = parseLedger(line(S))
    expect(planNext(entries, [res(S)], S, cap)).toEqual({ ok: false, reason: 'awaiting-verdict' })
  })

  it('allows one re-run of a failed slot (fallback, or rejected)', () => {
    const entries = parseLedger(line(S))
    expect(planNext(entries, [res(S, { styleKept: false })], S, cap)).toEqual({ ok: true, attempt: 2 })
    expect(planNext(entries, [res(S, { accepted: false })], S, cap)).toEqual({ ok: true, attempt: 2 })
  })

  it('allows a first run with an empty ledger', () => {
    expect(planNext([], [], S, cap)).toEqual({ ok: true, attempt: 1 })
  })

  it('prints the running total', () => {
    expect(totalLine(3, 16)).toBe('[look-check] call 3 of 16')
  })

  it('guards the base URL', () => {
    expect(checkBase('http://localhost:3002').ok).toBe(true)
    expect(checkBase('http://127.0.0.1:3002').ok).toBe(true)
    expect(checkBase('https://localhost:3002').ok).toBe(false)
    expect(checkBase('http://studio.bistecglobal.com').ok).toBe(false)
    expect(checkBase('http://localhost.evil.com').ok).toBe(false)
    expect(checkBase('not a url').ok).toBe(false)
    expect(checkBase(undefined).ok).toBe(false)
  })

  it('parses the --verdict argument', () => {
    expect(parseVerdictArg('spotlight:SQUARE=accept')).toEqual({ slot: S, accepted: true })
    expect(parseVerdictArg('spotlight:SQUARE=reject')).toEqual({ slot: S, accepted: false })
    expect(parseVerdictArg('spotlight:SQUARE=maybe')).toBeNull()
    expect(parseVerdictArg('spotlight:SQUARE')).toBeNull()
  })

  it('finds the last result per slot', () => {
    const r = [res(S, { attempt: 1 }), res('x', {}), res(S, { attempt: 2 })]
    expect(lastResult(r, S)).toMatchObject({ attempt: 2 })
    expect(lastResult(r, 'none')).toBeUndefined()
  })

  it('keeps the pure module free of fs, network and prisma imports', () => {
    const src = readFileSync('scripts/look-check/lookCheck.mjs', 'utf8').replace(/^\s*\/\/.*$/gm, '')
    expect(src).not.toMatch(/\bimport\b/)
    expect(src).not.toMatch(/fetch\(|prisma|node:fs/)
  })

  it('has no credentials in the runner source and appends the ledger before the request', () => {
    const src = readFileSync('scripts/look-check/run-look-check.mjs', 'utf8')
    expect(src).not.toMatch(/BistecStudio2026|adminBTG/)
    expect(src.indexOf('appendFileSync(ledgerPath')).toBeGreaterThan(-1)
    expect(src.indexOf('appendFileSync(ledgerPath')).toBeLessThan(src.indexOf('await generate('))
  })
})

describe('look-check pass rule (AC-16)', () => {
  const all = (key: string, over: Record<string, unknown> = {}) =>
    SLOTS.filter((s: { key: string }) => s.key === key).map((s: { slot: string }) => res(s.slot, { accepted: true, ...over }))

  it('passes a look only when every slot kept its style and is accepted', () => {
    const v = verdicts(all('spotlight'))
    expect(v.spotlight.passed).toBe(true)
    expect(Object.values(v.spotlight.slots)).toEqual(['pass', 'pass', 'pass'])
  })

  it('fails a look with a pending verdict', () => {
    const r = all('spotlight')
    r[1] = res('spotlight:PORTRAIT')
    const v = verdicts(r)
    expect(v.spotlight.passed).toBe(false)
    expect(v.spotlight.slots['spotlight:PORTRAIT']).toBe('pending')
  })

  it('fails a look with a fallback, a rejection or a slot not run', () => {
    const r = all('spotlight')
    r[0] = res('spotlight:SQUARE', { styleKept: false, accepted: true })
    expect(verdicts(r).spotlight.slots['spotlight:SQUARE']).toBe('fail')
    r[0] = res('spotlight:SQUARE', { accepted: false })
    expect(verdicts(r).spotlight.passed).toBe(false)
    expect(verdicts(r.slice(1)).spotlight.slots['spotlight:SQUARE']).toBe('not-run')
  })

  it('counts only the last result per slot (a failed re-run fails, a good re-run passes)', () => {
    const base = all('spotlight')
    const failedRerun = [...base, res('spotlight:SQUARE', { error: 'timeout', styleKept: false })]
    expect(verdicts(failedRerun).spotlight.passed).toBe(false)
    const goodRerun = [res('spotlight:SQUARE', { styleKept: false }), ...base]
    expect(verdicts(goodRerun).spotlight.passed).toBe(true)
  })

  it('judges each look on its own slots', () => {
    const v = verdicts(all('spotlight'))
    expect(v['full-bleed-scene'].passed).toBe(false)
    expect(slotPassed(res(S, { accepted: true }))).toBe(true)
    expect(slotPassed(res(S))).toBe(false)
  })
})

// ---- 025 probe mode (AC-07) ----
const P = 'device-screen:SQUARE'
type PV = Record<string, { passed: boolean; status: string; accepted: number }>
const pv = (r: unknown[]) => lc.probeVerdicts(r) as PV
const pres = (attempt: number, over: Record<string, unknown> = {}) => ({
  slot: P, attempt, styleKept: true, accepted: null, ...over,
})

describe('look-check probe mode (025 AC-07)', () => {
  it('keeps the 028 slots and cap, and the default per-slot maximum of 2', () => {
    expect(SLOTS).toHaveLength(8)
    expect(capFor(SLOTS)).toBe(16)
    expect(capFor(SLOTS, 2)).toBe(16)
    expect(lc.MAX_ATTEMPTS_PER_SLOT).toBe(2)
  })

  it('has three device-screen slots and a computed cap of 9', () => {
    expect(lc.PROBE_SLOTS).toEqual(['device-screen:SQUARE', 'device-screen:PORTRAIT', 'device-screen:STORY'])
    expect(capFor(lc.PROBE_SLOTS, 3)).toBe(9)
    expect(capFor(lc.PROBE_SLOTS, lc.PROBE_MAX_ATTEMPTS_PER_SLOT)).toBe(9)
  })

  it('writes a ledger line with mode, threshold and promptHash', () => {
    const l = lc.probeLedgerLine({ at: 't', runId: 'r', slot: P, attempt: 1 })
    expect(Object.keys(l)).toEqual(['at', 'runId', 'slot', 'attempt', 'mode', 'threshold', 'promptHash'])
    expect(l.mode).toBe('probe')
    expect(lc.probeLedgerLine({ at: 't', runId: 'r', slot: P, attempt: 2, threshold: 0.04, promptHash: 'abc' })).toMatchObject({
      threshold: 0.04, promptHash: 'abc',
    })
  })

  it('passes a slot with two attempts that each kept the look and were accepted', () => {
    const v = pv([pres(1, { accepted: true }), pres(2, { accepted: true })])
    expect(v[P]).toMatchObject({ passed: true, status: 'pass', accepted: 2 })
  })

  it('does not pass on one accepted attempt, a rejection, a fallback or a pending verdict', () => {
    expect(pv([pres(1, { accepted: true })])[P].passed).toBe(false)
    expect(pv([pres(1, { accepted: true }), pres(2, { accepted: false })])[P].status).toBe('fail')
    expect(pv([pres(1, { accepted: true }), pres(2, { styleKept: false, accepted: true })])[P].passed).toBe(false)
    expect(pv([pres(1, { accepted: true }), pres(2)])[P].status).toBe('pending')
    expect(pv([])[P]).toMatchObject({ passed: false, status: 'fail' })
  })

  it('025 A1: a recheck replaces the response styleKept: a re-judged keep counts, a re-judged fallback does not', () => {
    const kept = { styleKept: true, fallbackReason: null, rect: { x: 18, y: 40, w: 63, h: 38 } }
    const fell = { styleKept: false, fallbackReason: 'composite-not-blank', rect: null }
    // An attempt the live check failed (styleKept false) but the shipped detector keeps.
    const rejudged = pv([pres(1, { styleKept: false, recheck: kept, accepted: true }), pres(2, { styleKept: false, recheck: kept, accepted: true })])
    expect(rejudged[P]).toMatchObject({ passed: true, status: 'pass', accepted: 2 })
    // The reverse: the live check kept it, the recheck says no.
    expect(pv([pres(1, { recheck: fell, accepted: true }), pres(2, { accepted: true })])[P].passed).toBe(false)
    // A re-judged keep waits for a verdict; a re-judged fallback does not.
    expect(pv([pres(1, { styleKept: false, recheck: kept })])[P].status).toBe('pending')
    expect(pv([pres(1, { recheck: fell })])[P].status).toBe('fail')
    // No recheck: the response's own styleKept stands (unchanged behaviour).
    expect(pv([pres(1, { accepted: true }), pres(2, { accepted: true })])[P].passed).toBe(true)
  })

  it('025 A1: planNextProbe reads the recheck too (a re-judged keep awaits its verdict)', () => {
    const cap9 = capFor(lc.PROBE_SLOTS, 3)
    const e = parseLedger(line(P, 1))
    const kept = { styleKept: true, fallbackReason: null, rect: { x: 18, y: 40, w: 63, h: 38 } }
    expect(lc.planNextProbe(e, [pres(1, { styleKept: false, recheck: kept })], P, cap9)).toEqual({ ok: false, reason: 'awaiting-verdict' })
    expect(lc.planNextProbe(e, [pres(1, { styleKept: false })], P, cap9)).toEqual({ ok: true, attempt: 2 })
  })

  it('025 A1: --probe --recheck is wired to the tsx entry, and the entry file exists', () => {
    const runner = readFileSync('scripts/look-check/run-look-check.mjs', 'utf8')
    expect(runner).toContain("'--recheck'")
    expect(runner).toContain('scripts/look-check/recheck.ts')
    expect(readFileSync('scripts/look-check/recheck.ts', 'utf8')).toContain('runHeroCheck')
  })

  it('025 A1: a live probe result records the detected rect from the response', () => {
    const runner = readFileSync('scripts/look-check/run-look-check.mjs', 'utf8')
    expect(runner).toContain('rect: null, render: null')
    expect(runner).toContain('result.rect = r.body.rect ?? null')
  })

  it('counts the latest result per attempt number', () => {
    const v = pv([pres(1, { accepted: false }), pres(1, { accepted: true }), pres(2, { accepted: true })])
    expect(v[P].passed).toBe(true)
  })

  it('plans up to three attempts and refuses a fourth, at the cap, or after a pass', () => {
    const cap9 = capFor(lc.PROBE_SLOTS, 3)
    const e = (n: number) => parseLedger(Array.from({ length: n }, (_, i) => line(P, i + 1)).join('\n'))
    expect(lc.planNextProbe(e(0), [], P, cap9)).toEqual({ ok: true, attempt: 1 })
    expect(lc.planNextProbe(e(1), [pres(1, { accepted: true })], P, cap9)).toEqual({ ok: true, attempt: 2 })
    expect(lc.planNextProbe(e(3), [pres(1, { accepted: true }), pres(2, { accepted: false }), pres(3, { accepted: true })], P, cap9))
      .toEqual({ ok: false, reason: 'max-attempts' })
    expect(lc.planNextProbe(e(2), [pres(1, { accepted: true }), pres(2, { accepted: true })], P, cap9))
      .toEqual({ ok: false, reason: 'already-passed' })
    expect(lc.planNextProbe(e(1), [pres(1)], P, cap9)).toEqual({ ok: false, reason: 'awaiting-verdict' })
    expect(lc.planNextProbe(e(2), [pres(1, { accepted: false }), pres(2, { accepted: false })], P, cap9))
      .toEqual({ ok: false, reason: 'cannot-pass' })
    const full = parseLedger(Array.from({ length: 9 }, (_, i) => line(lc.PROBE_SLOTS[i % 3], 1)).join('\n'))
    expect(lc.planNextProbe(full, [], 'device-screen:STORY', cap9)).toEqual({ ok: false, reason: 'cap' })
  })

  it('parses the per-attempt verdict argument', () => {
    expect(lc.parseProbeVerdictArg('device-screen:SQUARE#2=accept')).toEqual({ slot: P, attempt: 2, accepted: true })
    expect(lc.parseProbeVerdictArg('device-screen:SQUARE#1=reject')).toEqual({ slot: P, attempt: 1, accepted: false })
    expect(lc.parseProbeVerdictArg('device-screen:SQUARE=accept')).toBeNull()
    expect(lc.parseProbeVerdictArg('device-screen:SQUARE#x=accept')).toBeNull()
  })

  it('--probe --dry-run lists three slots, a cap of 9 and the ledger line shape, and sends nothing', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'probe-dry-')), 'out')
    const text = execFileSync(
      process.execPath,
      ['scripts/look-check/run-look-check.mjs', '--probe', '--out', out, '--dry-run'],
      { encoding: 'utf8' },
    )
    expect(text).toContain('of cap 9')
    for (const s of lc.PROBE_SLOTS) expect(text).toContain(`${s}: would run attempt 1`)
    expect(text).toContain('"threshold":null')
    expect(text).toContain('"promptHash":null')
    expect(text).toContain('"mode":"probe"')
  })
})

describe('031 OP-031 additions (the full rule is in op031Verdict.test.ts)', () => {
  it('the OP-031 slot set is its own: one versioned slot, not in the 028 or 025 sets, with its own cap', () => {
    expect(lc.OP031_SLOTS).toEqual(['spotlight@2:SQUARE'])
    for (const s of lc.OP031_SLOTS) {
      expect(SLOTS.map((x) => x.slot)).not.toContain(s)
      expect(lc.PROBE_SLOTS).not.toContain(s)
    }
    expect(lc.OP031_CAP).toBe(4)
    expect(lc.ledgerFitsOp031([{ slot: 'spotlight@2:SQUARE' }])).toBe(true)
    expect(lc.ledgerFitsOp031([{ slot: 'spotlight:SQUARE' }])).toBe(false)
    expect(lc.ledgerFitsOp031([{ malformed: true, slot: null }])).toBe(false)
    expect(lc.ledgerFitsOp031([])).toBe(true)
  })
})
