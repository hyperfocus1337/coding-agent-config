#!/usr/bin/env bash
# symlink.sh — wire .claude from the marketplace repo into ~/.claude
#
# Usage:
#   ./scripts/integration/symlink.sh
#   REPO=/path/to/your/clone ./scripts/integration/symlink.sh

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
# Default: the directory two levels above this script (repo root).
# Override by setting REPO before running:  REPO=~/my/path ./symlink.sh
REPO="${REPO:-"$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"}"
CLAUDE_HOME="${CLAUDE_HOME:-"$HOME/.claude"}"
CONFIG_HOME="${XDG_CONFIG_HOME:-"$HOME/.config"}"

# ── Helpers ──────────────────────────────────────────────────────────────────
info()    { printf '\033[1;34m  →\033[0m %s\n' "$*"; }
success() { printf '\033[1;32m  ✓\033[0m %s\n' "$*"; }
warn()    { printf '\033[1;33m  !\033[0m %s\n' "$*"; }
die()     { printf '\033[1;31m  ✗\033[0m %s\n' "$*" >&2; exit 1; }

symlink() {
  local src="$1" dst="$2"
  if [[ -L "$dst" ]]; then
    warn "Already a symlink, skipping: $dst"
  elif [[ -e "$dst" ]]; then
    warn "Path exists and is not a symlink — skipping (handle manually): $dst"
  else
    ln -s "$src" "$dst"
    success "Linked $dst → $src"
  fi
}

# ── Validate repo ─────────────────────────────────────────────────────────────
[[ -d "$REPO/.claude" ]] \
  || die "Expected a .claude/ directory inside REPO='$REPO'. Set REPO to the repo root."

info "Repo:        $REPO"
info "Claude home: $CLAUDE_HOME"
echo

# ── Ensure ~/.claude structure exists ────────────────────────────────────────
mkdir -p "$CLAUDE_HOME/commands" "$CLAUDE_HOME/skills" "$CLAUDE_HOME/rules"
success "Ensured $CLAUDE_HOME/{commands,skills,rules}/"
echo

# ── Commands ─────────────────────────────────────────────────────────────────
# Create real directories for each namespace, then symlink individual command
# files inside them — Claude Code doesn't traverse symlinked directories.
info "Linking commands..."
for group_src in "$REPO/.claude/commands"/*/; do
  [[ -d "$group_src" ]] || continue
  group="$(basename "$group_src")"
  group_dst="$CLAUDE_HOME/commands/$group"
  mkdir -p "$group_dst"
  for cmd_src in "$group_src"*.md; do
    [[ -f "$cmd_src" ]] || continue
    symlink "$cmd_src" "$group_dst/$(basename "$cmd_src")"
  done
done
echo

# ── Skills ───────────────────────────────────────────────────────────────────
info "Linking skills..."
for src in "$REPO/.claude/skills"/*/; do
  [[ -d "$src" ]] || continue
  symlink "$src" "$CLAUDE_HOME/skills/$(basename "$src")"
done
echo

# ── Rules ────────────────────────────────────────────────────────────────────
if [[ -d "$REPO/.claude/rules" ]]; then
  info "Linking rules..."
  for rule_src in "$REPO/.claude/rules"/*.md; do
    [[ -f "$rule_src" ]] || continue
    [[ "$(basename "$rule_src")" == "README.md" ]] && continue  # skip docs, not a rule
    symlink "$rule_src" "$CLAUDE_HOME/rules/$(basename "$rule_src")"
  done
  echo
fi

# ── Hooks ────────────────────────────────────────────────────────────────────
# Symlink each hook subdirectory individually (like commands) so an existing
# ~/.claude/hooks/ directory doesn't block per-hook linking. Scripts inside are
# referenced from settings.json by absolute path ($HOME/.claude/hooks/...).
if [[ -d "$REPO/.claude/hooks" ]]; then
  info "Linking hooks..."
  mkdir -p "$CLAUDE_HOME/hooks"
  for hook_src in "$REPO/.claude/hooks"/*/; do
    [[ -d "$hook_src" ]] || continue
    hook_name="$(basename "$hook_src")"
    symlink "${hook_src%/}" "$CLAUDE_HOME/hooks/$hook_name"

    # Install npm deps in the repo subdir (the symlink target).
    hook_pkg="${hook_src}package.json"
    [[ -f "$hook_pkg" ]] || continue
    if [[ -d "${hook_src}node_modules" ]]; then
      success "Hook deps already installed: $hook_name"
    elif command -v npm >/dev/null 2>&1; then
      info "Installing hook deps: $hook_name"
      (cd "$hook_src" && npm install --silent) \
        && success "Installed $hook_name deps" \
        || warn "npm install failed for $hook_name"
    else
      warn "npm not found — skipping deps for $hook_name"
    fi
  done
  echo
