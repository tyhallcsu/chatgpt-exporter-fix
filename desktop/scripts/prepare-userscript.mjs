#!/usr/bin/env node
/**
 * Builds the ChatGPT Exporter userscript from this repository's own source and
 * stages it, plus a provenance record, for the Tauri build to embed.
 *
 * The repository tracks `dist/chatgpt.user.js`, but a tracked artifact is only
 * as fresh as the last `chore: ci build` commit, which can lag the source it is
 * supposed to represent. So the desktop build never trusts `dist/`; it
 * regenerates it here and records what it got. On a branch synced to an upstream
 * release the rebuild reproduces the tracked copy byte for byte, and that
 * agreement is itself the check.
 *
 * Side effect worth knowing: the root `vite build` runs with `emptyOutDir`, so
 * it deletes every other file in `dist/` — including any local `build:review`
 * artifact. This script snapshots those files first and puts them back, so the
 * working tree is left as it was found.
 *
 * Usage:
 *   node scripts/prepare-userscript.mjs                # build + stage
 *   node scripts/prepare-userscript.mjs --verify-only  # re-check staged hash
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(desktopDir, '..')
const distDir = path.join(repoRoot, 'dist')
const builtUserscript = path.join(distDir, 'chatgpt.user.js')
const stageDir = path.join(desktopDir, 'src-tauri', 'userscript')
const stagedUserscript = path.join(stageDir, 'chatgpt-exporter.user.js')
const stagedMetadata = path.join(stageDir, 'metadata.json')

const verifyOnly = process.argv.includes('--verify-only')

function fail(message) {
    console.error(`prepare-userscript: ${message}`)
    process.exit(1)
}

function sha256(buffer) {
    return createHash('sha256').update(buffer).digest('hex')
}

/** Reads a `// @key value` line out of a userscript metadata block. */
function readHeader(source, key) {
    const header = source.slice(0, source.indexOf('// ==/UserScript=='))
    const match = header.match(new RegExp(`^// @${key}\\s+(.+?)\\s*$`, 'm'))
    return match ? match[1] : null
}

function gitOutput(args) {
    const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
    if (result.status !== 0) return null
    return result.stdout.trim()
}

function buildUserscript() {
    // Preserve every other tracked file in dist/ across vite's emptyOutDir.
    const preserved = fs.existsSync(distDir)
        ? fs.readdirSync(distDir)
            .filter(name => name !== 'chatgpt.user.js')
            .map(name => ({ name, data: fs.readFileSync(path.join(distDir, name)) }))
        : []

    console.error('prepare-userscript: building the userscript from source…')
    const build = spawnSync('pnpm', ['run', 'build'], {
        cwd: repoRoot,
        stdio: 'inherit',
        shell: process.platform === 'win32',
    })
    if (build.status !== 0) fail('`pnpm run build` failed in the repository root')

    for (const file of preserved) {
        const target = path.join(distDir, file.name)
        if (!fs.existsSync(target)) fs.writeFileSync(target, file.data)
    }
}

if (!verifyOnly) buildUserscript()

if (!fs.existsSync(builtUserscript)) {
    fail(`${path.relative(repoRoot, builtUserscript)} is missing — run this script without --verify-only first`)
}

const source = fs.readFileSync(builtUserscript)
const text = source.toString('utf8')

const userscriptVersion = readHeader(text, 'version')
const userscriptName = readHeader(text, 'name')
if (!userscriptVersion) fail('the built userscript has no @version header')

// A mismatch here means the artifact and the manifest disagree about what was
// built, which is exactly the confusion this whole script exists to prevent.
const rootPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
if (!verifyOnly && userscriptVersion !== rootPackage.version) {
    fail(`built userscript is @version ${userscriptVersion} but package.json says ${rootPackage.version}`)
}

const digest = sha256(source)

if (verifyOnly) {
    if (!fs.existsSync(stagedMetadata)) fail('nothing staged yet — run without --verify-only first')
    const staged = JSON.parse(fs.readFileSync(stagedMetadata, 'utf8'))
    const stagedDigest = sha256(fs.readFileSync(stagedUserscript))
    if (staged.userscriptSha256 !== stagedDigest) {
        fail(`staged copy hashes ${stagedDigest} but metadata.json claims ${staged.userscriptSha256}`)
    }
    if (staged.userscriptSha256 !== digest) {
        fail(`staged copy (${staged.userscriptSha256}) differs from dist/chatgpt.user.js (${digest})`)
    }
    console.error(`prepare-userscript: verified ${userscriptVersion} sha256=${digest}`)
    process.exit(0)
}

const sourceCommit = process.env.SOURCE_COMMIT?.trim() || gitOutput(['rev-parse', 'HEAD']) || 'unknown'
const workingTreeClean = gitOutput(['status', '--porcelain', '--', 'src', 'package.json', 'vite.config.ts']) === ''

const metadata = {
    userscriptName: userscriptName ?? 'ChatGPT Exporter',
    userscriptVersion,
    userscriptSha256: digest,
    userscriptBytes: source.byteLength,
    sourceCommit,
    sourceCommitShort: sourceCommit.slice(0, 7),
    sourceClean: workingTreeClean,
    builtAt: new Date().toISOString(),
}

fs.mkdirSync(stageDir, { recursive: true })
fs.writeFileSync(stagedUserscript, source)
fs.writeFileSync(stagedMetadata, `${JSON.stringify(metadata, null, 4)}\n`)

console.error(`prepare-userscript: staged ${userscriptVersion} (${source.byteLength} bytes) sha256=${digest}`)
console.error(`prepare-userscript: source commit ${metadata.sourceCommitShort}${workingTreeClean ? '' : ' (dirty working tree)'}`)
