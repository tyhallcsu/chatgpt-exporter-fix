// CDP helpers for the *userscript-manager* Chrome — a persistent profile with a
// real Tampermonkey install, as opposed to cdp.mjs's GM-shim harness.
//
// Configure with:
//   MANAGER_CDP_PORT   CDP port                (default 9333)
//   MANAGER_PROFILE    Chrome --user-data-dir  (default ~/.chrome-chatgpt-exporter-test)
//   CHROME_BIN         Chrome binary           (default macOS path)
//   TM_EXTENSION_ID    Tampermonkey's id       (default the Web Store id)
// Needs Node 22+ for the global WebSocket.

import os from 'node:os'
import path from 'node:path'

export const CDP_PORT = Number(process.env.MANAGER_CDP_PORT || 9333)
export const PROFILE = process.env.MANAGER_PROFILE || path.join(os.homedir(), '.chrome-chatgpt-exporter-test')
export const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export const TM_ID = process.env.TM_EXTENSION_ID || 'dhdgffkkebhmkfjojejmpbldmpobfkfo'

const base = `http://127.0.0.1:${CDP_PORT}`

export const sleep = ms => new Promise(r => setTimeout(r, ms))

export async function browserVersion() {
    const r = await fetch(`${base}/json/version`)
    return r.json()
}

export async function targets() {
    return (await fetch(`${base}/json/list`)).json()
}

export async function openTab(url) {
    return (await fetch(`${base}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json()
}

/** Attach to the first page target matching a substring or predicate. */
export async function attach(match) {
    const list = await targets()
    const test = typeof match === 'function' ? match : p => p.url.includes(match)
    const t = list.find(p => p.type === 'page' && test(p))
    if (!t) {
        const have = list.filter(p => p.type === 'page').map(p => p.url).join('\n  ')
        throw new Error(`no page matching ${match}\nopen pages:\n  ${have}`)
    }
    return socket(t.webSocketDebuggerUrl)
}

export async function socket(wsUrl) {
    const ws = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })

    let id = 0
    const pending = new Map()
    const events = []
    ws.onmessage = (event) => {
        const message = JSON.parse(event.data)
        if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id) }
        else events.push(message)
    }

    const send = (method, params = {}) => new Promise((resolve) => {
        const messageId = ++id
        pending.set(messageId, resolve)
        ws.send(JSON.stringify({ id: messageId, method, params }))
    })

    const evaluate = async (expression) => {
        const { result } = await send('Runtime.evaluate', {
            expression, awaitPromise: true, returnByValue: true, userGesture: true,
        })
        if (result?.exceptionDetails) {
            const d = result.exceptionDetails
            throw new Error(d.exception?.description || d.text)
        }
        return result?.result?.value
    }

    const run = body => evaluate(`(async () => { ${body} })()`)

    /** A trusted mouse click at the centre of the element an expression returns. */
    const realClick = async (expression) => {
        const box = await run(`
            const el = (${expression});
            if (!el) return null;
            el.scrollIntoView({ block: 'center' });
            const r = el.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
        `)
        if (!box) throw new Error(`realClick: no element for ${expression}`)
        if (!box.w || !box.h) throw new Error(`realClick: zero-size element for ${expression}`)
        for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
            await send('Input.dispatchMouseEvent', {
                type, x: box.x, y: box.y, button: 'left', clickCount: type === 'mouseMoved' ? 0 : 1,
            })
        }
        return box
    }

    return { send, evaluate, run, realClick, events, close: () => ws.close() }
}

/** Close the manager Chrome through CDP so the profile is flushed cleanly. */
export async function closeBrowser() {
    let version
    try { version = await browserVersion() }
    catch { return false }
    const ws = new WebSocket(version.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
    ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }))
    await sleep(1500)
    return true
}
