# HANDOFF — ChatGPT Exporter desktop packaging fork

**Updated:** 2026-09-28
**Phase:** synced to upstream v2.36.3. **Product delta: zero.**
**What this fork is:** desktop installers, QA/reference tooling, and its own
documentation and release policy for upstream's userscript. It carries no product
changes.
**Next action:** none required for the product. Watch upstream releases; when a
newer userscript release lands, repeat the sync and cut the next `desktop-v*` tag.

## Posture

- Repository **public**.
- Publishes **desktop packaging releases only** (`desktop-v*` tags). It does not
  tag or release the userscript, and does not publish to GreasyFork.
- `desktop-v2.36.2.1` stays exactly as published — same tag, same assets.
- No upstream PR open from this fork. PR #400 is merged; nothing else was sent.
- No credentials, cookies or browser state in Git.

## Refs

| | Ref |
|---|---|
| Upstream release | `userscript-v2.36.3` → `0826b38f809538b8d15d97643dfad89e3eb56665` |
| Released artifact commit (product base) | `e2dd598a11ed709911943368f9eb7bad0e01dee0` — `chore: ci build` for 2.36.3 |
| PR #400 | **MERGED** 2026-09-26, merge `c6f158860a30be167508b343d50314a1db59ca73`, head `b08934a` |
| Upstream master at sync time | `4c8fe6ea01d58a59bc59aea9ba1421fee7d80969` |
| Excluded, unreleased | `f9d9e4c` *micromark markdown→HTML*, `4c8fe6e` *assistant text as written* |
| Fork master before the sync | `8c5d639f366d7db2cc638db948ab36af2afc939e` |
| Sync branch | `sync/upstream-2.36.3` |
| Comparison issue | https://github.com/tyhallcsu/chatgpt-exporter-fix/issues/5 |
| Previous lines on `origin` (kept) | `review/reconcile-upstream-2.36.2` @ `536f0dd` · `review/reconcile-upstream-2.36.1` @ `ceeaa55` |
| Superseded placement work | `wip/launcher-placement-superseded` @ `f6fcd31` — **local only, never pushed.** Not on `origin` and not reachable from any remote ref, so the docs that cite it point at nothing a reader of this repository can fetch. It is the record of the private launcher architecture that upstream `11de3cd` superseded. Push it if that record should be public. |
| Worktree | `<repo>/.claude/worktrees/chatgpt-exporter-upstream-2363` |

## Artifacts

| | Path | Version | SHA-256 | Bytes |
|---|---|---|---|---|
| **Current userscript** | `dist/chatgpt.user.js` | `2.36.3` | `479675436c6f9f1b4fdf9eb2979e103aa01da359e2d3926eb3e43d622a9d098a` | 587,764 |
| Same bytes upstream | `e2dd598:dist/chatgpt.user.js` | `2.36.3` | same | 587,764 |
| Historical — `desktop-v2.36.2.1` release | `chatgpt-exporter-2.36.2.user.js` | `2.36.2` | `9daa710bc102bb5dc62f574958581efd2029ea68cd5f6fb60ac7d3bfe8475f93` | — |

The tracked artifact is upstream's own released build, and `pnpm build` from this
tree reproduces it byte for byte. That is the check: if a local build ever stops
matching the tracked copy, something has drifted into the product.

### Reproduce

```bash
npm install --prefix /tmp/pnpm8 pnpm@8.14.1
export PATH="/tmp/pnpm8/node_modules/pnpm/bin:$PATH"   # pnpm 8.14.1, the declared version
pnpm install --frozen-lockfile
pnpm test    # 117 tests, 21 files, exit 0
pnpm lint    # clean, exit 0
pnpm build   # exit 0
shasum -a 256 dist/chatgpt.user.js
# 479675436c6f9f1b4fdf9eb2979e103aa01da359e2d3926eb3e43d622a9d098a
```

`pre-push` runs `pnpm run test`. Hooks were not bypassed.

## Review builds

`pnpm run build:review` writes `dist/chatgpt-exporter-review.user.js` — a build
that cannot be mistaken for a release: suffixed `@name`, semver-prerelease
`@version` led by the commit count so it stays monotonic, its own filename, and
`@updateURL`/`@downloadURL` of `none`. It is **untracked** (see `.gitignore`); the
scaffolding in `vite.config.ts` is inert unless `REVIEW_BUILD_ID` is set, which
the byte identity above proves.

Installing one in a real manager:

1. Tampermonkey → Dashboard → **disable any other ChatGPT Exporter**. A review
   build has its own `@name`, so it installs *alongside* rather than replacing;
   two enabled exporters both run. `manager-enable.mjs` does this and reads the
   result back.
2. Utilities → Import from file → `dist/chatgpt-exporter-review.user.js`.
3. Script **Settings** tab (Config mode: Advanced) → untick **Check for updates**.
   `@updateURL none` does not do this on its own — it leaves the box ticked and
   stores the literal string `none`.
