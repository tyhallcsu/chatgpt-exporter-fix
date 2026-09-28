---
name: browser-test
description: Test the built userscript on the real chatgpt.com in a dedicated Chrome over CDP. Inject dist, trigger exports, collect the downloads and inspect them. Use when verifying a change in the live app, reproducing an export or screenshot bug, or measuring why a screenshot differs from the page.
---

# Browser test

Run the current `dist/chatgpt.user.js` on the live chatgpt.com without
Tampermonkey. Everything goes through CDP on a Chrome started only for
testing. The scripts need Node 22+.

All paths below are relative to this skill's directory.

## Setup

1. `scripts/start-chrome.sh` starts Chrome with CDP on port 9222 and a
   separate profile in `~/.chrome-chatgpt-test`, or reuses the one that is
   running. The default binary path is macOS; set `CHROME_BIN` elsewhere.
2. The first time, and whenever the session expires or Cloudflare shows a
   challenge, the maintainer logs in by hand. Everything else is automatic.
3. Optional: the chrome-devtools MCP gives snapshots, clicks and console
   logs. Attach it to this Chrome instead of letting it launch its own,
   which uses automation flags that trip Cloudflare more often:
   `claude mcp add chrome-devtools -- npx chrome-devtools-mcp@latest --browser-url=http://127.0.0.1:9222`

## Loop

```sh
pnpm build
node scripts/inject.mjs --reload        # reload the tab, inject the new build
node scripts/eval.mjs -e "return location.href"
node scripts/export.mjs Screenshot      # or Markdown, HTML, "Copy Text", ...
node scripts/export.mjs JSON "OpenAI Official Format"
```

- `inject.mjs` loads the `@require` libraries, a localStorage GM shim and
  the build. A reload drops it. Navigating by clicking the sidebar keeps it.
  It refuses to inject twice; pass `--reload`.
- `eval.mjs` runs an async function body in the page and prints the
  result. Strings print raw, so large output such as a base64 PNG can be
  piped to a file. Use it instead of MCP `evaluate_script` with `filePath`,
  which only writes inside the repo.
- `export.mjs` clicks a menu item, waits for the download, moves it out of
  `~/Downloads` and unpacks zips. Output goes to the system temp dir by
  default. Exports contain real conversations: never commit them.
- `measure-text.mjs` compares the width of text on the page and inside an
  SVG image. See below.
- `ui-shot.mjs` opens one exporter UI state (`page`, `menu`, `setting`,
  `export`, `json`) and screenshots it. See UI changes below.

To open a conversation, click it in the sidebar through `eval.mjs`, for
example `[...document.querySelectorAll('a, button')].find(e => e.textContent.trim() === 'Title').click()`.

## Real userscript manager (tier M)

The loop above injects the build through a `GM_*` shim. That is not the product:
it proves nothing about the manager's own matching, grants, run-at, storage or
update behaviour. For those, run the build under a real Tampermonkey.

```sh
./scripts/start-manager-chrome.sh                      # persistent profile + CDP 9333
node scripts/manager-state.mjs                         # what is installed and enabled
node scripts/install-userscript.mjs ../../../dist/chatgpt-exporter-review.user.js
node scripts/manager-script-settings.mjs "review build"
```

Paths are configurable — `MANAGER_PROFILE`, `MANAGER_CDP_PORT`, `CHROME_BIN`,
`MANAGER_SERVE_PORT`, `TM_EXTENSION_ID`.

Things learned the hard way:

- **Command-line extension loading is gone.** In Chrome 153 `--load-extension` is
  silently ignored — `extensions.settings` stays empty — and
  `--enable-unsafe-extension-debugging` does not bring it back. The profile has
  to carry the extension. Copying a whole profile directory that already has
  Tampermonkey works: Chrome's preference MACs are not keyed on the profile path,
  so the extension stays enabled at the new location. Delete the copied `Cookies`,
  `History`, `Login Data` and `Sessions` afterwards.
