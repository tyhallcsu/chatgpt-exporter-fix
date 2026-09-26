# Verification matrix — reconciled candidate under a real userscript manager

**Date:** 2026-09-25
**Candidate:** `review/reconcile-upstream-2.36.1` @ `37badf7`, userscript version
`2.36.1-review.632.37badf7`, artifact `dist/chatgpt-exporter-review.user.js`,
SHA-256 `c252ca240a4410ae802f24ff8e8e8b2bd67f0d8f4a735f9417205d89691972f3`
**Plain artifact from the same source:** `dist/chatgpt.user.js`, SHA-256
`4a91f9cd51392be0660d3b9791e7a609ef47570029c718a5995be044235a4b71`
**Rollback artifact:** `chatgpt-exporter/dist/chatgpt.user.js` (master `3b38d30`),
version 2.35.2, SHA-256
`11133adf16f9e52c932ccc34a43466b0c2ca5f06bf5fae4252c306c2021901d8`
**Previous candidate, preserved for comparison:** version 2.36.1, SHA-256
`35f21bc0e598c0eeeed5f2dc4442728bb2099371dde2b410f5437717915ff048`

## Evidence tiers

| Tier | Meaning |
|---|---|
| **U** | unit / fixture (vitest + happy-dom, no browser) |
| **L** | live browser, authenticated ChatGPT, script injected by a `GM_*` harness |
| **M** | **real userscript manager** — Tampermonkey 5.5.0, installed through its own install prompt |

Unlike the previous run, **every live row below is tier M**. Conditions: signed in
as `***@tylerhalltech.com`, ChatGPT appearance **System** (never changed),
macOS appearance **Dark** natively (`defaults read -g AppleInterfaceStyle` =
`Dark`, `matchMedia('(prefers-color-scheme: dark)')` true without emulation),
Google Chrome 153.0.8010.53, dedicated profile `~/.chrome-chatgpt-exporter-test`,
exactly one ChatGPT exporter enabled in the manager for every measurement.

Where a preference had to be changed at runtime it was changed with CDP
`Emulation.setEmulatedMedia`, and those rows are labelled **emulated**.

---

## Manager behaviour

| Check | Result | Tier |
|---|---|---|
| Candidate installs through the manager's own prompt | **PASS** | M |
| Candidate is enabled and actually executing | **PASS** — `[Exporter] Loaded`, container inserted | M |
| Exactly one userscript evaluation per document | **PASS** — one `[Exporter] Loaded` per load | M |
| No second exporter executing | **PASS** — the other entry is disabled for every measurement | M |
| No GM shim or custom loader injecting a second copy | **PASS** — the shim harness was not used | M |
| `@match` / `@grant` / `@require` / `@run-at` as authored | **PASS** — manager reports run-at Default (`document-end`), 16 matches, GM target Auto | M |
| Installed build identity matches the tested artifact | **PASS** — manager shows `2.36.1-review.632.37badf7` | M |
| Settings survive a browser restart | **PASS** — enable state and update setting persisted across a full quit/relaunch | M |
| Same `@name` reinstall replaces in place | **PASS** — the manager offers *Update*, not *Install* | M |
| Different `@name` from the official script | **duplicates, does not replace** — the manager offers *Install* and both entries then run | M |
| `@updateURL`/`@downloadURL` of `none` disables updates | **NO** — *Check for updates* stays ticked and the URL is the literal string `none` | M |
| Unticking *Check for updates* per script | **PASS**, and it survives a restart | M |

A manual "Trigger Update" produced no HTTP request to the serving origin for
either entry, but no positive control could be produced, so that experiment is
**inconclusive** and is not used to claim updates are off. The checkbox reading
is the evidence.

## Launcher placement — overlap, hit test and popup geometry

**Acceptance row: the launcher does not overlap the profile/footer, and the popup
stays reachable. — PASS**

"One `[data-ce-mount]` with a positive box" is not evidence: the reported defect
satisfied all of that while printing on top of the account row. Each case below
therefore measures pixel overlap against the sidebar's other controls, hit-tests
the launcher's interior at five points, and confirms the conversation list still
scrolls to its last item uncovered.

Overlap is computed against each control's **visible** rectangle — its bounding
box intersected with every scrolling ancestor — because a bounding rect keeps
reporting a position after a scroll container has clipped the element out of
sight. Two earlier measurements were wrong for exactly that reason and were
corrected before any conclusion was drawn.

Measured with `launcher-placement-check.mjs` against the installed
`2.36.1-review.637.36db050`, after a page reload — a userscript is only
re-evaluated on load, and an earlier run silently measured a stale build.

