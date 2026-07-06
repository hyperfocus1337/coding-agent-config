#!/bin/bash

set -e

# Deploy apm.yml deps (MCP servers + skills) to user scope. Idempotent.

# APM resolves the Claude target relative to CLAUDE_CONFIG_DIR. Point it at the
# container user's home when that home exists and no caller value is set. On the
# host (no /home/$USER) we leave it unset so APM uses claude's built-in default.
CONTAINER_HOME="/home/$(whoami)"
if [ -z "${CLAUDE_CONFIG_DIR:-}" ] && [ -d "$CONTAINER_HOME" ]; then
  export CLAUDE_CONFIG_DIR="$CONTAINER_HOME/.claude"
fi

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
