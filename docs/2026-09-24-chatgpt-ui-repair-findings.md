# ChatGPT Exporter — 2026 navigation redesign repair

**Date:** 2026-09-24
**Baseline:** upstream `pionxzh/chatgpt-exporter` @ `816d9fe` (v2.35.2 + 3 commits)
**Method:** Playwright driving real Google Chrome 153 against an authenticated
`https://chatgpt.com` session. Every claim below was measured in the live DOM,
not inferred from source.

---

## 1. Summary

ChatGPT shipped a navigation redesign that **removed `data-testid` from the
entire application shell** and replaced the conversation DOM hooks with
namespaced `data-*` attributes. The exporter keyed almost all of its DOM
integration on those retired attributes.

The user-visible symptom was reported as "no Export button", but the actual
failure was worse and had three independent parts:

| # | Symptom | Cause |
|---|---|---|
| 1 | Export UI appears as an unlabeled icon crammed into the new icon rail | Primary and secondary mount targets dead; only the third fallback matched, and it now lives in the rail |
| 2 | **Every export format refuses to run** | `checkIfConversationStarted()` keyed on `[data-testid^="conversation-turn-"]`, which no longer exists |
| 3 | React error #418 in the console, menu destroyed and re-created | The menu was injected into the shell while React was still hydrating it |

Part 2 is the important one: even when the button was found and clicked, every
single export path bailed out with *"Please start a conversation first"*.

---

## 2. Old selector census (measured)

Counts taken on `https://chatgpt.com/` (home) and on `/c/<id>` (a real
conversation), desktop viewport 1440×950, authenticated.

| Selector | Home | Conversation | Verdict |
|---|---|---|---|
| `[data-testid="accounts-profile-button"]` | **0** | **0** | **Gone** |
| `[data-app-action-sidebar-scroll]` | 1 | 1 | Survives |
| `[data-sidebar-destination="builtin:automations"]` | 1 | 1 | Survives, but **moved into the icon rail** |
| `[data-testid^="conversation-turn-"]` | 0 | **0** | **Gone** |
| `[data-turn-id-container][data-is-intersecting]` | 0 | **0** | **Gone** |
| `[data-turn-id-container]` | 0 | **0** | **Gone** |
| `[data-scroll-root]` | 0 | **0** | **Gone** |
| `#thread` | 0 | **0** | **Gone** |
| `[data-message-id]` | 0 | **0** | **Gone** |
| `#prompt-textarea` | 0 | 0 | Gone |

**`data-testid` is effectively extinct.** A full page census found exactly one
`data-testid` on the home screen (`app-shell-header-context-menu-surface`) and
three on a conversation page (`chatgpt-citation`,
`chatgpt-library-file-citation`, plus the header one). None are useful for
mounting or turn detection.

There are also **zero `<a href>` elements** on the page — sidebar rows are
divs keyed by `data-sidebar-chatgpt-conversation-key="chatgpt:conversation:<uuid>"`.

---

## 3. The current navigation shell

```
<aside data-app-shell-left-panel-appearance="default">        340px
├── <nav data-app-navigation-rail="true" aria-label="App navigation">   52px
│   ├── <div aria-hidden="true">                              0×0
│   ├── <div>  destinations   [data-sidebar-destination="builtin:home|automations|library|images|customize"]
│   └── <div>  trailing cluster  ← Help menu + "Open profile menu"
└── <nav role="navigation" aria-label="Home">                 288px
    ├── <div> panel header                                    288×92
    └── <div data-app-action-sidebar-scroll>                  288×858   ← conversation list
```

Key facts:

- The account control is now `button[aria-haspopup="menu"][aria-label="Open profile menu"]`
  and it **moved out of the sidebar panel into the 52px rail**. It has no
  `data-testid`.
- `[data-app-action-sidebar-scroll]` is now the **last child** of the panel.
  Previously the account footer was its `nextElementSibling`; that sibling is
  now `null`, which is why the exporter's second fallback silently failed.
- **Collapsing the sidebar removes `<nav aria-label="Home">` from the DOM
  entirely** — `[data-app-action-sidebar-scroll]` disappears with it. Only the
  52px rail survives. Expanded and collapsed are genuinely different DOM, not
  a CSS width change.
- On narrow viewports ChatGPT renders **two** `[data-app-action-sidebar-scroll]`
  elements — the hidden desktop panel (0×0) and the open mobile drawer.

### Why the old fallback chain produced a broken UI

`getNavMenuMounts()` tried, in order: profile button → sidebar-scroll footer →
Automations item.

