import { render } from 'preact'
import sentinel from 'sentinel-js'
import { fetchConversation, processConversation } from './api'
import { getChatIdFromUrl, isSharePage } from './page'
import { watchTemporaryChatId } from './temporaryChat'
import { Menu } from './ui/Menu'
import {
    LEGACY_PROFILE_BUTTON_SELECTOR,
    NAV_RAIL_SELECTOR,
    SIDEBAR_SCROLL_SELECTOR,
    cleanupFloatingHost,
    getNavMenuMounts,
} from './utils/navMount'
import type { NavMenuMount } from './utils/navMount'
import { MESSAGE_SELECTORS, anyOf, getConversationTurns } from './utils/threadDom'
import { onloadSafe } from './utils/utils'

import './i18n'
import './styles/missing-tailwind.css'

/** How long the shell must stop mutating before it counts as hydrated. */
const SHELL_QUIET_MS = 400
/** Upper bound on waiting, for pages that never fall completely quiet. */
const SHELL_SETTLE_TIMEOUT_MS = 4000

/**
 * ChatGPT server-renders its app shell and hydrates it after the document has
 * loaded. Inserting a node into a container React is still hydrating makes
 * React report a hydration mismatch (#418), throw the server markup away and
 * re-render the shell — which both logs an error in the user's console and
 * immediately destroys the menu we just mounted.
 *
 * `load` alone is not late enough: React Router continues hydrating route
 * chunks after it. Waiting for the DOM itself to go quiet is, and it needs no
 * knowledge of ChatGPT's internals.
 */
function whenShellSettled(callback: () => void) {
    const start = () => {
        let quietTimer: ReturnType<typeof setTimeout>
        let capTimer: ReturnType<typeof setTimeout>
        let done = false

        const observer = new MutationObserver(() => {
            clearTimeout(quietTimer)
            quietTimer = setTimeout(finish, SHELL_QUIET_MS)
        })

        function finish() {
            if (done) return
            done = true
            clearTimeout(quietTimer)
            clearTimeout(capTimer)
            observer.disconnect()
            requestAnimationFrame(callback)
        }

        capTimer = setTimeout(finish, SHELL_SETTLE_TIMEOUT_MS)
        quietTimer = setTimeout(finish, SHELL_QUIET_MS)
        observer.observe(document.body, { childList: true, subtree: true })
    }

    if (document.readyState === 'complete') start()
    else window.addEventListener('load', start, { once: true })
}

/**
 * The navigation shell is re-rendered constantly (streaming replies, sidebar
 * animations). Discovery is cheap but must not run per mutation, so it is
 * coalesced into the next frame and rate limited.
 */
function createScheduler(run: () => void, minIntervalMs: number) {
    let frame = 0
    let last = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    return () => {
        if (frame) return
        const wait = Math.max(0, minIntervalMs - (Date.now() - last))
        clearTimeout(timer)
        timer = setTimeout(() => {
            frame = requestAnimationFrame(() => {
                frame = 0
                last = Date.now()
                run()
            })
        }, wait)
    }
}

main()

function main() {
    // Installed before the page is ready so it is in place by the time the
    // user can send the first message of a temporary chat.
    watchTemporaryChatId()

    onloadSafe(() => {
        // eslint-disable-next-line no-console
        console.log('[Exporter] Loaded')

        const styleEl = document.createElement('style')
        styleEl.id = 'sentinel-css'
        document.head.append(styleEl)

        const injectionMap = new Map<Element, Element>()
        let hydrated = false

        const injectNavMenu = ({ target, insert, strategy }: NavMenuMount) => {
            if (injectionMap.has(target)) return

            // eslint-disable-next-line no-console
            console.log(`[Exporter] Injecting nav (${strategy})`, target)

            const container = getMenuContainer()
            injectionMap.set(target, container)
            insert(container)
        }

        const syncNavMenu = () => {
            if (!hydrated) return

            // The floating launcher is a last resort. Suppressing it while the
            // app shell is still rendering avoids a launcher that appears for
            // a frame and is then replaced by the real sidebar mount.
            const mounts = getNavMenuMounts(document, { allowFloating: injectionMap.size > 0 || document.readyState === 'complete' })
            const activeTargets = new Set(mounts.map(({ target }) => target))
            injectionMap.forEach((container, target) => {
                if (!target.isConnected || !container.isConnected || !activeTargets.has(target)) {
                    container.remove()
                    injectionMap.delete(target)
                }
            })

            mounts.forEach(injectNavMenu)
            cleanupFloatingHost()
        }

        const scheduleSync = createScheduler(syncNavMenu, 150)

        // Sentinel reacts the moment a known navigation anchor is rendered.
        for (const selector of [LEGACY_PROFILE_BUTTON_SELECTOR, SIDEBAR_SCROLL_SELECTOR, NAV_RAIL_SELECTOR]) {
            sentinel.on(selector, scheduleSync)
        }

        // Sentinel only fires for nodes matching those selectors. A mutation
        // observer additionally catches the cases that remove or replace an
        // already-injected menu — sidebar collapse, route changes and React
        // re-rendering the shell around us.
        const observer = new MutationObserver(scheduleSync)

        whenShellSettled(() => {
            hydrated = true
            syncNavMenu()
            observer.observe(document.body, { childList: true, subtree: true })
        })

        // Failsafe only. Event-driven remounting above is what keeps the menu
        // present; this interval merely bounds how long a missed mutation can
        // leave the menu absent.
        setInterval(scheduleSync, 5000)

        // Support for share page
        if (isSharePage()) {
            sentinel.on(`div[role="presentation"] > .w-full > div >.flex.w-full`, (target) => {
                target.prepend(getMenuContainer())
            })
        }

        /** Insert timestamp to the bottom right of each message */
        let chatId = ''
        sentinel.on('[role="presentation"]', async () => {
            // Share pages carry a share id, not a conversation id, so the
            // conversation API below would 404 on them.
            if (isSharePage()) return

            const currentChatId = getChatIdFromUrl()
            if (!currentChatId || currentChatId === chatId) return
            chatId = currentChatId

            const rawConversation = await fetchConversation(chatId)
            const { conversationNodes } = processConversation(rawConversation)

            const turns = getConversationTurns(document).filter(turn => turn.closest('main'))
            const threadContents = turns.flatMap(turn => Array.from(turn.querySelectorAll(anyOf(MESSAGE_SELECTORS))))
            if (threadContents.length === 0) return

            threadContents.forEach((thread, index) => {
                const createTime = conversationNodes[index]?.message?.create_time
                if (!createTime) return

                const date = new Date(createTime * 1000)

                const timestamp = document.createElement('time')
                timestamp.className = 'w-full text-gray-500 dark:text-gray-400 text-sm text-right'
                timestamp.dateTime = date.toISOString()
                timestamp.title = date.toLocaleString()

                const hour12 = document.createElement('span')
                hour12.setAttribute('data-time-format', '12')
                hour12.textContent = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                const hour24 = document.createElement('span')
                hour24.setAttribute('data-time-format', '24')
                hour24.textContent = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
                timestamp.append(hour12, hour24)
                thread.append(timestamp)
            })
        })
    })
}

function getMenuContainer() {
    const container = document.createElement('div')
    // to overlap on the list section
    container.style.zIndex = '99'
    render(<Menu container={container} />, container)
    return container
}
