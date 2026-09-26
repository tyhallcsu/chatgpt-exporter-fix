# HANDOFF — ChatGPT Exporter private fork

**Updated:** 2026-09-26
**Phase:** reconciled onto upstream v2.36.2. Product delta reduced to PR #400 alone.
**Recommendation:** **reduce this repo to QA / reference now; retire the product
fork once PR #400 merges.** See the bottom of this file.
**Next action:** none required. Watch
[pionxzh/chatgpt-exporter#400](https://github.com/pionxzh/chatgpt-exporter/pull/400);
when it merges, drop `bd823cd` and the branch becomes a pure QA overlay on
upstream.

## Posture

- Repository **private**. Unchanged.
- **Nothing published** — no release, no tag, no GreasyFork update.
- Private `master` **not merged**, not moved by this work.
- One public contribution: PR #400. Not force-pushed, not commented on, not
  merged by us.
- No credentials, cookies or browser state in Git.

## Refs

| | Ref |
|---|---|
| Upstream base | `e59449ab7ff428ad86aa95e2d0be444db221ab5d` (= `userscript-v2.36.2` `2e8b65b` + `chore: ci build`) |
| Private branch | `review/reconcile-upstream-2.36.2` |
| PR #400 cherry-pick | `bd823cd` — tree identical to PR head `3963988` |
| Artifact source commit | `8f1284a` |
| Public PR | https://github.com/pionxzh/chatgpt-exporter/pull/400 |
| Comparison issue | https://github.com/tyhallcsu/chatgpt-exporter-fix/issues/5 |
| Previous private line (kept) | `review/reconcile-upstream-2.36.1` @ `ceeaa55` |
| Superseded placement work (kept) | `wip/launcher-placement-superseded` @ `f6fcd31` |
| Worktree | `/Users/bradbanks/Documents/GitHub/chatgpt-exporter/.claude/worktrees/chatgpt-exporter-reconcile-2362` |

## Artifacts

| | Path | Version | SHA-256 | Bytes |
|---|---|---|---|---|
| **Review build** | `dist/chatgpt-exporter-review.user.js` | `2.36.2-review.627.8f1284a` | `596d71dc50075294c4af2084bdb2fc1d932894b0b6f8596ee956e61a81e4f60d` | 830,165 |
| **Rollback — official v2.36.2** | `~/.chatgpt-exporter-artifacts/official-2.36.2-e59449a.user.js` | `2.36.2` | `26aa55ee5194d1f15afd9c584e57b0ca341dd2fef0c5e01a604c0fdf8c862772` | 829,325 |
| Previous review build (history) | `~/.chatgpt-exporter-artifacts/review-637.36db050.user.js` | `2.36.1-review.637.36db050` | `4e35d1b013f1726e7164cf44d36e98b36a7c01b7b4661055bfd4923cfe29e844` | — |
| Older rollback (history) | `~/.chatgpt-exporter-artifacts/rollback-2.35.2-3b38d30.user.js` | `2.35.2` | `11133adf16f9e52c932ccc34a43466b0c2ca5f06bf5fae4252c306c2021901d8` | — |

The rollback artifact is **upstream's own CI build**, extracted verbatim from
`e59449a:dist/chatgpt.user.js` — not a local rebuild — so rolling back lands
exactly on the released v2.36.2.

The review build is reproducible: a repeat `pnpm run build:review` from `8f1284a`
is byte-identical. The artifact is **not** rebuilt when only QA scripts or docs
change; its source commit is recorded above and is deliberately older than HEAD.

### Reproduce

```bash
git checkout 8f1284a
npm i -g --prefix /tmp/pnpm8 pnpm@8.14.1 && export PATH="/tmp/pnpm8/bin:$PATH"
pnpm install --frozen-lockfile
pnpm build && pnpm run build:review
```

`REVIEW_BUILD_SEQ` is the commit count and leads the prerelease so versions stay
monotonic. Note the count **fell** from 637 to 627 when the line was re-cut from
upstream instead of the private stack — that is fine, because the release portion
rose from 2.36.1 to 2.36.2, and Tampermonkey confirmed it by offering **Update**
rather than Downgrade.

## Install the review build

1. Tampermonkey → Dashboard → **disable any other ChatGPT Exporter**. The review
   build has its own `@name`, so it installs *alongside* rather than replacing;
   two enabled exporters both run. `manager-enable.mjs` does this and reads the
   result back.
2. Utilities → Import from file → `dist/chatgpt-exporter-review.user.js`.
3. Script **Settings** tab (Config mode: Advanced) → untick **Check for updates**.
   `@updateURL none` does not do this on its own — it leaves the box ticked and
   stores the literal string `none`.
4. **Reload** `https://chatgpt.com/`. A userscript is only re-evaluated on a page
   load.

Rollback: disable the review build, enable `ChatGPT Exporter 2.36.2`, reload.

## What this run established

Full evidence in `docs/verification-matrix.md` and
`docs/2.36.2-reconciliation.md`.

- **Placement:** upstream v2.36.2 fixed it independently (`11de3cd`). **6/6**
  placement cases pass on the candidate, which carries upstream's placement code
  unmodified. No account-row overlap anywhere. The private `navMount.ts`
  architecture, footer reservation, rail row and floating fallback are
  **superseded and dropped** — preserved on `f6fcd31` and `ceeaa55`.
- **React #418:** controlled cold loads, four each, same viewport and profile —
  no exporter **0/4**, official v2.36.2 **4/4**, candidate **4/4**; the launcher
  was present, correctly sized and clickable in **every** load of both exporter
  conditions. Console-only, no user-facing consequence, no difference between
  official and candidate. `shellSettle.ts` is **dropped**.
- **SPA navigation:** 6/6 steps pass, including real history back/forward.
- **PR #400:** verified live under a genuine 429 — the dialog shows
  `Error: Rate limited by the API · wait a moment and try again` and disables
  Export, instead of presenting `0 / 0` as a valid empty account.
- **Third-party interference:** `TeamHub Chat Exporter 1.0.5` in the same test
  profile matches only `*.teamhub.com/chat/*` and cannot run on chatgpt.com. It
  was disabled for the whole acceptance run regardless, and **restored** to its
  original enabled state afterwards.

## Blocked, not failed

**Single-conversation exports and the two-chat Export All ZIP were not verified.**
ChatGPT returned **429** for `/backend-api/conversations`,
`/backend-api/conversation/<id>` and `/backend-api/conversations/<id>` on its own
page requests, while 59 other backend calls in the same load returned 200. No
conversation body renders, so there is nothing for any exporter to read or
capture. One bounded Markdown attempt produced no download in 50 s; probing was
stopped rather than repeated.

Nothing in this reconciliation touches the export paths — the only product change
is `ExportDialog`'s error handling — so this is a ChatGPT-side blocker, and no
export pass is claimed.

## Build and test

```bash
export PATH="/tmp/pnpm8/bin:$PATH"   # pnpm 8.14.1, the declared version
pnpm install --frozen-lockfile
pnpm test    # 117 tests, 21 files, exit 0
pnpm lint    # clean, exit 0
pnpm build   # exit 0
```

`pre-push` runs `pnpm run test`. Hooks were not bypassed.

## Test browser

Dedicated profile `~/.chrome-chatgpt-exporter-test`, CDP 9333, Chrome
153.0.8010.53, real Tampermonkey 5.5.0, signed in. The owner's normal profile was
not touched.

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
| `cold-load-console.mjs` | cold-load console + launcher comparison (React #418) |
| `launcher-placement-check.mjs` | overlap, hit-test, popup geometry, list scroll |
| `spa-nav-check.mjs` | launcher survival across SPA and history navigation |
| `background-load-check.mjs` | hidden-tab load, then foreground |
| `goto-conversation.mjs`, `page-probe.mjs` | open and inspect one conversation |
| `api-health.mjs` | one bounded look at which backend endpoints are throttled |
| `export-all-probe.mjs` | the PR #400 acceptance check |
| `manager-export.mjs` | run one export in the manager browser and inspect it |
| `close-dialog.mjs` | leave the page clean between checks |

Five real faults in the placement checker were found and fixed this pass; they are
listed in `docs/2.36.2-reconciliation.md` so the corrected results can be trusted.

## Recommendation

**B → C.**

**Now: reduce the private repo to QA / reference.** After reconciliation the only
product difference from official upstream v2.36.2 is PR #400's Export All error
handling. Everything else this fork carried is either upstream's own code now, or
superseded by upstream's independent fix, or private test tooling that was never
meant to ship.

**After #400 merges: retire the product fork.** The delta becomes zero. What stays
worth keeping is the real userscript-manager test tier, the reproducible
review-build mechanism, and this evidence trail — none of which needs a product
fork to exist.

## Credit

Repo-local identity only: `sharmanhall <16804423+tyhallcsu@users.noreply.github.com>`.
pionxzh remains the author; `@namespace` and upstream attribution unchanged.
