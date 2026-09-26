# Upstream vs this fork — where the divergence went

**Updated:** 2026-09-26
**Comparison issue:** https://github.com/tyhallcsu/chatgpt-exporter-fix/issues/5

This replaces the 2.36.1-era comparison, which is preserved on
`review/reconcile-upstream-2.36.1` @ `ceeaa55`. Several of its conclusions no
longer hold and are corrected below.

---

## Headline

**Upstream v2.36.2 is the product. The fork's remaining product delta is PR #400,
and that delta is meant to disappear.**

| | Ref |
|---|---|
| Upstream release | `userscript-v2.36.2` = `2e8b65b` |
| Upstream master | `e59449a` (= the release + `chore: ci build`) |
| Private branch | `review/reconcile-upstream-2.36.2` |
| Public PR | https://github.com/pionxzh/chatgpt-exporter/pull/400 @ `3963988` |
| Superseded placement work | `wip/launcher-placement-superseded` @ `f6fcd31` — kept, not deleted |
| Previous private line | `review/reconcile-upstream-2.36.1` @ `ceeaa55` — kept, not rewritten |

---

## The placement story, in order

1. ChatGPT's 2026 navigation redesign broke the exporter's launcher: it mounted
   into a hidden shell, or landed on top of the account row.
2. This fork repaired it privately — `navMount.ts`, a real footer placement, a
   footer-height reservation, a collapsed-rail row, `pointerEvents: auto`, and a
   floating fallback. That work was correct and was verified against a real
   Tampermonkey install.
3. **Upstream then fixed the same problem independently** in `11de3cd`,
   *"keep the exporter menu visible in the collapsible sidebar layout"*, released
   as v2.36.2. It mounts a menu in the expanded sidebar *and* in the rail and
   lets ChatGPT's own `inert`/`display:none` decide which one is visible.
4. Measured on v2.36.2 this run: **6/6 placement cases pass**, no overlap with
   the account row anywhere, one rendered launcher in every layout.

**So the private placement work is superseded, not lost.** It solved a real
defect before upstream did; upstream's own solution now covers it, and carrying a
parallel architecture would be permanent maintenance for no user-visible gain.
`f6fcd31` and `ceeaa55` remain as the record of it.

The one behaviour upstream does not have is a floating launcher at narrow width
with the drawer **closed**. ChatGPT offers no sidebar control of its own in that
state either, so this is classified as an **optional fork feature, not a defect**,
and dropped.

---

## Corrections to the 2.36.1 comparison

| Old claim | Now |
|---|---|
| "Upstream's launcher mounts into a `display:none` container and is invisible." | True of **2.36.1**. Not true of 2.36.2: upstream mounts into both shells deliberately, and exactly one is rendered. |
| "Upstream still throws React #418; our checkpoint does not." | Does not hold. Measured over four cold loads each: no exporter **0/4**, official v2.36.2 **4/4**, reconciled candidate **4/4**. The warning is caused by *any* exporter mounting during hydration, and the launcher survives it every time. It is console-only. |
| "Our extra theme machinery is not needed; upstream is right." | Still true, and upstream went further: `188ba3b` drives checkbox and toggle accents from `var(--color-chart-blue)`, ChatGPT's own Appearance accent, which is better than the fork's `:is(.dark,[data-theme="dark"])` pair. |

---

## What upstream does not have yet

One thing: **conversation-list error reporting in Export All**, offered publicly
as PR #400.

Without it, a throttled list renders as `0 / 0` — indistinguishable from an
account with no conversations. With it:

- `fetchAllConversations` errors reach the dialog instead of being discarded;
- a 429 cannot masquerade as a valid empty account;
- whatever the load did collect stays visible while the failure is shown;
- a stale error is cleared when a new load begins, so Export is not left
  permanently disabled;
- a superseded load cannot contaminate the current scope;
- a server `Retry-After` is quoted as the API's answer; the internal fallback is
  not;
- `RequestQueue`'s existing retry/backoff from #367 is not duplicated.

Verified live this run under a genuine 429: the dialog shows
`Error: Rate limited by the API · wait a moment and try again`, Export is
disabled, and the `0 / 0` counter is no longer alone.

**When #400 merges, this fork's product delta is zero.**

---

## Fork posture

- Repository **private**. Unchanged.
- **No release, no tag, no GreasyFork publication.** Unchanged.
- Private `master` **not merged** and not moved by this work.
- The only public contribution is PR #400, which contains no private QA
  scaffolding, no local paths and no browser state.
- The private repo keeps what upstream has no reason to carry: the real
  userscript-manager test tier, the reproducible review-build mechanism, and this
  evidence trail.