| Case | Strategy | Launcher | Overlap | Hit test | Menu | List reaches end |
|---|---|---|---|---|---|---|
| Expanded, 1440×950 | `sidebar-footer` | 326×46 | **0 px²** | all 5 points ours | in viewport, Export All reachable | yes, uncovered |
| Collapsed, 1440×950 | `nav-rail` | 32×32 | **0 px²** | all 5 points ours | in viewport, Export All reachable | n/a |
| Short, 1440×620 | `sidebar-footer` | 326×46 | **0 px²** | all 5 points ours | in viewport, Export All reachable | yes, uncovered |
| Narrow, 520 wide | `floating` | 99×46 | **0 px²** | all 5 points ours | in viewport, Export All reachable | n/a |
| 125% zoom equivalent, 1152×760 | `sidebar-footer` | 326×46 | **0 px²** | all 5 points ours | in viewport, Export All reachable | yes, uncovered |
| 150% zoom equivalent, 960×633 | `sidebar-footer` | 326×46 | **0 px²** | all 5 points ours | in viewport, Export All reachable | yes, uncovered |

Browser zoom's effect on layout is a smaller CSS viewport, and these are the CSS
viewports 125% and 150% produce at 1440×950. CSS `zoom` was tried first and is
**not** equivalent — `innerWidth`/`innerHeight` stay unzoomed while rects scale, so
every viewport comparison measures an artifact — and a device-metrics override
wedged the renderer. The rows are labelled as equivalent viewports, not as real
browser zoom.

### Before and after, same viewport

| | Expanded sidebar, 1440×950 |
|---|---|
| **Before** | launcher `16,764 310×46`, account button `6,769 328×52`, **12,710 px² overlap**. In the capture the two rows print through each other — the text reads `Eyxbpoolrtt aHll`, "Export" over "Tyler Hall", with both icons stacked. |
| **After** | launcher `8,708 326×46`, account button `6,769 328×52`, **0 px² overlap**. The list ends at 708, the Export row runs 708→754, the account row 769→821. |

Screenshots: `*-closed.png` and `*-open.png` per case, plus `results.json`, written
by the check.

### What was wrong

ChatGPT's sidebar footer is absolutely positioned against the sidebar's bottom
edge and lives **outside** `nav[aria-label="Chat history"]`; the conversation list
keeps clear of it with `margin-bottom: var(--sidebar-footer-height)`. Appending the
menu to that nav dropped it straight into the band the footer already occupied.
The menu is now the first row *inside* the footer group, and the reservation grows
to the footer's measured height — the property ChatGPT already uses for this.

In the collapsed rail, `RAIL_MENU_BUTTON_SELECTOR` matches the account button
itself, so "insert before the button" put the launcher inside the account row as a
second flex item. It now takes a rail row of its own. The rail also disables
pointer events for its whole subtree, with each row opting back in, so the row had
to as well — without that, hit-testing the launcher returned "Show sidebar".

No negative margins, no raised stacking order, no rule targeting ChatGPT's
navigation, and the account row is not hidden. The reservation is restored
verbatim on cleanup.

## Initialisation

| Check | Result | Tier |
|---|---|---|
| Cold load and reload | **PASS** — one usable mount, 0 console errors | M |
| React #418 attribution, no script running | **0 errors, 0 #418** (baseline) | M |
| React #418 attribution, candidate running | **0 errors, 0 #418** | M |
| Settle gate runs once, bounded, releases its observer | **PASS** | U (5 tests) |
| Mount when the document is **hidden** for the whole load | **PASS** — 1 usable mount | M |
| Recovery once that same document is foregrounded, no reload | **PASS** | M |

Upstream 2.36.1 itself was **not** re-tested for #418 this run; the previous
session's observation is theirs, not re-confirmed here.

### Hidden-tab initialisation, candidate vs the previous candidate

Same script, same setup, both phases verified rather than assumed
(`heldHidden=true`, `becameVisible=true`):

| Build | mounts while hidden | usable once visible |
|---|---|---|
| Previous candidate `35f21bc0` | **0** | 1 |
| This candidate `632.37badf7` | **1, usable** | 1 |

So the settle-gate change moves *when* initialisation happens; it does **not**
repair a permanent failure. The previous build recovers as soon as the tab is
shown. What the fix buys is deterministic, bounded initialisation that does not
depend on paint scheduling, plus the launcher already being present the moment
the tab is looked at.

## Theme

