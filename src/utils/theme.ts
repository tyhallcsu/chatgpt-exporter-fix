/**
 * Colour-scheme detection.
 *
 * The exporter's stylesheets used to hang off the `.dark` class ChatGPT put on
 * `<html>`. That class is gone: the app now ships hashed atomic CSS and drives
 * its theme through `prefers-color-scheme`, with an explicit `data-theme`
 * attribute only when the user overrides the system setting. With nothing
 * matching `.dark`, every dark rule stopped applying and the menu rendered a
 * white card while inheriting ChatGPT's light text — unreadable.
 *
 * Rather than swap one attribute name for another, resolution falls through
 * several signals and ends at the background ChatGPT actually painted, which
 * is true by construction no matter what the attribute is called next.
 */

export type ColorScheme = 'light' | 'dark'

/** Attribute the exporter stamps on `<html>` for its own stylesheets. */
export const THEME_ATTRIBUTE = 'data-ce-theme'

/** Below this relative luminance a surface counts as dark. */
const DARK_LUMINANCE_THRESHOLD = 0.5

function parseColor(value: string): { r: number, g: number, b: number, a: number } | null {
    const match = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?/i)
    if (!match) return null
    return {
        r: Number(match[1]),
        g: Number(match[2]),
        b: Number(match[3]),
        a: match[4] === undefined ? 1 : Number(match[4]),
    }
}

/** Perceptual luminance, 0 (black) to 1 (white). */
export function relativeLuminance(color: { r: number, g: number, b: number }): number {
    const channel = (value: number) => {
        const c = value / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
}

/**
 * The first painted background walking up from `element`. Transparent
 * surfaces are skipped so a see-through body does not read as black.
 */
function paintedBackground(element: Element | null): { r: number, g: number, b: number } | null {
    if (typeof getComputedStyle !== 'function') return null

    let current: Element | null = element
    while (current) {
        const color = parseColor(getComputedStyle(current).backgroundColor || '')
        if (color && color.a > 0.1) return color
        current = current.parentElement
    }
    return null
}

/** Reads an explicit light/dark declaration, ignoring "system"/"auto". */
function explicitScheme(element: Element | null | undefined): ColorScheme | null {
    if (!element) return null

    for (const name of ['data-theme', 'data-color-scheme', 'data-mode']) {
        const value = element.getAttribute?.(name)?.toLowerCase()
        if (value === 'dark' || value === 'light') return value
    }

    if (element.classList?.contains('dark')) return 'dark'
    if (element.classList?.contains('light')) return 'light'

    return null
}

/**
 * Resolves the scheme ChatGPT is currently rendering in, most direct signal
 * first:
 *
 * 1. An explicit `data-theme` / `.dark` declaration on `<html>` or `<body>` —
 *    covers the user overriding the system setting, and the retired `.dark`
 *    class on older deployments.
 * 2. An inline `color-scheme` that names exactly one scheme. ChatGPT sets
 *    `light dark`, which names neither, so that case falls through.
 * 3. The painted background. This is the ground truth and needs no knowledge
 *    of ChatGPT's internals.
 * 4. The OS preference, for detached documents with nothing painted yet.
 */
export function detectColorScheme(doc: Document = document): ColorScheme {
    const root = doc.documentElement
    const explicit = explicitScheme(root) ?? explicitScheme(doc.body)
    if (explicit) return explicit

    const inline = root?.style?.getPropertyValue('color-scheme')?.trim().toLowerCase()
    if (inline === 'dark' || inline === 'light') return inline

    const background = paintedBackground(doc.body ?? root)
    if (background) return relativeLuminance(background) < DARK_LUMINANCE_THRESHOLD ? 'dark' : 'light'

    const prefersDark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    return prefersDark ? 'dark' : 'light'
}

/** Stamps the resolved scheme on `<html>` and reports whether it changed. */
export function applyColorScheme(doc: Document = document): ColorScheme {
    const scheme = detectColorScheme(doc)
    if (doc.documentElement.getAttribute(THEME_ATTRIBUTE) !== scheme) {
        doc.documentElement.setAttribute(THEME_ATTRIBUTE, scheme)
    }
    return scheme
}

/**
 * Keeps the stamp in sync while the user toggles ChatGPT's appearance setting
 * or their OS switches at sunset. Returns a disposer.
 *
 * Only attribute changes on `<html>` and `<body>` are observed — a subtree
 * observer would fire on every streamed token for information that changes a
 * handful of times per session.
 */
export function watchColorScheme(
    onChange?: (scheme: ColorScheme) => void,
    doc: Document = document,
): () => void {
    let current = applyColorScheme(doc)

    const update = () => {
        const next = applyColorScheme(doc)
        if (next === current) return
        current = next
        onChange?.(next)
    }

    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(update)
    if (observer) {
        const options: MutationObserverInit = {
            attributes: true,
            attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme', 'data-mode'],
        }
        observer.observe(doc.documentElement, options)
        if (doc.body) observer.observe(doc.body, options)
    }

    const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
    media?.addEventListener?.('change', update)

    return () => {
        observer?.disconnect()
        media?.removeEventListener?.('change', update)
    }
}
