# Desktop release design

**Date:** 2026-09-26
**Branch:** `feat/desktop-release-packaging`
**Packaging input:** `f19f207c41c0fc1fbc23d6e3569b89919e955466` — the head of
`review/reconcile-upstream-2.36.2`, whose product content is upstream v2.36.2
plus upstream PR #400 and nothing else (see
[`2.36.2-reconciliation.md`](./2.36.2-reconciliation.md)).

This note is the decision record for the Windows and macOS deliverables. It is
written before the implementation so the shape of the thing can be argued with
rather than reverse-engineered from a workflow file.

---

## Why this branch, and not `master` or PR #6

`review/reconcile-upstream-2.36.2` is the verified line. `master` still carries
the fork's own 2.36.1-era repairs, which the reconciliation classified as
superseded by upstream. PR #6, which would bring the reconciliation onto
`master`, is **still `CONFLICTING` / `DIRTY`** as of this writing — the conflict
is the reconciliation deleting `src/utils/navMount.ts`, `theme.ts` and
`threadDom.ts` that `master` added, which is a product decision and not a
packaging one.

Resolving it inside a packaging workstream would bury a product judgement in a
build change, so this branch stacks on the reconciliation instead and targets it
as its PR base. Packaging follows the product; it does not decide it.

### A finding worth acting on separately

`dist/chatgpt.user.js` as committed on `f19f207` is upstream's own
`chore: ci build` output for v2.36.2. It does **not** contain the PR #400
cherry-pick that the branch's `src/` carries — `grep` for `retryAfterFromServer`
or `describeListLoadError` finds nothing in it, and finds seven matches in a
fresh build. The tracked artifact is therefore stale with respect to its own
branch.

Nothing here depends on that file: the desktop build always rebuilds the
userscript from `src/`. But the repository does publish that path, so the stale
copy is worth a separate `chore: ci build` commit on the product line. It is
deliberately *not* fixed in this PR.

---

## What the desktop app is

**A userscript installer and verifier. Not a ChatGPT client.**

The exporter is, and stays, a browser userscript. Wrapping it in a desktop shell
would mean shipping a second browser to run a script that the user's real
browser already runs better — with their session, their extensions and their
conversation history. That product does not need to exist.

What *is* missing is the install path. Today a user has to find the right
`.user.js`, trust an unfamiliar raw-file URL, and have no way to check that the
bytes they installed are the bytes that were reviewed. That is what this app
fixes:

1. It carries a userscript built from a known commit, embedded in the binary.
2. It shows that script's version, size, source commit, and the SHA-256 of the
   exact bytes it is about to hand over — hashed at runtime, not quoted from a
   build record.
3. It serves those bytes from `127.0.0.1` at a `.user.js` address and opens a
   browser there, which is the one install gesture userscript managers accept
   from outside themselves.
4. It offers fallbacks when that does not work: copy the source, or save a copy
   next to the user's other downloads.

The manager's own install prompt is still what installs the script. The app
moves the user to that prompt with verified bytes in hand; it never stands in
for it.

## What it deliberately does not do

| Not done | Why |
| --- | --- |
| Write into a browser or extension store | Not possible without defeating the browser's own isolation, which is the boundary being relied on. |
| Detect which userscript manager is installed | Would require reading the browser profile. The app reads no profile, so it cannot know — and says so in the window rather than guessing. |
| Read cookies, sessions, history or saved credentials | Never needed for installing a script. |
| Copy or migrate browser profiles | Same. |
| Sign in to ChatGPT, or see any conversation | Export happens in the page, in the userscript, as it always has. |
| Bundle a browser engine | The OS webview renders one static local page. There is nothing here worth 100 MB of Chromium. |
| Auto-update itself silently | There is a *Check for a newer release* button that asks GitHub and reports what it finds. Nothing installs on its own. |
| Ship private test state | The repository's QA tooling (`.claude/skills/browser-test/`) is not packaged. |

## Supported systems

| OS | Artifact | Notes |
| --- | --- | --- |
| Windows 10 1803+ / 11, x64 | NSIS `.exe` installer, portable `.exe`, `.msi` | Needs the WebView2 runtime, which ships with Windows 10 1803+ and 11. The NSIS installer fetches it if it is somehow absent. |
| macOS 10.15+, Apple silicon and Intel | Universal `.dmg` containing a `.app` | One image for both architectures; WKWebView is part of the OS. |

Linux is not built. Userscript managers there install exactly as they do
everywhere else, and the userscript-only path below covers it.

Supported managers: **Tampermonkey**, **Violentmonkey**, and Safari's
**Userscripts**. The app links to all three and does not care which is used.

---

## Architecture

### Tauri, not Electron

| | Tauri v2 | Electron |
| --- | --- | --- |
| macOS `.dmg` | **1.9 MB** measured | ~90 MB typical |
| macOS `.app` | **4.0 MB** measured | ~200 MB typical |
| Renderer | OS webview (WKWebView / WebView2) | Bundled Chromium |
| Node in the app | none | full runtime |

