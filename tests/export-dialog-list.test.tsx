// @vitest-environment happy-dom

import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimitError } from '../src/utils/rateLimit'
import type { ApiConversationItem } from '../src/api'

// The only genuinely unavailable dependency outside a userscript manager.
vi.mock('vite-plugin-monkey/dist/client', () => ({
    unsafeWindow: globalThis,
    GM_getValue: () => '',
    GM_setValue: () => {},
    GM_deleteValue: () => {},
}))

const fetchAllConversations = vi.fn()
const fetchProjects = vi.fn()
const probeApi = vi.fn()

vi.mock('../src/api', async importOriginal => ({
    ...(await importOriginal<typeof import('../src/api')>()),
    fetchAllConversations,
    fetchProjects,
    probeApi,
}))

const { SettingProvider } = await import('../src/ui/SettingContext')
const { DialogContent } = await import('../src/ui/ExportDialog')
await import('../src/i18n')

const PROJECTS = [
    { id: 'p1', display: { name: 'Project One' } },
    { id: 'p2', display: { name: 'Project Two' } },
]

function conversation(id: string, title: string): ApiConversationItem {
    return { id, title, create_time: 1_700_000_000, update_time: 1_700_000_000 } as ApiConversationItem
}

/** Preact flushes effects off the task queue; give it a few turns. */
async function settle(turns = 8) {
    for (let i = 0; i < turns; i++) await new Promise(resolve => setTimeout(resolve, 0))
}

let host: HTMLDivElement

function text() {
    return (host.textContent || '').replace(/\s+/g, ' ')
}

function listItems() {
    return Array.from(host.querySelectorAll('.SelectList .SelectItem')).map(li => (li.textContent || '').trim())
}

async function chooseProject(id: string) {
    const select = host.querySelector('.ProjectSelect select') as HTMLSelectElement
    select.value = id
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await settle()
}

beforeEach(async () => {
    vi.clearAllMocks()
    fetchProjects.mockResolvedValue(PROJECTS)
    probeApi.mockResolvedValue({ ok: true, rateLimitHeaders: {} })
    // Default: an ordinary empty scope, so each test opts into its own behaviour.
    fetchAllConversations.mockResolvedValue([])
    host = document.createElement('div')
    document.body.append(host)
    render(<SettingProvider><DialogContent format="markdown" /></SettingProvider>, host)
    await settle()
})

afterEach(() => {
    render(null, host)
    host.remove()
})

/**
 * `fetchAllConversations` does not reject on a failed page: it reports through
 * `onError` and resolves with whatever it collected. The dialog therefore has to
 * read that callback, or a throttled load is indistinguishable from an account
 * with no conversations.
 */
describe('conversation list load failures', () => {
    it('shows the error instead of a successful-looking empty list', async () => {
        fetchAllConversations.mockImplementation(async (_project, _limit, _onBatch, _onHasMore, onError) => {
            onError?.(new RateLimitError(null))
            return []
        })

        await chooseProject('p1')

        expect(text()).toContain('429')
        expect(listItems().some(item => /Error/.test(item))).toBe(true)
    })

    it('keeps the partial page it did collect alongside the error', async () => {
        fetchAllConversations.mockImplementation(async (_project, _limit, onBatch, _onHasMore, onError) => {
            onBatch?.([conversation('a', 'Kept One')])
            onError?.(new RateLimitError(null))
            return [conversation('a', 'Kept One')]
        })

        await chooseProject('p1')

        expect(text()).toContain('Kept One')
        expect(text()).toContain('429')
    })

    it('clears the error and renders the list when a later load succeeds', async () => {
        fetchAllConversations.mockImplementationOnce(async (_p, _l, _b, _h, onError) => {
            onError?.(new RateLimitError(null))
            return []
        })
        await chooseProject('p1')
        expect(text()).toContain('429')

        fetchAllConversations.mockImplementation(async (_p, _l, onBatch) => {
            const items = [conversation('b', 'Recovered One'), conversation('c', 'Recovered Two')]
            onBatch?.(items)
            return items
        })
        await chooseProject('p2')

        expect(text()).not.toContain('429')
        expect(text()).toContain('Recovered One')
        expect(text()).toContain('Recovered Two')

        // The consequence of a stale error is a permanently greyed-out Export:
        // `disabled` keys off `error` as well as the selection.
        const bulk = Array.from(host.querySelectorAll('select'))
            .find(s => Array.from(s.options).some(o => o.value === 'all')) as HTMLSelectElement
        bulk.value = 'all'
        bulk.dispatchEvent(new Event('change', { bubbles: true }))
        await settle()
        expect(text()).toContain('2 / 2')

        const exportButton = Array.from(host.querySelectorAll('button'))
            .find(b => (b.textContent || '').trim() === 'Export') as HTMLButtonElement
        expect(exportButton.disabled).toBe(false)
    })

    it('does not let a superseded load overwrite the current scope', async () => {
        let releaseStale: () => void = () => {}
        const staleSettled = new Promise<void>((resolve) => {
            releaseStale = resolve
        })

        fetchAllConversations.mockImplementationOnce(async (_p, _l, _b, _h, onError) => {
            await staleSettled
            onError?.(new RateLimitError(null))
            return []
        })
        await chooseProject('p1')

        fetchAllConversations.mockImplementation(async (_p, _l, onBatch) => {
            const items = [conversation('d', 'Current Scope')]
            onBatch?.(items)
            return items
        })
        await chooseProject('p2')
        expect(text()).toContain('Current Scope')

        // The abandoned p1 request only now reports its failure.
        releaseStale()
        await settle()

        expect(text()).toContain('Current Scope')
        expect(text()).not.toContain('429')
    })
})
