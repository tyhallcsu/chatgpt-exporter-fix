// Does exactly one launcher survive SPA navigation, and is it still clickable?
//
//   node spa-nav-check.mjs
//
// A userscript runs once per document. Everything after that is React swapping
// the shell out underneath it, which is where a launcher goes missing, gets
// mounted twice, or is left behind in a detached tree. So: click through two
// conversations and home, then go back and forward through history, and after
// every step check the count of *rendered* launchers, the trigger's box, and
// that a real click opens the menu.
import { attach, sleep } from './manager.mjs'
import { CE_MOUNTS_JS } from './manager.mjs'

const STATE = `
    ${CE_MOUNTS_JS}
    const rendered = e => e && e.getClientRects().length > 0;
    const mounts = ceMounts();
    const visible = mounts.filter(rendered);
    const trigger = [...document.querySelectorAll('.ce-nav-trigger')].find(rendered) || null;
    const box = trigger && trigger.getBoundingClientRect();
    const detached = mounts.filter(m => !m.isConnected).length;
    return {
        path: location.pathname.slice(0, 48),
        mounts: mounts.length,
        rendered: visible.length,
        detached,
        trigger: box ? Math.round(box.width) + 'x' + Math.round(box.height) : null,
        theme: document.documentElement.getAttribute('data-theme'),
    };
`

const c = await attach('chatgpt.com')
await c.send('Page.bringToFront')

async function menuOpens() {
    try {
        await c.realClick(`(() => { const t = [...document.querySelectorAll('.ce-nav-trigger')]; return t.find(e => e.getClientRects().length > 0); })()`)
    }
    catch { return false }
    await sleep(1200)
    const open = await c.run(`const card = document.querySelector('.ce-card'); return !!(card && card.getClientRects().length > 0);`)
    if (open) {
        await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
        await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
        await sleep(600)
    }
    return open
}

async function step(name, action) {
    if (action) await action()
    await sleep(3500)
    const state = await c.run(STATE)
    const opens = await menuOpens()
    const pass = state.rendered === 1 && !!state.trigger && state.detached === 0 && opens
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(26)} path=${state.path} mounts=${state.mounts} rendered=${state.rendered} trigger=${state.trigger} menuOpens=${opens} theme=${state.theme}`)
    return pass
}

const clickChat = index => () => c.realClick(`[...document.querySelectorAll('a[href^="/c/"]')].filter(a => a.getClientRects().length > 0)[${index}]`)

const results = []
results.push(await step('initial document'))
results.push(await step('SPA → conversation A', clickChat(0)))
results.push(await step('SPA → conversation B', clickChat(1)))
results.push(await step('SPA → home', () => c.run(`const a = [...document.querySelectorAll('a[href="/"]')].find(e => e.getClientRects().length > 0); if (a) a.click(); else history.pushState({}, '', '/'); dispatchEvent(new PopStateEvent('popstate')); return true`)))
// Drive history through CDP's own entry list. `history.back()` from the page is
// a request the router can coalesce away, and a step that never moved would
// report a pass for a navigation that did not happen.
async function historyStep(offset) {
    const { result } = await c.send('Page.getNavigationHistory')
    const index = result.currentIndex + offset
    const entry = result.entries[index]
    if (!entry) return
    await c.send('Page.navigateToHistoryEntry', { entryId: entry.id })
}
results.push(await step('history back', () => historyStep(-1)))
results.push(await step('history forward', () => historyStep(+1)))

c.close()
const failed = results.filter(r => !r).length
console.log(`\n${results.length - failed}/${results.length} navigation steps pass`)
process.exit(failed ? 1 : 0)
