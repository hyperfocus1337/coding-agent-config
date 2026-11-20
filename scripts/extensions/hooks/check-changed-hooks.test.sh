#!/usr/bin/env bash
# Self-check of check-changed-hooks.sh in a throwaway repository: a changed hook runs its test and
# the test that imports it, a failure exits 2, and the stop after that only reports.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
cd "${WORK}"
git init -q
mkdir -p scripts/extensions/hooks dot_claude/hooks/a/test dot_claude/hooks/b/test dot_claude/hooks/c/test
cp "${HERE}/check-changed-hooks.sh" scripts/extensions/hooks/
echo 'console.log("a ran"); process.exit(1);' >dot_claude/hooks/a/test/check.ts
# Each fake test fails, so each test that runs shows as a FAILED line.
printf '// imports "../../a/core.ts"\nprocess.exit(1);\n' >dot_claude/hooks/b/test/check.ts
echo 'process.exit(1);' >dot_claude/hooks/c/test/check.ts
git add -A
git -c user.name=example -c user.email=example@example.com -c core.hooksPath=/dev/null commit -qm seed

run() { echo "$1" | scripts/extensions/hooks/check-changed-hooks.sh; }
[[ "$(run '{}' 2>&1)" == "" ]] || {
  echo "FAIL: no change runs no test"
  exit 1
}
echo 'x' >dot_claude/hooks/a/core.ts
set +e
out="$(run '{"stop_hook_active":false}' 2>&1)"
status=$?
set -e
[[ $status == 2 ]] || {
  echo "FAIL: exit $status, not 2"
  exit 1
}
[[ $out == *"FAILED: dot_claude/hooks/a/test/check.ts"*"a ran"* ]] || {
  echo "FAIL: a: $out"
  exit 1
}
[[ $out == *"FAILED: dot_claude/hooks/b/test/check.ts"* ]] || {
  echo "FAIL: b imports a but did not run: $out"
  exit 1
}
[[ $out != *"dot_claude/hooks/c/"* ]] || {
  echo "FAIL: c ran without a change: $out"
  exit 1
}
out="$(run '{"stop_hook_active":true}')"
[[ $(jq -r .systemMessage <<<"$out") == *"FAILED: dot_claude/hooks/a/test/check.ts"* ]] ||
  {
    echo "FAIL: report-only stop: $out"
    exit 1
  }
echo "all pass"