1. Profile button: **0 matches**.
2. Sidebar-scroll footer: matched the scroll element, but its
   `nextElementSibling` is now `null`, so the `button[aria-haspopup="menu"]`
   filter removed it.
3. Automations: matched — but that element is now a 36×36 icon button **inside
   the 52px rail**. The menu was inserted there, and because `useCollapsedSidebar`
   measures the parent (52px < 96px), it rendered in collapsed mode: a 32×32
   unlabeled icon at the *top* of the rail, looking like a stray "log out"
   button.

---

## 4. The current conversation DOM

| Purpose | Retired | Current |
|---|---|---|
| A turn (one user message + its reply) | `[data-testid^="conversation-turn-N"]`, `[data-turn-id-container]` | `[data-turn-key="<uuid>"]` |
| Thread container | `#thread` | `[data-thread-find-target="conversation"]` (also `[data-chatgpt-conversation-selection-target]`) |
| Thread scroll viewport | `[data-scroll-root]` | `[data-app-action-timeline-scroll]` |
| Message id | `[data-message-id]` | `[data-chatgpt-selection-message-id]` |
| Assistant reply marker | — | `[data-conversation-role="assistant"]` |
| User message marker | — | `[data-user-message-bubble]` |

A measured conversation page: `data-turn-key` × 2, each containing one
`[data-user-message-bubble]` and one `[data-conversation-role="assistant"]`.
The `.markdown` class is also gone (0 matches).

No `data-is-intersecting` virtualization placeholders were observed on the
current shell; turns render directly. A 26,624 px-tall thread had all of its
content in the DOM at once.

---

## 5. API layer — unchanged, no fix needed

Measured live, all returning **200**:

- `GET /api/auth/session` → `accessToken` present
- `GET /backend-api/conversation/<id>` → `{ title, create_time, mapping, current_node, … }`, 23 mapping nodes
- `GET /backend-api/conversations?offset&limit`
- `GET /backend-api/gizmos/snorlax/sidebar` → projects (176 in the test account)
- `GET /backend-api/gizmos/<gizmo>/conversations`
- `POST /backend-api/conversations/batch`

**Conclusion: the exporter's API/data layer required no changes.** Markdown,
HTML, JSON and Text exports are all built from the API, not the DOM — which is
why fixing the DOM gate alone restored them.

One caveat: `/backend-api/conversations` rate-limits (HTTP 429) under repeated
calls. The exporter already detects this and surfaces "⏳ Rate limited — waiting Ns",
which is correct behaviour.

---

## 6. Reproduction (v2.35.2, before the fix)

Running the **built production userscript** (not hand-pasted fragments) against
the live site under a Tampermonkey-equivalent harness (`GM_*` shim, `unsafeWindow`,
`@require` libraries loaded locally):

```
[Exporter] Loaded                                     +312ms
[Exporter] Injecting nav  → nav[data-app-navigation-rail]   +317ms
React error #418 (hydration mismatch)                 +936ms
[Exporter] Injecting nav  (again — first mount destroyed)  +1167ms
```

Measured state: 1 trigger, 32×32 at `(10, 60)`, `data-ce-sidebar-collapsed`
set, inside the icon rail. `checkIfConversationStarted()` → **false** on a
fully loaded conversation.

This is failure mode **C + D** from the brief (UI visible but misplaced *and*
exports fail), not mode A or B.

**React #418 was proven to be the exporter's fault** by an A/B run: with the
userscript disabled, the same page produced zero console errors.

---

## 7. The fix

Discovery, insertion and lifecycle are now separate concerns.

### `src/utils/navMount.ts` — mount discovery

Ordered strategies, first match wins, so only one menu is ever mounted:

| Order | Strategy | Anchor | Why it is stable | Fallback if it breaks |
|---|---|---|---|---|
| 1 | `legacy-profile-button` | `[data-testid="accounts-profile-button"]` | Only for the pre-redesign shell still served on `chat.openai.com` | strategies 2–5 |
| 2 | `legacy-sidebar-footer` | `[data-app-action-sidebar-scroll]` + `nextElementSibling` containing a menu button | Old footer layout | strategies 3–5 |
| 3 | `sidebar-panel` | `[data-app-action-sidebar-scroll]` → parent panel, appended last | An *app-action* attribute (command/keyboard surface), not a styling hook — it survived the redesign that deleted every `data-testid` around it | strategies 4–5 |
| 4 | `nav-rail` | `[data-app-navigation-rail]` → trailing cluster; falls back to a narrow `<nav>` landmark | The primary navigation region; also reachable by role | strategy 5 |
| 5 | `floating` | Own container on `document.body` | Owned outright by the exporter; touches no app DOM | — |

