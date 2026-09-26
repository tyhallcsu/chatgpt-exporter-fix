# Verification matrix — reconciled candidate vs upstream 2.36.1

**Date:** 2026-09-25
**Candidate:** `review/reconcile-upstream-2.36.1` @ `2f90610`, userscript version 2.36.1,
SHA-256 `35f21bc0e598c0eeeed5f2dc4442728bb2099371dde2b410f5437717915ff048`
**Upstream compared:** `2780b28` (v2.36.1 + ci build), SHA-256 `44ddb778e7997310d76efb000230ccb6a784c45070c28bc1fb5aaefd4190be40`
**Rollback artifact:** our checkpoint `3b38d30`, version 2.35.2,
SHA-256 `11133adf16f9e52c932ccc34a43466b0c2ca5f06bf5fae4252c306c2021901d8`

Evidence is separated by strength. **No test in this run used a real userscript
manager** — everything live used a `GM_*` injection harness in Playwright-driven
Google Chrome, which is not the same thing and is labelled accordingly.

| Tier | Meaning |
|---|---|
| **U** | unit / fixture (vitest + happy-dom, no browser) |
| **L** | live browser, authenticated ChatGPT, script injected by harness |
| **M** | actual userscript manager (Tampermonkey) — **none performed** |

Live conditions: signed-in account, ChatGPT appearance **System**, OS **dark**,
Chrome 153, viewport 1440×950, `colorScheme: dark`.

---

## Head-to-head, identical page and session

| Check | Upstream 2.36.1 | Candidate | Tier |
|---|---|---|---|
| Launcher rendered | **No — 0×0, `getClientRects()` 0** | **Yes — 310×46 @ (16,887)** | L |
| Mount target | hidden `nav[aria-label="Show sidebar"]` (`display:none`) | visible sidebar panel | L |
| Launcher count / visible | 1 / **0** | 1 / **1** | L |
| Exporter console errors | **React #418** | **none** | L |
| Menu card / text | `rgb(42,42,42)` / `rgb(237,237,237)` | same | L |
| Menu contrast | 12.3:1 | **12.3:1** | L |
| Export All dialog colours | — | `rgb(42,42,42)` / `rgb(237,237,237)` | L |

## Theme matrix

| Scenario | Upstream | Candidate | Tier | Note |
|---|---|---|---|---|
| Live: System + OS dark (signed in) | dark ✓ 12.3:1 | dark ✓ 12.3:1 | L | ChatGPT writes `<html data-theme="dark">` |
| explicit Dark, OS light | dark ✓ | dark ✓ | U | |
| explicit Light, OS dark | light ✓ | light ✓ | U | |
| legacy `.dark` class | dark ✓ | dark ✓ | U | |
| no attribute, OS dark | light ✗ | light ✗ | U | **not reachable signed in** — recorded, not treated as a defect |
| `data-theme="system"`, OS dark | light ✗ | light ✗ | U | same; ChatGPT resolves before writing |
| Theme change without reload | — | not tested | — | **gap** |
| Theme change with menu open | — | not tested | — | **gap** |

The candidate deliberately keeps upstream's theme implementation, so both
columns are identical by construction outside the live row.

## Exports (candidate, live)

| Export | Result | Tier |
|---|---|---|
| Markdown | 35,766 B | L |
| HTML | 58,720 B | L |
| JSON (OpenAI format) | 205,088 B | L |
| Copy Text | 34,013 chars, contains `You:` / `ChatGPT:` | L |
| Screenshot (short thread) | 1536×12,874 PNG, 2,627,396 B, dark themed, legible at 5/55/93 % height | L |
| Scroll position restored | yes | L |
| Exporter DOM left behind | none (`[data-chatgpt-exporter-screenshot-root]` = 0) | L |
| Timestamps rendered | 6 across 3 turns, upstream's message-id mapping | L |
| Menu item semantics | 7 items, all `role="button"` (upstream `061d81f`) | L |
| **Export All ZIP** | **UNVERIFIED** — see below | — |

Markdown/HTML/Copy Text are all substantially larger than the same conversation
exported by our 2.35.2 checkpoint (16,445 / 41,371 / 15,685), consistent with
upstream's 2.36.1 content fixes being active.

### Export All — unverified, not attributable to this change

The dialog opens and themes correctly, and the project list loads (177 entries
from `/backend-api/gizmos/snorlax/sidebar`). The **conversation list did not
populate** in this session (0 rows); `/backend-api/conversations` was never
issued and no rate-limit notice was shown.

`src/ui/ExportDialog.tsx` is byte-identical (`194f2f4db9b2`) across upstream,
our checkpoint and the candidate, and the candidate's `src/api.ts` is exactly
upstream's (`6b0e4983c8fb`). The same dialog populated 101 rows and produced a
valid 2-file ZIP in the previous session, so this is a session/environment
condition, not a reconciliation regression. It remains **unverified in this run**.

## Not covered in this run

- Actual Tampermonkey install (tier M) — none.
- Collapsed sidebar and mobile drawer on the live variant (fixture-only, tier U).
- SPA navigation and back/forward on the candidate (verified on the checkpoint
  in the previous session, not re-run here).
- Theme switching at runtime.
- Long-thread screenshot. A ~48,900 px thread crashed the renderer during PNG
  encode in the previous session. That was **not** re-tested here and is **not**
  claimed fixed or pre-existing; it is tracked as an open size-limit question.
  Upstream 2.36.1 rewrote this path substantially (history-spinner waiting,
  reversed-scroller handling, image embedding), so the previous observation does
  not transfer to the candidate either way.
- Keyboard focus: menu items expose `role="button"` but are not tabbable
  (`tabIndex` unset). Upstream's behaviour, untouched here.

## Repository checks (candidate)

| Check | Result |
|---|---|
| `pnpm test` (pnpm 8.14.1) | **119 passed**, 20 files |
| `pnpm lint` | clean |
| `pnpm build` | ok, 832.52 kB |
| Hooks | pre-commit and pre-push ran, not bypassed |
