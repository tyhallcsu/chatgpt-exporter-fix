// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest'
import { FLOATING_HOST_ID, MOUNT_ATTRIBUTE, cleanupFloatingHost, getNavMenuMounts } from '../src/utils/navMount'
import type { NavMenuMount } from '../src/utils/navMount'

/**
 * Structural fixtures. Only the attributes the exporter relies on are kept —
 * no styling classes and no conversation content — so the tests describe the
 * navigation contract rather than a snapshot of ChatGPT's markup.
 */

/** Sidebar shipped before the 2026 navigation redesign. */
const LEGACY_PROFILE_LAYOUT = `
<div id="root">
  <nav aria-label="Chat history">
    <div data-app-action-sidebar-scroll></div>
    <div class="footer">
      <div><button data-testid="accounts-profile-button" aria-haspopup="menu">Account</button></div>
    </div>
  </nav>
</div>`

/** Same era, but without the test hook on the account button. */
const LEGACY_FOOTER_LAYOUT = `
<div id="root">
  <nav aria-label="Chat history">
    <div data-app-action-sidebar-scroll></div>
    <div class="footer"><button aria-haspopup="menu">Account</button></div>
  </nav>
</div>`

/** Current shell with the wide sidebar panel open. */
const CURRENT_EXPANDED_LAYOUT = `
<div id="root">
  <aside data-app-shell-left-panel-appearance="default">
    <nav data-app-navigation-rail="true" aria-label="App navigation">
      <div aria-hidden="true"></div>
      <div class="destinations">
        <button data-sidebar-destination="builtin:home"></button>
        <button data-sidebar-destination="builtin:automations"></button>
      </div>
      <div class="rail-footer">
        <button aria-haspopup="menu" aria-label="Help menu"></button>
        <button aria-haspopup="menu" aria-label="Open profile menu"></button>
      </div>
    </nav>
    <nav role="navigation" aria-label="Home">
      <div class="panel-header"></div>
      <div data-app-action-sidebar-scroll></div>
    </nav>
  </aside>
</div>`

/** Current shell with the sidebar collapsed: the panel is removed entirely. */
const CURRENT_COLLAPSED_LAYOUT = `
<div id="root">
  <aside data-app-shell-left-panel-appearance="default">
    <nav data-app-navigation-rail="true" aria-label="App navigation">
      <div aria-hidden="true"></div>
      <div class="destinations">
        <button data-sidebar-destination="builtin:automations"></button>
      </div>
      <div class="rail-footer">
        <button aria-haspopup="menu" aria-label="Help menu"></button>
        <button aria-haspopup="menu" aria-label="Open profile menu"></button>
      </div>
    </nav>
  </aside>
</div>`

/** A shell the exporter has never seen: no known anchor anywhere. */
const UNKNOWN_LAYOUT = `<div id="root"><div class="mystery-shell"></div></div>`

function setLayout(html: string) {
    document.body.innerHTML = html
}

function makeContainer() {
    return document.createElement('div')
}

/** Mirrors the mount/cleanup loop in `main.tsx`. */
function createSync() {
    const injectionMap = new Map<Element, Element>()

    const sync = (options?: { allowFloating?: boolean }) => {
        const mounts = getNavMenuMounts(document, options)
        const active = new Set(mounts.map(({ target }) => target))

        injectionMap.forEach((container, target) => {
            if (!target.isConnected || !container.isConnected || !active.has(target)) {
                container.remove()
                injectionMap.delete(target)
            }
        })

        mounts.forEach(({ target, insert }: NavMenuMount) => {
            if (injectionMap.has(target)) return
            const container = makeContainer()
            injectionMap.set(target, container)
            insert(container)
        })
        cleanupFloatingHost()
        return mounts
    }

    return { sync, injectionMap }
}

function mountedContainers() {
    return Array.from(document.querySelectorAll(`[${MOUNT_ATTRIBUTE}]`))
}

