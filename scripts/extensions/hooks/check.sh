#!/usr/bin/env bash
# Check the hooks in dot_claude/hooks that have moved to TypeScript:
#   1. tsc over each mod (hooks/register.ts) against the Claude Code types,
#   2. tsc over each pi, omp, and Codex adapter (pi.ts, omp.ts, command.ts),
#      the Codex wrappers in dot_codex/hooks, and the git hooks in
#      dot_config/git/hooks against the pi types,
#   3. tsc over each test/check.ts in dot_claude/hooks against both sets of
#      types, because a test imports the mod and the pi adapter,
#   4. `claude plugin validate` over each mod, which catches what tsc cannot,
#      such as `$` passed as a value,
#   5. node over each test/check.ts of both hook folders and over
#      dot_codex/hooks/test/apply-patch.ts,
#   6. type-check-diff.sh against type-check.diff, so that type-check-tsc and
#      type-check-pyrefly stay the same where they must.
#
# A failed step does not stop the later steps. The script lists the failed
# steps at the end and exits 1.
#
# Both sets of types differ per machine, so the tsconfigs are generated here.
set -euo pipefail
shopt -s nullglob

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HOOKS="${REPO}/dot_claude/hooks"
CODEX_HOOKS="${REPO}/dot_codex/hooks"
GIT_HOOKS="${REPO}/dot_config/git/hooks"

for tool in claude node tsc; do
  command -v "${tool}" >/dev/null || {
    echo "missing: ${tool}" >&2
    exit 1
  }
done

# An interactive Claude Code session writes its types beside each mod it loads
# from a CLAUDE_CODE_PLUGIN_DIRS folder, as .claude-plugin/types/, at every
# load. A claude -p run does not. That copy matches the installed version. Set
# CLAUDE_CODE_TYPES to a folder that holds claude-code/index.d.ts to skip the
# search.
if [[ -z ${CLAUDE_CODE_TYPES:-} ]]; then
  for types in "${HOME}"/.claude/hooks/*/.claude-plugin/types; do
    if [[ -f ${types}/claude-code/index.d.ts ]]; then
      CLAUDE_CODE_TYPES="${types}"
      break
    fi
  done
fi
[[ -n ${CLAUDE_CODE_TYPES:-} ]] || {
  {
    echo "Claude Code types not found in ~/.claude/hooks/*/.claude-plugin/types."
    echo "Run just chezmoi, then start one interactive Claude Code session (not claude -p)."
    echo "Or set CLAUDE_CODE_TYPES to a folder that holds claude-code/index.d.ts."
  } >&2
  exit 1
}

PI_PACKAGE="$("${REPO}/scripts/extensions/pi/package.sh")"

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

FAILED=()
# Runs one step and records its name when it fails.
step() {
  local name="$1"
  shift
  echo "==> ${name}"
  "$@" || FAILED+=("${name}")
}

# The engine's own tsconfig sets the options and the type roots of a mod. A mod
# imports ../core.ts, so core.ts must also compile with no Node and no DOM.
cat >"${WORK}/mod.tsconfig.json" <<JSON
{
  "extends": "${CLAUDE_CODE_TYPES}/tsconfig.json",
  "compilerOptions": { "allowImportingTsExtensions": true },
  "include": ["${HOOKS}/*/hooks/register.ts"]
}
JSON

# The Node types come in through the pi declarations, which reference them.
cat >"${WORK}/node.tsconfig.json" <<JSON
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "types": [],
    "paths": { "@earendil-works/pi-coding-agent": ["${PI_PACKAGE}/dist/index.d.ts"] }
  },
  "include": ["${HOOKS}/*/pi.ts", "${HOOKS}/*/omp.ts", "${HOOKS}/*/command.ts", "${CODEX_HOOKS}/*.ts", "${CODEX_HOOKS}/test/*.ts", "${GIT_HOOKS}/*/main.ts", "${GIT_HOOKS}/*/test/*.ts"]
}
JSON

# The tests run in Node and import the mods, so they need both sets of types.
cat >"${WORK}/test.tsconfig.json" <<JSON
{
  "extends": "${WORK}/node.tsconfig.json",
  "compilerOptions": {
    "typeRoots": ["${CLAUDE_CODE_TYPES}"],
    "types": ["claude-code", "claude-code-tools", "claude-code-mcp"]
  },
  "include": ["${HOOKS}/*/test/*.ts"]
}
JSON

step "tsc mods ($(head -1 "${CLAUDE_CODE_TYPES}/claude-code/index.d.ts" | sed 's|^// ||'))" \
  tsc -p "${WORK}/mod.tsconfig.json"
step "tsc pi, omp, Codex, and git adapters" tsc -p "${WORK}/node.tsconfig.json"
step "tsc hook tests" tsc -p "${WORK}/test.tsconfig.json"

# validate reads .claude-plugin/, which chezmoi names dot_claude-plugin/ in the
# repository, so it runs on a copy.
validate() {
  local hook="$1" report
  cp -R "${HOOKS}/${hook}" "${WORK}/${hook}"
  mv "${WORK}/${hook}/dot_claude-plugin" "${WORK}/${hook}/.claude-plugin"
  report="$(claude plugin validate "${WORK}/${hook}" 2>&1)" || {
    printf '%s\n' "${report}" >&2
    return 1
  }
}
for manifest in "${HOOKS}"/*/dot_claude-plugin/plugin.json; do
  hook="$(basename "$(dirname "$(dirname "${manifest}")")")"
  step "claude plugin validate ${hook}" validate "${hook}"
done

# A subshell, so that the cd does not reach the later steps.
test_hook() (cd "$1" && PI_PACKAGE="${PI_PACKAGE}" node test/check.ts)
for check in "${HOOKS}"/*/test/check.ts "${GIT_HOOKS}"/*/test/check.ts; do
  step "${check#"${REPO}"/}" test_hook "${check%/test/check.ts}"
done
step "dot_codex/hooks/test/apply-patch.ts" node "${CODEX_HOOKS}/test/apply-patch.ts"

same_type_checks() {
  local here="scripts/extensions/hooks"
  diff "${REPO}/${here}/type-check.diff" <("${REPO}/${here}/type-check-diff.sh") || {
    echo "type-check-tsc and type-check-pyrefly differ in a new way. Make the same change in both, or, if the change is meant to differ, run: ${here}/type-check-diff.sh >${here}/type-check.diff" >&2
    return 1
  }
}
step "type-check-tsc and type-check-pyrefly in step" same_type_checks

if ((${#FAILED[@]})); then
  printf 'FAILED: %s\n' "${FAILED[@]}" >&2
  exit 1
fi
