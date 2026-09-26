// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest'
import { FLOATING_HOST_ID, MOUNT_ATTRIBUTE, getNavMenuMounts } from '../src/utils/navMount'
import type { NavMenuMount } from '../src/utils/navMount'

/**
 * Structural fixtures. Only the attributes mount discovery relies on are kept —
 * no styling classes and no conversation content — so these describe the
 * navigation contract rather than a snapshot of ChatGPT's markup.
 *
 * happy-dom has no layout engine, so `getClientRects()` is stubbed to model
 * which elements are actually rendered. That is the whole point of several of
 * these cases: ChatGPT ships more than one shell and hides the inactive one.
 */

/** Marks a subtree as not rendered, the way `display: none` would. */
function hide(root: Element) {
    for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
        ;(element as any).getClientRects = () => []
    }
}

/** Marks a subtree as rendered. */
function show(root: Element) {
    for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
        ;(element as any).getClientRects = () => [{ width: 100, height: 20 }]
    }
}

/**
 * The live layout that exposed the bug: the rail markup is still in the DOM but
 * hidden, and the visible sidebar is a separate panel whose scroll viewport is
 * its last child (so there is no footer sibling to sit above).
 */
const HIDDEN_RAIL_WITH_VISIBLE_PANEL = `
<div id="root">
  <nav aria-label="Show sidebar" data-app-navigation-rail="true" class="hidden-rail">
    <div><button aria-haspopup="menu" aria-label="Help menu"></button></div>
  </nav>
  <nav aria-label="Chat history" class="visible-panel">
    <div class="panel-header"></div>
    <div data-app-action-sidebar-scroll></div>
  </nav>
</div>`

/** Collapsed sidebar: only the rail is rendered. */
const VISIBLE_RAIL_ONLY = `
<div id="root">
  <nav aria-label="App navigation" data-app-navigation-rail="true" class="visible-rail">
    <div><button data-sidebar-destination="builtin:automations"></button></div>
    <div class="rail-footer"><button aria-haspopup="menu" aria-label="Help menu"></button></div>
  </nav>
</div>`

/**
 * The live collapsed state, which the panel strategy used to claim: ChatGPT keeps
 * the expanded panel and its scroll viewport in the DOM at zero size and renders
 * the rail instead.
 */
const COLLAPSED_PANEL_WITH_VISIBLE_RAIL = `
<div id="root">
  <nav aria-label="Show sidebar" data-app-navigation-rail="true" class="visible-rail">
    <div class="rail-footer"><button aria-haspopup="menu" aria-label="Help menu"></button></div>
  </nav>
  <nav aria-label="Chat history" class="collapsed-panel">
    <div data-app-action-sidebar-scroll></div>
  </nav>
</div>`

/** Pre-redesign shell. */
const LEGACY_FOOTER = `
<div id="root">
  <nav aria-label="Chat history" class="legacy">
    <div data-app-action-sidebar-scroll></div>
    <div class="footer"><button aria-haspopup="menu"></button></div>
  </nav>
</div>`

/** A shell with no anchor the exporter recognises. */
const UNKNOWN_SHELL = `<div id="root"><div class="mystery-shell"></div></div>`

/**
 * Gives the document itself a size, so `documentHasLayout()` is true. Without
 * this a fixture models a document with no layout engine, where every candidate
 * is deliberately kept.
 */
function withLayout() {
    ;(document.body as any).getClientRects = () => [{ width: 1440, height: 900 }]
}

function mountAll() {
    const mounts = getNavMenuMounts()
    mounts.forEach(({ insert }: NavMenuMount) => insert(document.createElement('div')))
    return mounts
}

function mounted() {
    return Array.from(document.querySelectorAll(`[${MOUNT_ATTRIBUTE}]`))
}

beforeEach(() => {
    document.body.innerHTML = ''
})

