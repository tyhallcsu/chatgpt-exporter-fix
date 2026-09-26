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

export interface NavMenuMount {
    target: Element
    insert: (container: Element) => void
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

    // Collapsed sidebar: place the menu above the first footer menu, which is
    // the help menu.
    const railMenuButtons = preferRendered(Array.from(document.querySelectorAll(RAIL_MENU_BUTTON_SELECTOR)))
    if (railMenuButtons.length > 0) {
        const railMenuButton = railMenuButtons[0]
        return [{
            target: railMenuButton,
            insert: (container) => {
                container.setAttribute(MOUNT_ATTRIBUTE, 'nav-rail')
                getNavMenuInsertionTarget(railMenuButton).before(container)
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
