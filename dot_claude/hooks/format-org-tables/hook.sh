#!/usr/bin/env bash
# ~/.claude/hooks/format-org-tables/hook.sh
#
# PostToolUse hook: realign Org tables after Claude writes a .org file.
# Prettier has no Org parser, so format-all-languages skips .org entirely;
# alignment is org-table-align, an Emacs function. Full design notes live in
# README.md next to this script. Never blocks Claude: always exits 0.

# --- Preflight ---
# Self-disable if jq or emacs is missing rather than erroring on every edit.
set -u
command -v jq >/dev/null 2>&1 || exit 0
command -v emacs >/dev/null 2>&1 || exit 0

# --- Collect target ---
# Write/Edit/MultiEdit name exactly one file. See README "Triggers".
file=$(jq -r '.tool_input.file_path // empty')
[[ "$file" == *.org && -f "$file" ]] || exit 0

# No table row anywhere means nothing to align, so skip the ~1.4s Emacs
# startup entirely. See README "Files without tables".
grep -qE '^[[:space:]]*\|' "$file" || exit 0

# --- Align ---
# Walk every table in the buffer and align it. Alignment only, deliberately
# not org-table-recalculate-buffer-tables. See README "Alignment only".
# --no-init-file matters: without it a full user init loads and this crawls.
# make-backup-files must be off or save-buffer drops a file.org~ beside it.
emacs --batch --no-init-file "$file" --eval '
(progn
  (setq make-backup-files nil create-lockfiles nil)
  (org-mode)
  (goto-char (point-min))
  (while (re-search-forward "^[ \t]*|" nil t)
    (when (org-at-table-p)
      (org-table-align)
      (goto-char (org-table-end))))
  (save-buffer))' >/dev/null 2>&1

exit 0
