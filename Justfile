set shell := ["bash", "-cu"]

# ──────────────────────────────────────────────────────────────────────────────
# Variables
# ──────────────────────────────────────────────────────────────────────────────

REPO := justfile_directory()
SCRIPTS := REPO / "scripts"
SKILLS := REPO / ".claude" / "skills"
DIST := REPO / "dist" / "skills"
CLAUDE_HOME := env("CLAUDE_HOME", env("HOME") / ".claude")

# ──────────────────────────────────────────────────────────────────────────────
# Setup & integration
# ──────────────────────────────────────────────────────────────────────────────

# Run `just` with no args to show available commands.
default:
    @just --list

# Wire ~/.claude into the repo (symlinks settings, hooks, skills, rules).
symlink:
    "{{ SCRIPTS }}/sync/symlink.sh"

# Install plugins, MCP servers, and dependencies. Runs symlink first.
plugins:
    "{{ SCRIPTS }}/extensions/install.sh"

# Full bootstrap: symlink + plugins. Idempotent.
setup: plugins

# git pull, then re-run setup. Use after upstream changes.
update:
    git pull
    @just setup

# ──────────────────────────────────────────────────────────────────────────────
# Sync
# ──────────────────────────────────────────────────────────────────────────────

# Pull the repo, then re-run symlink to refresh ~/.claude.
pull:
    git pull
    @just symlink

# ──────────────────────────────────────────────────────────────────────────────
# Lint & format
# ──────────────────────────────────────────────────────────────────────────────

# Shellcheck all scripts. find recurses, so nested dirs (e.g. extensions/mcp/) are covered.
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

# Show installed plugins.
plugin-list:
    claude plugin list

# Verify ~/.claude symlinks resolve back to this repo.
doctor:
    #!/usr/bin/env bash
    set -u
    fail=0
    check() {
      local path="$1" expected="$2"
      if [[ ! -L "$path" ]]; then
        printf '  ✗ %s — not a symlink\n' "$path"; fail=1; return
      fi
      local target; target="$(readlink "$path")"
      if [[ "$target" != "$expected" ]]; then
        printf '  ✗ %s → %s (expected %s)\n' "$path" "$target" "$expected"; fail=1; return
      fi
      printf '  ✓ %s\n' "$path"
    }
    check "{{ CLAUDE_HOME }}/settings.json"        "{{ REPO }}/.claude/settings.json"
    check "{{ CLAUDE_HOME }}/CLAUDE.md"            "{{ REPO }}/.claude/CLAUDE.md"
    for rule in "{{ REPO }}"/.claude/rules/*.md; do
      [[ "$(basename "$rule")" == "README.md" ]] && continue
      check "{{ CLAUDE_HOME }}/rules/$(basename "$rule")" "$rule"
    done
    exit "$fail"

# ──────────────────────────────────────────────────────────────────────────────
# Cleanup
# ──────────────────────────────────────────────────────────────────────────────

# Remove timestamped settings.json backups left by symlink.sh.
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
