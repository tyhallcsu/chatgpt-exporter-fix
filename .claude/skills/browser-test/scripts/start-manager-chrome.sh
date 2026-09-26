#!/usr/bin/env bash
# Start (or reuse) the userscript-manager Chrome: a persistent profile carrying a
# real Tampermonkey install, with CDP on MANAGER_CDP_PORT.
#
# Unlike start-chrome.sh — which runs the build through a GM_* shim — this profile
# runs the script the way a user does, under the manager. Command-line extension
# loading no longer works in current Chrome (`--load-extension` is ignored, with or
# without `--enable-unsafe-extension-debugging`), so the profile has to *carry* the
# extension. Seed it once from a profile that already has Tampermonkey installed:
#
#   rsync -a --exclude 'Singleton*' ~/.chrome-some-test-profile/ "$MANAGER_PROFILE/"
#
# then delete the copied browsing data (Cookies, History, Login Data, Sessions).
# Chrome's preference MACs survive the move, so the extension stays enabled.
# The ChatGPT login itself is manual and only needed when the session expires.
set -euo pipefail

PORT="${MANAGER_CDP_PORT:-9333}"
PROFILE="${MANAGER_PROFILE:-$HOME/.chrome-chatgpt-exporter-test}"
CHROME_BIN="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
START_URL="${MANAGER_START_URL:-https://chatgpt.com/}"

if curl -sf --max-time 2 "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
    echo "reusing the manager Chrome already on port ${PORT}"
    exit 0
fi

if [ ! -d "$PROFILE" ]; then
    echo "no profile at $PROFILE — seed it from a profile that has Tampermonkey (see the header)" >&2
    exit 1
fi

mkdir -p "${TMPDIR:-/tmp}/chatgpt-exporter-manager"
LOG="${TMPDIR:-/tmp}/chatgpt-exporter-manager/chrome.log"

nohup "$CHROME_BIN" \
    --user-data-dir="$PROFILE" \
    --remote-debugging-port="$PORT" \
    --no-first-run \
    --no-default-browser-check \
    --window-size=1440,950 \
    "$START_URL" >"$LOG" 2>&1 &

echo "started chrome pid $! — profile $PROFILE, CDP $PORT, log $LOG"

for _ in $(seq 1 20); do
    if curl -sf --max-time 2 "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
        echo "CDP ready on ${PORT}"
        exit 0
    fi
    sleep 1
done

echo "CDP did not come up on ${PORT}; see $LOG" >&2
exit 1
