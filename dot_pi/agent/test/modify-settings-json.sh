#!/usr/bin/env bash
# Test for modify_settings.json: runs the chezmoi modify script with a current
# settings.json on stdin. Run: bash modify-settings-json.sh
set -u

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/modify_settings.json"
command -v jq >/dev/null 2>&1 || { echo "SKIP no jq on PATH"; exit 0; }

out=$(mktemp)
trap 'rm -f "$out"' EXIT
fail=0

check() { # name, jq expression that must be true
  if jq -e "$2" "$out" >/dev/null; then echo "ok   $1"; else echo "FAIL $1"; fail=1; fi
}

# A current file as pi writes it after a /model change in the TUI.
printf '%s' '{
  "lastChangelogVersion": "9.9.9",
  "defaultProvider": "local",
  "defaultModel": "drift-model",
  "terminal": {"showTerminalProgress": false, "extra": 1},
  "enabledModels": ["local/drift-model"],
  "deviceId": "abc"
}' | sh "$SCRIPT" >"$out"
check "keeps deviceId" '.deviceId == "abc"'
check "keeps lastChangelogVersion" '.lastChangelogVersion == "9.9.9"'
check "repo model wins" '.defaultProvider == "openai" and .defaultModel == "gpt-6.1-sol"'
check "repo array replaces current" '.enabledModels | index("local/drift-model") == null'
check "objects merge key by key" '.terminal == {"showTerminalProgress": true, "extra": 1}'

sh "$SCRIPT" </dev/null >"$out"
check "empty stdin gives repo keys only" 'has("deviceId") | not'

exit "$fail"
