import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'
import monkey, { cdn } from 'vite-plugin-monkey'
import packageJson from './package.json' with { type: 'json' }

/**
 * Review builds. `REVIEW_BUILD_ID` is the short SHA of the source commit the
 * artifact is built from; the commit that *records* the artifact is its child.
 * Set it and the build becomes unmistakably not an official release:
 * a distinct `@name`, a semver-prerelease `@version`, its own filename, and
 * `@updateURL`/`@downloadURL` of `none` so the manager cannot auto-update it.
 * Authorship, namespace and licence stay pionxzh's.
 *
 * `REVIEW_BUILD_SEQ` is the commit count, and it leads the prerelease so the
 * version stays monotonic. A bare SHA does not: semver compares alphanumeric
 * prerelease identifiers lexically, so Tampermonkey offered `…-review.07f7498`
 * as a *downgrade* from `…-review.70ad156`. The count is a numeric identifier,
 * compares numerically, and is still reproducible from the commit alone.
 */
const reviewBuildId = process.env.REVIEW_BUILD_ID?.trim() || ''
const reviewBuildSeq = process.env.REVIEW_BUILD_SEQ?.trim() || '0'
const isReviewBuild = reviewBuildId.length > 0
const reviewSuffix = ' (review build)'

function title(base: string) {
    return isReviewBuild ? `${base}${reviewSuffix}` : base
}

function describe(base: string) {
    return isReviewBuild
        ? `[REVIEW BUILD ${reviewBuildId} — unreleased, for local review only] ${base}`
        : base
}

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        preact({
            devToolsEnabled: false,
            devtoolsInProd: false,
        }),
        monkey({
            entry: 'src/main.tsx',
            userscript: {
                'name': {
                    '': title(packageJson.title),
                    'zh-CN': title(packageJson['title:zh-CN']),
                    'zh-TW': title(packageJson['title:zh-TW']),
                },
                // Semver prerelease: sorts below 2.36.1, and names the source commit.
                'version': isReviewBuild
                    ? `${packageJson.version}-review.${reviewBuildSeq}.${reviewBuildId}`
                    : packageJson.version,
                'author': packageJson.author,
                'namespace': packageJson.author,
                'description': {
                    '': describe(packageJson.description),
                    'zh-CN': describe(packageJson['description:zh-CN']),
                    'zh-TW': describe(packageJson['description:zh-TW']),
                },
                'license': packageJson.license,
                'match': [
                    'https://chat.openai.com/',
                    // support https://chat.openai.com/?model={model}
                    'https://chat.openai.com/?*',
                    // support https://chat.openai.com/c/123456789
                    'https://chat.openai.com/c/*',
                    // support https://chat.openai.com/g/g-123456789
                    'https://chat.openai.com/g/*',
                    // support https://chat.openai.com/gpts/
                    'https://chat.openai.com/gpts',
                    'https://chat.openai.com/gpts/*',
                    // support https://chat.openai.com/share/123456789
                    'https://chat.openai.com/share/*',
                    // support https://chat.openai.com/share/123456789/continue
                    'https://chat.openai.com/share/*/continue',

                    'https://chatgpt.com/',
                    'https://chatgpt.com/?*',
                    'https://chatgpt.com/c/*',
                    'https://chatgpt.com/g/*',
                    'https://chatgpt.com/gpts',
                    'https://chatgpt.com/gpts/*',
                    'https://chatgpt.com/share/*',
                    'https://chatgpt.com/share/*/continue',
                ],
                'icon': 'https://chatgpt.com/favicon.ico',
                'run-at': 'document-end',
                // `none` is Tampermonkey's explicit opt-out. Absent headers only
                // mean "unspecified"; this states it. Verify the effect in the
                // manager's per-script settings, not from the header alone.
                ...(isReviewBuild ? { updateURL: 'none', downloadURL: 'none' } : {}),
            },
            build: {
                fileName: isReviewBuild ? 'chatgpt-exporter-review.user.js' : 'chatgpt.user.js',
                externalGlobals: [
                    ['jszip', cdn.jsdelivr('JSZip', 'dist/jszip.min.js')],
                    // SnapDOM's IIFE exposes its named export as window.snapdom.
                    ['@zumer/snapdom', cdn.jsdelivr('window', 'dist/snapdom.js')],
                ],
                // Serialized into the bundle and run in the page, so it must be self-contained.
                cssSideEffects: (css: string) => {
                    const o = document.createElement('style')
                    o.textContent = css
                    document.head.append(o)
                    setInterval(() => {
                        if (o.isConnected) return
                        document.head.append(o)
                    }, 300)
                },
            },
            server: {
                open: true,
            },
        }),
    ],
    build: {
        cssMinify: false,
        // A review build writes a second file into dist/; emptying the directory
        // would delete the tracked `chatgpt.user.js` next to it.
        emptyOutDir: !isReviewBuild,
    },
})
