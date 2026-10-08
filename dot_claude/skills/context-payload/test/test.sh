#!/usr/bin/env bash
# Test for parent_settings() in capture-request.py: the --settings flag that a
# new capture copies from the `claude` session above it. Run: bash test.sh
# A fake session is a bash process renamed to `claude` with `exec -a`, which
# runs `sh -c python3`, like the Bash tool in a real session.
set -u

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/capture-request.py"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail=0
echo '{}' >"$tmp/settings.json"
minimal="$HOME/.claude/settings-minimal.json"

# Print parent_settings() from under a fake session with the given arguments.
# The trailing `:` stops bash and sh from replacing themselves with the child.
run() {
  out=$(bash -c 'exec -a claude bash -c "sh -c \"python3 -B -c \\\"$0\\\" 2>&1; :\"; :" "$@"' \
    "import importlib.util as u; s = u.spec_from_file_location('c', '$SCRIPT'); m = u.module_from_spec(s); s.loader.exec_module(m); print(m.parent_settings())" \
    "$@")
}

check() { # name, expected substring in output
  if [[ "$out" != *"$2"* ]]; then
    echo "FAIL $1: got $out, wanted $2"; fail=1; return
  fi
  echo "ok   $1"
}

run --settings "$tmp/settings.json"
check "file value" "['--settings', '$tmp/settings.json']"

run '--settings={"model": "sonnet"}'
if [[ "$(uname)" == Darwin ]]; then
  # macOS has no /proc: the value is split on its space (shortcut in parent_settings).
  check "inline JSON with a space falls back on macOS" "['--settings', '$minimal']"
else
  check "inline JSON after =" "['--settings', '{\"model\": \"sonnet\"}']"
fi

run --dangerously-skip-permissions
check "session without --settings" "[]"

run --settings /nonexistent/settings.json
check "unreadable value warns" "warning: cannot read the parent --settings"
check "unreadable value falls back" "['--settings', '$minimal']"

exit "$fail"
