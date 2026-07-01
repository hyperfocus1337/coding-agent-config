#!/bin/bash

set -e

# Deploy apm.yml deps (MCP servers + skills) to user scope. Idempotent.

# Resolve repo root from this script's location.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Stage manifest + lockfile: `apm install -g` reads ~/.apm/, not $PWD.
mkdir -p "$HOME/.apm"
cp "$REPO_ROOT/apm.yml" "$HOME/.apm/apm.yml"
cp "$REPO_ROOT/apm.lock.yaml" "$HOME/.apm/apm.lock.yaml"

# Install. --frozen: reproducible against committed lockfile. --force: overwrite
# on collision (idempotent re-runs, adopt pre-existing skills). apm-managed only.
apm install -g --frozen --force
