# HANDOFF — ChatGPT Exporter reconciliation

**Updated:** 2026-09-25
**Phase:** reconciliation complete; defects found under a real userscript manager
fixed; **awaiting owner review**
**Next action:** owner installs the review build and confirms the Export row sits
in its own row above the account row, in both the expanded and collapsed sidebar.

## Posture (unchanged)

- Repository **private**. Not changed.
- **No pull request opened**, draft or otherwise. 0 open PRs.
- **Nothing published** — no release, no tag, no GreasyFork update. The `Release`
  workflow is `skipped` on every review push.
- `master` is **not** ours to move; it advanced only by PR #4 (`e2b4887`, README
  and a banner image, merged by another session before this run started). No
  `src/` or `dist/` change on master.
- Upstream PR and public visibility remain gated on explicit approval.

## Refs

| | Ref |
|---|---|
| Comparison issue | https://github.com/tyhallcsu/chatgpt-exporter-fix/issues/5 |
| Review branch | `review/reconcile-upstream-2.36.1` |
| Rollback checkpoint | `3b38d30` — `checkpoint/2026-09-25-local-repair` |
| Upstream v2.36.1 | `1d5d118` · upstream master `2780b28` |
| Worktree | `/Users/bradbanks/Documents/GitHub/chatgpt-exporter-review` |

## Install the review build

| | Path | Version | SHA-256 |
|---|---|---|---|
| **Review build** | `dist/chatgpt-exporter-review.user.js` | `2.36.1-review.637.36db050` | `4e35d1b013f1726e7164cf44d36e98b36a7c01b7b4661055bfd4923cfe29e844` |
| Plain build, same source | `dist/chatgpt.user.js` | 2.36.1 | `a9bdd05fc5561db9b5b14beb8630bed166726afe324a2d3da33c2b57bde45d00` |
| **Rollback** | `/Users/bradbanks/Documents/GitHub/chatgpt-exporter/dist/chatgpt.user.js` | 2.35.2 | `11133adf16f9e52c932ccc34a43466b0c2ca5f06bf5fae4252c306c2021901d8` |

Every build is also copied to `~/.chatgpt-exporter-artifacts/`, outside any build
output directory, so a rebuild cannot destroy a known-good copy.

The review build is deliberately easy to tell apart: `@name` is **ChatGPT Exporter
(review build)**, the version carries the source commit, and the description opens
with `[REVIEW BUILD … — unreleased, for local review only]`. Authorship, namespace
and licence stay pionxzh's.

### Steps

1. Tampermonkey → Dashboard → **disable any other ChatGPT Exporter**, including a
   GreasyFork copy. The review build has a different `@name`, so the manager
   installs it *alongside* rather than replacing — verified, it offers *Install*,
   not *Update*. Two enabled exporters both run.
2. Utilities → Import from file → the review build above.
3. Open the script's **Settings** tab (Config mode: Advanced) and untick
   **Check for updates**. `@updateURL none` does *not* do this on its own —
   verified: the box stays ticked and the URL becomes the literal string `none`.
4. **Reload** `https://chatgpt.com/`. A userscript is only re-evaluated on a page
   load; an already-open tab keeps running the previous build.

Rollback: disable the review build, re-enable the previous one, reload.

### Reproduce the artifact

```bash
git checkout 36db050
pnpm install --frozen-lockfile          # pnpm 8.14.1, the declared version
pnpm build && pnpm run build:review
```

`REVIEW_BUILD_ID` names the source commit and `REVIEW_BUILD_SEQ` is the commit
count, which keeps the version monotonic — a bare SHA is not, and the manager
offered a newer build as a *Downgrade*. Two consecutive review builds from the
same commit are byte-identical.

## What to check

1. **The Export row has its own row** at the bottom of the sidebar, above the
   account row — not on top of it. This was the reported defect.
2. Collapse the sidebar: one Export icon in its own rail slot, not stacked on the
   account control, and clicking it opens the menu rather than expanding the
   sidebar.
3. The conversation list still scrolls to its last item.
4. Console: no `React error #418`, no `[Exporter]` errors.
5. Dark menu is readable; switch the OS appearance with the menu open and it
   follows.
6. Export All: the dialog opens and, **while the account is being rate limited**,
   shows `Error: ChatGPT is rate limiting the conversation list (HTTP 429)…`
   instead of an empty `0 / 0` list.

## Known gaps

- **Export All ZIP is unverified — blocked, not failed.** `GET
  /backend-api/conversations` returned HTTP 429 with no `Retry-After` for the whole
  session, on the exporter's own authenticated request and on ChatGPT's own sidebar
  request in the same page load. `/backend-api/conversation/<id>` is throttled too,
  so Markdown / HTML / JSON / Copy Text could not be exercised either. Probing was
  stopped rather than repeated. Both native and exporter requests being throttled
  in this context shows both were affected; it does not by itself establish the
  scope or the cause of the limit.
- Signed **out**, `data-theme` is absent while the page renders dark, so the menu
  renders light on a dark page. Reachable on `/share/*` too. Not fixed: signed in —
  the owner's actual usage — ChatGPT always wrote `data-theme`.
- Escape closes the menu but returns focus to `<body>` rather than the trigger.
- Tab from the launcher does not walk into the menu items.
- Three image tiles at the top of the screenshot export rendered as spinners, so
  those attachments were not resolved at capture time.
- Upstream 2.36.1 was not itself re-tested this run; its React #418 report comes
  from the earlier session.

## Build

```bash
npm i -g --prefix /tmp/pnpm8 pnpm@8.14.1
export PATH="/tmp/pnpm8/bin:$PATH"
pnpm install --frozen-lockfile
pnpm test    # 134, exit 0
pnpm lint    # clean, exit 0
pnpm build && pnpm run build:review
```

`pre-push` runs `pnpm run test`. Hooks were not bypassed.

## Test browser

Dedicated profile `~/.chrome-chatgpt-exporter-test`, CDP on 9333, real
Tampermonkey 5.5.0, signed in. Chrome 153 ignores `--load-extension`, so the
profile carries the extension; see the `browser-test` skill. The owner's normal
profile and the APBPA profile were not touched, and no browser state is in Git.

Harness, all in `.claude/skills/browser-test/scripts/`:

| Script | Purpose |
|---|---|
| `start-manager-chrome.sh` | start/reuse the manager browser |
| `manager.mjs` | bounded CDP client with trusted-input clicks |
| `manager-state.mjs` | what is installed and enabled |
| `manager-script-settings.mjs` | a script's *effective* settings |
| `install-userscript.mjs` | install through the manager's own prompt |
| `background-load-check.mjs` | hidden-tab load, then foreground |
| `launcher-placement-check.mjs` | overlap, hit-test and popup geometry |

## Credit

Repo-local identity only: `sharmanhall <16804423+tyhallcsu@users.noreply.github.com>`.
Global identity untouched. pionxzh remains the author; `@namespace` and upstream
attribution unchanged. Any future upstream PR must describe only our guards, never
the fixes upstream already shipped.
