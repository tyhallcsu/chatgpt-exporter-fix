# Upstream 2.36.x vs local repair — comparison and reconciliation

**Retrieved:** 2026-09-25
**Comparison issue:** https://github.com/tyhallcsu/chatgpt-exporter-fix/issues/5

| | Ref |
|---|---|
| Shared merge base | `816d9fe` (v2.35.2 + 3) |
| Our checkpoint | `3b38d30` (`checkpoint/2026-09-25-local-repair`) |
| Upstream v2.36.0 | `4461c34` |
| Upstream v2.36.1 | `1d5d118` |
| Upstream master | `2780b28` (= v2.36.1 + `chore: ci build`) |
| GreasyFork | 2.36.1 |

`upstream/master` is 2 commits ahead of the v2.36.1 tag, so tag, master and the
GreasyFork artifact are **not** byte-identical.

---

## Headline result

Upstream 2.36.1 is the better baseline. It fixes everything our repair fixed,
*plus* seven export-content bugs, better timestamps, a far more capable
screenshot path, and menu accessibility we never touched.

But measured live on the account owner's own authenticated ChatGPT, upstream
2.36.1 has **two reproduced defects** our checkpoint does not:

1. its launcher mounts into a `display:none` container and is **invisible**;
2. it still throws **React #418**.

Recommendation: **upstream baseline + three ported guards + regression tests.**

---

## Live head-to-head

Identical page, same session, same moment. ChatGPT appearance = **System**,
OS = **dark**, so ChatGPT renders dark.

| | Upstream 2.36.1 | Our checkpoint |
|---|---|---|
| Launcher rendered | **No — 0×0, `getClientRects()` = 0** | **Yes — 310×46 @ (16,887)** |
| Mount target | `nav[aria-label="Show sidebar"][data-app-navigation-rail]`, computed `display:none` | the visible sidebar panel |
| Menu card / text | `rgb(42,42,42)` / `rgb(237,237,237)` | same |
| Contrast | 12.3:1 ✓ | 12.3:1 ✓ |
| Exporter console errors | **React #418** | none |

### Why upstream's launcher disappears

ChatGPT is serving more than one shell variant. On the variant measured here the
visible sidebar is `nav[aria-label="Chat history"]` (340px) and the rail markup
is still in the DOM as `nav[aria-label="Show sidebar"]` with `display:none`.

Upstream's chain is: profile button → sidebar-scroll `nextElementSibling`
footer → `[data-app-navigation-rail] button[aria-haspopup="menu"]` →
Automations. The third rule matched the **hidden** rail. Nothing in the chain
tests whether the target is rendered, so the menu mounts where no one can see it.

This is the same class of bug as the duplicate hidden mount we hit on mobile
yesterday, which is why our build guards against it.

---

## Theme: upstream is right, our extra machinery is not needed

This was the reason for the whole follow-up, so it was measured directly rather
than assumed.

Live, authenticated, appearance = System, OS dark:

```
<html data-theme="dark">          ← ChatGPT RESOLVES System to a concrete value
html.classList.contains('dark')   → false
getComputedStyle(html).colorScheme→ "dark"
body background                   → rgb(0,0,0)
html.matches(':is(.dark,[data-theme="dark"])') → true
```

**ChatGPT always writes a resolved `data-theme` when logged in**, so upstream's
pure-CSS `:is(.dark, [data-theme="dark"])` matches and renders correctly. Live
contrast measured at **12.3:1**.

Our luminance-based detector was built against the *logged-out* page, where no
`data-theme` and no `.dark` exist. That state is real but irrelevant: the
exporter's UI only matters once signed in.

A fixture matrix appeared to show upstream failing "System → dark":

| Scenario | Upstream | Ours |
|---|---|---|
| explicit Dark, OS light | dark ✓ | dark ✓ |
| explicit Light, OS dark | light ✓ | light ✓ |
| legacy `.dark`, OS light | dark ✓ | dark ✓ |
| **no attribute, OS dark** | light ✗ | dark ✓ |
| **`data-theme="system"`, OS dark** | light ✗ | dark ✓ |

Both failing rows are **unrealistic** — the live app never leaves the attribute
absent or unresolved while signed in. Recorded here so the claim is not repeated
as though it were a live defect.

**Decision: drop our theme module; keep upstream's.** Our fixture also exposed a
genuine weakness in *our* CSS — with an explicit theme opposite to the OS, our
menu text fell back to inherited page colour and measured **1.4:1**, where
upstream's explicit `--ce-text-primary` chain held 12.1:1. Another reason to
take upstream's stylesheet.

---

## Per-behaviour decisions

| Behaviour | Ours | Upstream | Evidence | Decision |
|---|---|---|---|---|
| Conversation start | `[data-turn-key]` + legacy, one generation at a time | `[data-chatgpt-conversation-selection-target] [data-chatgpt-search-message-ids]` + legacy | both work live | **REPLACE WITH UPSTREAM** |
| Theme detection | JS stamp + luminance | pure CSS `:is(.dark,[data-theme="dark"])` | live 12.3:1 both; ours worse on opposite-OS fixture | **REPLACE WITH UPSTREAM** |
| Timestamps | positional `conversationNodes[index]` | message-id mapping, dedupe guard, refetch for new messages | upstream is correct by construction; ours mis-aligns when DOM and API node order differ | **REPLACE WITH UPSTREAM** |
| Screenshot | clone intersecting turns | same selectors **plus** reversed-scroller handling, history-spinner wait, image preload/embed, CJK fonts, scroll restore | upstream strictly richer | **REPLACE WITH UPSTREAM** |
| Export content (HTML/MD math, prices, code, attachments, escaping) | none | 7 fixes in 2.36.1 | we never touched these | **UPSTREAM ONLY — KEEP** |
| Menu items as buttons (a11y) | none | `061d81f` | — | **UPSTREAM ONLY — KEEP** |
| Mount visibility guard | `preferRendered()` skips unrendered candidates | none | **reproduced: upstream launcher invisible** | **KEEP OURS (port)** |
| Visible-sidebar-panel strategy | mounts into the panel owning the scroll container | no equivalent | **reproduced: needed for any visible mount on this variant** | **KEEP OURS (port)** |
| Hydration gate | wait for DOM quiet before first injection | none | **reproduced: React #418 on upstream, absent on ours** | **KEEP OURS (port)** |
| Floating fallback | last-resort launcher on `document.body` | none | no longer purely speculative — upstream's whole chain just failed on a live variant | **KEEP OURS (port, as insurance)** |
| `navMount.ts` / `threadDom.ts` modules wholesale | — | — | most of their content duplicates upstream | **REDUNDANT — do not port wholesale** |
| Our `theme.ts` + `tests/theme.test.ts` | — | upstream has its own | conflicts by filename | **DROP OURS** |
| Our mount/lifecycle regression tests | 15 tests | none | valuable regardless of implementation | **ADAPT** |

---

## Reconciliation plan (smallest justified delta)

Baseline: `upstream/master` (`2780b28`). Add only:

1. a rendered-target filter in `getNavMenuMounts()`;
2. a visible-sidebar-panel strategy ahead of the rail rule;
3. a terminal floating launcher;
4. the shell-settle gate before first injection;
5. regression tests for the hidden-container and duplicate-mount cases.

Everything else stays upstream's.
