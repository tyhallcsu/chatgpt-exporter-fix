/**
 * Mount discovery for the exporter's navigation menu.
 *
 * Kept apart from `main.tsx` so placement can be regression-tested against
 * structural fixtures. Strategies are tried in order and the first that yields
 * a *rendered* target wins, so exactly one menu is mounted even when several
 * anchors exist in the DOM at once.
 */

export const PROFILE_BUTTON_SELECTOR = '[data-testid="accounts-profile-button"]'
export const SIDEBAR_SCROLL_SELECTOR = '[data-app-action-sidebar-scroll]'
export const AUTOMATIONS_SELECTOR = '[data-sidebar-destination="builtin:automations"]'
// The redesigned navigation rail keeps the help and profile menus in its footer.
export const MESSAGE_UNIT_SELECTOR = '[data-chatgpt-conversation-selection-target] [data-chatgpt-search-message-ids]'
export const RAIL_MENU_BUTTON_SELECTOR = '[data-app-navigation-rail] button[aria-haspopup="menu"]'
/** Host of the exporter's own launcher when no navigation anchor is usable. */
export const FLOATING_HOST_ID = 'chatgpt-exporter-floating-root'
/** Records which strategy placed a menu, so CSS and tests can tell them apart. */
export const MOUNT_ATTRIBUTE = 'data-ce-mount'

/**
 * ChatGPT ships more than one navigation shell and keeps the inactive one in
 * the DOM with `display: none`. Mounting into a hidden target produces a menu
 * nobody can see, so unrendered candidates are dropped. When nothing reports a
 * size — first layout, or a document with no layout engine — every candidate is
 * kept so the menu still mounts.
 */
/**
 * Whether the document reports layout at all.
 *
 * `preferRendered` keeps every candidate when nothing has a size, so the menu
 * still mounts during first layout or in a document with no layout engine. That
 * escape hatch must not apply once the page really is laid out: ChatGPT keeps
 * inactive shells in the DOM at zero size, and mounting into one produces a 0x0
 * launcher when a later strategy — ultimately the floating one — would have
 * placed a visible menu.
 */
function documentHasLayout() {
    const body = document.body
    return !!body && typeof body.getClientRects === 'function' && body.getClientRects().length > 0
}

export function preferRendered<T extends Element>(elements: T[]): T[] {
    const rendered = elements.filter(element =>
        typeof element.getClientRects === 'function' && element.getClientRects().length > 0)
    if (rendered.length > 0) return rendered
    return documentHasLayout() ? [] : elements
}

/** ChatGPT's inline custom property reserving room for the sidebar footer. */
export const SIDEBAR_FOOTER_VAR = '--sidebar-footer-height'

interface SidebarFooter {
    /** The bottom-anchored group ChatGPT overlays on the sidebar (profile row, …). */
    group: HTMLElement
    /** The element carrying `--sidebar-footer-height`, which the scroll area reserves. */
    owner: HTMLElement
    /** The reserved height, in px, as the owner currently declares it. */
    reserved: number
}

/** Original inline value of the reservation, so cleanup can put it back verbatim. */
const reservedBefore = new WeakMap<HTMLElement, string | null>()

function pxOf(value: string) {
    const n = Number.parseFloat(value)
    return Number.isFinite(n) ? n : Number.NaN
}

/**
 * Finds the footer ChatGPT overlays on the sidebar, and the element that reserves
 * room for it.
 *
 * The scroll area keeps clear of the footer with `margin-bottom:
 * var(--sidebar-footer-height)`, and the footer itself is absolutely positioned
 * against the sidebar's bottom edge, *outside* the navigation element. Anything
 * appended to the navigation therefore lands in the band the footer already
 * occupies. Identified structurally — the bottom-anchored box whose height is the
 * reserved height — so no localised label or generated class name is relied on.
 */
