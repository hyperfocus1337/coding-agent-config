#!/bin/bash

set -e

# Deploy apm.yml deps (MCP servers + skills) to user scope. Idempotent.

# Resolve repo root from this script's location.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Stage manifest: `apm install -g` reads ~/.apm/, not $PWD.
mkdir -p "$HOME/.apm"
cp "$REPO_ROOT/apm.yml" "$HOME/.apm/apm.yml"

# Install latest. No committed lockfile: we always want newest upstream skills.
# --update: re-resolve refs to latest every run (else the ~/.apm lock apm writes
# on first run pins subsequent runs). --force: overwrite on collision (idempotent
# re-runs, adopt pre-existing skills).
apm install -g --update --force
