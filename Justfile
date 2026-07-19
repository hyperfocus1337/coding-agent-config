set shell := ["bash", "-cu"]

# ──────────────────────────────────────────────────────────────────────────────
# Variables
# ──────────────────────────────────────────────────────────────────────────────

REPO := justfile_directory()
SCRIPTS := REPO / "scripts"
TEMPLATES := REPO / "templates"
CLAUDE_HOME := env("CLAUDE_HOME", env("HOME") / ".claude")
CONTAINER := "coding-agent-sandbox-devcontainer"
CONTAINER_USER := "user" # devcontainer runs as non-root `user`; exec as root hits wrong $HOME + missing PATH

# ──────────────────────────────────────────────────────────────────────────────
# Setup & integration
# ──────────────────────────────────────────────────────────────────────────────

# Run `just` with no args to show available commands, grouped by type.
default:
    @just --list --unsorted

# Pull, then run chezmoi and extensions locally and inside the devcontainer (full refresh).
[group('sync')]
update-all:
    @echo "==> Pulling latest from origin/main"
    git pull origin main
    @echo "==> chezmoi diff (what apply will change)"
    @just chezmoi-diff
    @just chezmoi-diff-devcontainer
    @echo "==> Applying chezmoi (local + devcontainer)"
    @just chezmoi-all
    @echo "==> Installing extensions (local + devcontainer)"
    @just extensions-all

# Pull the repo, then re-run chezmoi to refresh $HOME (light, local only).
[group('sync')]
pull:
    @echo "==> Pulling latest from origin/main"
    git pull origin main
    @echo "==> Applying chezmoi"
    @just chezmoi

# --- chezmoi ---

# Apply this repo to $HOME with chezmoi. Repo root is the chezmoi source dir.
[group('chezmoi')]
chezmoi:
    chezmoi apply --source "{{ REPO }}" --destination "{{ env('HOME') }}"

# Run `just chezmoi` inside the devcontainer.
[group('chezmoi')]
chezmoi-devcontainer:
    docker exec -u {{ CONTAINER_USER }} -w /workspaces/coding-agent-config -it {{ CONTAINER }} just chezmoi

# Run `just chezmoi` both locally and inside the devcontainer.
[group('chezmoi')]
chezmoi-all:
    @echo "==> chezmoi: local"
    @just chezmoi
    @echo "==> chezmoi: devcontainer"
    @just chezmoi-devcontainer

# Preview what `just chezmoi` would change without writing anything.
[group('chezmoi')]
chezmoi-diff:
    chezmoi diff --source "{{ REPO }}" --destination "{{ env('HOME') }}"

# Run `just chezmoi-diff` inside the devcontainer.
[group('chezmoi')]
chezmoi-diff-devcontainer:
    docker exec -u {{ CONTAINER_USER }} -w /workspaces/coding-agent-config -it {{ CONTAINER }} just chezmoi-diff

# Track a $HOME file in this repo: `just chezmoi-add ~/.config/foo`.
[group('chezmoi')]
chezmoi-add +PATHS:
    chezmoi add --source "{{ REPO }}" {{ PATHS }}

# --- APM ---

# Deploy APM deps (MCP servers + skills from apm.yml) to user scope only.
[group('apm')]
apm:
    "{{ SCRIPTS }}/extensions/apm/install.sh"

# Run `just apm` inside the devcontainer.
[group('apm')]
apm-devcontainer:
    docker exec -u {{ CONTAINER_USER }} -w /workspaces/coding-agent-config -it {{ CONTAINER }} just apm

# Run `just apm` both locally and inside the devcontainer.
[group('apm')]
apm-all:
    @echo "==> apm: local"
    @just apm
    @echo "==> apm: devcontainer"
    @just apm-devcontainer

# Preview APM changes without writing (reads repo apm.yml, user scope).
[group('apm')]
apm-diff:
    apm install -g --dry-run

# --- Extensions ---

# Run the full extension installer: chezmoi apply, node hook deps, Claude plugins, APM deps.
[group('extensions')]
extensions:
    "{{ SCRIPTS }}/extensions/install.sh"

# Run `just extensions` inside the devcontainer.
[group('extensions')]
extensions-devcontainer:
    docker exec -u {{ CONTAINER_USER }} -w /workspaces/coding-agent-config -it {{ CONTAINER }} just extensions

# Run `just extensions` both locally and inside the devcontainer.
[group('extensions')]
extensions-all:
    @echo "==> extensions: local"
    @just extensions
    @echo "==> extensions: devcontainer"
    @just extensions-devcontainer

# Update all installed plugin marketplaces from their sources.
[group('extensions')]
update-marketplaces:
    "{{ SCRIPTS }}/extensions/plugins/update.sh"

# ──────────────────────────────────────────────────────────────────────────────
# Lint & format
# ──────────────────────────────────────────────────────────────────────────────

# Shellcheck all scripts. find recurses, so nested dirs (e.g. extensions/apm/, templates/web/) are covered.
[group('lint & format')]
lint:
    find "{{ SCRIPTS }}" "{{ TEMPLATES }}" -name '*.sh' -print0 | xargs -0 shellcheck

# Format scripts in place. shfmt walks the roots recursively (by shebang/.sh).
[group('lint & format')]
fmt:
    shfmt -w -i 2 -ci "{{ SCRIPTS }}" "{{ TEMPLATES }}"

# Check formatting without writing. Non-zero exit if anything would change.
[group('lint & format')]
fmt-check:
    shfmt -d -i 2 -ci "{{ SCRIPTS }}" "{{ TEMPLATES }}"

# ──────────────────────────────────────────────────────────────────────────────
# Package
# ──────────────────────────────────────────────────────────────────────────────

# Publish changed skills as versioned GitHub Release assets (patch-bumps on content change).
[group('package')]
publish-skills:
    "{{ SCRIPTS }}/publish/publish-skills.sh"

# Show which skills would publish without creating releases or touching the lock file.
[group('package')]
publish-skills-dry:
    "{{ SCRIPTS }}/publish/publish-skills.sh" --dry-run

# ──────────────────────────────────────────────────────────────────────────────
# Inspect
# ──────────────────────────────────────────────────────────────────────────────

# Show user-scoped MCP servers configured for Claude Code.
[group('inspect')]
mcp-list:
    claude mcp list

# Show APM-managed deps resolved in the lockfile.
[group('inspect')]
apm-list:
    apm list

# Show installed plugins.
[group('inspect')]
plugin-list:
    claude plugin list

# ──────────────────────────────────────────────────────────────────────────────
# Cleanup
# ──────────────────────────────────────────────────────────────────────────────

# Remove timestamped settings.json backups
[group('cleanup')]
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
