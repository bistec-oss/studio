// 009 OP-1 runner: 6 briefs x 3 image styles against the local OP-1 server
// (http://localhost:3002, DB bistec_studio_op1), as adminBTG, real models.
// Usage: node run-op1.mjs [outDir]
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = 'http://localhost:3002'
const OUT = process.argv[2] ?? new URL('./renders/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const TEAM = 'cmvl440v600006x2cf3k5d4tv'
const BISTEC_KIT = 'cmqroh4me00005zvgrnmrsqbi'
const HEARTS_KIT = 'cmqroh4po00008xc8tcntem58'
const STYLES = ['classic', 'product-showcase', 'editorial-split']
const CONCURRENCY = 3
const POLL_MS = 10_000
const TIMEOUT_MS = 20 * 60_000

const BRIEFS = [
  { id: 'sq-announce', goal: 'announcement', tone: 'professional', aspectRatio: 'SQUARE', kit: BISTEC_KIT, kind: 'announcement',
    topic: 'Bistec Global opens a new engineering hub in Colombo',
    description: 'Announce that Bistec Global has opened a new engineering hub in Colombo to grow its software delivery and support teams. Tone: proud, forward-looking. Call to action: learn more about careers at Bistec Global.' },
  { id: 'sq-event', goal: 'engagement', tone: 'empathetic', aspectRatio: 'SQUARE', kit: HEARTS_KIT, kind: 'event',
    topic: 'Industry Readiness Programme information session',
    description: 'Invite undergraduates to an online information session about the BISTEC Hearts Academy Industry Readiness Programme (IRP). Explain that the session covers what the programme teaches and how to apply. Do not invent dates, fees or numbers. Call to action: register your interest.' },
  { id: 'sq-product', goal: 'awareness', tone: 'bold', aspectRatio: 'SQUARE', kit: BISTEC_KIT, kind: 'product',
    topic: 'Bistec Studio: on-brand social posts in minutes',
    description: 'Introduce Bistec Studio, an internal tool that turns a short brief into a finished, on-brand social media post with caption and design. Highlight speed, brand consistency and easy refinement in plain words. Call to action: ask the marketing team for a demo.' },
  { id: 'pt-announce', goal: 'announcement', tone: 'empathetic', aspectRatio: 'PORTRAIT', kit: HEARTS_KIT, kind: 'announcement',
    topic: 'Hearts Academy welcomes a new cohort',
    description: 'Announce that BISTEC Hearts Academy has welcomed a new cohort of undergraduates into the Industry Readiness Programme. Warm and encouraging. Do not invent numbers or dates. Call to action: follow Hearts Academy for programme updates.' },
  { id: 'pt-event', goal: 'engagement', tone: 'professional', aspectRatio: 'PORTRAIT', kit: BISTEC_KIT, kind: 'event',
    topic: 'Meet Bistec Global at the Colombo tech summit',
    description: 'Invite partners and job seekers to visit the Bistec Global booth at an upcoming Colombo technology summit to talk about digital transformation projects and careers. Do not invent a date or venue. Call to action: visit our booth.' },
  { id: 'pt-product', goal: 'conversion', tone: 'professional', aspectRatio: 'PORTRAIT', kit: BISTEC_KIT, kind: 'product',
    topic: 'Book appointments faster with Bistec Care',
    description: 'Promote Bistec Care, a patient app that lets people book clinic appointments, get reminders and see their visit history from their phone. Clear and reassuring. Call to action: download the app.' },
]

let cookie = ''
async function call(path, init = {}) {
  const res = await fetch(BASE + path, {
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

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

async function runOne(brief, style) {
  const tag = `${brief.id}__${style}`
  const t0 = Date.now()
  const b = await call('/api/briefs', { method: 'POST', body: JSON.stringify({
    topic: brief.topic, description: brief.description, goal: brief.goal, tone: brief.tone, channels: ['INSTAGRAM', 'LINKEDIN'],
    aspectRatio: brief.aspectRatio, designMode: 'GENERATE', brandKitId: brief.kit, imageStyle: style }) })
  if (b.status !== 201) return { tag, brief: brief.id, style, error: `brief ${b.status}: ${JSON.stringify(b.body).slice(0, 300)}` }
  const g = await call('/api/generate/assemble-b', { method: 'POST', body: JSON.stringify({ briefId: b.body.id }) })
  if (g.status !== 202) return { tag, brief: brief.id, style, error: `assemble ${g.status}: ${JSON.stringify(g.body).slice(0, 300)}` }
  const draftId = g.body.draftId
  log('started', tag, draftId)
  let d
  while (Date.now() - t0 < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS))
    const r = await call(`/api/drafts/${draftId}`)
    if (r.status !== 200) continue
    d = r.body
    if (d.status === 'EXPORTED' || d.status === 'FAILED') break
  }
  const secs = Math.round((Date.now() - t0) / 1000)
  const result = { tag, brief: brief.id, kind: brief.kind, aspectRatio: brief.aspectRatio, style, draftId, secs,
    status: d?.status, failureReason: d?.failureReason ?? null,
    composition: d?.composition ?? null, compositionNotice: d?.compositionNotice ?? null,
    backgroundSkip: d?.backgroundSkipReason ?? null, designModel: d?.designModel ?? null }
  if (d?.status === 'EXPORTED' && d.exportUrl) {
    const img = await fetch(d.exportUrl)
    if (img.ok) { writeFileSync(join(OUT, `${tag}.png`), Buffer.from(await img.arrayBuffer())); result.png = `${tag}.png` }
  }
  log('done', tag, result.status, `${secs}s`, result.failureReason ?? '')
  return result
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const login = await call('/api/auth/sign-in/username', { method: 'POST', body: JSON.stringify({ username: 'adminBTG', password: 'BistecStudio2026!' }) })
  if (login.status !== 200) throw new Error(`login ${login.status} ${JSON.stringify(login.body)}`)
  const team = await call('/api/me/active-team', { method: 'POST', body: JSON.stringify({ teamId: TEAM }) })
  if (team.status >= 300) throw new Error(`active-team ${team.status} ${JSON.stringify(team.body)}`)
  const me = await call('/api/me')
  log('signed in; cliMode', me.body?.cliMode, 'claudeToken', JSON.stringify(me.body?.claudeToken ?? null))
  // Interleave so each brief's three styles run in the same window.
  const jobs = BRIEFS.flatMap((b) => STYLES.map((s) => [b, s]))
  const results = []
  let next = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < jobs.length) {
      const [b, s] = jobs[next++]
      try { results.push(await runOne(b, s)) } catch (e) { results.push({ tag: `${b.id}__${s}`, error: String(e) }) }
      writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2))
    }
  }))
  log('ALL DONE', results.filter((r) => r.status === 'EXPORTED').length, 'exported of', jobs.length)
}
main().catch((e) => { console.error('FATAL', e); process.exit(1) })
