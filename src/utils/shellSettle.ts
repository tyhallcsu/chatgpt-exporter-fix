/**
 * The gate that holds the exporter back until ChatGPT's shell stops re-rendering.
 *
 * Kept apart from `main.tsx` so the lifecycle can be regression-tested without
 * running the whole userscript.
 */

/** How long the shell must stop mutating before the first injection. */
export const SHELL_QUIET_MS = 400
/** Upper bound on waiting, for pages that never fall completely quiet. */
export const SHELL_SETTLE_TIMEOUT_MS = 4000
/**
 * How long to wait for the frame callback before giving up on it. Two frames at
 * 60Hz; long enough that a visible page really does run the callback in a frame.
 */
export const FRAME_FALLBACK_MS = 32

/**
 * Run `callback` after the next frame, or after a short delay if no frame comes.
 *
 * `requestAnimationFrame` is suspended while the document is hidden, so a tab
 * that loads in the background — a restored session, a cmd-clicked link, an
 * occluded window — would otherwise never reach the callback at all, and the
 * menu would never mount. Whichever fires first wins, and it only fires once.
 */
function afterNextFrame(callback: () => void) {
    let called = false
    const once = () => {
        if (called) return
        called = true
        callback()
    }
    requestAnimationFrame(once)
    setTimeout(once, FRAME_FALLBACK_MS)
}

/**
 * ChatGPT server-renders its shell and hydrates it after load. Inserting into a
 * container React is still hydrating makes it report a hydration mismatch
 * (#418), throw the server markup away and re-render — destroying the menu we
 * just mounted. `load` alone is not late enough because React Router keeps
 * hydrating route chunks after it; waiting for the DOM itself to go quiet is,
 * and needs no knowledge of ChatGPT's internals.
 *
 * This is a heuristic, not proof that hydration finished. It is bounded, runs
 * its callback exactly once, and disconnects its observer either way.
 */
export function whenShellSettled(callback: () => void) {
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
            afterNextFrame(callback)
        }

        capTimer = setTimeout(finish, SHELL_SETTLE_TIMEOUT_MS)
        quietTimer = setTimeout(finish, SHELL_QUIET_MS)
        observer.observe(document.body, { childList: true, subtree: true })
    }

    if (document.readyState === 'complete') start()
    else window.addEventListener('load', start, { once: true })
}
