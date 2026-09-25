// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    THEME_ATTRIBUTE,
    applyColorScheme,
    detectColorScheme,
    relativeLuminance,
    watchColorScheme,
} from '../src/utils/theme'

/**
 * happy-dom reports `rgba(0, 0, 0, 0)` for an unstyled background, which the
 * detector treats as "not painted". Inline styles give the tests a real
 * painted surface to measure.
 */
function paint(color: string) {
    document.body.style.backgroundColor = color
}

function setPrefersDark(matches: boolean) {
    vi.stubGlobal('matchMedia', (query: string) => ({
        matches: matches && /dark/.test(query),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
    }))
}

beforeEach(() => {
    document.documentElement.removeAttribute('class')
    document.documentElement.removeAttribute('style')
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute(THEME_ATTRIBUTE)
    document.body.removeAttribute('class')
    document.body.removeAttribute('data-theme')
    document.body.style.backgroundColor = ''
    setPrefersDark(false)
})

describe('relativeLuminance', () => {
    it('separates black from white', () => {
        expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5)
        expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5)
    })

    it('puts ChatGPT\'s own surfaces on the expected side of the threshold', () => {
        // Measured on the live site: dark shell and light shell backgrounds.
        expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeLessThan(0.5)
        expect(relativeLuminance({ r: 252, g: 252, b: 252 })).toBeGreaterThan(0.5)
        // The sidebar surface used by the menu.
        expect(relativeLuminance({ r: 33, g: 33, b: 33 })).toBeLessThan(0.5)
    })
})

describe('detectColorScheme', () => {
    it('honours an explicit data-theme on <html>', () => {
        paint('rgb(255, 255, 255)')
        document.documentElement.setAttribute('data-theme', 'dark')
        expect(detectColorScheme(document)).toBe('dark')
    })

    it('honours an explicit data-theme on <body>', () => {
        paint('rgb(0, 0, 0)')
        document.body.setAttribute('data-theme', 'light')
        expect(detectColorScheme(document)).toBe('light')
    })

    it('ignores data-theme="system" and falls through to the painted surface', () => {
        document.documentElement.setAttribute('data-theme', 'system')
        paint('rgb(0, 0, 0)')
        expect(detectColorScheme(document)).toBe('dark')
    })

    it('still understands the retired .dark class', () => {
        paint('rgb(255, 255, 255)')
        document.documentElement.classList.add('dark')
        expect(detectColorScheme(document)).toBe('dark')
    })

    it('reads the painted background when ChatGPT declares nothing', () => {
        // What the current shell actually does: no class, no data-theme.
        paint('rgb(0, 0, 0)')
        expect(detectColorScheme(document)).toBe('dark')

        paint('rgb(252, 252, 252)')
        expect(detectColorScheme(document)).toBe('light')
    })

    it('ignores an inline color-scheme that names both schemes', () => {
        // ChatGPT sets `light dark`, which declares support, not a choice.
        document.documentElement.style.setProperty('color-scheme', 'light dark')
        paint('rgb(0, 0, 0)')
        expect(detectColorScheme(document)).toBe('dark')
    })

    it('uses an inline color-scheme that names exactly one', () => {
        document.documentElement.style.setProperty('color-scheme', 'dark')
        paint('rgb(255, 255, 255)')
        expect(detectColorScheme(document)).toBe('dark')
    })

    it('falls back to the OS preference with nothing painted', () => {
        setPrefersDark(true)
        expect(detectColorScheme(document)).toBe('dark')

        setPrefersDark(false)
        expect(detectColorScheme(document)).toBe('light')
    })

    it('skips fully transparent surfaces instead of reading them as black', () => {
        document.documentElement.style.backgroundColor = 'rgb(252, 252, 252)'
        document.body.style.backgroundColor = 'rgba(0, 0, 0, 0)'
        expect(detectColorScheme(document)).toBe('light')
    })
})

describe('applyColorScheme', () => {
    it('stamps the resolved scheme on <html> for the stylesheets to key off', () => {
        paint('rgb(0, 0, 0)')
        expect(applyColorScheme(document)).toBe('dark')
        expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('dark')

        paint('rgb(252, 252, 252)')
        applyColorScheme(document)
        expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('light')
    })
})

describe('watchColorScheme', () => {
    it('stamps immediately and reports later changes', async () => {
        paint('rgb(252, 252, 252)')
        const seen: string[] = []
        const stop = watchColorScheme(scheme => seen.push(scheme), document)

        expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('light')

        // The appearance toggle sets an explicit theme on <html>.
        document.documentElement.setAttribute('data-theme', 'dark')
        await new Promise(resolve => setTimeout(resolve, 0))

        expect(seen).toEqual(['dark'])
        expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('dark')
        stop()
    })

    it('stops reporting once disposed', async () => {
        paint('rgb(252, 252, 252)')
        const seen: string[] = []
        const stop = watchColorScheme(scheme => seen.push(scheme), document)
        stop()

        document.documentElement.setAttribute('data-theme', 'dark')
        await new Promise(resolve => setTimeout(resolve, 0))

        expect(seen).toEqual([])
    })
})