The app's entire job is to render one static page and open a URL. Electron
would ship a browser engine and a Node runtime to do that, and would put a
100 MB download in front of a 830 KB userscript. Tauri's numbers above are from
the first local build, not estimates.

The cost is a Rust toolchain in CI, which `dtolnay/rust-toolchain` plus
`Swatinem/rust-cache` handle in a few lines. That is the whole trade.

### Layout

```
desktop/
  package.json            @tauri-apps/cli, pinned pnpm 8.14.1
  scripts/
    prepare-userscript.mjs   builds + stages the userscript, records provenance
    collect-artifacts.mjs    verifies and renames what the bundler produced
  src/                    static frontend — no framework, no build step
  src-tauri/
    src/main.rs           commands; every privileged action is checked here
    src/server.rs         the loopback install server
    src/browsers.rs       installed-browser detection (existence checks only)
    src/userscript.rs     the embedded script and its provenance
    src/server_tests.rs   end-to-end tests against a real listening socket
```

Nothing desktop-specific is added to `src/`, `vite.config.ts` or the userscript
build. The only change outside `desktop/` and `.github/` is one `ignores` entry
in `eslint.config.js`, so the exporter's React-flavoured lint config does not
try to lint a Rust project's helper scripts.

### How the userscript gets in

`scripts/prepare-userscript.mjs` runs `pnpm run build` in the repository root,
then copies `dist/chatgpt.user.js` into `desktop/src-tauri/userscript/`
(gitignored) together with a `metadata.json` recording version, byte count,
SHA-256, source commit and whether the tree was clean. `build.rs` fails with a
readable message if that directory is missing; `main.rs` embeds both files with
`include_str!`.

Two details are deliberate:

* **It builds rather than copying `dist/`.** The committed artifact is stale on
  this very branch, as recorded above. A packaging step that trusted it would
  have shipped a userscript without PR #400 while claiming otherwise.
* **The app hashes the embedded bytes at runtime** and compares that against the
  recorded hash, showing a warning if they differ. The number on screen is a
  property of the binary, not a claim copied out of a build log.

The root build runs with `emptyOutDir`, which would delete the tracked
`dist/chatgpt-exporter-review.user.js` sitting beside its output. The prepare
script snapshots and restores it, so running the desktop build leaves the
working tree as it found it.

### The install server

`src/server.rs` binds `127.0.0.1:0`, takes the ephemeral port, and serves the
embedded script at `/<random>/chatgpt-exporter.user.js`. Constraints, each with
a test in `server_tests.rs`:

* loopback only — never `0.0.0.0`;
* one path, compared by equality, so traversal is not expressible;
* `GET` and `HEAD` only; anything else is 405;
* a wrong or guessed path is 404, including the un-prefixed one;
* `Content-Type: text/javascript`, `nosniff`, `no-store`;
* read/write timeouts and a capped request line;
* no disk access, no state, and it dies with the process.

The random path segment comes from `std::collections::hash_map::RandomState`,
which is OS-seeded, rather than from a new dependency.

### Security boundaries in the app

The webview is granted `core:default` and nothing else. It has no opener
permission, no filesystem permission and no shell permission. Every privileged
action is a Rust command that validates its own input:

* `open_external` accepts `https:` URLs and the live install URL, nothing else;
* `open_install_page` opens either the default browser or a path that
  `browsers::detect()` itself reported — the webview cannot name an arbitrary
  executable;
* `save_to_downloads` writes one fixed filename into the OS downloads folder.

The page's CSP allows `connect-src` to `https://api.github.com` for the update
check and nothing else off-machine.

---

## Release architecture

`.github/workflows/desktop-release.yml`, separate from the existing `Check`,
`Release` and `release-please` workflows. It never commits, never tags the
userscript and never publishes to a userscript host.

```
userscript (ubuntu)   lint + test + build; publishes the canonical SHA-256
   │
   ├── desktop (windows-latest)   cargo test --release, tauri build,
   │                              verify + rename, version + launch smoke test
   └── desktop (macos-latest)     same, --target universal-apple-darwin
   │
release (ubuntu, tags only)       cross-checks every job's userscript hash,
                                  writes SHA256SUMS.txt, publishes
```

Triggers: `desktop-v*` tag pushes, pull requests touching packaging or product
source, and manual dispatch. pnpm is pinned to **8.14.1** by an explicit
`version:` input *and* asserted at runtime, so a runner image bump cannot
silently move the build.

Windows artifacts are built on Windows. Nothing cross-compiles an installer.

### Verification, not extension-checking

`collect-artifacts.mjs` refuses anything it cannot confirm:

* every file is at least 1 MiB — a stub with the right extension fails;
* the **portable** Windows executable's COFF machine type must be `0x8664`;
* the macOS binary's Mach-O fat header must carry both `x86_64` and `arm64`;
* the `.app`'s `Info.plist` must carry the configured version;
* exactly one bundle must match in each bundler output directory.

