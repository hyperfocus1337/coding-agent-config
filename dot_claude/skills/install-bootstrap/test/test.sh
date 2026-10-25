#!/usr/bin/env bash
# Check merge-minimal.jq against the settings-minimal.json in this source tree.
# Run: bash test.sh. Needs jq on PATH.
set -u

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
filter="$here/../scripts/merge-minimal.jq"
minimal="$here/../../../settings-minimal.json"
command -v jq >/dev/null 2>&1 || {
  echo "SKIP no jq on PATH"
  exit 0
}
fail=0

merge() { jq -c --slurpfile m "$minimal" -f "$filter"; }

check() { # name, jq expression that must be true for $out
  if jq -e "$2" >/dev/null <<<"$out"; then echo "ok   $1"; else
    echo "FAIL $1: $out"
    fail=1
  fi
}

want_deny=$(jq -c '.permissions.deny' "$minimal")

out=$(echo '{}' | merge)
check "empty repo gets the full deny list" ".permissions.deny == $want_deny"
check "true disable keys copied" '.disableBundledSkills == true'
check "false disable keys dropped" 'has("disableAllHooks") | not'
check "enableArtifact false copied" '.enableArtifact == false'
check "schema and comment dropped" '(keys | map(startswith("$")) | any) | not'

out=$(echo '{"hooks":{"SessionStart":[]},"permissions":{"deny":["WebFetch","CronList"],"allow":["Bash(ls)"]}}' | merge)
check "other keys kept" '.hooks.SessionStart == [] and .permissions.allow == ["Bash(ls)"]'
check "existing deny order kept" '.permissions.deny[0:2] == ["WebFetch","CronList"]'
check "no duplicate deny entries" '(.permissions.deny | length) == (.permissions.deny | unique | length)'

twice=$(merge <<<"$out")
if [[ "$twice" == "$out" ]]; then echo "ok   re-run changes nothing"; else
  echo "FAIL re-run: $twice"
  fail=1
fi

exit "$fail"
