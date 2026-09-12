#!/usr/bin/env bash
# ~/.claude/hooks/format-org-tables/hook.sh
#
# PostToolUse hook: realign Org tables after Claude writes a .org file.
# Prettier has no Org parser, so format-all-languages skips .org entirely;
# alignment is org-table-align, an Emacs function. Full design notes live in
# README.md next to this script. Never blocks Claude: always exits 0.

# --- Preflight ---
set -u
command -v jq >/dev/null 2>&1 || exit 0
command -v emacs >/dev/null 2>&1 || exit 0

# --- Read payload ---
payload=$(cat)

# --- Collect targets ---
# Branches on the matcher. README "Triggers".
edited_file=$(jq -r '.tool_input.file_path // empty' <<<"$payload")

candidates=()
if [[ -n "$edited_file" ]]; then
  # Write/Edit: the one file named.
  candidates+=("$edited_file")
else
  # Bash: no file named, so read the paths out of the command text instead.
  # README "Bash (the paths the command names)".
  cwd=$(jq -r '.cwd // empty' <<<"$payload")
  [[ -n "$cwd" ]] || cwd=$PWD
  cmd=$(jq -r '.tool_input.command // empty' <<<"$payload")

  # A command that writes and commits in one call leaves the commit holding the
  # unaligned file. README "Write and commit in one command".
  committed=''
  [[ "$cmd" == *"git commit"* ]] && committed=1

  while IFS= read -r path; do
    [[ "$path" == /* ]] || path=$cwd/$path
    candidates+=("$path")
  done < <(grep -oE '[^[:space:]:;|&"'"'"'`()<>=]+\.org\b' <<<"$cmd")
fi

# --- Filter to Org files that hold a table ---
# The grep is what keeps Emacs out of the common case. README "Files without
# tables". A command names the same file twice often enough to be worth the
# membership scan; the list is single digits long.
targets=()
for f in "${candidates[@]}"; do
  [[ "$f" == *.org && -f "$f" ]] || continue
  [[ " ${targets[*]} " == *" $f "* ]] && continue
  grep -qE '^[[:space:]]*\|' "$f" || continue
  targets+=("$f")
done

[[ ${#targets[@]} -gt 0 ]] || exit 0

# --- Align ---
# One Emacs for the whole list: the ~1.4s is startup, so N files cost one
# startup and not N. README "One Emacs run for every file".
ORG_TABLE_FILES=$(printf '%s\n' "${targets[@]}") \
  emacs --batch --no-init-file --eval '
(progn
  (setq make-backup-files nil create-lockfiles nil)
  (dolist (file (split-string (getenv "ORG_TABLE_FILES") "\n" t))
    (with-current-buffer (find-file-noselect file)
      (org-mode)
      (goto-char (point-min))
      (while (re-search-forward "^[ \t]*|" nil t)
        (when (org-at-table-p)
          (org-table-align)
          (goto-char (org-table-end))))
      (save-buffer))))' >/dev/null 2>&1

# --- Report a commit that needs amending ---
# Aligning a file the command already committed fixes the file, not the commit.
# Say so, because only Claude can amend. README "Write and commit in one command".
if [[ -n "${committed:-}" ]]; then
  dirty=()
  for f in "${targets[@]}"; do
    # Status 1 is "the file differs"; 128 is "no repo here", which is not dirty.
    status=0
    git -C "${f%/*}" diff --quiet -- "$f" 2>/dev/null || status=$?
    [[ $status -eq 1 ]] && dirty+=("$f")
  done
  if [[ ${#dirty[@]} -gt 0 ]]; then
    jq -nc --arg files "${dirty[*]}" '{
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: ("Emacs realigned Org tables after your commit, so the commit holds the unaligned version and the working tree is now dirty: " + $files + ". Fold the alignment into that commit (amend, or a fixup commit if it is already pushed).")
      }
    }'
  fi
fi

exit 0