The architecture check deliberately reads the portable `.exe` and not the NSIS
installer. An NSIS stub is a 32-bit image — the published
`ChatGPT-Exporter-Setup-2.36.2-windows-x64.exe` reports COFF machine `0x14c` —
whatever architecture it carries inside, so checking *it* would either fail
every x64 build or prove nothing. The portable executable is the same binary
the installer unpacks, so measuring it measures what gets installed.

The workflow adds, on Windows, the version resource read back out of the built
`.exe`, and on both platforms a launch test that starts the app and fails if it
is not still running twenty seconds later.

### Expected file names

```
ChatGPT-Exporter-Setup-2.36.2-windows-x64.exe        NSIS installer
ChatGPT-Exporter-Portable-2.36.2-windows-x64.exe     no-install executable
ChatGPT-Exporter-2.36.2-windows-x64.msi              MSI, for managed deployment
ChatGPT-Exporter-2.36.2-macos-universal.dmg          .app inside, both arches
chatgpt-exporter-2.36.2.user.js                      the userscript on its own
SHA256SUMS.txt
```

The version in these names is the **userscript** version, which is also the app
version. The packaging revision lives in the tag.

### What is reproducible, and what is not

The userscript is. The same commit built on Ubuntu, macOS and Windows produced
byte-identical output — `9daa710bc102bb5dc62f574958581efd2029ea68cd5f6fb60ac7d3bfe8475f93`
on all three — which is what makes the release job's cross-job hash check a real
check rather than a formality. The Windows runner disables `core.autocrlf`
before checkout to keep it that way.

The installers are not, and are not claimed to be. A `.dmg` embeds creation
timestamps and filesystem metadata, so the same source produces a different
image hash on every run. Verify an installer against the `SHA256SUMS.txt`
published beside it, not against a hash from another build.

### Versioning

Tag: `desktop-v<userscript version>.<packaging revision>`, first release
`desktop-v2.36.2.1`. It cannot be confused with upstream's `userscript-v2.36.2`
or with a release-please tag, and it says exactly what it contains. The app
window shows both numbers side by side.

A packaging-only change bumps the last component. A new userscript version
resets it to `.1`.

### Visibility

The fork was private through the 2.36.1 and 2.36.2 reconciliations, and
`b9f5cd4` on `master` recorded that decision. It was reversed on 2026-09-26,
immediately after `desktop-v2.36.2.1` shipped, so that collaborators and users
could reach the installers without being added to the repository one at a time —
GitHub has no way to publish a single release from a private repository.

Publication was preceded by a scan of all 665 commits for private keys, personal
access tokens, cloud and Slack credentials, JWTs, ChatGPT conversation
identifiers and browser profile data. It found none. The one piece of
local-machine detail in tracked content — an absolute worktree path carrying a
macOS account name — was rewritten as `~/`-relative in `f48f220` beforehand.
Three older commits still contain the absolute form; history was deliberately
not rewritten, because that would invalidate the source commit recorded in the
release and in every artifact's provenance record, to hide a home-directory
name.

Going public also removes the Actions billing pressure this design note worried
about: public repositories do not consume the account's minute allowance, so the
10× macOS multiplier no longer applies.

### Update behaviour

None automatic. The updater artifacts Tauri can generate are switched off
(`createUpdaterArtifacts: false`). The *Check for a newer release* button asks
the GitHub releases API and reports what it gets.

The repository is **public** as of `desktop-v2.36.2.1`, so the endpoint answers
anonymously and the button reports the real latest tag. Verified without any
credential:

```console
$ curl -sS https://api.github.com/repos/tyhallcsu/chatgpt-exporter-fix/releases/latest
tag: desktop-v2.36.2.1   assets: 6
```

The 404 path is still handled and still worth keeping: it is what a fork of this
repository sees while it is private, and what anyone sees if the releases are
ever withdrawn. In that case the app says "no public release feed, this build
comes from a private repository" rather than reporting a failure.

### Signing

Not signed, and the app never claims otherwise: it prints *Unsigned community
build* unless the build was actually handed credentials, which it learns from a
compile-time `DESKTOP_BUILD_SIGNED` env var that CI only sets when the relevant
secret is non-empty.

The workflow already has both paths wired, gated on secrets that do not exist
yet:

| Platform | Secrets | Effect when set |
| --- | --- | --- |
| macOS | `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | Tauri signs and notarises the `.app` before the `.dmg` is made. |
| Windows | `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD`, `WINDOWS_CERTIFICATE_THUMBPRINT` | The PFX is imported into the runner's user store and passed to the bundler by thumbprint. |

No certificate, password or thumbprint is committed anywhere. Until those
secrets exist, users see Gatekeeper and SmartScreen prompts, and the release
notes say so and give the SHA-256 to check instead.
