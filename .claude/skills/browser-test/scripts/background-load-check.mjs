// Does the exporter mount in a tab that was hidden while it loaded, and is it
// usable once that same document is brought to the front — no reload, and no
// `Page.setWebLifecycleState` or other page-lifecycle override?
//
//   node background-load-check.mjs
//
// Backgrounding a tab from CDP is racy on macOS, where window occlusion also
// drives `visibilityState`. So the phases are *verified* rather than assumed:
// the run reports the visibility it actually observed, and says so plainly if it
// could not hold the tab hidden or could not make it visible again.
import { CE_MOUNTS_JS, openTab, sleep, socket, targets } from './manager.mjs'

const HIDDEN_SETTLE_MS = Number(process.env.HIDDEN_SETTLE_MS || 15000)
const VISIBLE_SETTLE_MS = Number(process.env.VISIBLE_SETTLE_MS || 20000)
const TARGET_URL = process.env.TARGET_URL || 'https://chatgpt.com/'
const PORT = process.env.MANAGER_CDP_PORT || 9333

const PROBE = `
    ${CE_MOUNTS_JS}
    const mounts = ceMounts();
    const usable = mounts.filter(m => m.getClientRects().length > 0 && m.getBoundingClientRect().height > 0);
    const sidebar = document.querySelector('[data-app-action-sidebar-scroll]');
    return {
        visibility: document.visibilityState,
        mounts: mounts.length,
        usable: usable.length,
        strategies: mounts.map(ceStrategy),
        sidebarRendered: !!sidebar && sidebar.getClientRects().length > 0,
    };
`

const park = await openTab('about:blank')
await sleep(800)
const subject = await openTab('about:blank')
await sleep(800)

const parkSock = await socket(park.webSocketDebuggerUrl)
const subjectSock = await socket(subject.webSocketDebuggerUrl)
await subjectSock.send('Page.enable')
await subjectSock.send('Runtime.enable')
await parkSock.send('Page.enable')

async function visibility() {
    return subjectSock.run(`return document.visibilityState`)
}

// ── Phase 1: load while hidden ───────────────────────────────────────────────
await parkSock.send('Page.bringToFront')
await sleep(800)
const before = await visibility()
await subjectSock.send('Page.navigate', { url: TARGET_URL })

// Sample throughout the load so a mid-load flip to visible is not missed.
const samples = []
for (let waited = 0; waited < HIDDEN_SETTLE_MS; waited += 1000) {
    samples.push(await visibility())
    await sleep(1000)
}
const heldHidden = before === 'hidden' && samples.every(s => s === 'hidden')
const hidden = await subjectSock.run(PROBE)
console.log(`phase 1 — loaded with visibility ${before} -> ${[...new Set(samples)].join('/')}`)
console.log(`  held hidden throughout: ${heldHidden}`)
console.log(`  ${JSON.stringify(hidden)}`)

// ── Phase 2: same document, brought to the front ─────────────────────────────
// A hidden document has no layout, so nothing reports a size — including
// ChatGPT's own sidebar. "Usable" therefore has to be sampled in a probe that
// itself reports `visible`, and something else on the desktop can re-occlude the
// window at any moment, so keep raising it and take the first visible sample
// that shows a usable launcher.
let becameVisible = false
let visible = null
const deadline = Date.now() + VISIBLE_SETTLE_MS
while (Date.now() < deadline) {
    await subjectSock.send('Page.bringToFront')
    const { result: win } = await subjectSock.send('Browser.getWindowForTarget', { targetId: subject.id })
    await subjectSock.send('Browser.setWindowBounds', {
        windowId: win.windowId,
        bounds: { windowState: 'normal', left: 20, top: 40, width: 1440, height: 950 },
    })
    await sleep(1500)
    const sample = await subjectSock.run(PROBE)
    if (sample.visibility === 'visible') {
        becameVisible = true
        visible = sample
        if (sample.usable > 0) break
    }
    visible ??= sample
}
console.log(`phase 2 — became visible: ${becameVisible}`)
console.log(`  ${JSON.stringify(visible)}`)

const errors = subjectSock.events
    .filter(e => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'))
    .map(e => e.method === 'Runtime.exceptionThrown'
        ? (e.params.exceptionDetails?.exception?.description || e.params.exceptionDetails?.text || '')
        : e.params.args.map(a => a.value ?? a.description ?? a.type).join(' '))
const hydration = errors.filter(t => /Minified React error #418|hydrat/i.test(t))
console.log(`console errors: ${errors.length}, hydration-related: ${hydration.length}`)
hydration.slice(0, 3).forEach(t => console.log('  ' + t.slice(0, 160)))

console.log('')
console.log(`SETUP   heldHidden=${heldHidden} becameVisible=${becameVisible}`)
console.log(`RESULT  mountedWhileHidden=${hidden.usable > 0} usableWhenVisible=${visible.usable > 0} mounts=${visible.mounts} sidebarRendered=${visible.sidebarRendered}`)
if (!heldHidden) console.log('NOTE    phase 1 is inconclusive: the tab did not stay hidden for the whole load.')
if (!becameVisible) console.log('NOTE    phase 2 is inconclusive: the tab never reported visible.')

subjectSock.close()
parkSock.close()
for (const t of await targets()) {
    if (t.type === 'page' && t.url === 'about:blank') await fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`)
}
