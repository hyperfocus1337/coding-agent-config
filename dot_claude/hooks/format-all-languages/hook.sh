#!/usr/bin/env bash
# ~/.claude/hooks/format-all-languages/hook.sh
#
# PostToolUse hook: formats files after Claude changes them. Two triggers:
#
#   Write/Edit/MultiEdit -> tool_input.file_path names one file; format it
#     if prettier handles the extension.
#   Bash -> no file_path. A shell command (sed/perl/echo/redirect) may have
#     rewritten markdown, which would leave tables misaligned until the next
#     edit. So re-format markdown the working tree changed vs HEAD, plus
#     untracked markdown. Scoped to markdown only: sweeping every changed
#     source file on every bash call would fight in-progress edits.
#
# Formatting never blocks Claude: this hook always exits 0, so a missing
# prettier or a parse error just leaves the file untouched.

set -u

command -v jq >/dev/null 2>&1 || exit 0

payload=$(cat)

# --- Collect target files + the extension filter to apply ---
file=$(jq -r '.tool_input.file_path // empty' <<<"$payload")

files=()
if [[ -n "$file" ]]; then
  # Write/Edit/MultiEdit: the single file the tool named. Prettier handles
  # these extensions natively; anything else is filtered out below.
  files+=("$file")
  exts='md|markdown|js|jsx|ts|tsx|mjs|cjs|json|css|scss|html|yml|yaml'
else
  # Bash: sweep markdown the shell command may have touched. stderr silenced
  # so "not a git repository" / no-HEAD never leaks as hook noise.
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

# --- Filter to existing, prettier-supported files ---
targets=()
for f in "${files[@]}"; do
  [[ -f "$f" ]] || continue
  [[ "${f##*.}" =~ ^(${exts})$ ]] && targets+=("$f")
done

[[ ${#targets[@]} -gt 0 ]] || exit 0

# --- Format in place ---
# Split markdown from the rest: markdown gets a wide --print-width so
# prettier keeps aligning table columns instead of collapsing wide tables
# to the compact `| --- |` form (its default under --prose-wrap never past
# printWidth). print-width is global, so code keeps the default 80.
# --no-install: use global/project prettier, never hit the network.
# --prose-wrap never keeps prose (and here also table padding) on one line.
# Errors (no prettier, parse failure) are swallowed; a formatter never
# fails an edit.
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
