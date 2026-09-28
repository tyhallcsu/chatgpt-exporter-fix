# Verification matrix

**Updated:** 2026-09-28

Two runs are recorded here. The first is the v2.36.3 upstream sync — what was
actually checked on the current tree. The second is the 2.36.2-era browser
acceptance run, kept as history and explicitly **not** claimed for the current
build.

---

# Run 2 — sync to upstream v2.36.3 (2026-09-28)

**Tree under test:** `sync/upstream-2.36.3`, product paths identical to upstream
`e2dd598a11ed709911943368f9eb7bad0e01dee0` (`chore: ci build` for
`userscript-v2.36.3`).
**What changed:** the product became upstream's again. Nothing fork-specific was
added to it.

## PRODUCT DELTA FROM RELEASED UPSTREAM: ZERO

| Check | Command | Result |
|---|---|---|
| Product paths vs released upstream | `git diff e2dd598 HEAD -- src tests dist vitest.config.ts tsconfig.json pnpm-lock.yaml CHANGELOG.md .release-please-manifest.json index.html .npmrc .editorconfig .husky scripts` | **empty** |
| `package.json` vs released upstream | `git diff e2dd598 HEAD -- package.json` | one added line, the `build:review` script. `version`, `dependencies`, `devDependencies` are upstream's. |
| Fork's old PR #400 variant | searched for in `src/` | **absent** — upstream's final implementation replaced it wholesale, not by reverting |
| `navMount` / `shellSettle` / placement patch / old theme patch | searched for in `src/` | **absent** |
| Tracked review artifact | `dist/chatgpt-exporter-review.user.js` | **removed from tracking**; regenerated on demand, gitignored |

See [`upstream-comparison.md`](./upstream-comparison.md) for the full classified
path table.

## Local checks

