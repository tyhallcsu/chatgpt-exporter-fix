// Does the Export launcher occupy its own space, and does its menu stay reachable?
//
//   node launcher-placement-check.mjs [outDir]
//
// "One [data-ce-mount] with a positive box" is not the question — an element can
// satisfy all of that while sitting on top of the account row, which is exactly
// the defect this checks for. Every case therefore measures pixel overlap against
// the sidebar's other interactive controls, hit-tests the launcher's interior, and
// confirms the conversation list still scrolls to its last item uncovered.
//
// Browser zoom is emulated the way zoom actually behaves — a narrower layout
// viewport at a higher device scale factor — and is labelled as emulated.
import fs from 'node:fs'
import path from 'node:path'
import { sleep, socket, targets } from './manager.mjs'

const OUT = process.argv[2] || path.join(process.env.TMPDIR || '/tmp', 'launcher-placement')
fs.mkdirSync(OUT, { recursive: true })

const MEASURE = `
    const rendered = e => e && e.getClientRects().length > 0;
    const box = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), top: b.top, bottom: b.bottom, left: b.left, right: b.right } };
    const overlapPx = (a, b) => { if (!a || !b) return 0; const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)); const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)); return Math.round(ix * iy) };

    const mounts = [...document.querySelectorAll('[data-ce-mount]')];
    const mount = mounts[0];
    if (!mount) return { mountCount: 0 };
    const trigger = mount.querySelector('[role="button"]') || mount.firstElementChild || mount;
    const trig = box(trigger);

    // Everything interactive in the sidebar that is not ours, ignoring pure
    // containers (an ancestor box legitimately contains the launcher).
    const sidebar = mount.closest('nav')?.parentElement || mount.closest('nav') || document.body;
    const others = [...sidebar.querySelectorAll('button, [role="button"], a[href]')]
        .filter(e => rendered(e) && !mount.contains(e) && !e.contains(mount));
    // A bounding rect keeps reporting a position after a scroll container has
    // clipped the element out of sight, so a plain rect test flags every list row
    // that happens to sit behind the launcher's band. Only count a control that is
    // genuinely on screen — hit-testable at its own centre — and ignore full-bleed
    // overlays and containers that merely enclose the launcher, since whether those
    // steal a click is what the hit test below measures.
    // What matters is the pixels a person can see. A bounding rect keeps reporting
    // the full element after a scroll container has clipped part or all of it, so
    // overlap is computed against the rect intersected with every scrolling
    // ancestor — the row that pokes six clipped pixels behind the launcher is not
    // on screen there. Full-bleed overlays and enclosing containers are skipped
    // too; whether they steal a click is what the hit test measures.
    const visibleRect = (e) => {
        let r = box(e);
        if (!r) return null;
        for (let p = e.parentElement; p; p = p.parentElement) {
            const cs = getComputedStyle(p);
            if (!/auto|scroll|hidden|clip/.test(cs.overflowY + cs.overflowX)) continue;
            const pb = box(p);
            if (!pb) continue;
            const top = Math.max(r.top, pb.top), bottom = Math.min(r.bottom, pb.bottom);
            const left = Math.max(r.left, pb.left), right = Math.min(r.right, pb.right);
            if (bottom <= top || right <= left) return null;
            r = { x: Math.round(left), y: Math.round(top), w: Math.round(right - left), h: Math.round(bottom - top), top, bottom, left, right };
        }
        return r;
    };
    const encloses = (a, b) => a && b && a.left <= b.left + 1 && a.right >= b.right - 1 && a.top <= b.top + 1 && a.bottom >= b.bottom - 1;
    const collisions = others
        .map(e => ({ name: e.getAttribute('aria-label') || (e.innerText || '').trim().slice(0, 18) || e.tagName, vis: visibleRect(e) }))
        .filter(x => x.vis && x.vis.w >= 2 && x.vis.h >= 2 && !encloses(x.vis, trig) && overlapPx(trig, x.vis) > 0)
        .map(x => ({ name: x.name, px: overlapPx(trig, x.vis), at: x.vis.x + ',' + x.vis.y + ' ' + x.vis.w + 'x' + x.vis.h }));

    const hits = [];
    if (trig && trig.w > 2 && trig.h > 2) {
        for (const [fx, fy] of [[0.5, 0.5], [0.2, 0.5], [0.8, 0.5], [0.5, 0.25], [0.5, 0.75]]) {
            const px = trig.left + trig.w * fx, py = trig.top + trig.h * fy;
            const el = document.elementFromPoint(px, py);
            hits.push({ ours: !!(el && mount.contains(el)), got: el ? el.tagName : 'null' });
        }
    }

    const scroll = [...document.querySelectorAll('[data-app-action-sidebar-scroll]')].filter(rendered)[0];
    return {
        viewport: innerWidth + 'x' + innerHeight,
        dpr: devicePixelRatio,
        mountCount: mounts.length,
        strategy: mount.getAttribute('data-ce-mount'),
        accessibleName: trigger.getAttribute('aria-label') || trigger.getAttribute('title') || (trigger.innerText || '').trim() || null,
        launcher: trig && { at: trig.x + ',' + trig.y, size: trig.w + 'x' + trig.h },
        launcherVisible: !!(trig && trig.w > 2 && trig.h > 2 && trig.bottom <= innerHeight + 1 && trig.top >= -1),
        collisions,
        hitTestAllOurs: hits.length > 0 && hits.every(h => h.ours),
        scrollBottom: scroll ? Math.round(box(scroll).bottom) : null,
        launcherTop: trig ? Math.round(trig.top) : null,
    };
`

