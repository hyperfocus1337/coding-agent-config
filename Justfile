set shell := ["bash", "-cu"]

REPO     := justfile_directory()
SCRIPTS  := REPO / "scripts"
CLAUDE_HOME := env("CLAUDE_HOME", env("HOME") / ".claude")

# Run `just` with no args to show available commands.
default:
    @just --list

# Wire ~/.claude into the repo (symlinks settings, hooks, skills, rules).
symlink:
    "{{SCRIPTS}}/integration/symlink.sh"

# Install plugins, MCP servers, and dependencies. Runs symlink first.
plugins:
    "{{SCRIPTS}}/plugins/install.sh"

# Full bootstrap: symlink + plugins. Idempotent.
setup: plugins

# git pull, then re-run setup. Use after upstream changes.
update:
    git pull --ff-only
    @just setup

# Shellcheck all scripts.
lint:
    shellcheck "{{SCRIPTS}}"/integration/*.sh "{{SCRIPTS}}"/plugins/*.sh

# Format scripts in place. shfmt walks scripts/ recursively (by shebang/.sh).
fmt:
    shfmt -w -i 2 -ci "{{SCRIPTS}}"

# Check formatting without writing. Non-zero exit if anything would change.
fmt-check:
    shfmt -d -i 2 -ci "{{SCRIPTS}}"

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
    check "{{CLAUDE_HOME}}/settings.json"        "{{REPO}}/.claude/settings.json"
    check "{{CLAUDE_HOME}}/CLAUDE.md"            "{{REPO}}/.claude/CLAUDE.md"
    for rule in "{{REPO}}"/.claude/rules/*.md; do
      [[ "$(basename "$rule")" == "README.md" ]] && continue
      check "{{CLAUDE_HOME}}/rules/$(basename "$rule")" "$rule"
    done
    exit "$fail"

# Remove timestamped settings.json backups left by symlink.sh.
clean-backups:
    #!/usr/bin/env bash
    set -u # error on unbound variables
    shopt -s nullglob # glob expands to empty array if no matches
    files=("{{CLAUDE_HOME}}"/settings.json.bak.*)
    if (( ${#files[@]} == 0 )); then # nullglob: empty array = no backups found
      echo "No settings.json backups in {{CLAUDE_HOME}}/."
      exit 0
    fi
    printf 'Will remove:\n'; printf '  %s\n' "${files[@]}"
    read -r -p "Proceed? [y/N] " ans
    if [[ "$ans" == "y" || "$ans" == "Y" ]]; then rm -f "${files[@]}" && echo "Removed."; else echo "Aborted."; fi
