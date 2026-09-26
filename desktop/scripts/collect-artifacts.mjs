#!/usr/bin/env node
/**
 * Collects what `tauri build` produced, renames it to the release naming
 * scheme, and refuses to pass anything it cannot actually verify.
 *
 * "A file with an .exe extension exists" is not a build result. Every artifact
 * here is checked for a plausible size and for the architecture recorded in its
 * own header before it is allowed into `desktop/artifacts/`.
 *
 * Usage: node scripts/collect-artifacts.mjs <windows|macos>
 */

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tauriDir = path.join(desktopDir, 'src-tauri')
const outDir = path.join(desktopDir, 'artifacts')

/** Anything smaller than this is a stub, not an installer. */
const MIN_BYTES = 1024 * 1024

const platform = process.argv[2]
if (!['windows', 'macos'].includes(platform)) {
    console.error('usage: collect-artifacts.mjs <windows|macos>')
    process.exit(1)
}

const version = JSON.parse(fs.readFileSync(path.join(tauriDir, 'tauri.conf.json'), 'utf8')).version

const problems = []

function fail(message) {
    problems.push(message)
}

function findOne(dir, predicate, label) {
    if (!fs.existsSync(dir)) {
        fail(`${label}: ${path.relative(desktopDir, dir)} does not exist`)
        return null
    }
    const matches = fs.readdirSync(dir).filter(predicate)
    if (matches.length !== 1) {
        fail(`${label}: expected exactly one match in ${path.relative(desktopDir, dir)}, found ${matches.length ? matches.join(', ') : 'none'}`)
        return null
    }
    return path.join(dir, matches[0])
}

/** x64 PE images report machine type 0x8664 in the COFF header. */
function peMachine(file) {
    const fd = fs.openSync(file, 'r')
    try {
        const dos = Buffer.alloc(64)
        fs.readSync(fd, dos, 0, 64, 0)
        if (dos.toString('ascii', 0, 2) !== 'MZ') return null
        const peOffset = dos.readUInt32LE(60)
        const header = Buffer.alloc(6)
        fs.readSync(fd, header, 0, 6, peOffset)
        if (header.toString('ascii', 0, 4) !== 'PE\0\0') return null
        return header.readUInt16LE(4)
    }
    finally {
        fs.closeSync(fd)
    }
}

/** Reads the CPU types out of a Mach-O fat header, or a thin one's single type. */
function machOArchitectures(file) {
    const fd = fs.openSync(file, 'r')
    try {
        const magic = Buffer.alloc(4)
        fs.readSync(fd, magic, 0, 4, 0)
        const value = magic.readUInt32BE(0)

        // FAT_MAGIC / FAT_CIGAM, both stored big-endian on disk.
        if (value === 0xCAFEBABE || value === 0xCAFEBABF) {
            const countBuf = Buffer.alloc(4)
            fs.readSync(fd, countBuf, 0, 4, 4)
            const count = countBuf.readUInt32BE(0)
            const entrySize = value === 0xCAFEBABF ? 32 : 20
            const arches = []
            for (let index = 0; index < count; index += 1) {
                const entry = Buffer.alloc(4)
                fs.readSync(fd, entry, 0, 4, 8 + index * entrySize)
                arches.push(cpuName(entry.readInt32BE(0)))
            }
            return arches
        }

        // Thin Mach-O: cputype follows the little-endian magic.
        if (value === 0xCFFAEDFE || value === 0xCEFAEDFE) {
            const cpu = Buffer.alloc(4)
            fs.readSync(fd, cpu, 0, 4, 4)
            return [cpuName(cpu.readInt32LE(0))]
        }
        return []
    }
    finally {
        fs.closeSync(fd)
    }
}

function cpuName(cpuType) {
    if (cpuType === 0x01000007) return 'x86_64'
    if (cpuType === 0x0100000C) return 'arm64'
    return `cpu:${cpuType}`
}

function sha256(file) {
    return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function collect(source, name, label) {
    if (!source) return null
    const size = fs.statSync(source).size
    if (size < MIN_BYTES) {
        fail(`${label}: ${path.basename(source)} is only ${size} bytes`)
        return null
    }
    const target = path.join(outDir, name)
    fs.copyFileSync(source, target)
    return { name, label, bytes: size, sha256: sha256(target) }
}

fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

const collected = []

if (platform === 'windows') {
    const releaseDir = path.join(tauriDir, 'target', 'release')

    const portable = path.join(releaseDir, 'chatgpt-exporter-desktop.exe')
    if (!fs.existsSync(portable)) {
        fail(`portable exe: ${path.relative(desktopDir, portable)} was not produced`)
    }
    else {
        const machine = peMachine(portable)
        if (machine !== 0x8664) {
            fail(`portable exe: COFF machine type is ${machine === null ? 'unreadable' : `0x${machine.toString(16)}`}, expected 0x8664 (x64)`)
        }
        collected.push(collect(portable, `ChatGPT-Exporter-Portable-${version}-windows-x64.exe`, 'Portable executable'))
    }

    const setup = findOne(
        path.join(releaseDir, 'bundle', 'nsis'),
        file => file.endsWith('.exe'),
        'NSIS installer',
    )
    collected.push(collect(setup, `ChatGPT-Exporter-Setup-${version}-windows-x64.exe`, 'Windows installer (NSIS)'))

    const msi = findOne(
        path.join(releaseDir, 'bundle', 'msi'),
        file => file.endsWith('.msi'),
        'MSI package',
    )
    collected.push(collect(msi, `ChatGPT-Exporter-${version}-windows-x64.msi`, 'Windows installer (MSI)'))
}

if (platform === 'macos') {
    const releaseDir = path.join(tauriDir, 'target', 'universal-apple-darwin', 'release')

    const binary = path.join(releaseDir, 'chatgpt-exporter-desktop')
    if (!fs.existsSync(binary)) {
        fail(`universal binary: ${path.relative(desktopDir, binary)} was not produced`)
    }
    else {
        const arches = machOArchitectures(binary)
        for (const required of ['x86_64', 'arm64']) {
            if (!arches.includes(required)) {
                fail(`universal binary: missing ${required} slice (found ${arches.join(', ') || 'nothing'})`)
            }
        }
    }

    const appDir = path.join(releaseDir, 'bundle', 'macos')
    const app = findOne(appDir, file => file.endsWith('.app'), 'App bundle')
    if (app) {
        const plist = path.join(app, 'Contents', 'Info.plist')
        if (!fs.existsSync(plist)) {
            fail('App bundle: Contents/Info.plist is missing')
        }
        else {
            const text = fs.readFileSync(plist, 'utf8')
            if (!text.includes(`<string>${version}</string>`)) {
                fail(`App bundle: Info.plist does not carry version ${version}`)
            }
        }
    }

    const dmg = findOne(
        path.join(releaseDir, 'bundle', 'dmg'),
        file => file.endsWith('.dmg'),
        'Disk image',
    )
    collected.push(collect(dmg, `ChatGPT-Exporter-${version}-macos-universal.dmg`, 'macOS disk image (universal)'))
}

const artifacts = collected.filter(Boolean)

if (problems.length > 0) {
    console.error('collect-artifacts: verification failed\n')
    for (const problem of problems) console.error(`  · ${problem}`)
    process.exit(1)
}

const manifest = { platform, version, artifacts }
fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 4)}\n`)

console.error(`collect-artifacts: ${artifacts.length} verified artifact(s) for ${platform} ${version}`)
for (const artifact of artifacts) {
    console.error(`  ${artifact.name}  ${(artifact.bytes / 1024 / 1024).toFixed(2)} MB  ${artifact.sha256}`)
}
