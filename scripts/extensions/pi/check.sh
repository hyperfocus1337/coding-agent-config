#!/usr/bin/env bash
# Type-check the pi extensions in dot_pi/agent/extensions, then run their self-checks.
#
# The pi types ship with the installed package, whose path differs per machine, so
# the tsconfig is generated here from the resolved `pi` binary rather than
# committed with a hard-coded path.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
EXTENSIONS="${REPO}/dot_pi/agent/extensions"

for tool in node pi tsc; do
  command -v "${tool}" >/dev/null || {
    echo "missing: ${tool}" >&2
    exit 1
  }
done

# The installed pi package, found by package.sh. Set PI_PACKAGE to skip the
# search.
PI_PACKAGE="$("${REPO}/scripts/extensions/pi/package.sh")"
PI_TYPES="${PI_PACKAGE}/dist/index.d.ts"
# pi-tui ships with the pi package, and an extension that draws its own component
# imports it by name; jiti aliases it at run time, tsc needs the path. An installer
# that nests it puts it under the package, one that hoists puts it beside it.
PI_TUI_CANDIDATES=(
  "${PI_PACKAGE}/node_modules/@earendil-works/pi-tui/dist/index.d.ts"
  "$(dirname "${PI_PACKAGE}")/pi-tui/dist/index.d.ts"
)
PI_TUI_TYPES=""
for types in "${PI_TUI_CANDIDATES[@]}"; do
  if [[ -f ${types} ]]; then
    PI_TUI_TYPES="${types}"
    break
  fi
done
[[ -n ${PI_TUI_TYPES} ]] || {
  {
    echo "pi-tui types not found. Tried:"
    printf '  %s\n' "${PI_TUI_CANDIDATES[@]}"
  } >&2
  exit 1
}
[[ -f ${PI_TYPES} ]] || {
  echo "pi types not found at ${PI_TYPES}" >&2
  exit 1
}

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

# track-session-changes imports ./core.ts, which is the chezmoi link
# symlink_core.ts in the repository. rootDirs makes tsc find it in the hook.
cat >"${WORK}/tsconfig.json" <<JSON
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "types": [],
    "rootDirs": ["${EXTENSIONS}/track-session-changes", "${REPO}/dot_claude/hooks/track-session-changes"],
    "paths": {
      "@earendil-works/pi-coding-agent": ["${PI_TYPES}"],
      "@earendil-works/pi-tui": ["${PI_TUI_TYPES}"]
    }
  },
  "include": ["${EXTENSIONS}/*/index.ts"]
}
JSON

echo "==> tsc ${EXTENSIONS}/*/index.ts"
tsc -p "${WORK}/tsconfig.json"

# PI_PACKAGE lets a check assert against the installed pi package, which it cannot
# import: the package sits outside the repository's module resolution.
for check in "${EXTENSIONS}"/*/test/check.ts; do
  echo "==> ${check#"${EXTENSIONS}"/}"
  PI_PACKAGE="${PI_PACKAGE}" node "${check}"
done
