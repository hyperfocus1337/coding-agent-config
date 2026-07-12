set shell := ["bash", "-cu"]

# ──────────────────────────────────────────────────────────────────────────────
# Variables
# ──────────────────────────────────────────────────────────────────────────────

REPO := justfile_directory()
SCRIPTS := REPO / "scripts"
SKILLS := REPO / ".claude" / "skills"
DIST := REPO / "dist" / "skills"
CLAUDE_HOME := env("CLAUDE_HOME", env("HOME") / ".claude")
CONTAINER := "coding-agent-sandbox-devcontainer"

# ──────────────────────────────────────────────────────────────────────────────
# Setup & integration
# ──────────────────────────────────────────────────────────────────────────────

# Run `just` with no args to show available commands.
default:
    @just --list

# --- chezmoi ---

# Apply this repo to $HOME with chezmoi. Repo root is the chezmoi source dir.
chezmoi:
    chezmoi apply --source "{{ REPO }}" --destination "{{ env('HOME') }}"

# Run `just chezmoi` inside the devcontainer.
chezmoi-devcontainer:
    docker exec -w /workspaces/coding-agent-config -it {{ CONTAINER }} just chezmoi

# Run `just chezmoi` both locally and inside the devcontainer.
chezmoi-all:
    @just chezmoi
    @just chezmoi-devcontainer

# Preview what `just chezmoi` would change without writing anything.
chezmoi-diff:
    chezmoi diff --source "{{ REPO }}" --destination "{{ env('HOME') }}"

# Track a $HOME file in this repo: `just chezmoi-add ~/.config/foo`.
chezmoi-add +PATHS:
    chezmoi add --source "{{ REPO }}" {{ PATHS }}

# --- APM ---

# Deploy APM deps (MCP servers + skills from apm.yml) to user scope only.
apm:
    "{{ SCRIPTS }}/extensions/apm/install.sh"

# Run `just apm` inside the devcontainer.
apm-devcontainer:
    docker exec -w /workspaces/coding-agent-config -it {{ CONTAINER }} just apm

# Run `just apm` both locally and inside the devcontainer.
apm-all:
    @just apm
    @just apm-devcontainer

# Preview APM changes without writing (reads repo apm.yml, user scope).
apm-diff:
    apm install -g --dry-run

# --- Extensions ---

# Run the full extension installer: chezmoi apply, node hook deps, Claude plugins, APM deps.
extensions:
    "{{ SCRIPTS }}/extensions/install.sh"

# Run `just extensions` inside the devcontainer.
extensions-devcontainer:
    docker exec -w /workspaces/coding-agent-config -it {{ CONTAINER }} just extensions

# Run `just extensions` both locally and inside the devcontainer.
extensions-all:
    @just extensions
    @just extensions-devcontainer

# Update all installed plugin marketplaces from their sources.
update-marketplaces:
    "{{ SCRIPTS }}/extensions/plugins/update.sh"

# git pull, then re-run extensions. Use after upstream changes.
update:
    git pull
    @just extensions

# ──────────────────────────────────────────────────────────────────────────────
# Sync
# ──────────────────────────────────────────────────────────────────────────────

# Pull the repo, then re-run chezmoi to refresh $HOME.
pull:
    git pull
    @just chezmoi

# ──────────────────────────────────────────────────────────────────────────────
# Lint & format
# ──────────────────────────────────────────────────────────────────────────────

# Shellcheck all scripts. find recurses, so nested dirs (e.g. extensions/apm/) are covered.
lint:
    find "{{ SCRIPTS }}" -name '*.sh' -print0 | xargs -0 shellcheck

# Format scripts in place. shfmt walks scripts/ recursively (by shebang/.sh).
fmt:
    shfmt -w -i 2 -ci "{{ SCRIPTS }}"

# Check formatting without writing. Non-zero exit if anything would change.
fmt-check:
    shfmt -d -i 2 -ci "{{ SCRIPTS }}"

# ──────────────────────────────────────────────────────────────────────────────
# Package
# ──────────────────────────────────────────────────────────────────────────────

# Zip each skill folder into dist/skills/<name>.zip for Claude desktop install.
zip-skills:
    #!/usr/bin/env bash
    set -euo pipefail # exit on error, unset var, or failed pipe
    rm -rf "{{ DIST }}" # wipe stale zips so deleted skills don't linger
    mkdir -p "{{ DIST }}"
    shopt -s nullglob # empty loop instead of literal '*/' when no skills
    found=0
    for dir in "{{ SKILLS }}"/*/; do
      [[ -f "$dir/SKILL.md" ]] || continue # skip dirs that aren't skills (no manifest)
      name="$(basename "$dir")"
      # cd into skills/ first so paths in the zip are relative: archive root is
      # <name>/SKILL.md, which is the layout Claude desktop's importer expects.
      # -r recurse into reference/ etc, -X drop macOS extra attrs, -x skip .DS_Store.
      ( cd "{{ SKILLS }}" && zip -r -X "{{ DIST }}/$name.zip" "$name" -x '*.DS_Store' )
      found=$((found + 1))
    done
    # nullglob makes a skill-less dir silently produce nothing; fail loudly instead.
    if (( found == 0 )); then echo "No skills found in {{ SKILLS }}/."; exit 1; fi
    echo "Zipped $found skill(s) to {{ DIST }}/."

# ──────────────────────────────────────────────────────────────────────────────
# Inspect
# ──────────────────────────────────────────────────────────────────────────────

# Show user-scoped MCP servers configured for Claude Code.
mcp-list:
    claude mcp list

# Show APM-managed deps resolved in the lockfile.
apm-list:
    apm list

# Show installed plugins.
plugin-list:
    claude plugin list

# ──────────────────────────────────────────────────────────────────────────────
# Cleanup
# ──────────────────────────────────────────────────────────────────────────────

# Remove timestamped settings.json backups
clean-backups:
    #!/usr/bin/env bash
    set -u # error on unbound variables
    shopt -s nullglob # glob expands to empty array if no matches
    files=("{{ CLAUDE_HOME }}"/settings.json.bak.*)
    if (( ${#files[@]} == 0 )); then # nullglob: empty array = no backups found
      echo "No settings.json backups in {{ CLAUDE_HOME }}/."
      exit 0
    fi
    printf 'Will remove:\n'; printf '  %s\n' "${files[@]}"
    read -r -p "Proceed? [y/N] " ans
    if [[ "$ans" == "y" || "$ans" == "Y" ]]; then rm -f "${files[@]}" && echo "Removed."; else echo "Aborted."; fi