fi

# ── CLAUDE.md ────────────────────────────────────────────────────────────────
info "Linking CLAUDE.md..."
if [[ -f "$CLAUDE_HOME/CLAUDE.md" && ! -L "$CLAUDE_HOME/CLAUDE.md" ]]; then
  warn "~/.claude/CLAUDE.md already exists and is not a symlink."
  warn "Append the repo's CLAUDE.md manually to preserve your existing file:"
  warn "  cat '$REPO/.claude/CLAUDE.md' >> '$CLAUDE_HOME/CLAUDE.md'"
else
  symlink "$REPO/.claude/CLAUDE.md" "$CLAUDE_HOME/CLAUDE.md"
fi
echo

# ── Status line ──────────────────────────────────────────────────────────────
# Referenced from settings.json as $HOME/.claude/statusline-command.sh.
if [[ -f "$REPO/.claude/statusline-command.sh" ]]; then
  info "Linking statusline-command.sh..."
  if [[ -f "$CLAUDE_HOME/statusline-command.sh" && ! -L "$CLAUDE_HOME/statusline-command.sh" ]]; then
    warn "~/.claude/statusline-command.sh already exists and is not a symlink."
    warn "Replace it manually if you want the repo's version:"
    warn "  diff '$CLAUDE_HOME/statusline-command.sh' '$REPO/.claude/statusline-command.sh'"
  else
    symlink "$REPO/.claude/statusline-command.sh" "$CLAUDE_HOME/statusline-command.sh"
  fi
  echo
fi

# ── settings.json ────────────────────────────────────────────────────────────
# Global settings file. Repo version is the source of truth across machines.
# Existing non-symlink files are timestamp-backed-up, then replaced.
if [[ -f "$REPO/.claude/settings.json" ]]; then
  info "Linking settings.json..."
  src="$REPO/.claude/settings.json"
  dst="$CLAUDE_HOME/settings.json"
  if [[ -L "$dst" ]]; then
    current="$(readlink "$dst")"
    if [[ "$current" != "$src" ]]; then
      warn "Symlink points to: $current — repointing to repo."
      rm "$dst"
      ln -s "$src" "$dst"
      success "Repointed $dst → $src"
    else
      success "Already linked: $dst"
    fi
  elif [[ -f "$dst" ]]; then
    backup="$dst.bak.$(date +%Y%m%d%H%M%S)"
    warn "Existing settings.json — backup: $backup"
    mv "$dst" "$backup"
    ln -s "$src" "$dst"
    success "Linked $dst → $src (backup: $backup)"
  else
    ln -s "$src" "$dst"
    success "Linked $dst → $src"
  fi
  echo
fi

# ── ccstatusline settings ────────────────────────────────────────────────────
# Lives outside ~/.claude, at $XDG_CONFIG_HOME/ccstatusline/settings.json.
if [[ -f "$REPO/.config/ccstatusline/settings.json" ]]; then
  info "Linking ccstatusline/settings.json..."
  ccs_dst_dir="$CONFIG_HOME/ccstatusline"
  ccs_dst="$ccs_dst_dir/settings.json"
  mkdir -p "$ccs_dst_dir"
  if [[ -f "$ccs_dst" && ! -L "$ccs_dst" ]]; then
    warn "$ccs_dst already exists and is not a symlink."
    warn "Replace it manually if you want the repo's version:"
    warn "  diff '$ccs_dst' '$REPO/.config/ccstatusline/settings.json'"
  else
    symlink "$REPO/.config/ccstatusline/settings.json" "$ccs_dst"
  fi
  echo
fi

success "Done. Commands, skills, rules, hooks, statusline, and settings are available globally."
info  "Keep assets up to date:  git -C '$REPO' pull"
