// 028 real-image check: the pure logic (no fs, no network, no prisma).
// The I/O lives in run-look-check.mjs. Design: .specclaw/changes/028-image-looks/design.md section 9.

export const SLOTS = [
  { slot: 'product-showcase:STORY', key: 'product-showcase', size: 'STORY', postStyle: 'launch' },
  { slot: 'editorial-split:STORY', key: 'editorial-split', size: 'STORY', postStyle: 'announcement' },
  { slot: 'full-bleed-scene:SQUARE', key: 'full-bleed-scene', size: 'SQUARE', postStyle: 'event' },
  { slot: 'full-bleed-scene:PORTRAIT', key: 'full-bleed-scene', size: 'PORTRAIT', postStyle: 'hiring' },
  { slot: 'full-bleed-scene:STORY', key: 'full-bleed-scene', size: 'STORY', postStyle: 'event' },
  { slot: 'spotlight:SQUARE', key: 'spotlight', size: 'SQUARE', postStyle: 'promotion' },
  { slot: 'spotlight:PORTRAIT', key: 'spotlight', size: 'PORTRAIT', postStyle: 'milestone' },
  { slot: 'spotlight:STORY', key: 'spotlight', size: 'STORY', postStyle: 'promotion' },
]

export const MAX_ATTEMPTS_PER_SLOT = 2

// The hard cap on image calls: computed, never typed.
export function capFor(slots, perSlotMax = MAX_ATTEMPTS_PER_SLOT) {
  return perSlotMax * slots.length
}

// JSONL to entries. A malformed line is an attempt too: it is kept as
// { malformed: true, slot } (slot read from the raw text when it can be) and
// counted in the total, never dropped.
export function parseLedger(text) {
  const entries = []
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    try {
      const v = JSON.parse(line)
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        entries.push(v)
        continue
      }
    } catch {
      // fall through to the malformed entry
    }
    const m = /"slot"\s*:\s*"([^"]+)"/.exec(line)
    entries.push({ malformed: true, slot: m ? m[1] : null })
  }
  return entries
}

export function attemptsFor(entries, slot) {
  return entries.filter((e) => e && e.slot === slot).length
}

export function lastResult(results, slot) {
  let found
  for (const r of results ?? []) if (r && r.slot === slot) found = r
  return found
}

export function slotPassed(result) {
  return result?.styleKept === true && result?.accepted === true
}

export function planNext(entries, results, slot, cap) {
  if (entries.length >= cap) return { ok: false, reason: 'cap' }
  const attempts = attemptsFor(entries, slot)
  if (attempts >= MAX_ATTEMPTS_PER_SLOT) return { ok: false, reason: 'max-attempts' }
  const last = lastResult(results, slot)
  if (slotPassed(last)) return { ok: false, reason: 'already-passed' }
  if (last && last.styleKept === true && (last.accepted === null || last.accepted === undefined)) {
    return { ok: false, reason: 'awaiting-verdict' }
  }
  return { ok: true, attempt: attempts + 1 }
}

function slotStatus(result) {
  if (!result) return 'not-run'
  if (slotPassed(result)) return 'pass'
  if (result.styleKept === true && (result.accepted === null || result.accepted === undefined)) return 'pending'
  return 'fail'
}

// A look passes only when every one of its slots is 'pass' (the last result per slot counts).
export function lookVerdicts(results, slots = SLOTS) {
  const out = {}
  for (const s of slots) {
    const status = slotStatus(lastResult(results, s.slot))
    const entry = (out[s.key] ??= { passed: true, slots: {} })
    entry.slots[s.slot] = status
    if (status !== 'pass') entry.passed = false
  }
  return out
}

export function totalLine(n, cap) {
  return `[look-check] call ${n} of ${cap}`
}

export function checkBase(url) {
  let u
  try {
    u = new URL(String(url))
  } catch {
    return { ok: false, error: '--base is not a valid URL' }
  }
  if (u.protocol !== 'http:') return { ok: false, error: '--base must use http' }
  if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
    return { ok: false, error: '--base must be http://localhost or http://127.0.0.1' }
  }
  return { ok: true }
}

// "spotlight:SQUARE=accept" -> { slot, accepted: true }; null when malformed.
export function parseVerdictArg(s) {
  const m = /^(.+)=(accept|reject)$/.exec(String(s ?? ''))
  if (!m) return null
  return { slot: m[1], accepted: m[2] === 'accept' }
}

// ---- 025 OP-025 probe mode ----
export const PROBE_SLOTS = ['device-screen:SQUARE', 'device-screen:PORTRAIT', 'device-screen:STORY']
export const PROBE_MAX_ATTEMPTS_PER_SLOT = 3
export const PROBE_ACCEPTS_NEEDED = 2

// The latest result per attempt number for a slot (a re-recorded attempt replaces the earlier one).
function probeResultsFor(results, slot) {
  const byAttempt = new Map()
  for (const r of results ?? []) if (r && r.slot === slot) byAttempt.set(r.attempt, r)
  return [...byAttempt.values()]
}

// An attempt re-judged offline with the shipped check (--recheck, 025 A1) counts by the recheck's
// styleKept; the response's own styleKept only stands for an attempt with no recheck.
const probeStyleKept = (r) => (r.recheck && typeof r.recheck.styleKept === 'boolean' ? r.recheck.styleKept : r.styleKept === true)
const probePending = (r) => probeStyleKept(r) && (r.accepted === null || r.accepted === undefined)
const probeAttemptOk = (r) => probeStyleKept(r) && r.accepted === true

