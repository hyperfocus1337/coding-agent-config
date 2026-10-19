#!/usr/bin/env bash
# Check the hooks in dot_claude/hooks that have moved to TypeScript:
#   1. tsc over each mod (hooks/register.ts) against the Claude Code types,
#   2. tsc over each pi and Codex adapter (pi.ts, command.ts), the Codex
#      wrappers in dot_codex/hooks, and the git hooks in dot_config/git/hooks
#      against the pi types,
#   3. `claude plugin validate` over each mod, which catches what tsc cannot,
#      such as `$` passed as a value,
#   4. node over each test/check.ts of both hook folders and over
#      dot_codex/hooks/test/apply-patch.ts.
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
  "include": ["${HOOKS}/*/pi.ts", "${HOOKS}/*/command.ts", "${CODEX_HOOKS}/*.ts", "${CODEX_HOOKS}/test/*.ts", "${GIT_HOOKS}/*/main.ts", "${GIT_HOOKS}/*/test/*.ts"]
}
JSON

echo "==> tsc mods ($(head -1 "${CLAUDE_CODE_TYPES}/claude-code/index.d.ts" | sed 's|^// ||'))"
tsc -p "${WORK}/mod.tsconfig.json"
echo "==> tsc pi, Codex, and git adapters"
tsc -p "${WORK}/node.tsconfig.json"

# validate reads .claude-plugin/, which chezmoi names dot_claude-plugin/ in the
# repository, so it runs on a copy.
for manifest in "${HOOKS}"/*/dot_claude-plugin/plugin.json; do
  source="$(dirname "$(dirname "${manifest}")")"
  hook="$(basename "${source}")"
  echo "==> claude plugin validate ${hook}"
  cp -R "${source}" "${WORK}/${hook}"
  mv "${WORK}/${hook}/dot_claude-plugin" "${WORK}/${hook}/.claude-plugin"
  report="$(claude plugin validate "${WORK}/${hook}" 2>&1)" || {
    printf '%s\n' "${report}" >&2
    exit 1
  }
done

for check in "${HOOKS}"/*/test/check.ts "${GIT_HOOKS}"/*/test/check.ts; do
  echo "==> ${check#"${REPO}"/}"
  (cd "${check%/test/check.ts}" && PI_PACKAGE="${PI_PACKAGE}" node test/check.ts)
done
echo "==> dot_codex/hooks/test/apply-patch.ts"
node "${CODEX_HOOKS}/test/apply-patch.ts"
