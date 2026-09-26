// Close whatever exporter dialog or menu is open, so the next check starts clean.
//
//   node close-dialog.mjs
import { attach, sleep } from './manager.mjs'

const c = await attach('chatgpt.com')
await c.send('Page.bringToFront')
for (let attempt = 0; attempt < 3; attempt++) {
    const open = await c.run(`
        const dialog = document.querySelector('[role="dialog"]');
        const card = document.querySelector('.ce-card');
        return !!(dialog && dialog.getClientRects().length) || !!(card && card.getClientRects().length);
    `)
    if (!open) break
    await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await sleep(900)
}
console.log(await c.run(`
    const dialog = document.querySelector('[role="dialog"]');
    const card = document.querySelector('.ce-card');
    return 'dialog open: ' + !!(dialog && dialog.getClientRects().length) + ', menu open: ' + !!(card && card.getClientRects().length);
`))
c.close()
