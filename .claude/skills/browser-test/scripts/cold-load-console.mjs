// Cold-load console comparison: how often does React error #418 appear, and does
// the exporter's launcher survive it?
//
//   node cold-load-console.mjs [loads] [url]
//   LABEL="official 2.36.2" node cold-load-console.mjs 4
//
// A hydration warning is only worth a private patch if it has a user-visible
// consequence, so this measures both halves on the *same* documents: the console
// text, and whether a usable launcher is present when the page has settled.
//
// Each load is a brand-new tab, opened and closed again, so nothing carries over
// from the previous one. Which exporter is being measured is whatever the manager
// has enabled — run `manager-enable.mjs` first and record its output alongside.
import { CE_MOUNTS_JS, openTab, sleep, socket } from './manager.mjs'

const loads = Number(process.argv[2] || 4)
const url = process.argv[3] || process.env.TARGET_URL || 'https://chatgpt.com/'
const SETTLE_MS = Number(process.env.SETTLE_MS || 14000)
const label = process.env.LABEL || '(unlabelled)'

const PROBE = `
    ${CE_MOUNTS_JS}
    const mounts = ceMounts();
    const usable = mounts.filter(m => m.getClientRects().length > 0 && m.getBoundingClientRect().height > 0);
    // Upstream mounts a menu in both the expanded sidebar and the rail and lets
    // the shell hide one, so the *first* trigger is routinely the hidden one.
    // Report the rendered trigger, which is the one a person can click.
    const triggers = [...document.querySelectorAll('.ce-nav-trigger')];
    const trigger = triggers.find(t => t.getClientRects().length > 0) || triggers[0] || null;
    const tb = trigger ? trigger.getBoundingClientRect() : null;
    const sidebar = document.querySelector('[data-app-action-sidebar-scroll]');
    return {
        mounts: mounts.length,
        usable: usable.length,
        strategies: mounts.map(ceStrategy),
        triggerBox: tb ? Math.round(tb.width) + 'x' + Math.round(tb.height) : null,
        sidebarRendered: !!sidebar && sidebar.getClientRects().length > 0,
        viewport: innerWidth + 'x' + innerHeight,
        href: location.pathname,
    };
`

// The window this browser was last left at decides the layout ChatGPT serves. At
// 520px wide it renders neither the rail nor an open drawer, so *every* build
// measures as "no launcher" and the comparison says nothing. Size the window
// explicitly, and report the viewport each load actually had.
const WIDTH = Number(process.env.WINDOW_WIDTH || 1440)
const HEIGHT = Number(process.env.WINDOW_HEIGHT || 900)

const rows = []
for (let n = 1; n <= loads; n++) {
    const tab = await openTab('about:blank')
    const c = await socket(tab.webSocketDebuggerUrl)
    await c.send('Runtime.enable')
    await c.send('Log.enable')
    await c.send('Page.enable')
    const { result: win } = await c.send('Browser.getWindowForTarget', { targetId: tab.id })
    await c.send('Browser.setWindowBounds', { windowId: win.windowId, bounds: { windowState: 'normal', left: 20, top: 40, width: WIDTH, height: HEIGHT } })
    await c.send('Page.bringToFront')

    const texts = []
    const drain = () => {
        for (const e of c.events.splice(0)) {
            if (e.method === 'Runtime.consoleAPICalled') {
                texts.push((e.params.args || []).map(a => a.value ?? a.description ?? '').join(' '))
            }
            else if (e.method === 'Log.entryAdded') {
                texts.push(e.params.entry.text || '')
            }
            else if (e.method === 'Runtime.exceptionThrown') {
                const d = e.params.exceptionDetails
                texts.push(d.exception?.description || d.text || '')
            }
        }
    }

    await c.send('Page.navigate', { url })
    await c.send('Page.bringToFront')
    // Drain as it goes; the event buffer is shared and only grows.
    for (let waited = 0; waited < SETTLE_MS; waited += 1000) {
        await sleep(1000)
        drain()
    }
    drain()

    let probe = null
    try { probe = await c.run(PROBE) }
    catch (e) { probe = { error: String(e.message || e) } }

    const hydration = texts.filter(t => /Minified React error #4(18|23|25)/.test(t) || /Hydration failed|did not match|hydrating/i.test(t))
    const exporterErrors = texts.filter(t => /\[Exporter\]/i.test(t) && /error/i.test(t))
    rows.push({ n, r418: texts.filter(t => /#418/.test(t)).length, hydration: hydration.length, exporterErrors: exporterErrors.length, probe, sample: hydration[0]?.slice(0, 160) || null })

    c.close()
    await fetch(`http://127.0.0.1:${process.env.MANAGER_CDP_PORT || 9333}/json/close/${tab.id}`)
    await sleep(1500)
}

console.log(`\n=== ${label} — ${loads} cold loads of ${url} ===`)
for (const r of rows) {
    const p = r.probe || {}
    console.log(`  load ${r.n}: #418=${r.r418} hydration=${r.hydration} exporterErrors=${r.exporterErrors} viewport=${p.viewport ?? '-'} sidebar=${p.sidebarRendered ?? '-'} mounts=${p.mounts ?? '-'} usable=${p.usable ?? '-'} trigger=${p.triggerBox ?? '-'} strategy=${(p.strategies || []).join(',') || '-'}`)
    if (r.sample) console.log(`           first hydration message: ${r.sample}`)
}
const with418 = rows.filter(r => r.r418 > 0).length
const withoutLauncher = rows.filter(r => (r.probe?.usable ?? 0) === 0).length
console.log(`\n  loads showing React #418: ${with418}/${loads}`)
console.log(`  loads ending with no usable launcher: ${withoutLauncher}/${loads}`)
console.log(JSON.stringify({ label, url, loads, rows }, null, 2).split('\n').map(l => `# ${l}`).join('\n'))
