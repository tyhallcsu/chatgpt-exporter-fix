// What is actually on the page right now, in a few lines.
//
//   node page-probe.mjs
//
// Used to tell "the export is broken" apart from "ChatGPT did not render the
// conversation", which look identical from the outside.
import { attach } from './manager.mjs'

const c = await attach('chatgpt.com')
await c.send('Page.bringToFront')
const out = await c.run(`
    const text = (document.body.innerText || '').split('\\n').map(l => l.trim()).filter(Boolean);
    return {
        path: location.pathname,
        lines: text.slice(0, 25),
        roles: document.querySelectorAll('[data-message-author-role]').length,
        turnArticles: document.querySelectorAll('article').length,
        conversationTurns: document.querySelectorAll('[data-testid^="conversation-turn"]').length,
    };
`)
console.log(JSON.stringify(out, null, 1))
c.close()