describe('getNavMenuMounts', () => {
    it('skips a hidden rail and mounts into the visible sidebar panel', () => {
        // Regression: upstream 2.36.1 mounted into the display:none rail, so the
        // launcher existed but had no client rects and was invisible on screen.
        document.body.innerHTML = HIDDEN_RAIL_WITH_VISIBLE_PANEL
        hide(document.querySelector('.hidden-rail')!)
        show(document.querySelector('.visible-panel')!)

        mountAll()

        const containers = mounted()
        expect(containers).toHaveLength(1)
        expect(containers[0].getAttribute(MOUNT_ATTRIBUTE)).toBe('sidebar-panel')
        expect(document.querySelector('.hidden-rail')!.contains(containers[0])).toBe(false)
        // Rendered as the panel's own last row.
        expect(document.querySelector('.visible-panel')!.lastElementChild).toBe(containers[0])
    })

    it('uses the rail when the rail is the rendered surface', () => {
        document.body.innerHTML = VISIBLE_RAIL_ONLY
        show(document.querySelector('.visible-rail')!)

        mountAll()

        const containers = mounted()
        expect(containers).toHaveLength(1)
        expect(containers[0].getAttribute(MOUNT_ATTRIBUTE)).toBe('nav-rail')
    })

    it('still prefers the legacy footer when that shell is served', () => {
        document.body.innerHTML = LEGACY_FOOTER
        show(document.querySelector('.legacy')!)

        mountAll()

        expect(mounted()[0].getAttribute(MOUNT_ATTRIBUTE)).toBe('legacy-sidebar-footer')
    })

    it('falls back to its own launcher when nothing is recognised', () => {
        document.body.innerHTML = UNKNOWN_SHELL

        mountAll()

        const host = document.getElementById(FLOATING_HOST_ID)
        expect(host).not.toBeNull()
        expect(mounted()[0].getAttribute(MOUNT_ATTRIBUTE)).toBe('floating')
    })

    it('uses the rail rather than a collapsed panel when the page is laid out', () => {
        // Regression: the panel strategy only required the scroll viewport to be
        // *present*, so a collapsed sidebar produced a 0x0 launcher on the live
        // site while a rendered rail went unused.
        document.body.innerHTML = COLLAPSED_PANEL_WITH_VISIBLE_RAIL
        withLayout()
        hide(document.querySelector('.collapsed-panel')!)
        show(document.querySelector('.visible-rail')!)

        mountAll()

        expect(mounted()).toHaveLength(1)
        expect(mounted()[0].getAttribute(MOUNT_ATTRIBUTE)).toBe('nav-rail')
    })

    it('keeps every candidate when nothing reports a size', () => {
        // No layout information at all — first paint, or a detached document.
        // Dropping everything here would mean never mounting.
        document.body.innerHTML = VISIBLE_RAIL_ONLY

        expect(getNavMenuMounts().length).toBeGreaterThan(0)
    })
})

describe('mount lifecycle', () => {
    /** Mirrors the inject/cleanup loop in `main.tsx`. */
    function createSync() {
        const injectionMap = new Map<Element, Element>()
        return () => {
            const mounts = getNavMenuMounts()
            const active = new Set(mounts.map(({ target }) => target))
            injectionMap.forEach((container, target) => {
                if (!target.isConnected || !container.isConnected || !active.has(target)) {
                    container.remove()
                    injectionMap.delete(target)
                }
            })
            mounts.forEach(({ target, insert }) => {
                if (injectionMap.has(target)) return
                const container = document.createElement('div')
                injectionMap.set(target, container)
                insert(container)
            })
            const host = document.getElementById(FLOATING_HOST_ID)
            if (host && host.children.length === 0) host.remove()
        }
    }

    it('does not duplicate the menu across repeated syncs', () => {
        document.body.innerHTML = HIDDEN_RAIL_WITH_VISIBLE_PANEL
        hide(document.querySelector('.hidden-rail')!)
        show(document.querySelector('.visible-panel')!)
        const sync = createSync()

        sync()
        sync()
        sync()

        expect(mounted()).toHaveLength(1)
    })

    it('moves to the rail when the panel is removed, leaving one menu', () => {
        document.body.innerHTML = HIDDEN_RAIL_WITH_VISIBLE_PANEL
        hide(document.querySelector('.hidden-rail')!)
        show(document.querySelector('.visible-panel')!)
        const sync = createSync()
        sync()
        expect(mounted()[0].getAttribute(MOUNT_ATTRIBUTE)).toBe('sidebar-panel')

        // Collapsing removes the panel and renders the rail instead.
        document.querySelector('.visible-panel')!.remove()
        show(document.querySelector('.hidden-rail')!)
        sync()

        const containers = mounted()
        expect(containers).toHaveLength(1)
        expect(containers[0].getAttribute(MOUNT_ATTRIBUTE)).toBe('nav-rail')
    })

    it('replaces a menu whose target was swapped out by a re-render', () => {
        document.body.innerHTML = HIDDEN_RAIL_WITH_VISIBLE_PANEL
        hide(document.querySelector('.hidden-rail')!)
        show(document.querySelector('.visible-panel')!)
        const sync = createSync()
        sync()
        const first = mounted()[0]

        const panel = document.querySelector('.visible-panel')!
        panel.innerHTML = '<div class="panel-header"></div><div data-app-action-sidebar-scroll></div>'
        show(panel)
        sync()

        const containers = mounted()
        expect(containers).toHaveLength(1)
        expect(containers[0]).not.toBe(first)
        expect(first.isConnected).toBe(false)
    })

    it('drops the floating launcher once a real sidebar appears', () => {
        document.body.innerHTML = UNKNOWN_SHELL
        const sync = createSync()
        sync()
        expect(document.getElementById(FLOATING_HOST_ID)).not.toBeNull()

        document.body.innerHTML = VISIBLE_RAIL_ONLY
        show(document.querySelector('.visible-rail')!)
        sync()

        expect(document.getElementById(FLOATING_HOST_ID)).toBeNull()
        expect(mounted()).toHaveLength(1)
        expect(mounted()[0].getAttribute(MOUNT_ATTRIBUTE)).toBe('nav-rail')
    })
})
