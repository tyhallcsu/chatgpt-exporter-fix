// Report what the real userscript manager actually has installed and enabled.
// Answers the questions a "tier M" claim needs: which scripts exist, which are
// enabled, their versions, and each one's effective update configuration.
//
//   node manager-state.mjs            # summary
//   node manager-state.mjs --json     # machine-readable
import { TM_ID, attach, openTab, sleep, targets } from './manager.mjs'

const asJson = process.argv.includes('--json')
const dashboard = `chrome-extension://${TM_ID}/options.html#nav=dashboard`

const open = await targets()
if (!open.some(t => t.type === 'page' && t.url.includes(TM_ID) && t.url.includes('options.html'))) await openTab(dashboard)
await sleep(2500)

const c = await attach(p => p.url.includes(TM_ID) && p.url.includes('options.html'))
await c.run(`location.hash = '#nav=dashboard'; return true`)
await sleep(2000)

const state = await c.run(`
    const rows = [...document.querySelectorAll('tr')].filter(r => r.cells && r.cells.length > 10 && !r.querySelector('th') && !r.querySelector('a.settingsth_a'));
    return {
        managerVersion: (document.body.innerText.match(/v(\\d+\\.\\d+\\.\\d+)/) || [])[1] || null,
        scripts: rows.map((r) => {
            const enabler = r.querySelector('div.enabler');
            const name = (r.cells[4]?.innerText || '').trim();
            if (!name || name === '<New userscript>') return null;
            return {
                name,
                version: (r.cells[5]?.innerText || '').trim(),
                enabled: /Enabled/i.test(enabler?.title || ''),
            };
        }).filter(Boolean),
    };
`)
c.close()

if (asJson) {
    console.log(JSON.stringify(state, null, 2))
}
else {
    console.log(`Tampermonkey v${state.managerVersion}`)
    for (const s of state.scripts) {
        console.log(`  [${s.enabled ? 'x' : ' '}] ${s.name} — ${s.version}`)
    }
    const enabled = state.scripts.filter(s => s.enabled && /exporter/i.test(s.name) && /chatgpt/i.test(s.name))
    console.log(`\nChatGPT exporters enabled: ${enabled.length}`)
    if (enabled.length > 1) console.log('WARNING: more than one ChatGPT exporter is enabled; they will both run.')
}
