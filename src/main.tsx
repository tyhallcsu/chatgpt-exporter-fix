import { render } from 'preact'
import sentinel from 'sentinel-js'
import { fetchConversation, processConversation } from './api'
import { getChatIdFromUrl, isSharePage } from './page'
import { watchTemporaryChatId } from './temporaryChat'
import { Menu } from './ui/Menu'
import {
    AUTOMATIONS_SELECTOR,
    FLOATING_HOST_ID,
    PROFILE_BUTTON_SELECTOR,
    RAIL_MENU_BUTTON_SELECTOR,
    SIDEBAR_SCROLL_SELECTOR,
    getNavMenuMounts,
} from './utils/navMount'
import type { NavMenuMount } from './utils/navMount'
import { onloadSafe } from './utils/utils'

import './i18n'
import './styles/missing-tailwind.css'

/** How long the shell must stop mutating before the first injection. */
const SHELL_QUIET_MS = 400
/** Upper bound on waiting, for pages that never fall completely quiet. */
const SHELL_SETTLE_TIMEOUT_MS = 4000
/** The rendered conversation block that carries its message ids. */
const MESSAGE_UNIT_SELECTOR = '[data-chatgpt-conversation-selection-target] [data-chatgpt-search-message-ids]'

/**
 * ChatGPT server-renders its shell and hydrates it after load. Inserting into a
 * container React is still hydrating makes it report a hydration mismatch
 * (#418), throw the server markup away and re-render — destroying the menu we
 * just mounted. `load` alone is not late enough because React Router keeps
 * hydrating route chunks after it; waiting for the DOM itself to go quiet is,
 * and needs no knowledge of ChatGPT's internals.
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

        const injectNavMenu = ({ target, insert }: NavMenuMount) => {
            if (injectionMap.has(target)) return

            // eslint-disable-next-line no-console
            console.log('[Exporter] Injecting nav', target)

            const container = getMenuContainer()
            injectionMap.set(target, container)
            insert(container)
        }

        const syncNavMenu = () => {
            if (!hydrated) return

            const mounts = getNavMenuMounts()
            const activeTargets = new Set(mounts.map(({ target }) => target))
            injectionMap.forEach((container, target) => {
                if (!target.isConnected || !container.isConnected || !activeTargets.has(target)) {
                    container.remove()
                    injectionMap.delete(target)
                }
            })

            mounts.forEach(injectNavMenu)

            const floatingHost = document.getElementById(FLOATING_HOST_ID)
            if (floatingHost && floatingHost.children.length === 0) floatingHost.remove()
        }

        // Sentinel handles new sidebar nodes immediately. Polling remains as a
        // fallback for UI variants that replace or remove injected siblings.
        for (const selector of [PROFILE_BUTTON_SELECTOR, SIDEBAR_SCROLL_SELECTOR, RAIL_MENU_BUTTON_SELECTOR, AUTOMATIONS_SELECTOR]) {
            sentinel.on(selector, syncNavMenu)
        }
        // Held back until the shell stops re-rendering; injecting during
        // hydration makes React discard the tree and the menu with it.
        whenShellSettled(() => {
            hydrated = true
            syncNavMenu()
        })
        setInterval(syncNavMenu, 1000)

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

            const threadContents = Array.from(document.querySelectorAll('main [data-testid^="conversation-turn-"] [data-message-id]'))
            if (threadContents.length === 0) return

            threadContents.forEach((thread, index) => {
                const createTime = conversationNodes[index]?.message?.create_time
                if (!createTime) return

                thread.append(createTimestamp(createTime))
            })
        })

        watchMessageTimestamps()
    })
}

/**
 * The redesigned thread tags each message block with the ids it renders and
 * virtualizes off-screen turns, so stamp every block as it mounts.
 */
function watchMessageTimestamps() {
    let chatId = ''
    let createTimes: Promise<Map<string, number>> = Promise.resolve(new Map())
    // Ids that were missing after a refetch, so they do not refetch again.
    const missingIds = new Set<string>()

    const loadCreateTimes = async (id: string) => {
        const conversation = await fetchConversation(id)
        const times = new Map<string, number>()
        Object.values(conversation.mapping).forEach(({ message }) => {
            if (message?.create_time) times.set(message.id, message.create_time)
        })
        return times
    }

    const findCreateTime = (times: Map<string, number>, ids: string[]) => {
        // A block can merge several messages. Use the last one, the reply
        // the user actually sees.
        for (let i = ids.length - 1; i >= 0; i--) {
            const time = times.get(ids[i])
            if (time) return time
        }
        return null
    }

    sentinel.on(MESSAGE_UNIT_SELECTOR, async (unit) => {
        if (isSharePage()) return
        // Stamp the outermost block only.
        if (unit.parentElement?.closest('[data-chatgpt-search-message-ids]')) return

        const currentChatId = getChatIdFromUrl()
        if (!currentChatId) return
        if (currentChatId !== chatId) {
            chatId = currentChatId
            missingIds.clear()
            createTimes = loadCreateTimes(chatId).catch(() => new Map())
        }

        const ids = unit.getAttribute('data-chatgpt-search-message-ids')?.split(/\s+/).filter(Boolean) ?? []
        if (ids.length === 0) return

        let createTime = findCreateTime(await createTimes, ids)
        // Messages sent after the first fetch are not in it yet.
        if (!createTime && ids.some(id => !missingIds.has(id)) && currentChatId === chatId) {
            ids.forEach(id => missingIds.add(id))
            createTimes = loadCreateTimes(chatId).catch(() => new Map())
            createTime = findCreateTime(await createTimes, ids)
        }

        if (!createTime || !unit.isConnected || unit.querySelector(':scope > time[data-ce-timestamp]')) return
        unit.append(createTimestamp(createTime))
    })
}

function createTimestamp(createTime: number) {
    const date = new Date(createTime * 1000)

    const timestamp = document.createElement('time')
    timestamp.className = 'ce-timestamp w-full text-sm text-right'
    timestamp.setAttribute('data-ce-timestamp', '')
    timestamp.dateTime = date.toISOString()
    timestamp.title = date.toLocaleString()

    const hour12 = document.createElement('span')
    hour12.setAttribute('data-time-format', '12')
    hour12.textContent = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    const hour24 = document.createElement('span')
    hour24.setAttribute('data-time-format', '24')
    hour24.textContent = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    timestamp.append(hour12, hour24)
    return timestamp
}

function getMenuContainer() {
    const container = document.createElement('div')
    // to overlap on the list section
    container.style.zIndex = '99'
    render(<Menu container={container} />, container)
    return container
}