describe('getNavMenuMounts', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
    })

    it('uses the legacy profile button when the old sidebar is served', () => {
        setLayout(LEGACY_PROFILE_LAYOUT)
        const mounts = getNavMenuMounts(document)

        expect(mounts).toHaveLength(1)
        expect(mounts[0].strategy).toBe('legacy-profile-button')
    })

    it('inserts above the legacy profile button rather than inside its wrapper', () => {
        setLayout(LEGACY_PROFILE_LAYOUT)
        const [mount] = getNavMenuMounts(document)
        const container = makeContainer()
        mount.insert(container)

        const wrapper = document.querySelector('[data-testid="accounts-profile-button"]')!.parentElement!
        expect(container.nextElementSibling).toBe(wrapper)
    })

    it('falls back to the legacy footer when the test hook is absent', () => {
        setLayout(LEGACY_FOOTER_LAYOUT)
        const mounts = getNavMenuMounts(document)

        expect(mounts).toHaveLength(1)
        expect(mounts[0].strategy).toBe('legacy-sidebar-footer')
    })

    it('mounts into the sidebar panel when the current sidebar is expanded', () => {
        setLayout(CURRENT_EXPANDED_LAYOUT)
        const mounts = getNavMenuMounts(document)

        expect(mounts).toHaveLength(1)
        expect(mounts[0].strategy).toBe('sidebar-panel')

        const container = makeContainer()
        mounts[0].insert(container)

        const panel = document.querySelector('nav[aria-label="Home"]')!
        expect(container.parentElement).toBe(panel)
        // Rendered last so it reads as the panel's footer row.
        expect(panel.lastElementChild).toBe(container)
        expect(container.getAttribute(MOUNT_ATTRIBUTE)).toBe('sidebar-panel')
    })

    it('prefers the panel over the rail while both are present', () => {
        setLayout(CURRENT_EXPANDED_LAYOUT)
        const { sync } = createSync()
        sync()

        expect(mountedContainers()).toHaveLength(1)
        expect(document.querySelector('[data-app-navigation-rail] [data-ce-mount]')).toBeNull()
    })

    it('mounts into the rail when the sidebar is collapsed', () => {
        setLayout(CURRENT_COLLAPSED_LAYOUT)
        const mounts = getNavMenuMounts(document)

        expect(mounts).toHaveLength(1)
        expect(mounts[0].strategy).toBe('nav-rail')

        const container = makeContainer()
        mounts[0].insert(container)

        // Joins the rail's trailing cluster (help / account) instead of
        // displacing the destinations at the top of the rail.
        expect(container.parentElement).toBe(document.querySelector('.rail-footer'))
        expect(container.parentElement!.firstElementChild).toBe(container)
    })

    it('falls back to a floating launcher when no navigation is recognised', () => {
        setLayout(UNKNOWN_LAYOUT)
        const mounts = getNavMenuMounts(document)

        expect(mounts).toHaveLength(1)
        expect(mounts[0].strategy).toBe('floating')

        const container = makeContainer()
        mounts[0].insert(container)

        const host = document.getElementById(FLOATING_HOST_ID)
        expect(host).not.toBeNull()
        expect(container.parentElement).toBe(host)
    })

    it('suppresses the floating launcher when it is not allowed yet', () => {
        setLayout(UNKNOWN_LAYOUT)
        expect(getNavMenuMounts(document, { allowFloating: false })).toHaveLength(0)
    })
})

describe('mount lifecycle', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
    })

    it('does not duplicate the menu when sync runs repeatedly', () => {
        setLayout(CURRENT_EXPANDED_LAYOUT)
        const { sync } = createSync()

        sync()
        sync()
        sync()

        expect(mountedContainers()).toHaveLength(1)
    })

    it('re-mounts into the rail when the sidebar collapses, leaving one menu', () => {
        setLayout(CURRENT_EXPANDED_LAYOUT)
        const { sync } = createSync()
        sync()
        expect(mountedContainers()[0].getAttribute(MOUNT_ATTRIBUTE)).toBe('sidebar-panel')

        // Collapsing removes the whole panel from the document.
        document.querySelector('nav[aria-label="Home"]')!.remove()
        sync()

        const containers = mountedContainers()
        expect(containers).toHaveLength(1)
        expect(containers[0].getAttribute(MOUNT_ATTRIBUTE)).toBe('nav-rail')
    })

    it('restores the panel mount when the sidebar expands again', () => {
        setLayout(CURRENT_COLLAPSED_LAYOUT)
        const { sync } = createSync()
        sync()
        expect(mountedContainers()[0].getAttribute(MOUNT_ATTRIBUTE)).toBe('nav-rail')

        const panel = document.createElement('nav')
        panel.setAttribute('role', 'navigation')
        panel.setAttribute('aria-label', 'Home')
        panel.innerHTML = '<div class="panel-header"></div><div data-app-action-sidebar-scroll></div>'
        document.querySelector('aside')!.append(panel)
        sync()

        const containers = mountedContainers()
        expect(containers).toHaveLength(1)
        expect(containers[0].getAttribute(MOUNT_ATTRIBUTE)).toBe('sidebar-panel')
    })

    it('replaces a menu whose target was swapped out by a re-render', () => {
        setLayout(CURRENT_EXPANDED_LAYOUT)
        const { sync } = createSync()
        sync()
        const first = mountedContainers()[0]

        // React re-renders the panel, replacing the scroll viewport node.
        const panel = document.querySelector('nav[aria-label="Home"]')!
        panel.innerHTML = '<div class="panel-header"></div><div data-app-action-sidebar-scroll></div>'
        sync()

        const containers = mountedContainers()
        expect(containers).toHaveLength(1)
        expect(containers[0]).not.toBe(first)
        expect(first.isConnected).toBe(false)
    })

    it('drops the floating launcher once a real sidebar appears', () => {
        setLayout(UNKNOWN_LAYOUT)
        const { sync } = createSync()
        sync()
        expect(document.getElementById(FLOATING_HOST_ID)).not.toBeNull()

        setLayout(CURRENT_EXPANDED_LAYOUT)
        sync()

        expect(document.getElementById(FLOATING_HOST_ID)).toBeNull()
        expect(mountedContainers()).toHaveLength(1)
        expect(mountedContainers()[0].getAttribute(MOUNT_ATTRIBUTE)).toBe('sidebar-panel')
    })
})