Run with the declared package manager, **pnpm 8.14.1** (`npm install pnpm@8.14.1`
into a scratch prefix; the machine's global pnpm is 9.1.1 and was not used).
Node 26.5.1.

| Command | Exit | Result |
|---|---|---|
| `pnpm install --frozen-lockfile` | **0** | lockfile accepted unchanged |
| `pnpm test` | **0** | 117 tests in 21 files, all passing (`tsc --noEmit` + Vitest) |
| `pnpm lint` | **0** | clean |
| `pnpm build` | **0** | `dist/chatgpt.user.js`, 587,764 bytes |
| `pnpm run build:review` | **0** | `dist/chatgpt-exporter-review.user.js`, `@name` suffixed, `@version 2.36.3-review.<seq>.<sha>`, `@updateURL`/`@downloadURL` `none`; leaves `dist/chatgpt.user.js` untouched |

## Userscript byte identity

| | Value |
|---|---|
| Our `pnpm build` output | `dist/chatgpt.user.js` |
| Version header | `2.36.3` |
| Bytes | 587,764 |
| SHA-256 | `479675436c6f9f1b4fdf9eb2979e103aa01da359e2d3926eb3e43d622a9d098a` |
| Upstream `e2dd598:dist/chatgpt.user.js` | same bytes, same hash — `cmp` clean |
| Verdict | **BYTE-IDENTICAL to the official upstream v2.36.3 artifact** |

This is also the proof that review-build scaffolding does not leak into a normal
build: with `REVIEW_BUILD_ID` unset, `vite.config.ts` emits upstream's bytes.

## Desktop packaging

| Check | Result |
|---|---|
| Version bumped 2.36.2 → 2.36.3 | `desktop/package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json` |
| `node scripts/prepare-userscript.mjs` | **exit 0** — builds the userscript from this repository's `src/`, does not trust `dist/` |
| Provenance recorded | version `2.36.3`, sha256 `4796754…d098a`, 587,764 bytes, source commit `4d268ba`, `sourceClean: true` |
| `--verify-only` re-check | **exit 0** — staged copy hashes what `metadata.json` claims, and matches `dist/` |
| JSON/TOML/YAML parse | `desktop/package.json`, `tauri.conf.json`, `capabilities/default.json`, `metadata.json`, `desktop-release.yml` all parse |
| Local Tauri bundle build | **not run.** Deliberate: repeated local universal Rust builds previously came close to filling this machine's disk. Cross-platform bundling is GitHub Actions' job. |
| `cargo test --release` | **not run locally**, same reason. The workflow runs it on both platforms before bundling. |

Windows and macOS artifacts, their architectures and their smoke tests are
verified by [`desktop-release.yml`](../.github/workflows/desktop-release.yml) on
the tag build, not here.

## Not re-measured this run

- **No browser acceptance run.** The current product is upstream's released
  v2.36.3, not a fork candidate, and its UI layer is materially different from
  the build Run 1 measured (see the note below). Nothing from Run 1's placement,
  SPA or console tables is claimed for it.
- **No export verified live.** Run 1's exports were blocked by a ChatGPT 429 and
  were not retried here.

---

# Run 1 — reconciled candidate on upstream v2.36.2 (2026-09-26)

> **History. Do not read these numbers as current.** They measure
> `2.36.2-review.627.8f1284a`, a build whose product content was upstream v2.36.2
> plus the fork's pre-merge PR #400 variant. Upstream has since rewritten the
> exporter's styling, sidebar row, toggles, dialog and hover card
> (`1b309f7`, `87b26a1`, `1757ece`, `03ebb1d`, `5cc7269`) and changed the
> timestamp path (`5208543`). The placement, SPA and console results below are
> therefore evidence about a superseded build. They are kept because they are what
> retired the fork's private placement architecture, which is still the reason
> that code is not here.

**Build under test:** `2.36.2-review.627.8f1284a`
(`dist/chatgpt-exporter-review.user.js`, SHA-256
`596d71dc50075294c4af2084bdb2fc1d932894b0b6f8596ee956e61a81e4f60d`)
**Reference build:** official upstream v2.36.2, `~/.chatgpt-exporter-artifacts/official-2.36.2-e59449a.user.js`,
SHA-256 `26aa55ee5194d1f15afd9c584e57b0ca341dd2fef0c5e01a604c0fdf8c862772`
**Browser:** dedicated profile `~/.chrome-chatgpt-exporter-test`, Chrome 153.0.8010.53,
CDP 9333, **real Tampermonkey 5.5.0**, signed in.

## Attribution controls

Every browser result below was taken with exactly one exporter able to run.

| Control | Result |
|---|---|
| ChatGPT exporters enabled during each run | **1**, set and read back with `manager-enable.mjs` |
| Official v2.36.2 in the manager | reinstalled from the byte-known `e59449a` artifact, so the reference is exactly upstream's own CI build |
| Candidate install path | served over loopback, installed through Tampermonkey's own prompt; it offered **Update**, confirming the version sorts above `2.36.1-review.637.36db050` despite the lower sequence number |
| `TeamHub Chat Exporter 1.0.5` (third party, in the same profile) | scope is `https://app.teamhub.com/chat/*` and `https://*.teamhub.com/chat/*` — **cannot match chatgpt.com**. Disabled anyway for the whole acceptance run, and **restored to its original enabled state** afterwards. |
| Owner's normal Chrome profile | not touched. No browser state in Git. |

## React #418 — controlled cold-load comparison

Four cold loads per condition, brand-new tab each, 1440×813 CSS viewport,
`https://chatgpt.com/`. Script: `cold-load-console.mjs`.

| Condition | Cold loads | #418 loads | Usable launcher | Clickable | Exporter runtime errors | User-facing failure |
|---|---|---|---|---|---|---|
| No exporter | 4 | 0 / 4 | n/a | n/a | 0 | — |
| Official v2.36.2 | 4 | 4 / 4 | 4 / 4 | yes | 0 | **none** |
| Reconciled candidate | 4 | 4 / 4 | 4 / 4 | yes, 314×46 | 0 | **none** |

**Verdict: console-only.** Identical between official and candidate, so it is not
a regression and not something a private patch is needed for.
`shellSettle.ts` was dropped on this evidence.

## UI / placement — candidate

`launcher-placement-check.mjs`, corrected harness (see
`docs/2.36.2-reconciliation.md` for the five faults fixed). **6/6 PASS.**

| Case | Viewport | Launcher box | Collisions with ChatGPT controls | Hit test | Menu in viewport | Export All reachable | List scrolls to end, uncovered |
|---|---|---|---|---|---|---|---|
| Expanded sidebar | 1440×827 | 314×46 @ (14,708) | none | all ours | yes | yes | yes |
| Collapsed rail | 1440×827 | 32×32 @ (10,739) | none | all ours | yes | yes | n/a |
| Short viewport | 1440×533 | 314×46 @ (14,414) | none | all ours | yes | yes | yes |
| Narrow, drawer open | 520×813 | 233×46 @ (14,694) | none | all ours | yes | yes | yes |
| 125%-equivalent | 1152×673 | 314×46 @ (14,554) | none | all ours | yes | yes | yes |
| 150%-equivalent | 960×546 | 314×46 @ (14,427) | none | all ours | yes | yes | yes |

- **Account / footer overlap:** none in any case. This was the original reported
  defect; upstream v2.36.2 fixed it on its own.
- **Narrow, drawer closed:** **not applicable.** ChatGPT renders no rail and no
  sidebar scroll area there, and offers no sidebar control of its own.
- **Appearance:** System → dark throughout; `data-theme="dark"` observed on every
  step. Menu rendered dark, readable.

## SPA navigation — candidate

`spa-nav-check.mjs`. **6/6 PASS.** Every step: exactly one rendered launcher, no
detached mounts, trigger 314×46, and a real click opens the menu.

| Step | Path reached | Rendered launchers | Menu opens |
|---|---|---|---|
| Initial document | `/` | 1 | yes |
| SPA → conversation A | `/c/6a629940…` | 1 | yes |
| SPA → conversation B | `/c/6a84ae40…` | 1 | yes |
| SPA → home | `/` | 1 | yes |
| History back | `/c/6a84ae40…` | 1 | yes |
| History forward | `/` | 1 | yes |

## Exports

**ChatGPT was rate limiting this account's conversation endpoints during the run.**
One bounded `api-health.mjs` observation of a single page load, no repeated
probing:

| Endpoint | Status |
|---|---|
| `/backend-api/conversations` (the Export All list) | **429** |
| `/backend-api/conversation/<id>` | **429** |
| `/backend-api/conversations/<id>` | **429** |
| everything else (`profiles/me`, `subscriptions`, `gizmos/*/conversations`, `sentinel/*`, …) — 59 requests | 200 |

These are **ChatGPT's own requests from its own page**, not the exporter's. No
conversation body renders, so there is nothing for any exporter to read or
capture.

| Export | Result | Evidence |
|---|---|---|
| Copy Text | **BLOCKED BY CHATGPT 429** | source endpoint `/backend-api/conversation/<id>` returns 429; no conversation content renders |
| Markdown | **BLOCKED BY CHATGPT 429** | one bounded attempt: menu item clicked, no download within 50 s. Not retried. |
| HTML | **BLOCKED BY CHATGPT 429** | same source endpoint |
| JSON / JSON (ZIP) | **BLOCKED BY CHATGPT 429** | same source endpoint |
| Screenshot | **BLOCKED BY CHATGPT 429** | captures the rendered thread; the thread does not render |

These were verified working on the build's predecessor in the session before —
screenshot export produced a valid ZIP with two valid PNGs, content verified at
start, middle and end. Recorded as **blocked, not failed**, and not claimed as a
pass.

## Export All

One attempt, `export-all-probe.mjs`. Not retried.

| Check | Result |
|---|---|
| Conversation-list endpoint | **429** |
| Dialog opens | yes |
| Error shown in the dialog | **yes** — `Error: Rate limited by the API · wait a moment and try again` |
| Counter | `0 / 0` — but now **accompanied by the error**, so it can no longer be read as an empty account |
| Export button | **disabled** |
| Wording | the no-`Retry-After` variant, correctly: the server sent none, so no wait is quoted as if it came from the API |
| Two-conversation ZIP | **BLOCKED BY CHATGPT 429** — not produced, not claimed |

This was the fork's pre-merge PR #400 variant working live under the exact
condition it was written for. It is the evidence that went to upstream with the
PR. Upstream's merged implementation, which is what ships in v2.36.3, is not the
same code and was not measured here.

## Known gaps from that run

- Single-conversation exports and the two-chat Export All ZIP were **blocked by
  ChatGPT's 429**, not verified.
- Escape closes the exporter menu but returns focus to `<body>` rather than the
  trigger (upstream behaviour at the time).
- Tab from the launcher did not walk into the menu items (upstream behaviour at
  the time).
- Signed **out**, `data-theme` was absent while the page rendered dark, so the
  menu rendered light on a dark page (upstream behaviour at the time).
