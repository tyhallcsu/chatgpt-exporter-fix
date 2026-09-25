/**
 * Mount discovery for the exporter's navigation menu.
 *
 * ChatGPT reshuffles its navigation chrome regularly, so this module keeps
 * discovery* separate from *insertion* and *lifecycle* (see `main.tsx`).
 * Strategies are tried in order and the first one that resolves wins, so a
 * single menu is mounted even when several anchors happen to be present.
 *
 * Every selector below is chosen for what it *means* to the app rather than
 * how it looks, and each one documents the fallback that covers its removal.
 */

export type NavMountStrategy =
    | 'legacy-profile-button'
    | 'legacy-sidebar-footer'
    | 'sidebar-panel'
    | 'nav-rail'
    | 'floating'

export interface NavMenuMount {
    /**
     * The element whose continued presence keeps this mount valid. When it is
     * detached — sidebar collapsed, route change, React re-render — the
     * lifecycle in `main.tsx` tears the menu down and re-runs discovery.
     */
    target: Element
    /** Places the (already rendered) menu container relative to `target`. */
    insert: (container: Element) => void
    /** Which strategy produced the mount. Surfaced for logging and tests. */
    strategy: NavMountStrategy
}

/**
 * Marks the menu container with the strategy that placed it so the stylesheet
 * can adapt the trigger to its surroundings without guessing.
 */
export const MOUNT_ATTRIBUTE = 'data-ce-mount'

/**
 * The account control in the pre-2026 sidebar footer.
 *
 * Semantics: the profile/account button. Stability: low — it is a test hook,
 * and ChatGPT has since stripped `data-testid` from the whole app shell.
 * Retained only because `chat.openai.com` and staged rollouts still serve the
 * older shell. Fallback: every strategy below.
 */
export const LEGACY_PROFILE_BUTTON_SELECTOR = '[data-testid="accounts-profile-button"]'

/**
 * The scroll viewport holding the sidebar's conversation list.
 *
 * Semantics: an "app action" target — part of ChatGPT's keyboard/command
 * surface, not a styling hook — which is why it survived the navigation
 * redesign that deleted every `data-testid` around it. It is present only
 * while the wide sidebar panel is open, which makes it an accurate signal for
 * "the expanded sidebar exists right now".
 * Fallback: `NAV_RAIL_SELECTOR`, then the floating launcher.
 */
export const SIDEBAR_SCROLL_SELECTOR = '[data-app-action-sidebar-scroll]'

/**
 * The narrow icon rail that persists when the sidebar panel is collapsed.
 *
 * Semantics: the app's primary navigation region. It is also exposed as
 * `<nav aria-label="…">`, so `NAV_RAIL_FALLBACK_SELECTOR` can stand in if the
 * data attribute is renamed. Fallback: the floating launcher.
 */
export const NAV_RAIL_SELECTOR = '[data-app-navigation-rail]'

/**
 * Role-based stand-in for the rail: a navigation landmark narrow enough that
 * it can only be the icon rail. Used when `NAV_RAIL_SELECTOR` disappears.
 */
export const NAV_RAIL_FALLBACK_SELECTOR = 'nav[aria-label], nav[role="navigation"], aside nav'

/** Widest a navigation region can be while still being the collapsed icon rail. */
const RAIL_MAX_WIDTH = 120

/** A popup-menu button, used to recognise the legacy account footer. */
const MENU_BUTTON_SELECTOR = 'button[aria-haspopup="menu"]'

function query(root: ParentNode, selector: string): Element[] {
    try {
        return Array.from(root.querySelectorAll(selector))
    }
    catch {
        // A selector the browser cannot parse must never take the whole
        // discovery chain down with it.
        return []
    }
}

/**
 * Elements are measured through `getBoundingClientRect` when it is available.
 * Test environments without layout report zeroes, so callers treat a missing
 * measurement as "unknown" rather than "hidden".
 */
function widthOf(element: Element): number | null {
    const rect = typeof element.getBoundingClientRect === 'function'
        ? element.getBoundingClientRect()
        : null
    if (!rect) return null
    return rect.width || null
}

/**
 * Narrows candidates to the ones the user can actually see.
 *
 * ChatGPT renders the desktop sidebar and the mobile drawer at the same time
 * and hides whichever does not apply, so a naive query matches both and would
 * mount a second, invisible copy of the menu. When nothing reports a size —
 * during first layout, or in a test document without a layout engine — every
 * candidate is kept so the menu still mounts.
 */
function preferRendered<T extends Element>(elements: T[]): T[] {
    const rendered = elements.filter(element =>
        typeof element.getClientRects === 'function' && element.getClientRects().length > 0)
    return rendered.length > 0 ? rendered : elements
}

/**
 * The legacy layout wrapped the account button in a single-child container.
 * Inserting before that wrapper keeps the menu outside of it.
 */
function getNavMenuInsertionTarget(target: Element) {
    const wrapper = target.parentElement
    if (!wrapper || wrapper.children.length !== 1) return target

    return wrapper
}

function tagMount(container: Element, strategy: NavMountStrategy) {
    container.setAttribute(MOUNT_ATTRIBUTE, strategy)
}

/** Pre-2026 shell: sit directly above the account button. */
function discoverLegacyProfileButton(root: ParentNode): NavMenuMount[] {
    return preferRendered(query(root, LEGACY_PROFILE_BUTTON_SELECTOR)).map(target => ({
        target,
        strategy: 'legacy-profile-button' as const,
        insert: (container: Element) => {
            tagMount(container, 'legacy-profile-button')
            getNavMenuInsertionTarget(target).before(container)
        },
    }))
}