4. **Reload** `https://chatgpt.com/`. A userscript is only re-evaluated on a page
   load.

Rollback: disable the review build, enable the released `ChatGPT Exporter`, reload.

## What the v2.36.3 sync established

Full evidence in [`docs/verification-matrix.md`](docs/verification-matrix.md) and
[`docs/upstream-comparison.md`](docs/upstream-comparison.md).

- **Product delta is zero.** `git diff e2dd598 HEAD` is empty across `src/`,
  `tests/`, `dist/`, `pnpm-lock.yaml`, `vitest.config.ts`, `tsconfig.json`,
  `CHANGELOG.md` and `.release-please-manifest.json`; `package.json` differs by
  the single `build:review` line.
- **Upstream owns the Export All fix.** PR #400 merged as `1715ca7` + `c6f1588`
  and shipped in v2.36.3. Upstream refined it after this fork's cherry-pick, so
  the fork adopted upstream's final tree rather than reverting its own commit. The
  fork's variant is not present in any form.
- **Byte identity.** `pnpm build` reproduces upstream's released artifact exactly.
- **The old fork product code is gone**, not disabled:
  `src/styles/missing-tailwind.css`, the fork's timestamp pass, its toggle and row
  styling, i18next/react-i18next, Radix dialog and headlessui hover card — all
  superseded by upstream `1b309f7`, `87b26a1`, `1757ece`, `5208543`, `5cc7269`,
  `03ebb1d`. `navMount.ts`, `shellSettle.ts`, the placement patch and the old
  theme patch went at the 2.36.2 reconciliation and did not come back.
- **The tracked review artifact is gone.** It was a build of the superseded
  source; keeping it would have left the old implementation alive in the tree.
- **Desktop packaging moved to 2.36.3** across `desktop/package.json`,
  `Cargo.toml`, `Cargo.lock` and `tauri.conf.json`, and
  `prepare-userscript.mjs` records version `2.36.3`, the matching SHA-256 and the
  source commit.

## Not verified locally, on purpose

- **No local Tauri bundle build and no local `cargo test --release`.** Repeated
  local universal Rust builds previously came close to filling this machine's
  disk. Cross-platform bundling, the architecture checks and the launch smoke
  tests are GitHub Actions' job, on the platforms that ship.
- **No browser acceptance run this sync.** The product is upstream's released
  code, and its UI layer differs materially from the build the 2026-09-26 run
  measured. Nothing from that run's placement, SPA or console tables is claimed
  for v2.36.3.

## Test browser

Dedicated profile `~/.chrome-chatgpt-exporter-test`, CDP 9333, real Tampermonkey.
The owner's normal profile is never touched.

Harness, all in `.claude/skills/browser-test/scripts/`:

| Script | Purpose |
|---|---|
| `start-manager-chrome.sh` | start/reuse the manager browser |
| `manager.mjs` | bounded CDP client, trusted-input clicks, build-agnostic mount detection |
| `manager-state.mjs` | what is installed and enabled |
| `manager-enable.mjs` | force exactly one ChatGPT exporter enabled, verified |
| `manager-toggle.mjs` | enable/disable one named script (third-party interference) |
| `manager-script-settings.mjs` | a script's *effective* settings |
| `install-userscript.mjs` | install through the manager's own prompt |
| `cold-load-console.mjs` | cold-load console + launcher comparison |
| `launcher-placement-check.mjs` | overlap, hit-test, popup geometry, list scroll |
| `spa-nav-check.mjs` | launcher survival across SPA and history navigation |
| `background-load-check.mjs` | hidden-tab load, then foreground |
| `goto-conversation.mjs`, `page-probe.mjs` | open and inspect one conversation |
| `api-health.mjs` | one bounded look at which backend endpoints are throttled |
| `export-all-probe.mjs` | the Export All list-error acceptance check |
| `manager-export.mjs` | run one export in the manager browser and inspect it |
| `close-dialog.mjs` | leave the page clean between checks |
| `ui-shot.mjs`, `measure-text.mjs` | upstream's own UI comparison tools |

## Releasing the desktop app

```bash
git tag desktop-v2.36.3.1
git push origin desktop-v2.36.3.1
```

`.github/workflows/desktop-release.yml` builds Windows on Windows and macOS on
macOS, cross-checks that every platform embedded the same userscript, runs the
architecture and version checks and the launch smoke tests, writes
`SHA256SUMS.txt`, and publishes the release. Builds are **unsigned** unless real
signing secrets are present; the workflow reports which.

## Credit

Repo-local identity only: `sharmanhall <16804423+tyhallcsu@users.noreply.github.com>`.
pionxzh is the author of the userscript; `@namespace` and upstream attribution are
unchanged. Desktop packaging is this fork's.
