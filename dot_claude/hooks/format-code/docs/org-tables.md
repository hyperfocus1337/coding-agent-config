# Org tables in format-code

[`formatters/org-tables.ts`](../formatters/org-tables.ts) aligns the [Org mode](https://orgmode.org/) tables in the `.org` files of a call, with Emacs in batch mode. The [README](../README.md) tells what the hook does for each formatter. This file gives what is different for Org tables. It was the separate hook `format-org-tables` until 2026-11-08.

## The problem

The model writes files through Write and Edit, not through an editor, so nothing runs `org-table-align`. Each table that the model touches stays without column padding:

```org
| Key | Action | Note |
|---|---|---|
| ⌘ ⇧ P | command palette | wide glyphs |
| a | short | x |
```

This is valid Org, but it is hard to read as plain text. Emacs aligns the table on the next manual edit, but only when you open the file, and only for the table at the cursor. VSCode `editor.formatOnSave` cannot help either: the file changes outside the editor, so no save event occurs. oxfmt has no Org parser.

## Requirements

**Emacs** on `PATH`. Org mode comes with Emacs, so nothing else is necessary. Tested with GNU Emacs 30.1, 30.2, and 31.1. Without Emacs, the hook leaves `.org` files as they are.

```sh
brew install emacs
```

## One Emacs run for every file

The hook aligns all `.org` files of a call in one `emacs --batch --no-init-file` run, and stops Emacs after 10 s. It gives the files to Emacs in the `ORG_TABLE_FILES` environment variable, one path for each line. Command line arguments also work, because batch Emacs opens each file, but then the elisp must find the files again in the buffer list. The variable is the list, so the loop reads it directly.

`--no-init-file` keeps your Emacs init (Doom, in this setup) out of the run, so only the Org mode that comes with Emacs loads. Without it, each run takes much longer than the timeout. One Emacs run costs about 1.4 s, and almost all of it is the start of Emacs. Five files take 1.6 s in one run and 6.7 s in five runs, see [`research.md`](research.md#emacs).

## Files without tables

Before it starts Emacs, the hook reads each file and looks for a line that starts with `|`, through `wants` in the module. A file with no such line has no table, so the hook does not start Emacs for it. Most Org files are prose, so this check keeps Emacs out of the common case: such a file takes 0.02 s.

The check is loose on purpose: a `|` line in a `#+begin_example` block also passes it. It only decides if a start of Emacs is useful. `org-at-table-p` makes the real decision for each table.

## Alignment only

The hook calls `org-table-align` on each table, and does nothing else. It does not evaluate a `#+TBLFM` formula, because a formatter must not recalculate data. A `|` line in a `#+begin_example` block, or in a similar block, is not a table, and the hook does not change it.

The alignment follows the rules of Org, not of Prettier:

- The padding uses the display width, so wide glyphs such as `⌘ ⇧ ⌃ ⌥` align correctly.
- A column with only numbers is aligned to the right.
- A second pass over an aligned file changes no byte.

Emacs writes no backup file (`file.org~`) and no lock file next to the Org file.

## Links count at their raw width

By default, Org hides the brackets and the target of a link such as `[[*Cache][Cache]]`, and `org-table-align` measures only the text that it shows. The table is then straight in Emacs, but not straight in a diff, in Magit, or in a different editor. For `[[*Cache][Cache]]`, the cell gets 12 pad characters fewer than its raw width needs. The hook sets `org-link-descriptive` to `nil`, so it counts each link at its raw width and each `|` is at the same column in the file.

In Emacs, the `org-markup-kinds` package of the Doom config aligns the same way, and pads the hidden link text on the screen.

## The elisp

The hook gives this code to `emacs --batch --no-init-file --eval`:

```elisp
(progn
  (setq make-backup-files nil create-lockfiles nil org-link-descriptive nil)
  (dolist (file (split-string (getenv "ORG_TABLE_FILES") "\n" t))
    (with-current-buffer (find-file-noselect file)
      (org-mode)
      (goto-char (point-min))
      (while (re-search-forward "^[ \t]*|" nil t)
        (when (org-at-table-p)
          (org-table-align)
          (goto-char (org-table-end))))
      (save-buffer))))
```

- The regexp also finds `|` lines in `#+begin_example` and similar blocks. The `org-at-table-p` test skips them.
- `(goto-char (org-table-end))` moves past each table, so the loop does not search its body rows again.
- `make-backup-files` and `create-lockfiles` are on by default. With backups on, `save-buffer` writes a `file.org~` next to each Org file that the hook aligns, and a background hook must not leave such files.

### Why not `org-table-recalculate-buffer-tables`

Org has a one-call alternative, `org-table-recalculate-buffer-tables`, which gives the same bytes. The hook does not use it, because it also evaluates each `#+TBLFM` formula in the file. A silent recalculation of spreadsheet formulas on each edit can cause data loss. The explicit loop is also faster, see [`research.md`](research.md#alignment-loop-and-recalculation).

## What you see

The hook drops the stderr of Emacs, so the locale warning of Emacs batch runs (`LANG=… cannot be used, using en_US.UTF-8 instead`) does not show.

## Settings

| Setting                                              | Effect                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| `git config agent-hook.format-code.org-tables false` | Turns the alignment off in one repository, across sessions.                     |
| `format-code.org-tables` in `AGENT_HOOKS_DISABLE`    | Turns the alignment off for the session. `/toggle-hook format-code.org-tables`. |
