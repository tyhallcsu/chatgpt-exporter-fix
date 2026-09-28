# ChatGPT Exporter Desktop

A small [Tauri](https://tauri.app) app that installs the ChatGPT Exporter
userscript into your browser's userscript manager, and shows you exactly what it
is installing.

It is an installer, not a ChatGPT client. The exporter itself is still a
userscript running in your own browser, with your own session — which is the
only place it can do its job properly.

The reasoning behind all of this is in
[`../docs/desktop-release-design.md`](../docs/desktop-release-design.md).

---

## For users

Download from the [Releases page](https://github.com/tyhallcsu/chatgpt-exporter-fix/releases):

| You have | Download |
| --- | --- |
| Windows 10 / 11 | `ChatGPT-Exporter-Setup-<version>-windows-x64.exe` |
| Windows, no install wanted | `ChatGPT-Exporter-Portable-<version>-windows-x64.exe` |
| Windows, managed deployment | `ChatGPT-Exporter-<version>-windows-x64.msi` |
| macOS 10.15+, any Mac | `ChatGPT-Exporter-<version>-macos-universal.dmg` |
| Just the userscript | `chatgpt-exporter-<version>.user.js` |

Then: install a userscript manager if you have not got one, press **Open in
default browser**, and confirm in the install page your manager shows you.

### These builds are unsigned

There is no Apple Developer or Authenticode certificate behind them yet, so:

* **macOS** refuses the first launch. Right-click the app in Finder and choose
  **Open**, or allow it under System Settings › Privacy & Security.
* **Windows** shows a SmartScreen warning. **More info → Run anyway**.

Check the download against `SHA256SUMS.txt` on the release before you do either.
The app shows the same hash for the script it carries, so you can check that too.

### You do not need this app

Installing the `.user.js` directly into Tampermonkey or Violentmonkey works
exactly as it always has. The desktop helper exists to make that easier and
checkable, not to replace it.

---

## For developers

### Prerequisites

* Node ≥ 20 and pnpm **8.14.1** (`corepack enable` picks it up from
  `packageManager`)
* Rust stable ≥ 1.82
* macOS: Xcode Command Line Tools. Windows: MSVC build tools + WebView2 (present
  on Windows 10 1803+ and 11)

### Running it

```bash
pnpm install              # in the repository root
pnpm --dir desktop install
pnpm --dir desktop run dev
```

`dev` and `build` both run `scripts/prepare-userscript.mjs` first, which builds
the userscript from `src/` and stages it for embedding. You never copy
`dist/chatgpt.user.js` by hand, and the desktop app never reads the committed
copy — on some branches that copy is older than the source next to it.

### Building installers

```bash
pnpm --dir desktop run build                                  # for this machine
pnpm --dir desktop exec tauri build --target universal-apple-darwin   # macOS, both arches
```

Output lands in `src-tauri/target/**/release/bundle/`. To get the release naming
and the verification CI applies:

```bash
node desktop/scripts/collect-artifacts.mjs macos     # or: windows
```

That writes `desktop/artifacts/` and **fails** rather than passing a file that is
too small, has the wrong CPU architecture in its header, or carries the wrong
version in its `Info.plist`.

### Tests

```bash
cd desktop/src-tauri && cargo test --release
```

Six end-to-end tests drive a really-listening loopback server: that it serves the
script at its own path with the right content type, that `HEAD` carries no body,
that a query string does not defeat the path match, that guessed paths 404, and
that write methods are refused.

The release profile is used so the tests reuse the dependencies the bundle
compiles anyway. `cargo test` on its own works too, at the cost of building the
whole tree a second time.

### Layout

| Path | What |
| --- | --- |
| `src/` | The window: plain HTML, CSS and JS. No framework, no build step. |
| `src-tauri/src/main.rs` | Tauri commands. Every privileged action is validated here. |
| `src-tauri/src/server.rs` | The loopback install server. |
| `src-tauri/src/browsers.rs` | Installed-browser detection — existence checks only, never a profile. |
| `src-tauri/src/userscript.rs` | The embedded script and its provenance record. |
| `scripts/prepare-userscript.mjs` | Builds and stages the userscript. |
| `scripts/collect-artifacts.mjs` | Verifies and renames bundler output. |
| `assets/icon.svg` | Icon source. Regenerate with `pnpm exec tauri icon assets/icon.png`. |

### Releasing

Push a tag:

```bash
git tag desktop-v2.36.3.1
git push origin desktop-v2.36.3.1
```

`.github/workflows/desktop-release.yml` builds Windows on Windows and macOS on
macOS, cross-checks that both embedded the same userscript, writes
`SHA256SUMS.txt` and publishes the release.

---

## Licence and attribution

ChatGPT Exporter is by [pionxzh](https://github.com/pionxzh/chatgpt-exporter),
MIT licensed. This packaging is MIT too. Not affiliated with OpenAI.
