// 028 real-image check runner (OP-028). An operator tool: never run by a build task.
// Usage:
//   node scripts/look-check/run-look-check.mjs --base http://localhost:3002 --out <dir> [--only <slot> ...] [--dry-run]
//   node scripts/look-check/run-look-check.mjs --out <dir> --verdict <slot>=accept|reject
// 025 OP-025 probe mode (device-screen; --out defaults to .specclaw/changes/025-hero-reference-images/look-check):
//   node scripts/look-check/run-look-check.mjs --probe --base http://localhost:3002 [--out <dir>] [--only <slot> ...] [--dry-run]
//   node scripts/look-check/run-look-check.mjs --probe [--out <dir>] --verdict <slot>#<attempt>=accept|reject
// 025 A1 recheck (no network, no image call): re-judge every saved render with the shipped check,
// write `recheck` into results.json and a page with the detected rects drawn (recheck.html):
//   node scripts/look-check/run-look-check.mjs --probe --recheck [--out <dir>]
// 031 OP-031 (Spotlight SQUARE v2; --out defaults to .specclaw/changes/031-v2-final-polish/look-check, a
// cap of 4 ledger lines, pass = the first 2 counted attempts both kept and accepted):
//   node scripts/look-check/run-look-check.mjs --probe --slot-set op031 --base http://localhost:3002 [--out <dir>] [--dry-run]
//   node scripts/look-check/run-look-check.mjs --probe --slot-set op031 [--out <dir>] --verdict spotlight@2:SQUARE#<attempt>=accept|reject
// env (a run only): LOOK_CHECK_USERNAME, LOOK_CHECK_PASSWORD, LOOK_CHECK_TEAM, LOOK_CHECK_KIT
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  SLOTS, capFor, checkBase, lastResult, parseLedger, parseVerdictArg, planNext, totalLine,
  PROBE_SLOTS, PROBE_MAX_ATTEMPTS_PER_SLOT, planNextProbe, parseProbeVerdictArg, probeLedgerLine, probeVerdicts,
  OP031_SLOTS, OP031_CAP, ledgerFitsOp031, op031Verdict, parseVersionedSlot, planNextOp031,
} from './lookCheck.mjs'

const POLL_MS = 10_000
const TIMEOUT_MS = 20 * 60_000

// One brief per slot: the slot's post style, no invented date, price or number, a plain call to action.
const BRIEFS = {
  'product-showcase:STORY': {
    topic: 'Bistec Studio: on-brand social posts in minutes',
    description: 'Launch Bistec Studio, an internal tool that turns a short brief into a finished, on-brand social media post with caption and design. Name it as Bistec Studio. Highlight speed, brand consistency and easy refinement in plain words. Do not invent features, prices or dates. Call to action: ask the marketing team for a demo.',
  },
  'editorial-split:STORY': {
    topic: 'Hearts Academy welcomes a new cohort',
    description: 'Announce that BISTEC Hearts Academy has welcomed a new cohort of undergraduates into the Industry Readiness Programme. Warm and encouraging. Do not invent numbers or dates. Call to action: follow Hearts Academy for programme updates.',
  },
  'full-bleed-scene:SQUARE': {
    topic: 'Meet Bistec Global at a Colombo technology meetup',
    description: 'Invite engineers to meet the Bistec Global team at a technology meetup in Colombo to talk about cloud projects and careers. Do not invent a date or venue. Call to action: say hello at the event.',
  },
  'full-bleed-scene:PORTRAIT': {
    topic: 'Bistec Global is hiring a senior cloud engineer',
    description: 'Announce that Bistec Global has an open role for a senior cloud engineer to help deliver cloud projects for clients. Do not invent a salary, location, work arrangement or deadline. Call to action: get in touch with the Bistec Global team to apply.',
  },
  'full-bleed-scene:STORY': {
    topic: 'Join the Hearts Academy online information session',
    description: 'Invite undergraduates to an online information session about the BISTEC Hearts Academy Industry Readiness Programme, covering what the programme teaches and how to apply. Do not invent a date or time. Call to action: ask Hearts Academy for details.',
  },
  'spotlight:SQUARE': {
    topic: 'Bistec Care: appointments from your phone',
    description: 'Promote Bistec Care, a patient app that lets people book clinic appointments, get reminders and see their visit history from their phone. Clear and reassuring. Do not invent a price, discount or end date. Call to action: find out more about Bistec Care.',
  },
  'spotlight:PORTRAIT': {
    topic: 'Thank you for growing with Bistec Global',
    description: 'Mark a milestone for Bistec Global and thank clients and colleagues for their trust and hard work. Describe the milestone without any number or year. Call to action: follow Bistec Global for more news.',
  },
  'spotlight:STORY': {
    topic: 'Bistec Studio: a faster way to brand-ready posts',
    description: 'Promote Bistec Studio to the marketing team as a quicker way to produce brand-ready social posts from a short brief. Do not invent a price, discount or end date. Call to action: get in touch to see how it works.',
  },
}