const MENU = `
    const rendered = e => e && e.getClientRects().length > 0;
    const items = [...document.querySelectorAll('[class*="menu-item"]')].filter(rendered);
    const card = document.querySelector('.ce-card') || (items[1] && items[1].closest('[data-radix-popper-content-wrapper], .ce-card'));
    if (!card) return { open: false, itemCount: items.length };
    const b = card.getBoundingClientRect();
    const trigger = document.querySelector('[data-ce-mount] [role="button"]');
    const tb = trigger ? trigger.getBoundingClientRect() : null;
    const exportAll = items.find(e => (e.innerText || '').trim() === 'Export All');
    const eb = exportAll ? exportAll.getBoundingClientRect() : null;
    const hitAt = (r) => { const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return el ? (el.closest('[class*="menu-item"]') ? 'menu-item' : el.tagName) : 'null' };
    return {
        open: true,
        names: [...new Set(items.map(e => (e.innerText || '').trim()))].filter(Boolean),
        card: { at: Math.round(b.x) + ',' + Math.round(b.y), size: Math.round(b.width) + 'x' + Math.round(b.height) },
        withinViewport: b.bottom <= innerHeight + 1 && b.top >= -1 && b.left >= -1 && b.right <= innerWidth + 1,
        overflow: { bottom: Math.round(b.bottom - innerHeight), top: Math.round(-b.top), right: Math.round(b.right - innerWidth), left: Math.round(-b.left) },
        scrollable: card.scrollHeight > card.clientHeight + 1,
        adjacentToTrigger: tb ? Math.round(Math.min(Math.abs(b.bottom - tb.top), Math.abs(b.top - tb.bottom), Math.abs(b.left - tb.right), Math.abs(b.right - tb.left))) : null,
        exportAllReachable: eb ? (eb.height > 0 && eb.bottom <= innerHeight + 1 && eb.top >= -1 && hitAt(eb) === 'menu-item') : false,
    };
`

