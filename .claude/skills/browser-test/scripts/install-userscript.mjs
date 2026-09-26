// Install a built userscript into the real manager, the way a user does: serve the
// file over loopback, let Tampermonkey intercept the .user.js navigation, and click
// its own Install button. Nothing is written into the manager's storage directly.
//
//   node install-userscript.mjs ../../../../dist/chatgpt-exporter-review.user.js
//
//   MANAGER_SERVE_PORT   loopback port for the one-shot server (default 8899)
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { TM_ID, attach, openTab, sleep, targets } from './manager.mjs'

const file = process.argv[2]
if (!file) {
    console.error('usage: node install-userscript.mjs <path to .user.js>')
    process.exit(1)
}
const abs = path.resolve(file)
const body = fs.readFileSync(abs)
const name = path.basename(abs)
const port = Number(process.env.MANAGER_SERVE_PORT || 8899)

const server = http.createServer((req, res) => {
    if (req.url !== `/${name}`) { res.writeHead(404).end(); return }
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(body)
})
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${port}/${name}`
console.log(`serving ${name} (${body.length} bytes) at ${url}`)

try {
    await openTab(url)
    await sleep(4000)

    const ask = (await targets()).find(t => t.type === 'page' && t.url.includes('/ask.html'))
    if (!ask) throw new Error('the manager did not show its install prompt — is it enabled for loopback URLs?')

    const c = await attach('/ask.html')
    const prompt = await c.run(`
        return {
            buttons: [...document.querySelectorAll('button, input[type=button]')].map(b => (b.value || b.textContent || '').trim()).filter(Boolean),
            head: (document.body.innerText || '').slice(0, 300),
        };
    `)
    console.log(`manager prompt offers: ${prompt.buttons.join(' / ')}`)
    console.log(prompt.head.split('\n').filter(Boolean).slice(0, 4).join(' | '))
    // "Install" means a new entry; "Update"/"Reinstall" means it replaces one.
    await c.realClick(`[...document.querySelectorAll('button, input[type=button]')].find(b => /^(Install|Update|Reinstall)$/i.test((b.value || b.textContent || '').trim()))`)
    await sleep(3000)
    c.close()
    console.log('clicked the manager\'s install button')
}
finally {
    server.close()
}
