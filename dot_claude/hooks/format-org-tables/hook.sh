#!/usr/bin/env bash
# ~/.claude/hooks/format-org-tables/hook.sh
#
# PostToolUse and PostToolUseFailure hook: realign Org tables after Claude
# writes a .org file. A Bash command that writes a file and then exits non-zero
# raises the failure event, not PostToolUse, so both are wired.
# Prettier has no Org parser, so format-all-languages skips .org entirely;
# alignment is org-table-align, an Emacs function. Full design notes live in
# README.md next to this script. Never blocks Claude: always exits 0.

# --- Preflight ---
set -u
command -v jq >/dev/null 2>&1 || exit 0
command -v emacs >/dev/null 2>&1 || exit 0

# --- Read payload ---
payload=$(cat)

# The hook is wired to PostToolUse and to PostToolUseFailure, and the amend hint
# below has to name the event that fired: hookEventName is the discriminant of a
# per-event schema, so the wrong literal makes the whole output invalid.
# README "A Bash command that writes a file and then fails".
event=$(jq -r '.hook_event_name // "PostToolUse"' <<<"$payload")

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

  # A named path the command only read must not be realigned and saved: `sed
  # -n ... config.org > copy.org` names the live file, writes another one, and
  # an align of the live file would be an edit nobody asked for. A file the
  # command wrote carries a fresh mtime, so that is the test, the same one
  # lint-all-languages applies.
  # ponytail: a command that writes early and then runs for minutes falls
  # outside the window and is missed. The upgrade is a PreToolUse hook that
  # stamps the start time for the matching call to compare against.
  now=$(date +%s)
  while IFS= read -r path; do
    [[ "$path" == /* ]] || path=$cwd/$path
    [[ -f "$path" ]] || continue
    mtime=$(stat -c %Y "$path" 2>/dev/null || stat -f %m "$path" 2>/dev/null)
    [[ -n "$mtime" ]] || continue
    [[ $((now - mtime)) -le 120 ]] && candidates+=("$path")
  done < <(grep -oE '[^[:space:]:;|&"'"'"'`()<>=]+\.org\b' <<<"$cmd")
fi

# --- Filter to Org files that hold a table ---
# The grep is what keeps Emacs out of the common case. README "Files without
# tables". A command names the same file twice often enough to be worth the
# membership scan; the list is single digits long.
# A scratchpad or temp file is not project prose, and an align there is an edit
# of a file Claude is about to throw away. macOS resolves /tmp to /private/tmp
# and $TMPDIR to /private/var/folders/..., and the scratchpad path Claude
# writes to carries that /private prefix, so both sides of the comparison drop
# it.
tmpdir=${TMPDIR:-/nonexistent}
tmpdir=${tmpdir#/private}
targets=()
for f in "${candidates[@]-}"; do
  [[ "$f" == *.org && -f "$f" ]] || continue
  p=${f#/private}
  [[ "$p" == /tmp/* || "$p" == /var/tmp/* || "$p" == "$tmpdir"* ]] && continue
  [[ " ${targets[*]-} " == *" $f "* ]] && continue
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
    jq -nc --arg files "${dirty[*]}" --arg event "$event" '{
      hookSpecificOutput: {
        hookEventName: $event,
        additionalContext: ("Emacs realigned Org tables after your commit, so the commit holds the unaligned version and the working tree is now dirty: " + $files + ". Fold the alignment into that commit (amend, or a fixup commit if it is already pushed).")
      }
    }'
  fi
fi

exit 0
