#!/bin/bash

set -e

# Provision the vendor CLIs that carry bundled skills, then install every
# vendor-cli skill the install-skills catalog scopes to `user`.
#
# The binaries are installed unconditionally: a project-scoped install of
# playwright or orbit runs the same CLI from inside the repo, so it must be on
# PATH even when no skill is installed globally here.
#
# The catalog is the single declaration of which skills belong at user scope.
# Rows scoped `project` or `local` are installed per repo by the install-skills
# skill, never here.

# --- Preflight ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CATALOG="$REPO_ROOT/dot_claude/skills/install-skills/references/skills.json"

if ! command -v jq &>/dev/null; then
  echo "ERROR: 'jq' not found in PATH." >&2
  exit 1
fi
if [ ! -f "$CATALOG" ]; then
  echo "ERROR: skill catalog not found at $CATALOG" >&2
  exit 1
fi

# --- Playwright CLI ---
# https://github.com/microsoft/playwright-cli
# Provides the `playwright-cli` binary the playwright skill row runs.
echo "==> Installing playwright-cli"
npm install -g @playwright/cli@latest

# --- glab ---
# Provides the `glab` binary the orbit skill row runs. Update through whichever
# channel owns the on-PATH binary. Skip cleanly when neither brew nor mise
# manages it (e.g. distro package), and skip the upgrade when it's already
# current.
echo "==> Updating glab"
if command -v brew >/dev/null 2>&1 && brew list --formula glab >/dev/null 2>&1; then
  if [ -n "$(brew outdated --formula glab)" ]; then
    HOMEBREW_NO_AUTO_UPDATE=1 brew upgrade glab
  else
    echo "==> glab already up to date"
  fi
elif command -v mise >/dev/null 2>&1 && mise which glab >/dev/null 2>&1; then
  mise upgrade glab
else
  echo "!! glab not managed by brew or mise, skipping update"
fi

# --- User-scope vendor skills ---
# Each row supplies its command and the args that switch it to user scope. Both
# vendor CLIs install into the current project by default, so those args are
# required here. No row is user-scoped today: playwright and orbit are both
# project-candidates, installed per repo by the install-skills skill.
echo "==> Installing user-scope vendor skills"
count=0
while IFS=$'\t' read -r id command global_args; do
  echo "==> Skill: $id"
  # global_args may contain $HOME, which the catalog cannot expand itself.
  global_args="${global_args//\$HOME/$HOME}"
  # shellcheck disable=SC2086 # both are catalog-declared argv, not one word each
  (cd "$HOME" && $command $global_args)
  count=$((count + 1))
done < <(jq -r '.skills[] | select(.channel == "vendor-cli" and .scope == "user") | [.id, .command, .global_args] | @tsv' "$CATALOG")
if [ "$count" -eq 0 ]; then
  echo "==> none declared"
fi
