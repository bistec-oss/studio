const puppeteer = require('D:/studio/node_modules/puppeteer-core')
const fs = require('fs')
const drafts = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const norm = (s) => s.replace(/\s+/g, ' ').trim()
;(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
  const page = await browser.newPage()
  await page.setRequestInterception(true)
  page.on('request', (r) => (r.url().startsWith('data:') ? r.continue() : r.abort()))
  const rows = []
  for (const d of drafts) {
    await page.setContent(d.html, { waitUntil: 'domcontentloaded' })
    const h = norm(d.headline)
    const r = await page.evaluate((h) => {
      const norm = (s) => s.replace(/\s+/g, ' ').trim()
      const lc = h.toLowerCase()
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      let exactNode = 0, nodeContains = 0, nodeContainsCI = 0
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const p = n.parentElement
        if (p && /^(SCRIPT|STYLE|TITLE|NOSCRIPT)$/.test(p.tagName)) continue
        const t = norm(n.data)
        if (t === h) exactNode++
        if (t.includes(h)) nodeContains++
        if (t.toLowerCase().includes(lc)) nodeContainsCI++
      }
      // smallest elements whose normalised textContent contains the headline (spans split)
      let elemCI = 0
      for (const el of document.body.querySelectorAll('*')) {
        if (!norm(el.textContent || '').toLowerCase().includes(lc)) continue
        const childHas = [...el.children].some((c) => norm(c.textContent || '').toLowerCase().includes(lc))
        if (!childHas) elemCI++
      }
      const visible = norm(document.body.innerText || '').toLowerCase().includes(lc)
      return { exactNode, nodeContains, nodeContainsCI, elemCI, visible }
    }, h)
    const raw = d.html.split(d.headline).length - 1
    rows.push({ id: d.id.slice(-6), path: d.path, style: d.style, len: h.length, raw, ...r })
  }
  await browser.close()
  console.table(rows)
  const n = rows.length
  const c = (f) => rows.filter(f).length
  console.log(JSON.stringify({
    n,
    rawExactlyOnce: c((r) => r.raw === 1),
    oneTextNodeContains: c((r) => r.nodeContains === 1),
    oneTextNodeContainsCI: c((r) => r.nodeContainsCI === 1),
    oneElementCI: c((r) => r.elemCI === 1),
    visibleCI: c((r) => r.visible),
    pathB: c((r) => r.path === 'GENERATE'),
    pathB_oneTextNode: c((r) => r.path === 'GENERATE' && r.nodeContains === 1),
    pathB_oneElementCI: c((r) => r.path === 'GENERATE' && r.elemCI === 1),
  }))
})()
