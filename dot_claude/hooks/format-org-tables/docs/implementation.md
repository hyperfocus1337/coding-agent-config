# format-org-tables: implementation

This file gives the design of [`format-org-tables`](../README.md): why it is a separate hook, the reasons for its rules, and the approaches it does not use. The README tells what the hook does.

## The problem

The model writes files through Write and Edit, not through an editor, so nothing runs `org-table-align`. Each table that the model touches stays without column padding:

```org
| Key | Action | Note |
|---|---|---|
| ⌘ ⇧ P | command palette | wide glyphs |
| a | short | x |
```

This is valid Org, but it is hard to read as plain text. Emacs aligns the table on the next manual edit, but only when you open the file, and only for the table at the cursor. VSCode `editor.formatOnSave` cannot help either: the file changes outside the editor, so no save event occurs.

## Why this is a separate hook

[`format-prettier`](../../format-prettier/README.md) formats the Prettier languages in its extension list. Prettier has no Org parser, so `.org` is not in that list. Org table alignment is `org-table-align`, an Emacs function, so the tool, the command, and the failure modes are different from the Prettier hook.

As a separate hook, it needs none of the parts of `format-prettier`: no git sweep, no split between Markdown and code, and no `--print-width` logic. You can also turn it off alone.

## Bash calls

### Why the hook reads the command text

A Bash call carries no `file_path`. An earlier version of the hook skipped all Bash calls. A literate Emacs config that the model wrote through heredocs then kept two tables without alignment, until someone found them by hand.

The hook asks git nothing, unlike the Markdown sweep in [`format-prettier`](../../format-prettier/README.md). A command that writes an Org file usually names the file, so the name is sufficient.

### The `cd` folders

The session cwd in the payload is the one from before the command. Without the folders of each `cd`, a relative path after `cd docs && sed -i … notes.org` is a silent miss. The hook does not follow a `cd` to `~`, to `-`, or to a folder with a variable. The upgrade is the cwd of the shell after the command, which the adapters do not get.

### The 120 s mtime window

A command names a file that it only reads as often as a file that it writes. Alignment of a file that the command only read is an edit that nobody asked for: `sed -n '1,20p' config.org > copy.org` names the live config and writes a copy. Thus a named path counts only when its mtime is at most 120 s old.

A command that writes early and then runs for minutes falls outside the window. The upgrade is a `PreToolUse` hook that records the start time of the call.

### A Bash command that writes a file and then fails

A shell command that exits with a code other than 0 can still have written a file: `cat > notes.org <<'EOF' ... EOF && just fmt-check` writes the file, then fails the check. Claude Code once ran the hook as a command hook only on `PostToolUse`, and then the hook missed such a file, see [`research.md`](research.md#a-bash-command-that-fails). The command hook then got a second entry on `PostToolUseFailure`.

Now each adapter also runs on a failed call:

- The mod runs after `next` for each result. It skips a call that was denied.
- pi and omp send `tool_result` for each result.
- Codex runs `PostToolUse` also after a Bash command that exits with a code other than 0.

`command.ts` sends the amend hint as `hookSpecificOutput`. Its `hookEventName` field selects the schema of one event, so it must name the event that occurred. `command.ts` reads `hook_event_name` from the payload and sends it back, and uses `PostToolUse` only when the payload has none.

## The amend hint

The hint compares the text of each target file before and after the Emacs run. An earlier version used `git diff --quiet` on the working tree. That test could not tell the alignment of the hook from a change that was already in the file.

A second session that edited the same file, or an earlier unrelated edit of the file in the same session, then made the hook report a commit that held nothing to amend. If the model followed that hint, it put the work of a different author into its own commit.

`git diff-tree` uses `--root` so that the first commit of a repository also answers, because that commit has no `HEAD~1`.

## The Emacs run

### The elisp

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

### Why `ORG_TABLE_FILES` and not arguments

Command line arguments also work, because batch Emacs opens each file. But then the elisp must find the files again in the buffer list. The variable is the list, so the loop reads it directly.

### `org-table-recalculate-buffer-tables`

Org has a one-call alternative, `org-table-recalculate-buffer-tables`, which gives the same bytes. The hook does not use it, because it also evaluates each `#+TBLFM` formula in the file. A silent recalculation of spreadsheet formulas on each edit can cause data loss. The explicit loop is also faster, see [`research.md`](research.md#alignment-loop-and-recalculation).

### `org-link-descriptive`

`org-link-descriptive` is `t` by default, also in batch Emacs. Then Org hides the brackets and the target of a link, and `org-table-align` measures a cell by the text that it shows. For `[[*Cache][Cache]]`, the cell gets 12 pad characters fewer than its raw width needs. The hook sets `org-link-descriptive` to `nil`.

### The check for a table line

The check for a line that starts with `|` is loose on purpose: a `|` line in a `#+begin_example` block also passes it. It only decides if a start of Emacs is useful. `org-at-table-p` makes the real decision for each table.

## Scratch files

macOS resolves `/tmp` to `/private/tmp`, and `$TMPDIR` to `/private/var/folders/...`. The path in a payload has the `/private` prefix, but `$TMPDIR` does not. Thus the hook removes a leading `/private` from both sides before it compares them.

## Files

| File                                                                | Role                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`core.ts`](../core.ts)                                             | Finds the files and runs Emacs. No Node imports.                          |
| [`io.ts`](../io.ts)                                                 | The file and process functions of the core under Node                     |
| [`command.ts`](../command.ts)                                       | The command hook for Codex and `format-staged-files`                      |
| [`pi.ts`](../pi.ts)                                                 | The pi extension, which omp also loads                                    |
| [`omp.ts`](../omp.ts)                                               | The omp extension, after `pi.ts`: the omp calls that `pi.ts` does not see |
| [`hooks/register.ts`](../hooks/register.ts), `hooks/hooks.json`     | The Claude Code mod                                                       |
| [`dot_claude-plugin/plugin.json`](../dot_claude-plugin/plugin.json) | The plugin manifest, deployed as `.claude-plugin/plugin.json`             |