/**
 * Pre-2026 shell without the test hook: the footer was a sibling rendered
 * after the scroll viewport and contained the account menu button.
 */
function discoverLegacySidebarFooter(root: ParentNode): NavMenuMount[] {
    return query(root, SIDEBAR_SCROLL_SELECTOR)
        .map(scrollRoot => scrollRoot.nextElementSibling)
        .filter((footer): footer is Element => !!footer?.querySelector(MENU_BUTTON_SELECTOR))
        .map(target => ({
            target,
            strategy: 'legacy-sidebar-footer' as const,
            insert: (container: Element) => {
                tagMount(container, 'legacy-sidebar-footer')
                target.prepend(container)
            },
        }))
}

/**
 * Current shell, sidebar expanded: the conversation list scrolls inside
 * `[data-app-action-sidebar-scroll]` and the panel that owns it is the
 * sidebar. The menu becomes the panel's last row, which is where a footer
 * action belongs and is the one spot that never overlaps the list.
 */
function discoverSidebarPanel(root: ParentNode): NavMenuMount[] {
    return preferRendered(query(root, SIDEBAR_SCROLL_SELECTOR))
        .map<NavMenuMount | null>((scrollRoot) => {
            const panel = scrollRoot.parentElement
            if (!panel) return null
            return {
                // Keyed on the scroll viewport: the panel element can be
                // reused across routes, the viewport is torn down with the
                // sidebar, which is exactly when the menu must be re-placed.
                target: scrollRoot,
                strategy: 'sidebar-panel' as const,
                insert: (container: Element) => {
                    tagMount(container, 'sidebar-panel')
                    panel.append(container)
                },
            }
        })
        .filter((mount): mount is NavMenuMount => !!mount)
}

/**
 * Current shell, sidebar collapsed: the wide panel is removed from the DOM
 * and only the icon rail remains. The menu joins the rail's bottom cluster
 * (help / account) so it keeps the position users expect instead of jumping
 * to the top of the rail.
 */
function discoverNavRail(root: ParentNode): NavMenuMount[] {
    const rails = query(root, NAV_RAIL_SELECTOR)
    const candidates = rails.length > 0
        ? rails
        : query(root, NAV_RAIL_FALLBACK_SELECTOR).filter((nav) => {
                const width = widthOf(nav)
                // Without layout information (tests, detached documents) accept the
                // landmark; in a real page only the narrow rail qualifies.
                return width === null || width <= RAIL_MAX_WIDTH
            })

    return preferRendered(candidates).map((rail) => {
        // The rail renders its destinations in one group and its account /
        // help controls in a trailing group. Prefer that trailing group so the
        // menu lands beside the account button rather than above "Home".
        const clusters = Array.from(rail.children).filter(child => !!child.querySelector(MENU_BUTTON_SELECTOR))
        const host = clusters[clusters.length - 1] ?? rail

        return {
            target: rail,
            strategy: 'nav-rail' as const,
            insert: (container: Element) => {
                tagMount(container, 'nav-rail')
                host.prepend(container)
            },
        }
    })
}

/**
 * Last resort: ChatGPT shipped a navigation shell we do not recognise. Rather
 * than disappear, the exporter mounts its own container on `document.body` as
 * a small floating launcher. It owns that container outright, so nothing in
 * the app's DOM is touched.
 */
export const FLOATING_HOST_ID = 'chatgpt-exporter-floating-root'

function discoverFloating(root: ParentNode): NavMenuMount[] {
    const doc = ownerDocument(root)
    const body = doc?.body
    if (!body) return []

    return [{
        target: body,
        strategy: 'floating' as const,
        insert: (container: Element) => {
            tagMount(container, 'floating')
            const host = doc.getElementById(FLOATING_HOST_ID) ?? (() => {
                const element = doc.createElement('div')
                element.id = FLOATING_HOST_ID
                body.append(element)
                return element
            })()
            host.append(container)
        },
    }]
}

/**
 * Resolves the document a root belongs to. Duck-typed rather than using
 * `instanceof Document`, which is unreliable across realms (userscript
 * sandboxes, iframes, test environments).
 */
function ownerDocument(root: ParentNode): Document | null {
    const candidate = root as Partial<Document> & Node
    if (candidate.body && typeof candidate.createElement === 'function') return candidate as Document
    return candidate.ownerDocument ?? null
}

const STRATEGIES: Array<(root: ParentNode) => NavMenuMount[]> = [
    discoverLegacyProfileButton,
    discoverLegacySidebarFooter,
    discoverSidebarPanel,
    discoverNavRail,
]

/**
 * Resolves where the menu should live right now.
 *
 * `allowFloating` is off during the first moments after load so a slow-
 * rendering sidebar does not briefly produce a floating launcher.
 */
export function getNavMenuMounts(
    root: ParentNode = document,
    { allowFloating = true }: { allowFloating?: boolean } = {},
): NavMenuMount[] {
    for (const discover of STRATEGIES) {
        const mounts = discover(root)
        if (mounts.length > 0) return mounts
    }

    return allowFloating ? discoverFloating(root) : []
}

/** Removes the floating host once a real navigation mount takes over. */
export function cleanupFloatingHost(root: ParentNode = document) {
    const doc = ownerDocument(root)
    const host = doc?.getElementById(FLOATING_HOST_ID)
    if (host && host.children.length === 0) host.remove()
}
