#!/usr/bin/env bash
# Type-check the pi extensions in dot_agents/extensions, then run their self-checks.
#
# The pi types ship with the installed package, whose path differs per machine, so
# the tsconfig is generated here from the resolved `pi` binary rather than
# committed with a hard-coded path.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
EXTENSIONS="${REPO}/dot_agents/extensions"

for tool in node pi tsc; do
  command -v "${tool}" >/dev/null || {
    echo "missing: ${tool}" >&2
    exit 1
  }
done

# .../<package>/dist/bundle/cli.js -> .../<package>
PI_PACKAGE="$(cd "$(dirname "$(readlink -f "$(command -v pi)")")/../.." && pwd)"
PI_TYPES="${PI_PACKAGE}/dist/index.d.ts"
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
    "paths": { "@earendil-works/pi-coding-agent": ["${PI_TYPES}"] }
  },
  "include": ["${EXTENSIONS}/*.ts"]
}
JSON

echo "==> tsc ${EXTENSIONS}/*.ts"
tsc -p "${WORK}/tsconfig.json"

for check in "${REPO}"/scripts/extensions/pi/check-*.ts; do
  echo "==> ${check##*/}"
  node "${check}"
done
