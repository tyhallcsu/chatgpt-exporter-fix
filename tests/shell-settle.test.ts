// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    FRAME_FALLBACK_MS,
    SHELL_QUIET_MS,
    SHELL_SETTLE_TIMEOUT_MS,
    whenShellSettled,
} from '../src/utils/shellSettle'

/**
 * Lifecycle contract for the hydration gate. The gate is a heuristic, so what is
 * worth pinning down is not *when* it decides the shell is ready but that it
 * always decides: exactly once, within a bound, with its observer released, and
 * regardless of whether the document is being painted.
 */
describe('whenShellSettled', () => {
    let frames: Array<() => void>
    let disconnects: number

    beforeEach(() => {
        vi.useFakeTimers()
        frames = []
        disconnects = 0
        document.body.innerHTML = '<div id="shell"></div>'
        Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true })
        // Count observer releases without losing MutationObserver's behaviour.
        const disconnect = MutationObserver.prototype.disconnect
        vi.spyOn(MutationObserver.prototype, 'disconnect').mockImplementation(function (this: MutationObserver) {
            disconnects++
            return disconnect.call(this)
        })
        // A hidden document never runs frame callbacks. Collect them instead of
        // dropping them, so a test can decide whether a frame ever happens.
        vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
            frames.push(callback)
            return frames.length
        })
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('runs the callback once the DOM has been quiet', () => {
        const callback = vi.fn()
        whenShellSettled(callback)

        vi.advanceTimersByTime(SHELL_QUIET_MS)
        frames.forEach(frame => frame())

        expect(callback).toHaveBeenCalledTimes(1)
        expect(disconnects).toBe(1)
    })

    it('still runs when the document is hidden and no frame is ever painted', () => {
        const callback = vi.fn()
        whenShellSettled(callback)

        vi.advanceTimersByTime(SHELL_QUIET_MS)
        expect(callback).not.toHaveBeenCalled()

        // No frame callback is invoked — this is a background tab.
        vi.advanceTimersByTime(FRAME_FALLBACK_MS)

        expect(callback).toHaveBeenCalledTimes(1)
    })

    it('does not run the callback twice when a frame arrives after the fallback', () => {
        const callback = vi.fn()
        whenShellSettled(callback)

        vi.advanceTimersByTime(SHELL_QUIET_MS + FRAME_FALLBACK_MS)
        expect(callback).toHaveBeenCalledTimes(1)

        frames.forEach(frame => frame())
        expect(callback).toHaveBeenCalledTimes(1)
    })

    it('is bounded when the DOM never falls quiet', () => {
        const callback = vi.fn()
        whenShellSettled(callback)

        // Keep mutating just under the quiet threshold, forever.
        for (let elapsed = 0; elapsed < SHELL_SETTLE_TIMEOUT_MS * 2; elapsed += SHELL_QUIET_MS / 2) {
            document.getElementById('shell')!.append(document.createElement('span'))
            vi.advanceTimersByTime(SHELL_QUIET_MS / 2)
        }
        vi.advanceTimersByTime(FRAME_FALLBACK_MS)

        expect(callback).toHaveBeenCalledTimes(1)
        expect(disconnects).toBe(1)
    })

    it('waits for load when the document is not complete yet', () => {
        Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true })
        const callback = vi.fn()
        whenShellSettled(callback)

        vi.advanceTimersByTime(SHELL_SETTLE_TIMEOUT_MS + FRAME_FALLBACK_MS)
        expect(callback).not.toHaveBeenCalled()

        window.dispatchEvent(new Event('load'))
        vi.advanceTimersByTime(SHELL_QUIET_MS + FRAME_FALLBACK_MS)
        expect(callback).toHaveBeenCalledTimes(1)
    })
})