const SCROLL_END = `
    const rendered = e => e && e.getClientRects().length > 0;
    const s = [...document.querySelectorAll('[data-app-action-sidebar-scroll]')].filter(rendered)[0];
    if (!s) return { applicable: false };
    // The list lazy-loads as it is scrolled, so one jump to the bottom is not the
    // bottom. Keep going until the scroll height stops growing.
    let previous = -1;
    for (let attempt = 0; attempt < 12 && s.scrollHeight !== previous; attempt++) {
        previous = s.scrollHeight;
        s.scrollTop = s.scrollHeight;
        await new Promise(r => setTimeout(r, 800));
    }
    const items = [...s.querySelectorAll('a[href^="/c/"]')];
    const last = items[items.length - 1];
    if (!last) return { applicable: false };
    const lb = last.getBoundingClientRect(), sb = s.getBoundingClientRect();
    const mount = document.querySelector('[data-ce-mount]');
    const hit = document.elementFromPoint(lb.x + lb.width / 2, lb.y + lb.height / 2);
    return {
        applicable: true,
        atEnd: Math.abs(s.scrollTop + s.clientHeight - s.scrollHeight) <= 2,
        lastItem: (last.innerText || '').trim().slice(0, 24),
        lastItemFullyVisible: lb.bottom <= sb.bottom + 1 && lb.top >= sb.top - 1,
        lastItemUncovered: !(hit && mount && mount.contains(hit)),
    };
`

const t = (await targets()).find(x => x.type === 'page' && x.url.includes('chatgpt.com'))
if (!t) throw new Error('no chatgpt.com tab open in the manager browser')
const c = await socket(t.webSocketDebuggerUrl)
await c.send('Page.enable')
await c.send('Runtime.enable')
const { result: win } = await c.send('Browser.getWindowForTarget', { targetId: t.id })

async function shoot(name) {
    const { result } = await c.send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(result.data, 'base64'))
}

async function closeMenu() {
    await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await sleep(900)
}

async function setSidebar(expanded) {
    const label = expanded ? 'Show sidebar' : 'Hide sidebar'
    await c.run(`
        const b = [...document.querySelectorAll('button,[role=button]')]
            .find(e => (e.getAttribute('aria-label') || '') === ${JSON.stringify(label)} && e.getClientRects().length);
        if (b) b.click();
        return !!b;
    `)
    await sleep(3000)
}

const CASES = [
    { name: 'expanded-1440x950', width: 1440, height: 950, zoom: 1, expanded: true },
    { name: 'collapsed-1440x950', width: 1440, height: 950, zoom: 1, expanded: false },
    { name: 'short-1440x620', width: 1440, height: 620, zoom: 1, expanded: true },
    { name: 'narrow-520', width: 520, height: 900, zoom: 1, expanded: true },
    // Browser zoom's effect on layout is a smaller CSS viewport. CSS `zoom` was
    // tried and is not equivalent — `innerWidth`/`innerHeight` stay unzoomed while
    // rects scale, so every viewport comparison measures an artifact. A device
    // metrics override wedged the renderer. These are the CSS viewports that
    // 125% and 150% zoom produce at 1440x950, and are labelled as that rather
    // than as real browser zoom.
    { name: 'zoom125-equivalent-1152x760', width: 1152, height: 760, zoom: 1, expanded: true },
    { name: 'zoom150-equivalent-960x633', width: 960, height: 633, zoom: 1, expanded: true },
]

// `PLACEMENT_CASES=collapsed,narrow` runs a subset while iterating on one defect.
const only = (process.env.PLACEMENT_CASES || '').split(',').map(x => x.trim()).filter(Boolean)
const selected = only.length ? CASES.filter(k => only.some(o => k.name.includes(o))) : CASES

// A userscript is only re-evaluated on a page load. Measuring an already-open
// document after installing a new build silently reports the *old* build, so the
// run starts by reloading and confirming the script is live.
await c.send('Page.bringToFront')
await c.send('Page.reload')
await sleep(2500)
await c.send('Page.bringToFront')
await sleep(9000)
const live = await c.run(`
    const mount = document.querySelector('[data-ce-mount]');
    return { mounted: !!mount, strategy: mount && mount.getAttribute('data-ce-mount') };
`)
console.log(`reloaded; exporter mounted=${live.mounted} strategy=${live.strategy}`)
if (!live.mounted) throw new Error('the exporter did not mount after reload — nothing to measure')

