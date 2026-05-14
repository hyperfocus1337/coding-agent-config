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
mkdir -p "$CLAUDE_HOME/commands" "$CLAUDE_HOME/skills"
success "Ensured $CLAUDE_HOME/{commands,skills}/"
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

# ── Hooks ────────────────────────────────────────────────────────────────────
# Symlink the whole hooks/ directory if the repo provides one. Scripts inside
# are referenced from settings.json by absolute path ($HOME/.claude/hooks/...).
if [[ -d "$REPO/.claude/hooks" ]]; then
  info "Linking hooks..."
  symlink "$REPO/.claude/hooks" "$CLAUDE_HOME/hooks"
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
# Global settings file. Cannot be safely merged automatically — warn if the
# user already has their own and let them merge by hand.
if [[ -f "$REPO/.claude/settings.json" ]]; then
  info "Linking settings.json..."
  if [[ -f "$CLAUDE_HOME/settings.json" && ! -L "$CLAUDE_HOME/settings.json" ]]; then
    warn "~/.claude/settings.json already exists and is not a symlink."
    warn "Merge the repo's settings.json manually (e.g. with jq) to preserve your config:"
    warn "  diff '$CLAUDE_HOME/settings.json' '$REPO/.claude/settings.json'"
  else
    symlink "$REPO/.claude/settings.json" "$CLAUDE_HOME/settings.json"
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

success "Done. Commands, skills, hooks, statusline, and settings are available globally."
info  "Keep assets up to date:  git -C '$REPO' pull"
