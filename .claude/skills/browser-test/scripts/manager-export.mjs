// Run one export from the exporter menu in the *real manager* browser and
// inspect what came out.
//
//   node manager-export.mjs Markdown
//   node manager-export.mjs JSON "OpenAI Official Format"
//   node manager-export.mjs "Copy Text"        # clipboard, no download
//
//   --out <dir>       where to keep the file (default: a temp dir, never the repo)
//   --timeout <secs>  how long to wait for the download (default 180)
//
// `export.mjs` does this for the GM-shim harness on port 9222. This one drives
// the manager browser, where the product actually runs, and clicks with trusted
// CDP input because Tampermonkey-hosted UI and ChatGPT both ignore some
// synthetic events.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import JSZip from 'jszip'
import { attach, sleep } from './manager.mjs'

const args = process.argv.slice(2)
const option = (name, fallback) => {
    const index = args.indexOf(name)
    if (index === -1) return fallback
    return args.splice(index, 2)[1]
}
const outDir = option('--out', join(tmpdir(), 'chatgpt-exporter-manager-test'))
const timeout = Number(option('--timeout', 180)) * 1000
const [item, dialogItem] = args
if (!item) {
    console.error('usage: node manager-export.mjs <menu item> [dialog item] [--out dir] [--timeout secs]')
    process.exit(1)
}

const downloadDir = process.env.DOWNLOAD_DIR || join(homedir(), 'Downloads')
const before = new Set(readdirSync(downloadDir))
const clipboardItem = /^copy /i.test(item)

const c = await attach('chatgpt.com')
await c.send('Page.bringToFront')
if (clipboardItem) {
    // Reading the clipboard back is the only way to check a "Copy …" item, and
    // the page has to be allowed to do it.
    await c.send('Browser.grantPermissions', { origin: 'https://chatgpt.com', permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {})
    await c.run(`try { await navigator.clipboard.writeText(''); } catch {} return true`)
}

await c.realClick(`(() => { const t = [...document.querySelectorAll('.ce-nav-trigger')]; return t.find(e => e.getClientRects().length > 0) || t[0]; })()`)
await sleep(1200)

const clickItem = async (label) => {
    const find = `[...document.querySelectorAll('[class*="menu-item"]')].find(e => e.getClientRects().length > 0 && (e.innerText || '').trim() === ${JSON.stringify(label)})`
    for (let attempt = 0; attempt < 15; attempt++) {
        try {
            await c.realClick(find)
            return
        }
        catch { await sleep(400) }
    }
    throw new Error(`menu item not found or not clickable: ${label}`)
}

await clickItem(item)
if (dialogItem) {
    await sleep(1200)
    await clickItem(dialogItem)
}
console.log(`clicked ${[item, dialogItem].filter(Boolean).join(' > ')}`)

if (clipboardItem) {
    let text = ''
    for (let waited = 0; waited < 20000 && !text; waited += 1000) {
        await sleep(1000)
        text = await c.run(`try { return await navigator.clipboard.readText(); } catch (e) { return ''; }`)
    }
    c.close()
    if (!text) {
        console.error('clipboard stayed empty')
        process.exit(1)
    }
    const lines = text.split('\n')
    console.log(`clipboard: ${text.length} chars, ${lines.length} lines`)
    console.log(lines.slice(0, 6).map(l => `  | ${l.slice(0, 100)}`).join('\n'))
    console.log('  …')
    console.log(lines.slice(-3).map(l => `  | ${l.slice(0, 100)}`).join('\n'))
    process.exit(0)
}

// Wait for a new file whose size has stopped changing.
const deadline = Date.now() + timeout
let file = null
let lastSize = -1
while (Date.now() < deadline) {
    await sleep(1000)
    const added = readdirSync(downloadDir).filter(name => !before.has(name) && !name.endsWith('.crdownload') && !name.startsWith('.'))
    if (added.length === 0) continue
    const candidate = join(downloadDir, added[0])
    const size = statSync(candidate).size
    if (candidate === file && size === lastSize) break
    file = candidate
    lastSize = size
}
c.close()
if (!file) {
    console.error(`no download within ${timeout / 1000}s`)
    process.exit(1)
}

mkdirSync(outDir, { recursive: true })
let target = join(outDir, basename(file))
for (let n = 1; existsSync(target); n++) target = join(outDir, `${basename(file, extname(file))}-${n}${extname(file)}`)
renameSync(file, target)
console.log(`saved ${target} — ${lastSize} bytes`)

if (target.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(readFileSync(target))
    const dir = target.slice(0, -4)
    mkdirSync(dir, { recursive: true })
    const entries = Object.values(zip.files).filter(e => !e.dir)
    console.log(`  zip opens: ${entries.length} entries`)
    for (const entry of entries) {
        const buffer = await entry.async('nodebuffer')
        writeFileSync(join(dir, basename(entry.name)), buffer)
        console.log(`   ${entry.name} — ${buffer.length} bytes`)
    }
}
else {
    const head = readFileSync(target, 'utf8').slice(0, 400)
    console.log(head.split('\n').slice(0, 8).map(l => `  | ${l.slice(0, 110)}`).join('\n'))
}
