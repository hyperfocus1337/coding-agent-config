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

# The installed pi package is the directory that holds dist/index.d.ts. `pi` on
# PATH is a symlink into it on some installs and a shim next to it on others, so
# the binary is resolved with node (macOS readlink has no -f before 12.3) and its
# directory is walked up, then the global roots are tried. Set PI_PACKAGE to skip
# the search.
GLOBAL_ROOTS=(
  "$(dirname "$(dirname "$(command -v node)")")/lib/node_modules"
  "${NPM_CONFIG_PREFIX:-}/lib/node_modules"
  "${BUN_INSTALL:-${HOME}/.bun}/install/global/node_modules"
  "${HOME}/.local/lib/node_modules"
)
for manager in pnpm npm; do
  command -v "${manager}" >/dev/null || continue
  root="$("${manager}" root -g 2>/dev/null || true)"
  if [[ -n ${root} ]]; then
    GLOBAL_ROOTS+=("${root}")
  fi
done

find_pi_package() {
  local directory root
  directory="$(dirname "$(node -p 'require("node:fs").realpathSync(process.argv[1])' "$(command -v pi)")")"
  while [[ ${directory} != "/" ]]; do
    if [[ -f ${directory}/dist/index.d.ts ]]; then
      printf '%s\n' "${directory}"
      return 0
    fi
    directory="$(dirname "${directory}")"
  done
  for root in "${GLOBAL_ROOTS[@]}"; do
    if [[ -f ${root}/@earendil-works/pi-coding-agent/dist/index.d.ts ]]; then
      printf '%s\n' "${root}/@earendil-works/pi-coding-agent"
      return 0
    fi
  done
  return 1
}

PI_PACKAGE="${PI_PACKAGE:-$(find_pi_package || true)}"
[[ -n ${PI_PACKAGE} ]] || {
  {
    echo "pi package not found. pi resolves to:"
    echo "  $(node -p 'require("node:fs").realpathSync(process.argv[1])' "$(command -v pi)")"
    echo "and none of its parents, nor these roots, holds dist/index.d.ts:"
    printf '  %s\n' "${GLOBAL_ROOTS[@]}"
    echo "Set PI_PACKAGE to the directory that holds dist/index.d.ts."
  } >&2
  exit 1
}
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
