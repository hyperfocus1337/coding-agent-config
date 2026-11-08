import type { Formatter } from "../core.ts";

/**
 * Aligns each table in the files of ORG_TABLE_FILES, one per line. Alignment only: a #+TBLFM
 * formula is not evaluated. org-link-descriptive nil counts a link at its raw width, so the table
 * is straight in a diff too. docs/org-tables.md "Alignment only" and "Links count at their raw
 * width".
 */
const ELISP = `
(progn
  (setq make-backup-files nil create-lockfiles nil org-link-descriptive nil)
  (dolist (file (split-string (getenv "ORG_TABLE_FILES") "\\n" t))
    (with-current-buffer (find-file-noselect file)
      (org-mode)
      (goto-char (point-min))
      (while (re-search-forward "^[ \\t]*|" nil t)
        (when (org-at-table-p)
          (org-table-align)
          (goto-char (org-table-end))))
      (save-buffer))))`;

export const orgTables: Formatter = {
  name: "Emacs org-table-align",
  key: "org-tables",
  extensions: ["org"],
  // Only a file with a line that starts with `|` can hold a table, which keeps Emacs out of the
  // common case. docs/org-tables.md "Files without tables".
  wants: (text) => /^[ \t]*\|/m.test(text),
  // One Emacs for all files: the 1.4 s is the start of Emacs. --no-init-file keeps the user's
  // init out. docs/org-tables.md "One Emacs run for every file".
  runs: async (files, cwd) => [
    {
      argv: ["emacs", "--batch", "--no-init-file", "--eval", ELISP],
      cwd,
      env: { ORG_TABLE_FILES: files.join("\n") },
    },
  ],
};
