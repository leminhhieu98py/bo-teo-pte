#!/bin/bash
# Bo cố lên - one command to set up or update the extension on macOS.
# Usage: ./start.sh
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"
CONFIG="config.local.json"

say()  { printf '\n\033[1;35m%s\033[0m\n' "$1"; }
info() { printf '  %s\n' "$1"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$1"; }
wait_enter() { read -r -p "  Press Enter to continue... " _; }

json_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

say "Hi! Let's get Bo cố lên ready."

# 1. Get the newest code.
if git rev-parse --is-inside-work-tree >/dev/null 2>&1 && git remote get-url origin >/dev/null 2>&1; then
  say "1. Updating the code"
  if git pull --ff-only; then
    info "Code is up to date."
  else
    warn "Could not update (no internet or local changes). Continuing with the current code."
  fi
fi

# 2. Settings (Google Sheet + Gemini). Saved only on this Mac, never pushed to GitHub.
say "2. Checking settings"
CHANGE="n"
if [ -f "$CONFIG" ]; then
  info "Found $CONFIG."
  read -r -p "  Enter new values (URL, token, key)? [y/N] " CHANGE
fi
if [ ! -f "$CONFIG" ] || [[ "$CHANGE" =~ ^[Yy] ]]; then
  info "Please enter 3 values (ask your brother for them)."
  SHEET_URL=""
  while [[ "$SHEET_URL" != https://script.google.com/* ]]; do
    read -r -p "  Apps Script URL (starts with https://script.google.com/): " SHEET_URL
  done
  TOKEN=""
  while [ -z "$TOKEN" ]; do read -r -s -p "  Sheet token (hidden while typing): " TOKEN; echo; done
  API_KEY=""
  while [ -z "$API_KEY" ]; do read -r -s -p "  Gemini API key (hidden while typing): " API_KEY; echo; done

  umask 077
  cat > "$CONFIG" <<EOF
{
  "sheetUrl": "$(json_escape "$SHEET_URL")",
  "token": "$(json_escape "$TOKEN")",
  "apiKey": "$(json_escape "$API_KEY")",
  "model": ""
}
EOF
  info "Saved to $CONFIG. Bo co len picks up the new values the next time it opens."
fi

# 3. Add the extension to Chrome.
if [ ! -d "/Applications/Google Chrome.app" ] && [ ! -d "$HOME/Applications/Google Chrome.app" ]; then
  warn "Google Chrome is not installed. Install it from https://www.google.com/chrome/ and run ./start.sh again."
  exit 1
fi

say "3. Chrome"
read -r -p "  Is Bo cố lên already added to Chrome? [y/N] " ALREADY
printf 'chrome://extensions' | pbcopy
open -a "Google Chrome" "chrome://extensions" >/dev/null 2>&1 || true

if [[ "$ALREADY" =~ ^[Yy] ]]; then
  info "Chrome is opening the Extensions page."
  info "If it does not open: click the address bar, press Cmd+V (already copied), then Enter."
  info "Find Bo cố lên and click its round reload arrow. Done!"
else
  info "Chrome is opening the Extensions page."
  info "If it does not open: click the address bar, press Cmd+V (already copied), then Enter."
  wait_enter
  printf '%s' "$ROOT" | pbcopy
  info "Now in Chrome:"
  info "  a) Turn ON 'Developer mode' (top right corner)."
  info "  b) Click 'Load unpacked'."
  info "  c) Press Cmd+Shift+G, then Cmd+V (the folder path is copied), then Enter."
  info "  d) Click 'Select'. Bo cố lên appears in the list."
  info "  e) Click the puzzle icon next to the address bar and pin Bo cố lên."
  wait_enter
fi

say "All set!"
info "Save a word : highlight it on any page, then press Command+B."
info "            : or press Command+B with nothing highlighted and drag around the explanation."
info "Review      : click the Bo cố lên icon, then 'Start review'."
info "You do not need to run this script every day. Run it again only to get updates."