function getSidebarFooter(scrollRoot: Element): SidebarFooter | null {
    let owner: HTMLElement | null = scrollRoot.parentElement as HTMLElement | null
    while (owner && !owner.style?.getPropertyValue(SIDEBAR_FOOTER_VAR)) {
        owner = owner.parentElement as HTMLElement | null
    }
    if (!owner) return null

    const reserved = pxOf(getComputedStyle(owner).getPropertyValue(SIDEBAR_FOOTER_VAR))
    if (!Number.isFinite(reserved) || reserved <= 0) return null

    const group = Array.from(owner.querySelectorAll<HTMLElement>('*')).find((element) => {
        if (element.contains(scrollRoot) || scrollRoot.contains(element)) return false
        if (element.getClientRects().length === 0) return false
        const style = getComputedStyle(element)
        if (style.position !== 'absolute' || pxOf(style.bottom) !== 0) return false
        return Math.abs(element.getBoundingClientRect().height - reserved) <= 1
    })
    if (!group) return null

    return { group, owner, reserved }
}

/**
 * Grows the reservation to the footer's current height.
 *
 * Adding a row makes the footer taller; without this the extra height would cover
 * the end of the conversation list instead of pushing it up, and the last item
 * could not be scrolled to. Uses ChatGPT's own reservation property rather than a
 * negative margin or a stacking-order trick.
 */
export function reserveSidebarFooterSpace(owner: HTMLElement, group: HTMLElement) {
    if (!reservedBefore.has(owner)) {
        reservedBefore.set(owner, owner.style.getPropertyValue(SIDEBAR_FOOTER_VAR) || null)
    }
    const needed = Math.ceil(group.getBoundingClientRect().height)
    if (!Number.isFinite(needed) || needed <= 0) return
    if (pxOf(owner.style.getPropertyValue(SIDEBAR_FOOTER_VAR)) === needed) return
    owner.style.setProperty(SIDEBAR_FOOTER_VAR, `${needed}px`)
}

/** Puts the reservation back exactly as ChatGPT had it. */
export function releaseSidebarFooterSpace(owner: HTMLElement) {
    if (!reservedBefore.has(owner)) return
    const original = reservedBefore.get(owner) ?? null
    if (original === null) owner.style.removeProperty(SIDEBAR_FOOTER_VAR)
    else owner.style.setProperty(SIDEBAR_FOOTER_VAR, original)
    reservedBefore.delete(owner)
}

/** Owners whose reservation this module has grown, so a sync can keep them current. */
const grownOwners = new Set<HTMLElement>()

/** Re-measures every grown reservation. Cheap, and called from the mount sync. */
export function syncSidebarFooterSpace() {
    for (const owner of grownOwners) {
        if (!owner.isConnected) {
            releaseSidebarFooterSpace(owner)
            grownOwners.delete(owner)
            continue
        }
        const group = Array.from(owner.querySelectorAll<HTMLElement>(`[${MOUNT_ATTRIBUTE}="sidebar-footer"]`))[0]?.parentElement
        if (!group || !group.isConnected) {
            releaseSidebarFooterSpace(owner)
            grownOwners.delete(owner)
            continue
        }
        reserveSidebarFooterSpace(owner, group)
    }
}

export interface NavMenuMount {
    target: Element
    insert: (container: Element) => void
}

/** The rail's own direct child that holds `element`, i.e. one whole rail row. */
function railRowOf(element: Element, rail: Element | null) {
    if (!rail) return null
    let row: Element | null = element
    while (row && row.parentElement && row.parentElement !== rail) row = row.parentElement
    return row && row.parentElement === rail ? row : null
}

function getNavMenuInsertionTarget(target: Element) {
    const wrapper = target.parentElement
    if (!wrapper || wrapper.children.length !== 1) return target

    return wrapper
}

/**
 * Resolves where the menu should live right now. Strategies are tried in order
 * and the first that yields a *rendered* target wins, so exactly one menu is
 * mounted even when several anchors are present in the DOM at once.
 */
