#!/usr/bin/env bash
# ~/.claude/hooks/format-all-languages/hook.sh
#
# PostToolUse hook: format files with Prettier after Claude changes them.
# Full design notes live in README.md next to this script; the comments
# below just name which section explains each step. Never blocks Claude:
# always exits 0. See README "Never blocks Claude".

# --- Preflight ---
# Self-disable if jq is missing rather than erroring on every tool call.
set -u
command -v jq >/dev/null 2>&1 || exit 0

# --- Read payload ---
payload=$(cat)

# --- Collect targets ---
# Target files + the extension filter. See README "Triggers".
file=$(jq -r '.tool_input.file_path // empty' <<<"$payload")

files=()
if [[ -n "$file" ]]; then
  # Write/Edit/MultiEdit: the one file named. README "Write / Edit / MultiEdit".
  files+=("$file")
  exts='md|markdown|js|jsx|ts|tsx|mjs|cjs|json|css|scss|html|yml|yaml'
else
  # Bash: sweep changed + untracked markdown. README "Bash (markdown sweep)".
  cwd=$(jq -r '.cwd // empty' <<<"$payload")
  [[ -n "$cwd" ]] || cwd=$PWD
  top=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || exit 0
  while IFS= read -r rel; do
    [[ -n "$rel" ]] && files+=("$top/$rel")
  done < <(
    { git -C "$top" diff --name-only --diff-filter=d HEAD
      git -C "$top" ls-files --others --exclude-standard; } 2>/dev/null | sort -u
  )
  exts='md|markdown'
fi

# --- Filter to supported files ---
# Keep existing, Prettier-supported files. See README "Supported extensions".
targets=()
for f in "${files[@]}"; do
  [[ -f "$f" ]] || continue
  [[ "${f##*.}" =~ ^(${exts})$ ]] && targets+=("$f")
done

[[ ${#targets[@]} -gt 0 ]] || exit 0

# --- Format ---
# Markdown formats in its own pass at a wide --print-width so wide tables
# stay column-aligned; code keeps the default 80. Full rationale in README
# "Markdown gets its own pass (wide-table alignment)".
# ponytail: tables wider than 400 cols still compact; bump if that bites.
md_targets=()
other_targets=()
for f in "${targets[@]}"; do
  case "${f##*.}" in
    md|markdown) md_targets+=("$f") ;;
    *) other_targets+=("$f") ;;
  esac
done

pretty=(npx --no-install prettier --write --prose-wrap never)
[[ ${#md_targets[@]} -gt 0 ]] && "${pretty[@]}" --print-width 400 "${md_targets[@]}" >/dev/null 2>&1
[[ ${#other_targets[@]} -gt 0 ]] && "${pretty[@]}" "${other_targets[@]}" >/dev/null 2>&1

exit 0
