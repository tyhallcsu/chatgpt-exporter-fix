/**
 * Selectors for ChatGPT's rendered conversation.
 *
 * Exports themselves are built from the conversation API, not from the DOM —
 * the DOM only has to answer "is a conversation on screen?", "where are the
 * turns?" and "what scrolls them?", which the screenshot export and the
 * timestamp overlay depend on.
 *
 * ChatGPT replaced its `data-testid` conversation hooks with namespaced
 * `data-*` attributes, so each selector below lists the current attribute
 * first and keeps the retired one as a fallback for older deployments.
 */

/**
 * One exchange in the thread (the user message plus the reply it produced).
 *
 * Semantics: `data-turn-key` carries the turn's stable id and is what ChatGPT
 * itself keys the rendered list by, so it exists for as long as turns are
 * rendered as a list. Fallback: the retired
 * `[data-testid^="conversation-turn-"]` / `[data-turn-id-container]` hooks.
 */
export const TURN_SELECTORS = [
    '[data-turn-key]',
    '[data-testid^="conversation-turn-"]',
    '[data-turn-id-container]',
] as const

/**
 * The scroll viewport the thread lives in.
 *
 * Semantics: an "app action" target, the same family of attributes that keeps
 * the sidebar scroll container addressable. Fallback: the retired
 * `[data-scroll-root]`, then the nearest scrollable ancestor computed at
 * runtime by `findScrollRoot`.
 */
export const THREAD_SCROLL_SELECTORS = [
    '[data-app-action-timeline-scroll]',
    '[data-scroll-root]',
] as const

/**
 * The element wrapping all turns.
 *
 * Semantics: ChatGPT marks the conversation body as both a selection target
 * and the search/"find in thread" target. Fallback: the retired `#thread`,
 * then the computed common ancestor of the turns.
 */
export const THREAD_CONTAINER_SELECTORS = [
    '[data-thread-find-target="conversation"]',
    '[data-chatgpt-conversation-selection-target]',
    '#thread',
] as const

/**
 * The node carrying a message id, used to anchor per-message timestamps.
 *
 * Semantics: the id ChatGPT uses for copy/selection of a single message.
 * Fallback: the retired `[data-message-id]`.
 */
export const MESSAGE_SELECTORS = [
    '[data-chatgpt-selection-message-id]',
    '[data-message-id]',
] as const

/** Joins a selector list into one query, preserving priority order. */
export function anyOf(selectors: readonly string[]): string {
    return selectors.join(', ')
}

/**
 * Returns matches for the first selector in the list that matches anything.
 *
 * Querying selector-by-selector (rather than with one comma-joined query)
 * keeps results in a single DOM generation: a page mid-migration that exposes
 * both the new and the retired attribute would otherwise return every turn
 * twice.
 */
export function queryFirstMatching<T extends Element>(
    root: ParentNode,
    selectors: readonly string[],
): T[] {
    for (const selector of selectors) {
        try {
            const found = Array.from(root.querySelectorAll<T>(selector))
            if (found.length > 0) return found
        }
        catch {
            // Ignore selectors this browser cannot parse and try the next one.
        }
    }
    return []
}

/** All rendered conversation turns, in document order. */
export function getConversationTurns(root: ParentNode = document): HTMLElement[] {
    return queryFirstMatching<HTMLElement>(root, TURN_SELECTORS)
}

/** True when the page is showing a conversation rather than an empty composer. */
export function hasRenderedConversation(root: ParentNode = document): boolean {
    return getConversationTurns(root).length > 0
}

/** The element that contains every turn, preferring ChatGPT's own marker. */
export function findThreadContainer(
    turns: HTMLElement[],
    root: ParentNode = document,
): HTMLElement | null {
    const marked = queryFirstMatching<HTMLElement>(root, THREAD_CONTAINER_SELECTORS)
        // A marked container is only useful if it actually holds the turns.
        .find(element => turns.length === 0 || turns.every(turn => element.contains(turn)))
    if (marked) return marked

    return findCommonAncestor(turns)
}

export function findCommonAncestor(elements: HTMLElement[]): HTMLElement | null {
    let ancestor = elements[0]?.parentElement
    while (ancestor && !elements.every(element => ancestor!.contains(element))) {
        ancestor = ancestor.parentElement
    }
    return ancestor
}

/**
 * The scrollable ancestor of the thread. Prefers ChatGPT's own marker and
 * falls back to measuring ancestors, so a renamed attribute degrades to a
 * slower lookup instead of breaking the screenshot export.
 */
export function findScrollRoot(thread: HTMLElement | null): HTMLElement | null {
    if (!thread) return null

    const marked = thread.closest<HTMLElement>(anyOf(THREAD_SCROLL_SELECTORS))
    if (marked) return marked

    let element: HTMLElement | null = thread.parentElement
    while (element) {
        const style = typeof getComputedStyle === 'function' ? getComputedStyle(element) : null
        const scrolls = !!style && /auto|scroll/.test(style.overflowY)
        if (scrolls && element.scrollHeight > element.clientHeight + 4) return element
        element = element.parentElement
    }
    return null
}
