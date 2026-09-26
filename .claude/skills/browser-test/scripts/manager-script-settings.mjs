// Print one installed script's *effective* per-script configuration in the manager.
// Header metadata is a request; this is what the manager decided. In particular
// `@updateURL none` / `@downloadURL none` leaves "Check for updates" ticked and
// only sets the URL to the literal `none`, so the header alone proves nothing.
//
//   node manager-script-settings.mjs "review build"
import { TM_ID, attach, openTab, sleep, targets } from './manager.mjs'

const needle = process.argv[2] || 'review build'
if (!(await targets()).some(t => t.type === 'page' && t.url.includes(TM_ID) && t.url.includes('options.html'))) {
    await openTab(`chrome-extension://${TM_ID}/options.html#nav=dashboard`)
    await sleep(2500)
}
const c = await attach(p => p.url.includes(TM_ID) && p.url.includes('options.html'))

// Advanced config mode exposes the per-script Updates section.
await c.run(`location.hash = '#nav=settings'; return true`)
await sleep(2000)
await c.run(`
    const s = [...document.querySelectorAll('select')].find(s => [...s.options].map(o => o.text).join(',') === 'Novice,Beginner,Advanced');
    if (s && s.value !== '2') { s.value = '2'; s.dispatchEvent(new Event('change', { bubbles: true })); }
    return true;
`)
await sleep(1500)
await c.run(`location.hash = '#nav=dashboard'; return true`)
await sleep(2000)
await c.realClick(`[...document.querySelectorAll('span.clickable')].find(s => (s.title || '').includes(${JSON.stringify(needle)}))`)
await sleep(2500)
await c.realClick(`(() => { const e = [...document.querySelectorAll('a,div,span,li')].filter(e => e.getClientRects().length && (e.textContent || '').trim() === 'Settings'); return e[e.length - 1]; })()`)
await sleep(2500)

console.log(JSON.stringify(await c.run(`
    const findRow = (re) => {
        const leaf = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && re.test(e.textContent || ''));
        return leaf ? (leaf.closest('div,tr,li') || leaf.parentElement) : null;
    };
    const updRow = findRow(/Check for updates/i);
    const urlRow = findRow(/Update URL/i);
    const pick = (re) => {
        const s = [...document.querySelectorAll('select')].find(s => re.test((s.closest('div,tr,li')?.innerText) || ''));
        return s ? s.options[s.selectedIndex]?.text : null;
    };
    return {
        title: (document.body.innerText.match(/^Edit - (.*)$/m) || [])[1] || null,
        checkForUpdates: updRow ? !!updRow.querySelector('input[type=checkbox]')?.checked : null,
        updateURL: urlRow ? (urlRow.querySelector('input')?.value ?? null) : null,
        runAt: pick(/Run at:/),
        topFrameOnly: pick(/top frame/i),
        runIn: pick(/Run in:/),
        gmTarget: pick(/GM functions/i),
    };
`), null, 2))
c.close()
