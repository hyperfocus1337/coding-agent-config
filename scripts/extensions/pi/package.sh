#!/usr/bin/env bash
# Print the directory of the installed pi package: the one that holds
# dist/index.d.ts. pi/check.sh and hooks/check.sh type-check against it.
#
# `pi` on PATH is a symlink into the package on some installs and a shim next to
# it on others, so the binary is resolved with node (macOS readlink has no -f
# before 12.3) and its directory is walked up, then the global roots are tried.
# Set PI_PACKAGE to skip the search.
set -euo pipefail

if [[ -n ${PI_PACKAGE:-} ]]; then
  printf '%s\n' "${PI_PACKAGE}"
  exit 0
fi

for tool in node pi; do
  command -v "${tool}" >/dev/null || {
    echo "missing: ${tool}" >&2
    exit 1
  }
done

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

PI_BINARY="$(node -p 'require("node:fs").realpathSync(process.argv[1])' "$(command -v pi)")"

directory="$(dirname "${PI_BINARY}")"
while [[ ${directory} != "/" ]]; do
  if [[ -f ${directory}/dist/index.d.ts ]]; then
    printf '%s\n' "${directory}"
    exit 0
  fi
  directory="$(dirname "${directory}")"
done

# pnpm 11 puts each global install in its own <root>/<hash>/node_modules, as a
# link into its store. pi-tui sits beside the real directory, so print that.
for root in "${GLOBAL_ROOTS[@]}"; do
  for directory in "${root}/@earendil-works/pi-coding-agent" "${root}"/*/node_modules/@earendil-works/pi-coding-agent; do
    if [[ -f ${directory}/dist/index.d.ts ]]; then
      (cd "${directory}" && pwd -P)
      exit 0
    fi
  done
done

{
  echo "pi package not found. pi resolves to:"
  echo "  ${PI_BINARY}"
  echo "and none of its parents, nor these roots, holds dist/index.d.ts:"
  printf '  %s\n' "${GLOBAL_ROOTS[@]}"
  echo "Set PI_PACKAGE to the directory that holds dist/index.d.ts."
} >&2
exit 1
