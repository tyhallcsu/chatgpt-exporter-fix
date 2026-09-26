// One bounded look at the Export All dialog, and what it says when the
// conversation-list endpoint is throttled.
//
//   node export-all-probe.mjs [outDir]
//
// This is the acceptance check for PR #400. The defect it fixes is silent: a 429
// used to render as `0 / 0`, which is exactly what an account with no
// conversations looks like. So the check is not "did the dialog open" but "does
// the dialog say the load failed", and it records the dialog's own text plus a
// screenshot as the evidence either way.
//
// It opens the dialog once. If the list is throttled it does not retry.
import fs from 'node:fs'
import path from 'node:path'
import { attach, sleep } from './manager.mjs'

const OUT = process.argv[2] || path.join(process.env.TMPDIR || '/tmp', 'export-all-probe')
fs.mkdirSync(OUT, { recursive: true })

const c = await attach('chatgpt.com')
await c.send('Page.bringToFront')
await c.send('Network.enable')

await c.realClick(`(() => { const t = [...document.querySelectorAll('.ce-nav-trigger')]; return t.find(e => e.getClientRects().length > 0); })()`)
await sleep(1200)
await c.realClick(`[...document.querySelectorAll('[class*="menu-item"]')].find(e => e.getClientRects().length > 0 && (e.innerText || '').trim() === 'Export All')`)
await sleep(12000)

const listCalls = c.events
    .filter(e => e.method === 'Network.responseReceived' && e.params.response.url.includes('/backend-api/conversations'))
    .map(e => e.params.response.status)

const state = await c.run(`
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return { open: false };
    const text = (dialog.innerText || '').split('\\n').map(l => l.trim()).filter(Boolean);
    const rows = dialog.querySelectorAll('input[type="checkbox"]');
    const exportButton = [...dialog.querySelectorAll('button')].find(b => /^export/i.test((b.innerText || '').trim()));
    return {
        open: true,
        text,
        // The defect: a throttled load that reports a count and no error is
        // indistinguishable from an empty account.
        counter: text.find(l => /^\\d+\\s*\\/\\s*\\d+$/.test(l)) || null,
        errorLines: text.filter(l => /rate limit|429|failed|error/i.test(l)),
        selectableRows: rows.length,
        exportDisabled: exportButton ? exportButton.disabled : null,
    };
`)

const { result } = await c.send('Page.captureScreenshot', { format: 'png' })
const shot = path.join(OUT, 'export-all-dialog.png')
fs.writeFileSync(shot, Buffer.from(result.data, 'base64'))

console.log(`list endpoint statuses seen: ${listCalls.length ? listCalls.join(', ') : 'none observed in this window'}`)
console.log(JSON.stringify(state, null, 1))
console.log(`screenshot: ${shot}`)

if (state.open) {
    const throttled = listCalls.includes(429)
    if (throttled) {
        const surfaced = state.errorLines.length > 0
        console.log(`\n429 on the conversation list. Error surfaced in the dialog: ${surfaced ? 'YES' : 'NO'}`)
        console.log(surfaced
            ? 'PASS — the failure is visible; it is not being reported as an empty account.'
            : 'FAIL — the dialog is hiding a throttled load.')
        process.exit(surfaced ? 0 : 1)
    }
    console.log('\nthe conversation list is not throttled right now; a two-conversation export can be attempted')
}
c.close()
