const { invoke } = window.__TAURI__.core

const MANAGERS = [
    { name: 'Tampermonkey', url: 'https://www.tampermonkey.net/' },
    { name: 'Violentmonkey', url: 'https://violentmonkey.github.io/' },
    { name: 'Userscripts (Safari)', url: 'https://github.com/quoid/userscripts' },
]

const el = id => document.getElementById(id)

let info = null

function setStatus(node, message, tone) {
    node.textContent = message
    node.className = tone ? `status status--${tone}` : 'status'
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return '—'
    const kb = bytes / 1024
    return kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${Math.round(kb)} KB`
}

function formatTimestamp(iso) {
    const parsed = new Date(iso)
    if (Number.isNaN(parsed.getTime())) return iso || '—'
    return parsed.toLocaleString()
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text)
        return true
    }
    catch {
        // WKWebView can refuse the async API outside a trusted gesture chain.
        const scratch = document.createElement('textarea')
        scratch.value = text
        scratch.setAttribute('readonly', '')
        scratch.style.position = 'fixed'
        scratch.style.opacity = '0'
        document.body.appendChild(scratch)
        scratch.select()
        const ok = document.execCommand('copy')
        scratch.remove()
        return ok
    }
}

function renderManagerLinks() {
    const host = el('manager-links')
    host.replaceChildren(...MANAGERS.map((manager) => {
        const button = document.createElement('button')
        button.className = 'btn btn--ghost btn--small'
        button.textContent = manager.name
        button.addEventListener('click', () => openExternal(manager.url))
        return button
    }))
}

async function openExternal(url) {
    try {
        await invoke('open_external', { url })
    }
    catch (error) {
        setStatus(el('aux-status'), String(error), 'bad')
    }
}

function renderInfo(next) {
    info = next

    el('packaging-version').textContent = next.packagingVersion
    el('userscript-version').textContent = next.userscriptVersion

    el('fact-name').textContent = next.userscriptName
    el('fact-version').textContent = next.userscriptVersion
    el('fact-size').textContent = formatBytes(next.userscriptBytes)
    el('fact-commit').textContent = next.sourceClean
        ? next.sourceCommitShort
        : `${next.sourceCommitShort} (built from a modified tree)`
    el('fact-built').textContent = formatTimestamp(next.builtAt)
    el('fact-sha').textContent = next.userscriptSha256

    if (!next.sha256Matches) {
        const warning = el('integrity-warning')
        warning.hidden = false
        warning.textContent
            = `The embedded script hashes to ${next.userscriptSha256}, but this build recorded `
            + `${next.recordedSha256}. Do not install it; rebuild from source instead.`
    }

    el('signing-note').textContent = next.codeSigned
        ? `Signed build · ${next.os}/${next.arch}`
        : `Unsigned community build · ${next.os}/${next.arch} · your OS will ask you to confirm it on first launch`
}

async function renderBrowsers() {
    let detected = []
    try {
        detected = await invoke('detect_browsers')
    }
    catch {
        return
    }
    if (detected.length === 0) return

    el('browser-divider').hidden = false
    el('browser-buttons').replaceChildren(...detected.map((browser) => {
        const button = document.createElement('button')
        button.className = 'btn btn--small'
        button.textContent = browser.name
        button.addEventListener('click', () => install(browser.path, browser.name))
        return button
    }))
}

async function install(browserPath, label) {
    const status = el('status')
    setStatus(status, browserPath ? `Opening ${label}…` : 'Opening your default browser…')
    try {
        const url = await invoke('open_install_page', { browserPath: browserPath ?? null })
        el('install-url').textContent = url
        el('urlbar').hidden = false
        setStatus(
            status,
            'Opened. Your userscript manager should show its install page — confirm there to finish.',
            'ok',
        )
    }
    catch (error) {
        setStatus(
            status,
            `${error}. You can still copy the script source below and paste it into your manager.`,
            'bad',
        )
    }
}

async function checkUpdates() {
    const status = el('aux-status')
    setStatus(status, 'Checking the release feed…')
    try {
        const response = await fetch(
            'https://api.github.com/repos/tyhallcsu/chatgpt-exporter-fix/releases/latest',
            { headers: { Accept: 'application/vnd.github+json' } },
        )
        if (response.status === 404) {
            setStatus(
                status,
                'No public release feed — this build comes from a private repository. Open the repository to check by hand.',
            )
            return
        }
        if (!response.ok) {
            setStatus(status, `GitHub answered ${response.status}. Try again later.`, 'bad')
            return
        }
        const release = await response.json()
        const tag = String(release.tag_name ?? '')
        const current = `desktop-v${info.packagingVersion}`
        setStatus(
            status,
            tag === current
                ? `You are on the latest release (${tag}).`
                : `Latest published release is ${tag}; this build is ${current}.`,
            tag === current ? 'ok' : undefined,
        )
    }
    catch (error) {
        setStatus(status, `Could not reach GitHub: ${error}`, 'bad')
    }
}

function wireAuxButtons() {
    const status = el('aux-status')

    el('copy-url').addEventListener('click', async () => {
        const ok = await copyText(el('install-url').textContent)
        setStatus(status, ok ? 'Install address copied.' : 'Could not reach the clipboard.', ok ? 'ok' : 'bad')
    })

    el('copy-sha').addEventListener('click', async () => {
        const ok = await copyText(info.userscriptSha256)
        setStatus(status, ok ? 'Hash copied.' : 'Could not reach the clipboard.', ok ? 'ok' : 'bad')
    })

    el('copy-script').addEventListener('click', async () => {
        setStatus(status, 'Reading the bundled script…')
        try {
            const source = await invoke('userscript_text')
            const ok = await copyText(source)
            setStatus(
                status,
                ok ? 'Script source copied — paste it into a new script in your manager.' : 'Could not reach the clipboard.',
                ok ? 'ok' : 'bad',
            )
        }
        catch (error) {
            setStatus(status, String(error), 'bad')
        }
    })

    el('save-script').addEventListener('click', async () => {
        setStatus(status, 'Saving…')
        try {
            const path = await invoke('save_to_downloads')
            setStatus(status, `Saved to ${path}`, 'ok')
        }
        catch (error) {
            setStatus(status, String(error), 'bad')
        }
    })

    el('check-updates').addEventListener('click', checkUpdates)
    el('install-default').addEventListener('click', () => install(null, 'your default browser'))

    for (const link of document.querySelectorAll('[data-external]')) {
        link.addEventListener('click', (event) => {
            event.preventDefault()
            openExternal(link.dataset.external)
        })
    }
}

async function boot() {
    renderManagerLinks()
    wireAuxButtons()
    try {
        renderInfo(await invoke('app_info'))
    }
    catch (error) {
        setStatus(el('status'), `Could not read this build's details: ${error}`, 'bad')
    }
    await renderBrowsers()
}

boot()