function parseArgs(argv) {
  const a = { only: [], dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i]
    if (v === '--dry-run') a.dryRun = true
    else if (v === '--probe') a.probe = true
    else if (v === '--recheck') a.recheck = true
    else if (v === '--slot-set') a.slotSet = argv[++i]
    else if (v === '--base') a.base = argv[++i]
    else if (v === '--out') a.out = argv[++i]
    else if (v === '--verdict') a.verdict = argv[++i]
    else if (v === '--only') a.only.push(argv[++i])
    else { console.error(`unknown argument: ${v}`); process.exit(1) }
  }
  return a
}

const args = parseArgs(process.argv.slice(2))
if (args.slotSet !== undefined && !(args.probe && args.slotSet === 'op031')) {
  console.error('--slot-set takes only "op031" and only with --probe')
  process.exit(1)
}
const op031 = args.slotSet === 'op031'
if (args.probe && !args.out) {
  args.out = op031 ? '.specclaw/changes/031-v2-final-polish/look-check' : '.specclaw/changes/025-hero-reference-images/look-check'
}
if (!args.out) { console.error('--out <dir> is required'); process.exit(1) }

const ledgerPath = join(args.out, 'ledger.jsonl')
const resultsPath = join(args.out, 'results.json')
const readLedger = () => (existsSync(ledgerPath) ? parseLedger(readFileSync(ledgerPath, 'utf8')) : [])
const readResults = () => (existsSync(resultsPath) ? JSON.parse(readFileSync(resultsPath, 'utf8')) : [])
const cap = capFor(SLOTS)
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

function wanted() {
  const unknown = args.only.filter((s) => !SLOTS.some((x) => x.slot === s))
  if (unknown.length) { console.error(`unknown slot: ${unknown.join(', ')}`); process.exit(1) }
  return SLOTS.filter((s) => args.only.length === 0 || args.only.includes(s.slot))
}