| Scenario | `data-theme` | Card / text | Contrast | Tier |
|---|---|---|---|---|
| System + **native** OS dark, menu opened after | `dark` | `rgb(42,42,42)` / `rgb(237,237,237)` | **12.26:1** | M |
| Switch to light **with the menu already open** | `light` | `rgb(255,255,255)` / `rgb(13,13,13)` | **19.44:1** | M, emulated |
| Switch back to dark **with the menu already open** | `dark` | `rgb(42,42,42)` / `rgb(237,237,237)` | **12.26:1** | M, emulated |
| Light preference, menu opened after | `light` | `rgb(255,255,255)` / `rgb(13,13,13)` | **19.44:1** | M, emulated |
| Restored to native preference | `dark` | — | **12.26:1** | M |
| explicit Dark, OS light · explicit Light, OS dark · legacy `.dark` | correct | — | — | U |

Both theme gaps the previous matrix listed — *change without reload* and *change
with the menu open* — are now closed. ChatGPT rewrites `data-theme` on a
preference change and the exporter follows it in place, no reload needed.

The ChatGPT appearance setting was never modified, so there was nothing to
restore.

### Signed-out `data-theme`

Signed **out** on `https://chatgpt.com/`, with native OS dark, `data-theme` is
**absent** while the page still renders dark (`body` background `rgb(0,0,0)`).
The exporter menu then renders light — a white card on a black page. The previous
matrix recorded this row as *not reachable signed in*; it **is** reachable signed
out, and `/share/*` is in `@match` and viewable without a session.

Not fixed, deliberately: signed **in** — the owner's actual usage — ChatGPT always
wrote `data-theme`, so it does not affect the reported complaint. Recorded as an
open cosmetic gap rather than folded into this change.

## Exports

| Export | Result | Tier |
|---|---|---|
| Screenshot, long thread | **PASS** — see below | M |
| Screenshot leaves no exporter DOM behind | **PASS** — 0 `[data-chatgpt-exporter-screenshot-root]` | M |
| Scroll position restored after screenshot | **PASS** — `scrollY` 0 | M |
| Conversation list shows its failure instead of an empty list | **PASS** — see below | M |
| Markdown / HTML / JSON / Copy Text | **BLOCKED** | — |
| **Export All ZIP** | **BLOCKED** | — |

### Screenshot ZIP, validated as an archive and as images

`ChatGPT-FAKE_NEWEGG_ITEM.zip`, 5,265,399 B. `unzip -t` reports no errors. Two
members, both valid PNGs by signature and IHDR: 1536×29,996 (4,527,317 B) and
1536×3,718 (737,788 B) — about 33,700 px of thread, tiled rather than encoded as
one image.

Pixels inspected, not just dimensions. Crops at the beginning, middle and end all
render real, legible, correctly dark-themed conversation content: the opening user
message with its attachment cards and quoted email headers; a mid-thread passage of
the refund request; and the closing assistant paragraphs on the second tile. So the
archive covers the thread start to finish.

One observation, not a pass or a fail: three image tiles at the very top rendered
as loading spinners, so those attachments were not resolved at capture time.

That ~33,700 px thread is the same size class as the ~48,900 px thread that
crashed the renderer during PNG encode in an earlier session. **That specific
thread was not re-tested**, so the old observation is neither confirmed nor
cleared — but the tiling path demonstrably works at this size.

### Blocked: everything that reads the conversation API

`GET https://chatgpt.com/backend-api/conversations` returned **HTTP 429** with **no
`Retry-After`** for the whole session. Reproduced with the exporter's own
authenticated request (`Authorization: Bearer …`), request id
`f6df166a-8c30-4424-bf46-f232d21a0cc5` among others, and still 429 on bounded
retries at 01:39:54Z, 01:44:49Z and 02:29:48Z — roughly 75 minutes.
`GET /backend-api/conversation/<id>` is throttled too, which is why the
single-conversation exports are blocked as well.

ChatGPT's **own** sidebar request
(`/backend-api/conversations?exclude_conversation_origin=tpp&…`) was also 429 in the
same page load, and the project endpoint (`/backend-api/gizmos/snorlax/sidebar`)
returned 200 and paginated normally throughout — which is exactly the "projects
load, conversations do not" pattern the previous session saw and could not explain.
That both the native and the exporter request were throttled shows both were
affected in this context. It does **not** by itself establish the scope of the
limit or what caused it.

An unauthenticated probe of the same path returns `200` with
`{"items":[],"total":0}`. That is an artifact of omitting the `Authorization`
header, not evidence about the account.

Probing was stopped rather than repeated. **No ZIP was produced and none is
claimed.** This is BLOCKED, not FAIL.

### What the fix does deliver, measured on the shipped build

With the account throttled, Export All on `2.36.1-review.637.36db050` renders:

> Error: ChatGPT is rate limiting the conversation list (HTTP 429). It sent no
> Retry-After, so there is no stated wait; retrying after a minute or two may work.