export function getNavMenuMounts(): NavMenuMount[] {
    const profileButtons = preferRendered(Array.from(document.querySelectorAll(PROFILE_BUTTON_SELECTOR)))
    if (profileButtons.length > 0) {
        return profileButtons.map(target => ({
            target,
            insert: (container) => {
                container.setAttribute(MOUNT_ATTRIBUTE, 'legacy-profile-button')
                getNavMenuInsertionTarget(target).before(container)
            },
        }))
    }

    const scrollRoots = preferRendered(Array.from(document.querySelectorAll(SIDEBAR_SCROLL_SELECTOR)))

    const profileFooters = scrollRoots
        .map(scrollRoot => scrollRoot.nextElementSibling)
        .filter((footer): footer is Element => !!footer?.querySelector('button[aria-haspopup="menu"]'))
    if (profileFooters.length > 0) {
        return profileFooters.map(target => ({
            target,
            insert: (container) => {
                container.setAttribute(MOUNT_ATTRIBUTE, 'legacy-sidebar-footer')
                target.prepend(container)
            },
        }))
    }

    // Expanded sidebar, current shell. The menu becomes a row inside the footer
    // ChatGPT overlays on the sidebar, directly above the account row, and the
    // reservation grows so neither row covers the other or the conversation list.
    const footers = scrollRoots
        .map(scrollRoot => getSidebarFooter(scrollRoot))
        .filter((footer): footer is SidebarFooter => footer !== null)
    if (footers.length > 0) {
        return footers.map(({ group, owner }) => ({
            target: group,
            insert: (container) => {
                container.setAttribute(MOUNT_ATTRIBUTE, 'sidebar-footer')
                group.prepend(container)
                grownOwners.add(owner)
                reserveSidebarFooterSpace(owner, group)
            },
        }))
    }

    // Expanded sidebar. On the layouts where the scroll viewport is the panel's
    // last child there is no footer sibling to sit above, so the menu becomes
    // the panel's own last row. Keyed on the viewport, which is torn down with
    // the sidebar and therefore signals exactly when to re-place the menu.
    //
    // `scrollRoots` is already narrowed to rendered viewports, so a collapsed
    // sidebar falls through to the rail rather than hiding the menu inside it.
    const panels = scrollRoots.filter(scrollRoot => !!scrollRoot.parentElement)
    if (panels.length > 0) {
        return panels.map(scrollRoot => ({
            target: scrollRoot,
            insert: (container) => {
                container.setAttribute(MOUNT_ATTRIBUTE, 'sidebar-panel')
                scrollRoot.parentElement!.append(container)
            },
        }))
    }

    // Collapsed sidebar. The rail is a column of rows, and its last one holds the
    // account control — which is itself the `aria-haspopup="menu"` button this
    // selector finds. Inserting next to that button put the menu *inside* the
    // account row as a second flex item, on top of it. Insert before the whole
    // row instead, so the menu gets a row of the rail to itself.
    const railMenuButtons = preferRendered(Array.from(document.querySelectorAll(RAIL_MENU_BUTTON_SELECTOR)))
    if (railMenuButtons.length > 0) {
        const railMenuButton = railMenuButtons[0]
        const rail = railMenuButton.closest('[data-app-navigation-rail]')
        return [{
            target: railMenuButton,
            insert: (container) => {
                container.setAttribute(MOUNT_ATTRIBUTE, 'nav-rail')
                const row = railRowOf(railMenuButton, rail)
                if (row) row.before(container)
                else getNavMenuInsertionTarget(railMenuButton).before(container)
            },
        }]
    }

    const automations = preferRendered(Array.from(document.querySelectorAll(AUTOMATIONS_SELECTOR)))
    if (automations.length > 0) {
        return automations.map(target => ({
            target,
            insert: (container) => {
                container.setAttribute(MOUNT_ATTRIBUTE, 'automations')
                getNavMenuInsertionTarget(target).before(container)
            },
        }))
    }

    // Nothing recognisable is on screen. Rather than disappear, the exporter
    // mounts a small launcher in a container it owns outright, so no app DOM is
    // touched. Superseded as soon as a real anchor appears.
    if (!document.body) return []
    return [{
        target: document.body,
        insert: (container) => {
            container.setAttribute(MOUNT_ATTRIBUTE, 'floating')
            const host = document.getElementById(FLOATING_HOST_ID) ?? (() => {
                const element = document.createElement('div')
                element.id = FLOATING_HOST_ID
                document.body.append(element)
                return element
            })()
            host.append(container)
        },
    }]
}