// ---- 025 probe mode: the device-screen look, through POST /api/admin/look-probe ----
async function runProbe() {
  const slotSet = op031 ? OP031_SLOTS : PROBE_SLOTS
  const pcap = op031 ? OP031_CAP : capFor(PROBE_SLOTS, PROBE_MAX_ATTEMPTS_PER_SLOT)
  const pwanted = () => {
    const unknown = args.only.filter((s) => !slotSet.includes(s))
    if (unknown.length) { console.error(`unknown slot: ${unknown.join(', ')}`); process.exit(1) }
    return slotSet.filter((s) => args.only.length === 0 || args.only.includes(s))
  }
  const verdictOf = (results) => (op031 ? op031Verdict(results) : probeVerdicts(results))
  const planFor = (entries, results, slot) => (op031 ? planNextOp031(entries, results) : planNextProbe(entries, results, slot, pcap))
  // An OP-031 --out holds only OP-031 slots (an earlier look check's ledger is another slot set).
  if (op031 && !ledgerFitsOp031(readLedger())) {
    console.error(`refusing --out ${args.out}: its ledger holds slots of another slot set`)
    process.exit(1)
  }
  if (op031 && args.recheck) { console.error('--recheck is not supported for --slot-set op031'); process.exit(1) }

  if (args.recheck) {
    // The shipped check, run in a tsx entry (it imports the same module the app does) on the saved
    // renders. It makes no network call and no image call, and writes results.json and recheck.html.
    const run = spawnSync('npx', ['tsx', 'scripts/look-check/recheck.ts', '--out', JSON.stringify(args.out)], { stdio: 'inherit', shell: true })
    process.exit(run.status ?? 1)
  }

  if (args.verdict) {
    const v = parseProbeVerdictArg(args.verdict)
    if (!v) { console.error('--verdict must be <slot>#<attempt>=accept|reject'); process.exit(1) }
    const results = readResults()
    const r = results.find((x) => x.slot === v.slot && x.attempt === v.attempt)
    if (!r) { console.error(`no result for ${v.slot} attempt ${v.attempt}`); process.exit(1) }
    r.accepted = v.accepted
    writeFileSync(resultsPath, JSON.stringify(results, null, 2))
    console.log(`${v.slot}#${v.attempt}: ${v.accepted ? 'accepted' : 'rejected'}`)
    console.log(JSON.stringify(verdictOf(results)))
    process.exit(0)
  }

  if (args.dryRun) {
    const entries = readLedger()
    const results = readResults()
    if (args.base) {
      const b = checkBase(args.base)
      if (!b.ok) { console.error(b.error); process.exit(1) }
    }
    console.log(`[look-check] probe dry run${op031 ? ' (slot set op031)' : ''}: ledger ${entries.length} of cap ${pcap}`)
    if (op031) console.log(`slots: ${OP031_SLOTS.join(', ')}; the probe is asked for contract version ${parseVersionedSlot(OP031_SLOTS[0]).version}; pass = the first 2 counted attempts kept and accepted`)
    console.log(`ledger line shape: ${JSON.stringify(probeLedgerLine({ at: '<iso>', runId: '<uuid>', slot: '<slot>', attempt: 1 }))}`)
    for (const slot of pwanted()) {
      const p = planFor(entries, results, slot)
      console.log(`${slot}: ${p.ok ? `would run attempt ${p.attempt}` : `refused: ${p.reason}`}`)
    }
    process.exit(0)
  }

  const base = checkBase(args.base)
  if (!base.ok) { console.error(base.error); process.exit(1) }
  const { LOOK_CHECK_USERNAME: USER, LOOK_CHECK_PASSWORD: PASS, LOOK_CHECK_TEAM: TEAM } = process.env
  if (!USER || !PASS || !TEAM) {
    console.error('LOOK_CHECK_USERNAME, LOOK_CHECK_PASSWORD and LOOK_CHECK_TEAM are required')
    process.exit(2)
  }
  mkdirSync(join(args.out, 'renders'), { recursive: true })
  if (readLedger().length >= pcap) {
    console.log(`${totalLine(readLedger().length, pcap)} (cap reached)`)
    process.exit(3)
  }

  let cookie = ''
  async function call(path, init = {}) {
    const res = await fetch(args.base + path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) },
      redirect: 'manual',
    })
    const setCookie = res.headers.getSetCookie?.() ?? []
    if (setCookie.length) {
      const jar = new Map(cookie.split('; ').filter(Boolean).map((c) => c.split(/=(.*)/s).slice(0, 2)))
      for (const c of setCookie) { const [kv] = c.split(';'); const [k, v] = kv.split(/=(.*)/s); jar.set(k, v) }
      cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
    }
    const text = await res.text()
    let body; try { body = JSON.parse(text) } catch { body = text }
    return { status: res.status, body }
  }

  const login = await call('/api/auth/sign-in/username', { method: 'POST', body: JSON.stringify({ username: USER, password: PASS }) })
  if (login.status !== 200) { console.error(`login ${login.status}`); process.exit(1) }
  const team = await call('/api/me/active-team', { method: 'POST', body: JSON.stringify({ teamId: TEAM }) })
  if (team.status >= 300) { console.error(`active-team ${team.status}`); process.exit(1) }

  const runId = randomUUID()
  for (const slot of pwanted()) {
    const entries = readLedger()
    const results = readResults()
    const p = planFor(entries, results, slot)
    if (!p.ok) {
      console.log(`${slot}: skipped (${p.reason})`)
      if (p.reason === 'cap') break
      continue
    }
    // The ledger line goes down first, synchronously: a crash after it still counts. threshold and
    // promptHash come from the response, so they are null here and are recorded in results.json.
    appendFileSync(ledgerPath, JSON.stringify(probeLedgerLine({ at: new Date().toISOString(), runId, slot, attempt: p.attempt })) + '\n')
    console.log(totalLine(entries.length + 1, pcap))
    log('started', slot, `attempt ${p.attempt}`)
    const versioned = parseVersionedSlot(slot)
    const [key, size] = versioned ? [versioned.key, versioned.size] : slot.split(':')
    const result = { slot, attempt: p.attempt, runId, styleKept: false, fallbackReason: null, threshold: null, promptHash: null, rect: null, render: null, error: null, accepted: null }
    try {
      const r = await call('/api/admin/look-probe', { method: 'POST', body: JSON.stringify(versioned ? { key, size, version: versioned.version } : { key, size }) })
      if (r.status !== 200) throw new Error(`probe ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`)
      result.styleKept = r.body.verdict?.ok === true
      result.fallbackReason = r.body.fallbackReason ?? null
      result.threshold = r.body.threshold ?? null
      result.promptHash = r.body.promptHash ?? null
      result.rect = r.body.rect ?? null
      const m = /^data:[^;]+;base64,(.+)$/s.exec(String(r.body.image ?? ''))
      if (m) {
        const name = `${key}${versioned ? `_v${versioned.version}` : ''}_${size}_${p.attempt}.png`
        writeFileSync(join(args.out, 'renders', name), Buffer.from(m[1], 'base64'))
        result.render = name
      }
    } catch (e) {
      result.error = String(e?.message ?? e)
      result.styleKept = false
    }
    // OP-031: a call that returned no image is infrastructure, not an attempt at the look: it is
    // not counted, but its ledger line stays (the cap holds). A response that names a fallback
    // reason is a real attempt even without an image, so it counts (and fails) (031 T16 review).
    if (op031 && !result.render && (result.error || !result.fallbackReason)) result.infra = true
    results.push(result)
    writeFileSync(resultsPath, JSON.stringify(results, null, 2))
    log('done', slot, result.error ? `error: ${result.error}` : `styleKept ${result.styleKept}${result.fallbackReason ? ` (${result.fallbackReason})` : ''}`)
  }
  process.exit(0)
}
if (args.probe) await runProbe()

