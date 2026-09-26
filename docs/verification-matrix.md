# Verification matrix — reconciled candidate on upstream v2.36.2

**Date:** 2026-09-26
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
`shellSettle.ts` is dropped.

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
  defect; upstream v2.36.2 fixes it on its own.
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

**ChatGPT is rate limiting this account's conversation endpoints right now.** One
bounded `api-health.mjs` observation of a single page load, no repeated probing:

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

These were verified working on this build's predecessor in the previous session
(screenshot export produced a valid ZIP with two valid PNGs, content verified at
start, middle and end). Nothing in this reconciliation touches the export paths —
the branch's only product change is `ExportDialog`'s error handling — so this is
recorded as **blocked, not failed**, and not claimed as a pass.

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

**This is PR #400's fix working live under the exact condition it was written
for.** Screenshot: kept with the run output, not committed (it shows real
conversation titles).

## Local checks

Run with the declared package manager, pnpm 8.14.1.

| Command | Exit | Result |
|---|---|---|
| `pnpm test` | 0 | 117 tests in 21 files, all passing |
| `pnpm lint` | 0 | clean |
| `pnpm build` | 0 | `dist/chatgpt.user.js` |
| `pnpm run build:review` | 0 | `dist/chatgpt-exporter-review.user.js`, byte-identical on a repeat build |

## Known gaps

- Single-conversation exports and the two-chat Export All ZIP are **blocked by
  ChatGPT's 429**, not verified this run.
- Escape closes the exporter menu but returns focus to `<body>` rather than the
  trigger (upstream behaviour, unchanged).
- Tab from the launcher does not walk into the menu items (upstream behaviour,
  unchanged).
- Signed **out**, `data-theme` is absent while the page renders dark, so the menu
  renders light on a dark page (upstream behaviour, unchanged; not reachable in
  the owner's signed-in usage).