Before the fix the same conditions produced `0 / 0` and no error at all, with the
`RateLimitError` visible only in the console. **"Error reporting fixed" is not
"Export All completed"** — the first is verified, the second is blocked.

## Keyboard

| Check | Result | Tier |
|---|---|---|
| Launcher exposes a role and a label | `role="button"`, `aria-label="Export"` | M |
| Launcher is focusable | yes, `tabIndex` 0 | M |
| **Enter** opens the menu | **yes** | M |
| **Space** opens the menu | **yes** | M |
| Pointer opens the menu | yes | M |
| Focus alone opens the menu | yes — the trigger is a hover card, so this is by design | M |
| **Escape** closes the menu | yes | M |
| Focus after Escape | returns to `<body>`, not the trigger | M |
| Tab from the launcher reaches a menu item | no — focus moves into ChatGPT's own controls | M |

**Correction.** An earlier measurement in this run reported that Enter did not
activate the launcher. That was wrong, and the cause was the test, not the
product: the key event was dispatched as `keyDown` with `text`, which never
produced a `keydown` the page could act on. Re-dispatched correctly as
`rawKeyDown` + `char`, the page records `keydown:Enter → click` and the menu
opens. `MenuItem` already handles both Enter and Space. No change was made to
the component, and none was needed.

The two genuine gaps — focus not returning to the trigger after Escape, and Tab
not walking into the menu — are upstream behaviour, do not block the workflow
under test, and are left as separate reported gaps rather than folded into this
change.

## Fixed this run

| Defect | Evidence | Fix |
|---|---|---|
| **Launcher printed on top of the account row** in the expanded sidebar | launcher `16,764 310×46` vs account `6,769 328×52`, **12,710 px²**; the capture reads `Eyxbpoolrtt aHll` | the menu is a row inside ChatGPT's footer group, and `--sidebar-footer-height` grows to match |
| Launcher stacked on the account control in the **collapsed rail** | `0,809 32×40` vs `24,811 36×36`, **240 px²** | inserted before the whole rail row, not next to the account button |
| Collapsed launcher **did not receive its own clicks** | collisions 0 but hit test returned `Show sidebar` | the row opts back into pointer events, as ChatGPT's rail rows do |
| Floating launcher over the **composer's attachment button** at narrow width | `20,746 99×46` vs `24,745 36×36`, **1,260 px²** | raised clear of the composer |
| Menu mounted at **0×0** with the sidebar collapsed, and again with the drawer closed | `getClientRects()` 0 while a rendered anchor sat unused | `preferRendered` no longer keeps unrendered candidates once the document reports layout |
| A throttled list rendered as a **successful-looking empty list** | `0 / 0` while the console had `RateLimitError` | the loader's `onError` feeds the dialog's error row |
| A successful retry left the old error on screen, and `disabled` keys off it, so **Export stayed greyed out for the life of the dialog** | found by the new component test | the loader clears the error as each load starts |
| The 30 s retry fallback was worded as a **server promise** | — | `RateLimitError` records whether the wait came from `Retry-After` |
| **No mount at all** while the document stayed hidden | 0 containers in 24 s, no frame callback within 2 s | the settle gate takes the frame callback or a 32 ms timer, whichever comes first |

### Corrections made to earlier findings in this run

- **Enter does activate the launcher.** The earlier "Enter fails" reading came from
  a malformed synthetic key event, not the product.
- **The hidden-tab defect is not a permanent failure.** The previous build recovers
  as soon as the tab is shown; the fix changes *when* initialisation happens.
- **Three placement measurements were wrong before they were trusted**: a stale
  build was measured because the page had not been reloaded; clipped list rows were
  counted as collisions; and CSS `zoom` was not a faithful stand-in for browser
  zoom. Each was corrected and re-measured.

## Repository checks

| Check | Result | Exit |
|---|---|---|
| `pnpm test` (pnpm 8.14.1, the declared version) | **134 passed**, 23 files | 0 |
| `pnpm lint` | clean | 0 |
| `pnpm build` | ok | 0 |
| `pnpm run build:review` | ok, byte-identical on a repeat run | 0 |
| Hooks | pre-commit and pre-push ran; not bypassed | — |

Tests went 119 → 134. The new ones are load-bearing, not decorative:

- 4 of the 5 settle-gate tests fail against the previous `requestAnimationFrame` gate.
- 3 of the 4 list-load tests fail if `onError` goes back to `() => { loadFailed = true }`.
- Each navMount fixture fails without its corresponding placement fix.

The list-load tests render the real dialog and drive the real `onError` contract;
only `vite-plugin-monkey/dist/client` and the three API functions are mocked.
