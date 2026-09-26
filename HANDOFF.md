# HANDOFF — ChatGPT Exporter reconciliation

**Updated:** 2026-09-25
**Phase:** reconciliation complete, **awaiting owner review**
**Next action:** owner installs the review build and checks the menu is readable
in dark mode (see *Install the review build*).

## Posture (unchanged this run)

- Repository is **private**. Not changed.
- **No pull request opened**, draft or otherwise.
- **Nothing published** — no release, no GreasyFork update.
- `master` still carries the previously merged working implementation. The
  reconciliation lives on a review branch only.
- Upstream PR and public visibility remain gated on explicit approval.

## Refs

| | Ref |
|---|---|
| Comparison issue | https://github.com/tyhallcsu/chatgpt-exporter-fix/issues/5 |
| Our checkpoint (rollback) | `3b38d30` — `checkpoint/2026-09-25-local-repair`, also `master` |
| Merge base | `816d9fe` |
| Upstream v2.36.1 | `1d5d118` · upstream master `2780b28` |
| **Candidate (review)** | **`review/reconcile-upstream-2.36.1`** — worktree `/Users/bradbanks/Documents/GitHub/chatgpt-exporter-review` |

## Recommendation

**Use upstream 2.36.1 plus three retained guards.**

Upstream fixes everything our repair fixed and does timestamps, screenshots and
export content better. But measured live on the owner's authenticated ChatGPT
(appearance System, OS dark), upstream 2.36.1 has two reproduced defects:

1. its launcher mounts into a `display:none` navigation rail and is invisible;
2. it throws React #418 on every load.

The candidate is upstream plus: a rendered-target filter, a visible-sidebar-panel
strategy, a terminal floating launcher, a hydration settle gate, and 9 regression
tests. Everything else is upstream's, unmodified.

**Dropped from our checkpoint:** the luminance theme detector. ChatGPT resolves
System to a concrete `data-theme` once signed in, so upstream's CSS matches and
measures 12.3:1 live. Our stylesheet was in fact worse than upstream's on an
explicit-theme-opposite-to-OS fixture (1.4:1 vs 12.1:1).

## Install the review build

Artifacts, both version-stamped and hashed:

| | Path | Version | SHA-256 |
|---|---|---|---|
| **Review build** | `/Users/bradbanks/Documents/GitHub/chatgpt-exporter-review/dist/chatgpt.user.js` | 2.36.1 | `35f21bc0e598c0eeeed5f2dc4442728bb2099371dde2b410f5437717915ff048` |
| **Rollback** | `/Users/bradbanks/Documents/GitHub/chatgpt-exporter/dist/chatgpt.user.js` (master = `3b38d30`) | 2.35.2 | `11133adf16f9e52c932ccc34a43466b0c2ca5f06bf5fae4252c306c2021901d8` |

Neither carries `@updateURL`/`@downloadURL`, so neither self-updates. The
GreasyFork copy does — if it is installed, it will keep updating itself and you
would be running **two** exporters. Disable the other copy first.

1. Tampermonkey → Dashboard → disable/delete any existing ChatGPT Exporter.
2. Utilities → Import from file → the review build above.
3. Reload `https://chatgpt.com/`.

Rollback: disable the review build, re-enable the previous one.

## What to check

Focused on the original complaint — the unreadable menu.

1. Menu opens from the **bottom of the sidebar** and the labels are **readable**
   (light text on a dark card), not white-on-white.
2. Collapse the sidebar — the launcher should still be reachable and readable.
3. Console: no `React error #418` and no `[Exporter]` errors.
4. Markdown / HTML / JSON / Copy Text on a small conversation.
5. Screenshot on a **short** conversation.
6. Export All: dialog opens and is readable. **Its conversation list did not
   populate during testing** — see the verification matrix; unverified, and not
   attributable to this change.

## Known gaps

- No actual Tampermonkey test was run; all live evidence used a `GM_*` injection
  harness.
- Export All end-to-end ZIP unverified this session.
- Long-thread PNG: a ~48,900 px thread crashed the renderer previously. Not
  re-tested, **not** claimed fixed. Upstream rewrote this path, so the old
  observation does not transfer either way.
- Runtime theme switching untested.
- Menu items have `role="button"` but are not tabbable (upstream behaviour).

## Build

```bash
npm i -g --prefix /tmp/pnpm8 pnpm@8.14.1   # corepack unavailable on this machine
export PATH="/tmp/pnpm8/bin:$PATH"
pnpm install --frozen-lockfile
pnpm test   # 119
pnpm lint
pnpm build  # dist/ is tracked
```

`pre-push` runs `pnpm run test` and fails unless pnpm 8.14.1 is first on `PATH`.
Hooks were not bypassed.

## Credit

Repo-local git identity only: `sharmanhall <16804423+tyhallcsu@users.noreply.github.com>`
— the verified GitHub noreply address already used by the merged squash commits.
Global identity untouched. pionxzh remains the project author; `@namespace`
and upstream attribution are unchanged. Any future upstream PR must describe
only the two guards, never the fixes upstream already shipped.
