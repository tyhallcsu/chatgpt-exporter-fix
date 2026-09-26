// Enable exactly one ChatGPT exporter in the real manager and disable the others.
//
//   node manager-enable.mjs "review build"     # substring, case-insensitive
//   node manager-enable.mjs --none             # disable every ChatGPT exporter
//
// Attribution is the whole point of the tier-M browser: two enabled exporters
// both run, and every measurement afterwards is meaningless. Doing the toggling
// here rather than by hand means a comparison run cannot forget it, and the
// script re-reads the dashboard afterwards so the state it reports is observed,
// not assumed.
//
// Only ChatGPT exporters are touched; unrelated userscripts are left alone.
import { TM_ID, attach, openTab, sleep, targets } from './manager.mjs'

const wanted = process.argv[2]
if (!wanted) {
    console.error('usage: node manager-enable.mjs <name substring> | --none')
    process.exit(1)
}
const none = wanted === '--none'
const dashboard = `chrome-extension://${TM_ID}/options.html#nav=dashboard`

const open = await targets()
if (!open.some(t => t.type === 'page' && t.url.includes(TM_ID) && t.url.includes('options.html'))) await openTab(dashboard)
await sleep(2000)

let c = await attach(p => p.url.includes(TM_ID) && p.url.includes('options.html'))
await c.run(`location.hash = '#nav=dashboard'; return true`)
await c.send('Page.enable')
await c.send('Page.reload')
c.close()
await sleep(3500)
c = await attach(p => p.url.includes(TM_ID) && p.url.includes('options.html'))

const ROWS = `
    return [...document.querySelectorAll('tr')]
        .filter(r => r.cells && r.cells.length > 10 && !r.querySelector('th') && !r.querySelector('a.settingsth_a'))
        .map((r, i) => {
            const name = (r.cells[4] || {}).innerText || '';
            const enabler = r.querySelector('div.enabler');
            return { i, name: name.trim(), version: ((r.cells[5] || {}).innerText || '').trim(), enabled: /Enabled/i.test((enabler || {}).title || '') };
        })
        .filter(r => r.name && r.name !== '<New userscript>');
`

const isExporter = r => /chatgpt/i.test(r.name) && /exporter/i.test(r.name)

let rows = await c.run(ROWS)
const want = wanted.toLowerCase()
const matches = none ? [] : rows.filter(r => isExporter(r) && r.name.toLowerCase().includes(want))
// "ChatGPT Exporter" is a substring of "ChatGPT Exporter (review build)", so an
// exact name wins over the substring it is contained in.
const exact = matches.filter(r => r.name.toLowerCase() === want)
const targetsToEnable = exact.length === 1 ? exact : matches
if (!none && targetsToEnable.length !== 1) {
    console.error(`"${wanted}" matched ${targetsToEnable.length} ChatGPT exporters; be more specific.`)
    for (const r of rows.filter(isExporter)) console.error(`  ${r.name} — ${r.version}`)
    process.exit(1)
}
const keep = targetsToEnable[0]?.name ?? null

// Toggling a row makes the dashboard re-render it, and a click dispatched at the
// coordinates of the row that has just been replaced lands on nothing. So the
// state is re-read before every click, and the whole pass repeats until the
// dashboard agrees or the attempts run out.
for (let attempt = 1; attempt <= 4; attempt++) {
    const wrong = rows.filter(isExporter).filter(r => r.enabled !== (r.name === keep))
    if (wrong.length === 0) break
    // The enabler is a styled div, not a checkbox; Tampermonkey wants a real click.
    // A click can miss when the row is mid-re-render, which shows up as "no
    // element" or a zero-size box. That is a retry, not a failure: the loop
    // re-reads and tries again, and only the final dashboard read decides.
    await c.realClick(`(() => {
        const row = [...document.querySelectorAll('tr')]
            .filter(r => r.cells && r.cells.length > 10 && !r.querySelector('th') && !r.querySelector('a.settingsth_a'))
            .find(r => ((r.cells[4] || {}).innerText || '').trim() === ${JSON.stringify(wrong[0].name)});
        return row && row.querySelector('div.enabler');
    })()`).catch(e => console.error(`  toggle attempt ${attempt} missed: ${e.message}`))
    await sleep(1500)
    // Reload before re-reading. The dashboard updates a toggled row in place and
    // an immediate read can still return the pre-click title, which sends the
    // loop off clicking a row that is already in the right state.
    await c.send('Page.enable')
    await c.send('Page.reload')
    await sleep(3000)
    rows = await c.run(ROWS)
}

// Re-read rather than trust the clicks.
await c.send('Page.reload')
c.close()
await sleep(3000)
c = await attach(p => p.url.includes(TM_ID) && p.url.includes('options.html'))
rows = await c.run(ROWS)
c.close()

for (const r of rows) console.log(`  [${r.enabled ? 'x' : ' '}] ${r.name} — ${r.version}`)
const enabled = rows.filter(r => r.enabled && isExporter(r))
console.log(`\nChatGPT exporters enabled: ${enabled.length}${enabled.length ? ` (${enabled.map(r => r.name).join(', ')})` : ''}`)

const ok = none ? enabled.length === 0 : enabled.length === 1 && enabled[0].name === keep
if (!ok) {
    console.error('FAILED: the dashboard does not show the requested state.')
    process.exit(1)
}
