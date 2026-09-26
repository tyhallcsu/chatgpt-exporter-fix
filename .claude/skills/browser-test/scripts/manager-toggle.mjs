// Enable or disable one named userscript in the real manager, and verify it.
//
//   node manager-toggle.mjs "TeamHub" off
//   node manager-toggle.mjs "TeamHub" on
//
// `manager-enable.mjs` owns the "exactly one ChatGPT exporter" rule. This is for
// the other half of attribution: an unrelated userscript that could also modify
// the page under test. Check its include/match scope first, and put its original
// state back when the run is over.
import { TM_ID, attach, openTab, sleep, targets } from './manager.mjs'

const needle = process.argv[2]
const want = (process.argv[3] || '').toLowerCase()
if (!needle || !['on', 'off'].includes(want)) {
    console.error('usage: node manager-toggle.mjs <name substring> on|off')
    process.exit(1)
}
const shouldBe = want === 'on'

if (!(await targets()).some(t => t.type === 'page' && t.url.includes(TM_ID) && t.url.includes('options.html'))) {
    await openTab(`chrome-extension://${TM_ID}/options.html#nav=dashboard`)
    await sleep(2500)
}
let c = await attach(p => p.url.includes(TM_ID) && p.url.includes('options.html'))
await c.run(`location.hash = '#nav=dashboard'; return true`)
await c.send('Page.enable')
await c.send('Page.reload')
await sleep(3500)

const ROWS = `
    return [...document.querySelectorAll('tr')]
        .filter(r => r.cells && r.cells.length > 10 && !r.querySelector('th') && !r.querySelector('a.settingsth_a'))
        .map((r) => {
            const enabler = r.querySelector('div.enabler');
            return { name: (((r.cells[4] || {}).innerText) || '').trim(), version: (((r.cells[5] || {}).innerText) || '').trim(), enabled: /Enabled/i.test((enabler || {}).title || '') };
        })
        .filter(r => r.name && r.name !== '<New userscript>');
`

let rows = await c.run(ROWS)
const hits = rows.filter(r => r.name.toLowerCase().includes(needle.toLowerCase()))
if (hits.length !== 1) {
    console.error(`"${needle}" matched ${hits.length} scripts; be more specific.`)
    for (const r of rows) console.error(`  ${r.name} — ${r.version}`)
    process.exit(1)
}
const name = hits[0].name
console.log(`before: [${hits[0].enabled ? 'x' : ' '}] ${name} — ${hits[0].version}`)

for (let attempt = 1; attempt <= 3 && rows.find(r => r.name === name)?.enabled !== shouldBe; attempt++) {
    await c.realClick(`(() => {
        const row = [...document.querySelectorAll('tr')]
            .filter(r => r.cells && r.cells.length > 10 && !r.querySelector('th') && !r.querySelector('a.settingsth_a'))
            .find(r => ((r.cells[4] || {}).innerText || '').trim() === ${JSON.stringify(name)});
        return row && row.querySelector('div.enabler');
    })()`).catch(e => console.error(`  toggle attempt ${attempt} missed: ${e.message}`))
    await sleep(1500)
    // The dashboard re-renders the row in place and can still report the old
    // title right after a click, so re-read from a fresh load.
    await c.send('Page.reload')
    await sleep(3000)
    rows = await c.run(ROWS)
}

const after = rows.find(r => r.name === name)
c.close()
console.log(`after:  [${after.enabled ? 'x' : ' '}] ${after.name} — ${after.version}`)
if (after.enabled !== shouldBe) {
    console.error('FAILED: the dashboard does not show the requested state.')
    process.exit(1)
}
