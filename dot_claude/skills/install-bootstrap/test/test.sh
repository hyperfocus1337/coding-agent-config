#!/usr/bin/env bash
# Check merge.jq against assets/settings.json and settings-minimal.json in this
# source tree. Run: bash test.sh. Needs jq on PATH.
set -u

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
filter="$here/../scripts/merge.jq"
web="$here/../assets/settings.json"
minimal="$here/../../../settings-minimal.json"
command -v jq >/dev/null 2>&1 || {
  echo "SKIP no jq on PATH"
  exit 0
}
fail=0

merge() { jq -c --slurpfile m "$1" -f "$filter"; }

check() { # name, jq expression that must be true for $out
  if jq -e "$2" >/dev/null <<<"$out"; then echo "ok   $1"; else
    echo "FAIL $1: $out"
    fail=1
  fi
}

rerun() { # name, source file
  local twice
  twice=$(merge "$2" <<<"$out")
  if [[ "$twice" == "$out" ]]; then echo "ok   $1"; else
    echo "FAIL $1: $twice"
    fail=1
  fi
}

want_hook=$(jq -c '.hooks.SessionStart[0]' "$web")
want_deny=$(jq -c '.permissions.deny' "$minimal")

# assets/settings.json
out=$(echo '{}' | merge "$web")
check "empty repo gets the hook" ".hooks.SessionStart == [$want_hook]"
check "empty repo gets attribution" '.attribution == {"commit":"","pr":"","sessionUrl":false}'
check "web schema and comment dropped" '(keys | map(startswith("$")) | any) | not'
rerun "web re-run changes nothing" "$web"

out=$(echo "{\"hooks\":{\"SessionStart\":[{\"matcher\":\"resume\",\"hooks\":[]},$want_hook],\"Stop\":[]},\"attribution\":{\"commit\":\"x\",\"extra\":1}}" | merge "$web")
check "other hooks kept, bootstrap hook not doubled" ".hooks.SessionStart == [{\"matcher\":\"resume\",\"hooks\":[]},$want_hook] and .hooks.Stop == []"
check "attribution values from the source win" '.attribution == {"commit":"","extra":1,"pr":"","sessionUrl":false}'

# settings-minimal.json
out=$(echo '{}' | merge "$minimal")
check "empty repo gets the full deny list" ".permissions.deny == $want_deny"
check "true disable keys copied" '.disableBundledSkills == true'
check "false disable keys dropped" 'has("disableAllHooks") | not'
check "enableArtifact false copied" '.enableArtifact == false'
check "minimal schema and comment dropped" '(keys | map(startswith("$")) | any) | not'

out=$(echo '{"hooks":{"SessionStart":[]},"permissions":{"deny":["WebFetch","CronList"],"allow":["Bash(ls)"]}}' | merge "$minimal")
check "other keys kept" '.hooks.SessionStart == [] and .permissions.allow == ["Bash(ls)"]'
check "existing deny order kept" '.permissions.deny[0:2] == ["WebFetch","CronList"]'
check "no duplicate deny entries" '(.permissions.deny | length) == (.permissions.deny | unique | length)'
rerun "minimal re-run changes nothing" "$minimal"

# Both, in the order of the minimal profile
out=$(echo '{}' | merge "$web" | merge "$minimal")
check "both files merge into one" ".hooks.SessionStart == [$want_hook] and .permissions.deny == $want_deny and .attribution.sessionUrl == false"

exit "$fail"