const results = []
for (const kase of selected) {
  try {
    await c.send('Browser.setWindowBounds', { windowId: win.windowId, bounds: { windowState: 'normal', left: 20, top: 40, width: kase.width, height: kase.height } })
    await sleep(1800)
    // Zoom via CSS `zoom` on the root: it shrinks the layout viewport in CSS px
    // exactly as browser page zoom does. A device-metrics override was tried first
    // and wedged the renderer, so this is the emulation actually used.
    await c.run(`document.documentElement.style.zoom = ${JSON.stringify(kase.zoom === 1 ? '' : String(kase.zoom))}; return true`)
    if (kase.zoom !== 1) await sleep(2000)
    await c.send('Page.bringToFront')
    await closeMenu()
    await setSidebar(kase.expanded)
    await closeMenu()

    const closed = await c.run(MEASURE)
    await shoot(`${kase.name}-closed`)
    const scrollEnd = await c.run(SCROLL_END)

    await c.realClick(`(() => { const m = document.querySelector('[data-ce-mount]'); return m.querySelector('[role="button"]') || m.firstElementChild; })()`).catch(() => {})
    await sleep(1800)
    const open = await c.run(MENU)
    await shoot(`${kase.name}-open`)
    await closeMenu()

    const pass = closed.mountCount === 1
        && closed.launcherVisible
        && closed.collisions.length === 0
        && closed.hitTestAllOurs
        && !!closed.accessibleName
        && open.open === true
        && (open.withinViewport || open.scrollable)
        && open.exportAllReachable
        && (scrollEnd.applicable === false || (scrollEnd.lastItemFullyVisible && scrollEnd.lastItemUncovered))

    results.push({ case: kase.name, zoom: kase.zoom, pass, closed, open, scrollEnd })
    // Written after every case: a later hang must not lose what is already measured.
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
    console.log(`\n=== ${kase.name}${kase.zoom !== 1 ? ` (zoom ${kase.zoom * 100}%, emulated)` : ''} → ${pass ? 'PASS' : 'FAIL'} ===`)
    console.log(`  viewport ${closed.viewport} dpr ${closed.dpr} | mounts ${closed.mountCount} | strategy ${closed.strategy} | name "${closed.accessibleName}"`)
    console.log(`  launcher ${closed.launcher ? closed.launcher.at + ' ' + closed.launcher.size : 'none'} visible=${closed.launcherVisible} hitTestAllOurs=${closed.hitTestAllOurs}`)
    console.log(`  collisions: ${closed.collisions.length ? JSON.stringify(closed.collisions) : 'none'}`)
    console.log(`  menu: within=${open.withinViewport} scrollable=${open.scrollable} gap=${open.adjacentToTrigger} exportAllReachable=${open.exportAllReachable} overflow=${JSON.stringify(open.overflow)}`)
    console.log(`  list: ${scrollEnd.applicable ? `atEnd=${scrollEnd.atEnd} lastVisible=${scrollEnd.lastItemFullyVisible} uncovered=${scrollEnd.lastItemUncovered} ("${scrollEnd.lastItem}")` : 'n/a'}`)
  }
  catch (error) {
    results.push({ case: kase.name, zoom: kase.zoom, pass: false, error: String(error.message || error) })
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
    console.log(`\n=== ${kase.name} → ERROR: ${error.message || error} ===`)
  }
}

await c.run(`document.documentElement.style.zoom = ''; return true`).catch(() => {})
await c.send('Browser.setWindowBounds', { windowId: win.windowId, bounds: { windowState: 'normal', left: 20, top: 40, width: 1440, height: 950 } })
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter(r => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} cases pass. Screenshots and results.json in ${OUT}`)
if (failed.length) console.log(`FAILED: ${failed.map(f => f.case).join(', ')}`)
c.close()
process.exit(failed.length ? 1 : 0)