// A slot passes with 2 attempts that are each styleKept and accepted.
export function probeVerdicts(results, slots = PROBE_SLOTS) {
  const out = {}
  for (const slot of slots) {
    const rs = probeResultsFor(results, slot)
    const ok = rs.filter(probeAttemptOk).length
    const pending = rs.some(probePending)
    out[slot] = { passed: ok >= PROBE_ACCEPTS_NEEDED, accepted: ok, status: ok >= PROBE_ACCEPTS_NEEDED ? 'pass' : pending ? 'pending' : 'fail' }
  }
  return out
}

// planNext for the probe. planNext stops a slot after one accepted attempt and
// allows two attempts; the probe needs two accepted attempts out of at most three.
export function planNextProbe(entries, results, slot, cap) {
  if (entries.length >= cap) return { ok: false, reason: 'cap' }
  const attempts = attemptsFor(entries, slot)
  if (attempts >= PROBE_MAX_ATTEMPTS_PER_SLOT) return { ok: false, reason: 'max-attempts' }
  const rs = probeResultsFor(results, slot)
  const accepted = rs.filter(probeAttemptOk).length
  if (accepted >= PROBE_ACCEPTS_NEEDED) return { ok: false, reason: 'already-passed' }
  if (rs.some(probePending)) {
    return { ok: false, reason: 'awaiting-verdict' }
  }
  if (accepted + (PROBE_MAX_ATTEMPTS_PER_SLOT - attempts) < PROBE_ACCEPTS_NEEDED) return { ok: false, reason: 'cannot-pass' }
  return { ok: true, attempt: attempts + 1 }
}

// "device-screen:SQUARE#2=accept" -> { slot, attempt: 2, accepted: true }; null when malformed.
export function parseProbeVerdictArg(s) {
  const m = /^(.+)#(\d+)=(accept|reject)$/.exec(String(s ?? ''))
  if (!m) return null
  return { slot: m[1], attempt: Number(m[2]), accepted: m[3] === 'accept' }
}

// The ledger line shape. threshold and promptHash are known only from the
// response, so a line written before the request carries them as null.
export function probeLedgerLine({ at, runId, slot, attempt, threshold = /** @type {number | null} */ (null), promptHash = /** @type {string | null} */ (null) }) {
  return { at, runId, slot, attempt, mode: 'probe', threshold, promptHash }
}

// ---- 031 OP-031: Spotlight SQUARE v2 through the look probe (design section 9.3) ----
// One slot, `<key>@<version>:<size>`, so the probe plans a non-current version. A hard cap of 4
// ledger lines (an attempt that returned no image still uses one), and the 028 rule: the first
// two counted attempts must both keep the look and both be accepted.
export const OP031_SLOTS = ['spotlight@2:SQUARE']
export const OP031_CAP = 4
export const OP031_COUNTED = 2

// "spotlight@2:SQUARE" -> { key, version, size }; null for an ordinary `key:size` slot.
export function parseVersionedSlot(slot) {
  const m = /^([a-z-]+)@(\d+):(SQUARE|PORTRAIT|STORY)$/.exec(String(slot ?? ''))
  return m ? { key: m[1], version: Number(m[2]), size: m[3] } : null
}

// True when every ledger line belongs to the OP-031 slot set (an empty ledger is fine). A line of
// another slot set, or a malformed line with no slot, is another set's ledger: refuse to use it.
export function ledgerFitsOp031(entries) {
  return (entries ?? []).every((e) => e && typeof e.slot === 'string' && OP031_SLOTS.includes(e.slot))
}

// The latest result per attempt number (a re-recorded attempt replaces the earlier one), in order.
function op031Attempts(results) {
  const byAttempt = new Map()
  for (const r of results ?? []) if (r && OP031_SLOTS.includes(r.slot)) byAttempt.set(r.attempt, r)
  return [...byAttempt.values()].sort((a, b) => a.attempt - b.attempt)
}

// An attempt re-judged offline counts by its recheck, as in probe mode (025 A1).
const op031Kept = (r) => (r.recheck && typeof r.recheck.styleKept === 'boolean' ? r.recheck.styleKept : r.styleKept === true)

// An attempt is counted unless the call returned no image (`infra: true`).
export function op031Counted(results) {
  return op031Attempts(results).filter((r) => r.infra !== true)
}

// 'pass' only when the first two counted attempts are both kept and accepted. Any fallback or
// reject among them is 'fail' (a fallback is decided at once, and so is a reject; a kept render
// waits for the user's verdict). Anything else is 'pending'.
export function op031Verdict(results) {
  const first = op031Counted(results).slice(0, OP031_COUNTED)
  const failed = first.some((r) => !op031Kept(r) || r.accepted === false)
  if (failed) return { passed: false, status: 'fail', counted: first.length }
  if (first.length === OP031_COUNTED && first.every((r) => r.accepted === true)) {
    return { passed: true, status: 'pass', counted: first.length }
  }
  return { passed: false, status: 'pending', counted: first.length }
}

// The next attempt. The ledger is the cap: 4 lines, counted or not. Refused once decided and
// while a kept render awaits the user's verdict.
export function planNextOp031(entries, results, cap = OP031_CAP) {
  if ((entries ?? []).length >= cap) return { ok: false, reason: 'cap' }
  const v = op031Verdict(results)
  if (v.status === 'pass') return { ok: false, reason: 'already-passed' }
  if (v.status === 'fail') return { ok: false, reason: 'decided-fail' }
  const attempts = op031Attempts(results)
  if (attempts.some((r) => op031Kept(r) && r.infra !== true && (r.accepted === null || r.accepted === undefined))) {
    return { ok: false, reason: 'awaiting-verdict' }
  }
  return { ok: true, attempt: entries.length + 1 }
}
