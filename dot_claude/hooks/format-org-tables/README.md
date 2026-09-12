# format-org-tables

A `PostToolUse` hook that realigns [Org mode](https://orgmode.org/) tables after Claude writes a `.org` file, using Emacs in batch mode. This is the single source of truth for the design notes the hook script only points at; `hook.sh` keeps its inline comments short and references the sections below by name.

## Why this is a separate hook

[`format-all-languages`](../format-all-languages/) covers everything Prettier parses, and Prettier has no Org parser, so `.org` is not in its extension list and never will be. Org table alignment is `org-table-align`, an Emacs function, so the tool, the invocation, and the failure modes share nothing with the Prettier hook. Keeping it standalone means it needs none of that hook's machinery (no git sweep, no markdown/code split, no `--print-width` reasoning) and can be removed by deleting one `settings.json` entry.

## The problem it solves

Claude writes files through `Write` and `Edit`, not through an editor, so nothing runs `org-table-align`. Every table Claude touches lands with its columns unpadded:

```org
| Key | Action | Note |
|---|---|---|
| ⌘ ⇧ P | command palette | wide glyphs |
| a | short | x |
```

Valid Org, unreadable as plain text. Emacs realigns it on the next manual edit, but only if you open the file, and only for the table the cursor sits in. VSCode `editor.formatOnSave` cannot help either: the file is written outside the editor, so no save event fires.

## Triggers

The hook is wired to two matchers in `settings.json`, and tells them apart by whether the tool payload carries `tool_input.file_path`. On both paths, anything that is not an existing `.org` file is a clean skip.

### Write / Edit / MultiEdit (single file)

The payload names exactly one file in `tool_input.file_path`. The hook aligns that file.

### Bash (the paths the command names)

A Bash call carries no `file_path`, but a shell command (a heredoc, `sed`, a redirect) writes `.org` files often enough to matter. This hook used to skip them all: a literate Emacs configuration written through heredocs kept two misaligned tables until they were found by hand.

So on the Bash matcher the hook takes every `.org` path the command text names, absolute or relative to the session cwd, and aligns those. It asks git nothing, unlike the markdown sweep in [`format-all-languages`](../format-all-languages/README.md), because a command that writes an Org file names the file. A command that rewrites one without naming it (a script it calls, a `find -exec`) is still missed, and that file stays misaligned until the next `Edit` touches it.

Relative paths resolve against the session cwd, so a `cd` elsewhere in the command can resolve one wrong. The `-f` check makes that a silent miss, or at worst a no-op pass over an already aligned file of the same name.

#### Write and commit in one command

A single Bash call can write a file, commit it, and push it. Aligning the file afterwards fixes the file, not the commit: the commit still holds the unaligned version, and the working tree is now dirty. Only Claude can amend, so the hook says so, through `hookSpecificOutput.additionalContext` naming the files it changed. The hint is emitted only when the command text contains `git commit` and a file the hook aligned is now dirty. `git diff --quiet` exits 1 for "the file differs" and 128 for "no repo here", so a file outside a repo does not report.

## One Emacs run for every file

The Bash path can name several files, and the cost of alignment is Emacs startup, not the work. So every target goes into one `emacs --batch` call, through the `ORG_TABLE_FILES` environment variable, and the elisp loops over the list. Five files cost 1.6s in one run against 6.7s in five runs.

Passing the files as command line arguments would work as well, since batch Emacs visits each one, but then the elisp has to find them again in the buffer list. The variable is the list, so the loop reads it directly.

## Alignment only

The hook loops over the buffer and calls `org-table-align` on each table:

```elisp
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
      (save-buffer))))
```

Org ships a one-call alternative, `org-table-recalculate-buffer-tables`, which produces byte-identical output and is not used here. It also **evaluates every `#+TBLFM` formula in the file**. Silently recomputing spreadsheet formulas on every edit is a real way to lose data, and it is not what a formatter was asked to do. The explicit loop is alignment and nothing else. It is also faster: ~1.4s versus ~3.3s on a ~1000 line file with ~90 tables.

The `org-at-table-p` guard matters because the regexp also matches `|` lines inside `#+begin_example` and similar blocks, where alignment must not apply. `(goto-char (org-table-end))` skips past each table so its body rows are not rescanned.

Alignment is Org's own, so it follows Org's conventions rather than Prettier's: display width is used for the padding, which is why `⌘ ⇧ ⌃ ⌥` glyphs line up correctly, and columns holding only numbers are right-aligned.

The pass is idempotent. An already-aligned file comes out byte-identical.

`make-backup-files` and `create-lockfiles` are switched off before the buffer is touched. Both default to on, and with backups on, `save-buffer` drops a `file.org~` next to every Org file the hook formats, which is exactly the kind of litter a background hook must not leave behind.

## Files without tables

Before starting Emacs at all, the hook greps the file for a line beginning with `|`. No match means no table, so there is nothing to align and the hook exits: 0.02s instead of 1.4s. Most Org files are prose, so this is the common case. The grep is deliberately loose (a `|` inside an `#+begin_example` block is enough to pass it); it only decides whether starting Emacs is worthwhile, and `org-at-table-p` makes the real per-table decision.

## `--no-init-file` is required

Without it, Emacs loads the user's full init (Doom, in this setup) on every hook run, and the hook goes from ~1.4s to far past its timeout. With it, only bundled Org loads. The ~1.4s is almost entirely Emacs startup; the alignment work itself is negligible, which is why the `settings.json` timeouts are 5s on the edit matcher and 10s on the Bash matcher, where the file list can be longer.

## Never blocks Claude

Always exits `0`. A missing `emacs` or `jq` self-disables the hook (the `command -v` checks bail cleanly), and any Emacs failure is swallowed with the file left untouched. A formatter should reshape working files, not reject an edit.

Emacs batch runs emit a harmless locale warning on `stderr` (`LANG=… cannot be used, using en_US.UTF-8 instead`); the hook silences `stderr` along with everything else, so it never surfaces as hook noise.

## Installing Emacs

Any `emacs` on `PATH` works, and Org mode is bundled with it, so there is nothing else to install:

```sh
brew install emacs
```

Tested against GNU Emacs 30.2. Without Emacs installed the hook is a no-op.

## Tests

`test/test.sh` runs the hook against both matchers with a temporary fixture: the file an edit names, a file that is not `.org`, a path that does not exist, a second pass over an aligned file, the backup litter, a `|` line inside a block, a `#+TBLFM` formula, a relative and two absolute paths in a command, a command that names no `.org` file, and the amend notice after a commit. It needs `jq`, `emacs`, and `git`, and skips loudly without them.

```sh
bash test/test.sh
```