if (args.verdict) {
  const v = parseVerdictArg(args.verdict)
  if (!v) { console.error('--verdict must be <slot>=accept|reject'); process.exit(1) }
  const results = readResults()
  const last = lastResult(results, v.slot)
  if (!last) { console.error(`no result for slot ${v.slot}`); process.exit(1) }
  last.accepted = v.accepted
  writeFileSync(resultsPath, JSON.stringify(results, null, 2))
  console.log(`${v.slot}: ${v.accepted ? 'accepted' : 'rejected'}`)
  process.exit(0)
}

if (args.dryRun) {
  const entries = readLedger()
  const results = readResults()
  if (args.base) {
    const b = checkBase(args.base)
    if (!b.ok) { console.error(b.error); process.exit(1) }
  }
  console.log(`[look-check] dry run: ledger ${entries.length} of cap ${cap}`)
  for (const s of wanted()) {
    const p = planNext(entries, results, s.slot, cap)
    console.log(`${s.slot} (${s.postStyle}): ${p.ok ? `would run attempt ${p.attempt}` : `refused: ${p.reason}`}`)
  }
  process.exit(0)
}

// ---- a real run ----
const base = checkBase(args.base)
if (!base.ok) { console.error(base.error); process.exit(1) }
const { LOOK_CHECK_USERNAME: USER, LOOK_CHECK_PASSWORD: PASS, LOOK_CHECK_TEAM: TEAM, LOOK_CHECK_KIT: KIT } = process.env
if (!USER || !PASS || !TEAM || !KIT) {
  console.error('LOOK_CHECK_USERNAME, LOOK_CHECK_PASSWORD, LOOK_CHECK_TEAM and LOOK_CHECK_KIT are required')
  process.exit(2)
}
mkdirSync(join(args.out, 'renders'), { recursive: true })
if (readLedger().length >= cap) {
  console.log(`${totalLine(readLedger().length, cap)} (cap reached)`)
  process.exit(3)
}

