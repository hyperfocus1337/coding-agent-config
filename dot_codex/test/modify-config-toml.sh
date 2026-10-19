#!/usr/bin/env bash
# Test for modify_private_config.toml: runs the chezmoi modify script with a
# current config.toml on stdin. Run: bash modify-config-toml.sh
# shellcheck disable=SC2016 # check() evals its single-quoted command later.
set -u

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO/dot_codex/modify_private_config.toml"
command -v uv >/dev/null 2>&1 || { echo "SKIP no uv on PATH"; exit 0; }

in=$(mktemp)
out=$(mktemp)
src=$(mktemp -d) # stands in for the chezmoi source dir that holds .envrc
trap 'rm -rf "$in" "$out" "$src"' EXIT
fail=0

run() { CHEZMOI_SOURCE_DIR="$src" uv run --quiet --script "$SCRIPT"; }
check() { # name, command that must succeed
  if eval "$2" >/dev/null; then echo "ok   $1"; else echo "FAIL $1"; fail=1; fi
}

# A current file as Codex and cmux write it on the host: a /model change, a
# literal string, cmux marker comments, and hooks.state tables split by [tui].
cat >"$in" <<'EOF'
model = "drift-model"
model_reasoning_effort = "low"
project_doc_fallback_filenames = ["OLD.md"]

notify = ["a", "turn-ended"]

[mcp_servers.context7]
args = ["old"]

[shell_environment_policy.set]
SERVICES = '{"browser":"x"}'

[features]
# cmux-codex-hooks-feature-1 begin
hooks = true
# cmux-codex-hooks-feature-1 end
js_repl = false

[hooks.state]

[hooks.state."/a:stop:0:0"]
trusted_hash = "sha256:abc"

[tui]
screen_reader_detection_done = true

# cmux-codex-hook-trust-1 begin
[hooks.state."/a:stop:1:0"]
trusted_hash = "sha256:def"
# cmux-codex-hook-trust-1 end
EOF
run <"$in" >"$out"
check "repo model wins" 'rg -qx "model = \"gpt-6.1-sol\"" "$out" && rg -qx "model_reasoning_effort = \"high\"" "$out"'
check "repo array replaces current" 'rg -qxF "args = [\"-y\", \"@upstash/context7-mcp\"]" "$out" && rg -qx "command = \"npx\"" "$out"'
check "adds key at end of table" 'rg -A1 -x "js_repl = false" "$out" | rg -qx "memories = true"'
check "Codex fallback uses CODEX.md" 'rg -qxF "project_doc_fallback_filenames = [\"CODEX.md\"]" "$out"'
check "changes only repo keys" '[ "$(diff "$in" "$out" | rg -c "^[<>]")" = 10 ]'
check "keeps cmux markers" 'rg -qx "# cmux-codex-hook-trust-1 end" "$out" && rg -qx "# cmux-codex-hooks-feature-1 end" "$out"'
check "keeps literal string" 'rg -qxF "SERVICES = '"'"'{\"browser\":\"x\"}'"'"'" "$out"'
check "keeps table order" '[ "$(rg -n -x "\[tui\]" "$out" | cut -d: -f1)" -lt "$(rg -n -F "[hooks.state.\"/a:stop:1:0\"]" "$out" | cut -d: -f1)" ]'
check "second apply changes nothing" 'run <"$out" | diff -q "$out" -'

run </dev/null >"$out"
check "empty stdin gives repo keys only" '! rg -q "tui|projects" "$out" && rg -qx "\[mcp_servers.context7\]" "$out"'
check "empty stdin adds Codex fallback" 'rg -qxF "project_doc_fallback_filenames = [\"CODEX.md\"]" "$out"'

# Context7 API key: none keeps the current key, else .envrc wins.
printf '[mcp_servers.context7.env]\nCONTEXT7_API_KEY = "old-key"\n' >"$in"
run <"$in" >"$out"
check "no key keeps current key" 'rg -qx "CONTEXT7_API_KEY = \"old-key\"" "$out"'
printf 'export CONTEXT7_API_KEY="envrc-key"\n' >"$src/.envrc"
run <"$in" >"$out"
check "key from .envrc" 'rg -A1 -xF "[mcp_servers.context7.env]" "$out" | rg -qx "CONTEXT7_API_KEY = \"envrc-key\""'

# PreToolUse: this repo's groups 0 and 1 turn on, a cmux group and another
# event stay off, and the trusted_hash stays.
hooks="$HOME/.codex/hooks.json"
cat >"$in" <<EOF
[hooks.state."$hooks:pre_tool_use:0:0"]
trusted_hash = "sha256:a"
enabled = false

[hooks.state."$hooks:pre_tool_use:1:0"]
enabled = false

[hooks.state."$hooks:pre_tool_use:2:0"]
enabled = false

[hooks.state."$hooks:post_tool_use:0:0"]
enabled = false
EOF
run <"$in" >"$out"
check "turns on repo PreToolUse hooks" '[ "$(rg -c "enabled = false" "$out")" = 2 ] && rg -A2 -F "pre_tool_use:0:0\"]" "$out" | rg -qx "trusted_hash = \"sha256:a\""'
check "keeps cmux PreToolUse off" 'rg -A1 -F "pre_tool_use:2:0\"]" "$out" | rg -qx "enabled = false"'
check "keeps other events off" 'rg -A1 -F "post_tool_use:0:0\"]" "$out" | rg -qx "enabled = false"'

check "root Codex alias keeps the single rule source" '[ -L "$REPO/CODEX.md" ] && [ "$(readlink "$REPO/CODEX.md")" = .claude/rules/apply.md ] && [ -f "$REPO/CODEX.md" ]'
check "no root AGENTS.md duplicates the rule in pi" '[ ! -e "$REPO/AGENTS.md" ] && [ ! -L "$REPO/AGENTS.md" ]'
check "chezmoi excludes the project Codex alias" 'rg -qxF "CODEX.md" "$REPO/.chezmoiignore"'

exit "$fail"
