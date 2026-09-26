// Open one conversation in the manager browser and report how big it is.
//
//   node goto-conversation.mjs <chat id or full url>
//
// Export checks need a *bounded* conversation — a long one turns every format
// into a slow test and a screenshot into a stress test — so this prints the turn
// count and page length before anything is exported.
import { attach, sleep } from './manager.mjs'

const arg = process.argv[2]
if (!arg) {
    console.error('usage: node goto-conversation.mjs <chat id | url>')
    process.exit(1)
}
const url = arg.startsWith('http') ? arg : `https://chatgpt.com/c/${arg}`

const c = await attach('chatgpt.com')
await c.send('Page.bringToFront')
await c.send('Page.navigate', { url })
await sleep(15000)
const info = await c.run(`
    const turns = document.querySelectorAll('[data-message-author-role]');
    const trigger = [...document.querySelectorAll('.ce-nav-trigger')].find(e => e.getClientRects().length > 0);
    return {
        path: location.pathname,
        title: document.title,
        turns: turns.length,
        chars: (document.body.innerText || '').length,
        launcherRendered: !!trigger,
    };
`)
console.log(JSON.stringify(info, null, 1))
c.close()
