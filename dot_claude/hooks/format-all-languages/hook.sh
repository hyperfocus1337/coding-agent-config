#!/usr/bin/env bash
# ~/.claude/hooks/format-all-languages/hook.sh
#
# PostToolUse hook: format files with Prettier after Claude changes them.
# Full design notes live in README.md next to this script; the comments
# below just name which section explains each step. Never blocks Claude:
# always exits 0. See README "Never blocks Claude".

# --- Preflight ---
# No jq: self-disable, rather than erroring on every tool call.
set -u
command -v jq >/dev/null 2>&1 || exit 0

# --- Read payload ---
payload=$(cat)

# --- Collect targets ---
# Which files, which extensions. Branches on the matcher. README "Triggers".
edited_file=$(jq -r '.tool_input.file_path // empty' <<<"$payload")

candidates=()
if [[ -n "$edited_file" ]]; then
  # Write/Edit: the one file named. README "Write / Edit / MultiEdit".
  candidates+=("$edited_file")
  ext_filter='md|markdown|js|jsx|ts|tsx|mjs|cjs|json|css|scss|html|yml|yaml'
else
  # Bash: no file named, so sweep instead. README "Bash (markdown sweep)".
  cwd=$(jq -r '.cwd // empty' <<<"$payload")
  [[ -n "$cwd" ]] || cwd=$PWD

  # Roots = cwd + absolute paths in the command; a `cd` there never moves the
  # hook's own cwd. README "Cross-repo Bash edits".
  # ponytail: absolute paths only; relative ones are ambiguous after a cd.
  repo_roots=$(
    { printf '%s\n' "$cwd"
      jq -r '.tool_input.command // empty' <<<"$payload" |
        grep -oE '/[^[:space:]:;|&"'"'"'`()<>]+'
    } | while IFS= read -r path; do
      [[ -d "$path" ]] || path=${path%/*}
      git -C "$path" rev-parse --show-toplevel 2>/dev/null
    done | sort -u
  )
  [[ -n "$repo_roots" ]] || exit 0

  # Per root: changed vs HEAD, plus untracked. Git errors stay silent.
  # A git repo inside a repo is opaque to the parent: an embedded repo lists as
  # a bare `nested/` entry, a submodule as a gitlink path, so their markdown is
  # invisible to the parent sweep. Directory entries queue as roots of their own,
  # which is why the roots are a growing queue and not a fixed list.
  mapfile -t queue <<<"$repo_roots"
  for ((i = 0; i < ${#queue[@]}; i++)); do
    root=${queue[i]}
    while IFS= read -r rel_path; do
      [[ -n "$rel_path" ]] || continue
      if [[ -d "$root/$rel_path" ]]; then
        nested=$(git -C "$root/$rel_path" rev-parse --show-toplevel 2>/dev/null) || continue
        # ponytail: membership scan; roots per sweep stay single digits.
        [[ " ${queue[*]} " == *" $nested "* ]] || queue+=("$nested")
      else
        candidates+=("$root/$rel_path")
      fi
    done < <(
      { git -C "$root" diff --name-only --diff-filter=d HEAD
        git -C "$root" ls-files --others --exclude-standard; } 2>/dev/null | sort -u
    )
  done
  ext_filter='md|markdown'
fi

# --- Filter to supported files ---
# Keep what still exists and Prettier parses. README "Supported extensions".
targets=()
for f in "${candidates[@]}"; do
  [[ -f "$f" ]] || continue
  [[ "${f##*.}" =~ ^(${ext_filter})$ ]] && targets+=("$f")
done

[[ ${#targets[@]} -gt 0 ]] || exit 0

# --- Format ---
# Two passes, because printWidth is global. README "Markdown gets its own pass".
md_targets=()
other_targets=()
for f in "${targets[@]}"; do
  case "${f##*.}" in
    md|markdown) md_targets+=("$f") ;;
    *) other_targets+=("$f") ;;
  esac
done

command -v prettier >/dev/null 2>&1 || exit 0
prettier_cmd=(prettier --write --prose-wrap never)

# Markdown: wide width keeps tables column-aligned. Code: Prettier's default 80.
# ponytail: tables wider than 400 cols still compact; bump if that bites.
[[ ${#md_targets[@]} -gt 0 ]] && "${prettier_cmd[@]}" --print-width 400 "${md_targets[@]}" >/dev/null 2>&1
[[ ${#other_targets[@]} -gt 0 ]] && "${prettier_cmd[@]}" "${other_targets[@]}" >/dev/null 2>&1

exit 0
