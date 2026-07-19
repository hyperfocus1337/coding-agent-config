#!/bin/bash

set -e

# Deploy apm.yml deps (MCP servers + skills) to user scope. Idempotent.

# --- Config directory ---
# APM resolves the Claude target relative to CLAUDE_CONFIG_DIR. Point it at the
# container user's home when that home exists and no caller value is set. On the
# host (no /home/$USER) we leave it unset so APM uses claude's built-in default.
# waiting for bug fix: https://github.com/microsoft/apm/issues/2060
CONTAINER_HOME="/home/$(whoami)"
if [ -z "${CLAUDE_CONFIG_DIR:-}" ] && [ -d "$CONTAINER_HOME" ]; then
  export CLAUDE_CONFIG_DIR="$CONTAINER_HOME/.claude"
fi

# --- Environment ---
# Resolve repo root from this script's location.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# APM prompts for API keys when they're absent from the env. direnv normally
# loads .envrc, but a fresh checkout (no `direnv allow`) leaves it unset. Source
# .envrc directly so this works with or without direnv.
if [ -z "${CONTEXT7_API_KEY:-}" ] && [ -f "$REPO_ROOT/.envrc" ]; then
  # shellcheck disable=SC1091
  . "$REPO_ROOT/.envrc"
fi

# --- Install ---
# Stage manifest: `apm install -g` reads ~/.apm/, not $PWD.
echo "==> Staging apm.yml manifest"
mkdir -p "$HOME/.apm"
cp "$REPO_ROOT/apm.yml" "$HOME/.apm/apm.yml"

# Install latest. No committed lockfile: we always want newest upstream skills.
# --update: re-resolve refs to latest every run (else the ~/.apm lock apm writes
# on first run pins subsequent runs). --force: overwrite on collision (idempotent
# re-runs, adopt pre-existing skills).
echo "==> Installing apm deps (MCP servers + skills)"
apm install -g --update --force
echo "==> APM install done"