let cookie = ''
async function call(path, init = {}) {
  const res = await fetch(args.base + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) },
    redirect: 'manual',
  })
  const setCookie = res.headers.getSetCookie?.() ?? []
  if (setCookie.length) {
    const jar = new Map(cookie.split('; ').filter(Boolean).map((c) => c.split(/=(.*)/s).slice(0, 2)))
    for (const c of setCookie) { const [kv] = c.split(';'); const [k, v] = kv.split(/=(.*)/s); jar.set(k, v) }
    cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
  }
  const text = await res.text()
  let body; try { body = JSON.parse(text) } catch { body = text }
  return { status: res.status, body }
}

async function generate(s, attempt, runId) {
  const brief = BRIEFS[s.slot]
  const result = {
    slot: s.slot, key: s.key, size: s.size, attempt, runId, briefId: null, draftId: null, render: null,
    requestedArchetype: s.key, appliedArchetype: null, contractVersion: null,
    styleKept: false, fallbackReason: null, observations: [], error: null, accepted: null,
  }
  const t0 = Date.now()
  try {
    const b = await call('/api/briefs', { method: 'POST', body: JSON.stringify({
      topic: brief.topic, description: brief.description, channels: ['INSTAGRAM', 'LINKEDIN'],
      aspectRatio: s.size, designMode: 'GENERATE', brandKitId: KIT, imageStyle: s.key, postStyle: s.postStyle }) })
    if (b.status !== 201) throw new Error(`brief ${b.status}: ${JSON.stringify(b.body).slice(0, 300)}`)
    result.briefId = b.body.id
    const g = await call('/api/generate/assemble-b', { method: 'POST', body: JSON.stringify({ briefId: b.body.id }) })
    if (g.status !== 202) throw new Error(`assemble ${g.status}: ${JSON.stringify(g.body).slice(0, 300)}`)
    result.draftId = g.body.draftId
    let d
    while (Date.now() - t0 < TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, POLL_MS))
      const r = await call(`/api/drafts/${result.draftId}`)
      if (r.status !== 200) continue
      d = r.body
      if (d.status === 'EXPORTED' || d.status === 'FAILED') break
    }
    if (!d || (d.status !== 'EXPORTED' && d.status !== 'FAILED')) throw new Error('timeout')
    if (d.status === 'FAILED') throw new Error(`draft failed: ${d.failureReason ?? 'unknown'}`)
    const c = d.composition ?? null
    result.appliedArchetype = c?.appliedArchetype ?? null
    result.contractVersion = c?.contractVersion ?? null
    result.fallbackReason = c?.fallbackReason ?? null
    result.observations = c?.observations ?? []
    result.styleKept = c != null && c.appliedArchetype === c.requestedArchetype
    if (d.exportUrl) {
      const img = await fetch(d.exportUrl)
      if (img.ok) {
        const name = `${s.key}_${s.size}_${attempt}.png`
        writeFileSync(join(args.out, 'renders', name), Buffer.from(await img.arrayBuffer()))
        result.render = name
      }
    }
  } catch (e) {
    result.error = String(e?.message ?? e)
    result.styleKept = false
  }
  return result
}

const login = await call('/api/auth/sign-in/username', { method: 'POST', body: JSON.stringify({ username: USER, password: PASS }) })
if (login.status !== 200) { console.error(`login ${login.status}`); process.exit(1) }
const team = await call('/api/me/active-team', { method: 'POST', body: JSON.stringify({ teamId: TEAM }) })
if (team.status >= 300) { console.error(`active-team ${team.status}`); process.exit(1) }

const runId = randomUUID()
for (const s of wanted()) {
  const entries = readLedger()
  const results = readResults()
  const p = planNext(entries, results, s.slot, cap)
  if (!p.ok) {
    console.log(`${s.slot}: skipped (${p.reason})`)
    if (p.reason === 'cap') break
    continue
  }
  // The ledger line goes down first, synchronously: a crash or timeout after it still counts.
  appendFileSync(ledgerPath, JSON.stringify({ at: new Date().toISOString(), runId, slot: s.slot, attempt: p.attempt }) + '\n')
  console.log(totalLine(entries.length + 1, cap))
  log('started', s.slot, `attempt ${p.attempt}`)
  const result = await generate(s, p.attempt, runId)
  results.push(result)
  writeFileSync(resultsPath, JSON.stringify(results, null, 2))
  log('done', s.slot, result.error ? `error: ${result.error}` : `applied ${result.appliedArchetype}`)
}