- **Install through the manager's own prompt**, by serving the file over loopback
  and letting Tampermonkey intercept the `.user.js` navigation. The button it
  offers is the evidence: `Install` means a second entry, `Update` or `Reinstall`
  means it replaces an existing one.
- **A different `@name` duplicates rather than replaces.** Two enabled exporters
  both run. `manager-state.mjs` warns when that happens; check it before
  attributing any behaviour to the build.
- **`@updateURL none` does not disable updates.** Tampermonkey keeps *Check for
  updates* ticked and stores the literal string `none` as the URL. Untick it in
  the script's Settings tab (Advanced config mode) and verify with
  `manager-script-settings.mjs`. The setting survives a browser restart.
- The manager's dashboard needs trusted input for some controls; `manager.mjs`
  exposes `realClick`, which dispatches real CDP mouse events.

## Inspecting output

- Crop with ffmpeg: `ffmpeg -i in.png -vf crop=W:H:X:Y out.png`. Do not use
  `sips -c`, which ignores the offset and crops from the center.
- Screenshots are 2x. A turn at list offset N CSS px sits near 2N in the image.
- macOS ImageIO (Preview, `sips`) cannot open PNGs taller than about 65k px.
- MCP screenshots are scaled. Take click coordinates from
  `getBoundingClientRect()`, not from the screenshot.

## UI changes

Compare every UI change before and after, in both themes. Capture the
baseline before editing, since the old build is gone once you rebuild:

```sh
pnpm build && node scripts/inject.mjs --reload
for t in light dark; do
  for s in menu setting export json; do
    node scripts/ui-shot.mjs $s --theme $t --out /tmp/ui/before-$s-$t.png
  done
  node scripts/ui-shot.mjs setting --theme $t --scroll bottom --out /tmp/ui/before-setting2-$t.png
done
# edit, rebuild, reinject, then repeat with after-*.png and Read the pairs
```

- `--theme` flips `<html>` only, not the account setting, and lasts until
  the tab reloads.
- Check the collapsed rail too. Collapse the sidebar with an MCP click on
  "Hide sidebar"; a synthetic `click()` does not toggle it. Hover states
  also need MCP `hover`.
- Toggling settings in the dialog writes them to the test profile. Put them
  back when done.
- To match a ChatGPT control, find the live one and read its computed
  style instead of guessing. Settings > Security and login has switches in
  both states; Library cards show checkboxes on hover.
- Run `git checkout dist/chatgpt.user.js` before committing. CI builds dist.

## Screenshot bugs

SnapDOM freezes each box at its page size and rasterizes the copy as an SVG
`<foreignObject>` image. When text measures differently inside the image,
shrink-to-fit boxes wrap, clip or overlap. Measure before guessing:

```sh
node scripts/measure-text.mjs "中文字寬測試" "🥒 Hello" --weight 600
```

Known gaps, both fixed in `src/exporter/image.ts`:

- macOS `system-ui` tracks its CJK fallback to 15.34px per glyph at 16px on
  the page, but not in the image (16px). Fixed by `matchCjkMetrics`.
- Chrome widens emoji below 24px in the image (16px becomes 20px) while the
  glyph stays the same size. Fixed by `pinEmojiWidths`.

Reproduce in this real Chrome before trusting a headless result. Headless
Chrome has different fonts, and a fix found there may not hold here.

Other things that look like bugs but are not:

- Timestamps only show when enabled in settings (`body[data-time-format]`).
- Empty gray image cards can be ChatGPT's own. Check the conversation JSON
  for `"hidden_reason": "insufficient_images"`.
- Third-party images without CORS headers cannot be read from the page. The
  exporter draws placeholders for them by design.

## Gotchas

- `local()` in `@font-face` matches PostScript names such as
  `PingFangTC-Regular`, not family names.
- Styles and fonts a test adds to `<head>` stay until the tab reloads, and a
  failed `FontFace` keeps rejecting later `document.fonts.load` calls.
- Export All hits the conversation API once per chat. Keep test runs small.