Additional rule: `preferRendered()` drops candidates with no client rects, so
the hidden desktop panel on mobile does not receive a second, invisible menu.
When nothing reports a size (first layout, or a test document with no layout
engine) every candidate is kept.

### `src/utils/threadDom.ts` — conversation DOM

Selector lists ordered current-first, retired-second. `queryFirstMatching()`
returns matches for the **first list entry that matches anything**, rather than
a comma-joined union — a page mid-rollout exposing both generations would
otherwise count every turn twice.

### `src/main.tsx` — lifecycle

- **`whenShellSettled()`** delays the first injection until the DOM stops
  mutating for 400 ms (hard cap 4 s) after `load`. This removes React #418:
  `load` alone is not late enough because React Router keeps hydrating route
  chunks after it.
- A **`MutationObserver`** on `document.body` drives remounting, coalesced into
  one `requestAnimationFrame` and rate-limited to 150 ms.
- `sentinel` still fires on the three known anchors for an immediate first mount.
- The polling interval is now a **5 s failsafe** (was the 1 s primary mechanism).

---

## 8. Verification

### Live UI

| Scenario | Result |
|---|---|
| Sidebar expanded | `sidebar-panel`, 258×46 labeled row at panel footer, 1 trigger |
| Sidebar collapsed | `nav-rail`, 32×32 icon in the trailing cluster above Help/profile, 1 trigger |
| Collapse ⇄ expand ×3 | 1 trigger throughout, no duplicates |
| SPA nav home → `/c/<id>` | 1 trigger, `sidebar-panel` |
| Browser back / forward | 1 trigger, `sidebar-panel`, 0 errors |
| Mobile 430 px, drawer open | 1 mount, 1 visible trigger (was 2 before `preferRendered`) |
| Console errors | **0** (React #418 eliminated) |

### Export matrix (real downloads from a live conversation)

| Format | Result |
|---|---|
| Markdown | 16,445 B — 2 `#### You:` / 2 `#### ChatGPT:` blocks |
| HTML | 41,371 B — well-formed, closes `</html>` |
| JSON | 129,153 B |
| Copy Text | 15,685 chars to clipboard, contains `You:` / `ChatGPT:` |
| Screenshot (short) | 1,886,636 B, 1536×9232, full conversation |
| Screenshot (long) | 5,846,796 B, **1536×52,564** via the tiled encoder — sampled at 8 %, 50 % and 92 % height: continuous content, code blocks and thinking blocks intact, no blank gaps, no duplicated turns |
| Export All | Dialog opens, 176 projects loaded, 101 conversation rows, selection works (2 checked), Export enabled and started (`chatgpt-export-markdown.zip`) |

### Known limitation (pre-existing, not a regression)

A ~48,932 px-tall thread (≈98,000 px at 2× scale, ~150 M pixels) crashed the
browser renderer during PNG encoding. This is an upstream memory limit in the
tiled screenshot path, not something this change introduced — before the fix
that conversation could not be exported at all, because the gate rejected it
immediately. Threads up to ~52,000 output pixels encode successfully.

---

## 8b. Follow-up: dark mode (reported 2026-09-25)

**Symptom:** with ChatGPT in dark mode the export menu rendered as a white
card with near-invisible text — measured contrast **1.2:1**.

**Cause:** the same redesign, one layer down. Every themed rule in the
exporter hung off the `.dark` class ChatGPT used to put on `<html>`. Measured
on the live site, in both schemes:

| Signal | Light | Dark |
|---|---|---|
| `html.classList.contains('dark')` | `false` | **`false`** |
| `html` class list | 23 hashed atomic names (`xsw4dja`, `x108lcm5`, …) | same |
| inline `color-scheme` | `""` | `""` |
| computed `color-scheme` | `light dark` | `light dark` |
| `[data-theme]` count (logged out) | 0 | 0 |
| painted `body` background | `rgb(252,252,252)` | `rgb(0,0,0)` |

`.dark` is gone — ChatGPT ships hashed atomic CSS and drives its theme from
`prefers-color-scheme`, adding an explicit `data-theme` only when the user
overrides the system setting. With nothing matching `.dark`, the dark
variable block never applied, so `--ce-menu-primary` stayed `#ffffff` while
`--ce-text-primary` resolved through ChatGPT's own `--text-primary` to a
*light* colour. White card, light text.

This also silently broke two non-visual paths: `getColorScheme()` read an
inline `color-scheme` that is now empty (so HTML exports carried the wrong
theme), and the screenshot exporter picked its background from the same
missing `.dark` class.

**Fix — `src/utils/theme.ts`:** resolve the scheme from several signals,
most direct first, and stamp the result as `data-ce-theme` on `<html>` for
the stylesheets to key off:

1. explicit `data-theme` / `data-color-scheme` / `data-mode` on `<html>` or
   `<body>` (ignoring `system`/`auto`), or the retired `.dark` / `.light` class;
2. an inline `color-scheme` naming exactly one scheme — `light dark` names
   neither, so it correctly falls through;
3. **the relative luminance of the background ChatGPT actually painted**,
   walking past transparent surfaces. This is true by construction and needs
   no knowledge of the attribute names;
4. the OS preference, for a document with nothing painted yet.

A `MutationObserver` limited to attribute changes on `<html>`/`<body>` plus a
`matchMedia` listener keeps it current when the user toggles appearance or the
OS flips at sunset — no subtree observation, so it costs nothing during
streaming.

All 27 `.dark` selectors across the four stylesheets now key off
`[data-ce-theme="dark"]`. The variable block is additionally duplicated under
`@media (prefers-color-scheme: dark)`, guarded by
`html:not([data-ce-theme="light"])`, so dark users get dark colours even
before the script runs — and an explicit light theme under a dark OS is not
overridden.

**Verified** with the built userscript against a fixture reproducing the
current shell (black body, no `.dark` class anywhere):

| | Light | Dark |
|---|---|---|
| `data-ce-theme` | `light` | `dark` |
| menu card | `rgb(255,255,255)` | `rgb(42,42,42)` |
| menu text | `rgb(13,13,13)` | `rgb(236,236,236)` |
| contrast | ~19:1 | **12.1:1** (was 1.2:1) |
| dialog bg / text | — | `rgb(42,42,42)` / `rgb(236,236,236)` |

---

## 9. Files changed

| File | Change |
|---|---|
| `src/utils/navMount.ts` | **New.** Layered mount discovery + floating fallback |
| `src/utils/threadDom.ts` | **New.** Conversation DOM selectors with current/retired ordering |
| `src/utils/theme.ts` | **New.** Colour-scheme resolution and the `data-ce-theme` stamp |
| `src/main.tsx` | Hydration-safe gate, MutationObserver lifecycle, uses the new modules |
| `src/page.ts` | `checkIfConversationStarted()` → `hasRenderedConversation()` |
| `src/exporter/image.ts` | Screenshot uses the new turn/thread/scroll-root helpers |
| `src/style.css`, `src/ui/Dialog.css`, `src/ui/CheckBox.css`, `src/styles/missing-tailwind.css` | Per-mount styling (`data-ce-mount`), floating launcher, and 27 `.dark` selectors rekeyed to `[data-ce-theme="dark"]` |
| `src/utils/utils.ts` | `getColorScheme()` delegates to the detector |
| `tests/nav-mount.test.ts` | **New.** 15 tests over 5 structural fixtures |
| `tests/thread-dom.test.ts` | **New.** 9 tests incl. mixed-generation de-duplication |
| `tests/theme.test.ts` | **New.** 14 tests over every detection signal |
| `package.json`, `pnpm-lock.yaml` | `happy-dom` devDependency for DOM tests |
| `dist/chatgpt.user.js` | Rebuilt (`dist/` is tracked upstream) |

`pnpm test` 121 passed · `pnpm lint` clean · `pnpm build` OK.

---

## 10. What still depends on unstable ChatGPT internals

Ranked by risk:

1. **`[data-app-action-sidebar-scroll]`** — the expanded-sidebar mount. If
   renamed, discovery falls through to the rail; the menu stays usable but
   moves to the icon rail.
2. **`[data-turn-key]`** — conversation detection. If renamed, exports refuse
   to run again. This is the single highest-value selector to monitor; the
   retired `data-testid` fallbacks would not save it.
3. **`[data-app-navigation-rail]`** — backed by a narrow-`<nav>` landmark
   fallback, then the floating launcher.
4. **`[data-app-action-timeline-scroll]`** — screenshot scrolling; falls back
   to computing the nearest scrollable ancestor.
5. **Theme signalling** — lowest risk of the set: detection ends at the
   painted background, so a renamed attribute changes nothing.
6. **`/backend-api/conversation/<id>` response shape** — unchanged for years,
   but all non-screenshot exports depend on it.

The floating launcher means that even if items 1 and 3 both disappear, the
exporter remains reachable rather than vanishing.
