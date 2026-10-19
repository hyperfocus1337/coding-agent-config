# format-org-tables

Aligns the [Org mode](https://orgmode.org/) tables in the `.org` files that a Write, an Edit, or a Bash call changed, with Emacs in batch mode. This README holds the design notes, and the comments in [`core.ts`](core.ts) name the sections below.

One core, [`core.ts`](core.ts), serves four agents through three adapters:

| Agent       | Adapter                                                                                                   | Loaded by                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Claude Code | [`hooks/register.ts`](hooks/register.ts), a mod: `tool.call` on Write, Edit, and Bash aligns after `next` | `CLAUDE_CODE_PLUGIN_DIRS` in `settings.json.tmpl`                                                  |
| pi and omp  | [`pi.ts`](pi.ts): `tool_result` on write, edit, and bash                                                  | `extensions` in `dot_pi/agent/modify_settings.json` and `dot_omp/private_agent/private_config.yml` |
| Codex       | [`command.ts`](command.ts): the amend hint as `hookSpecificOutput` JSON on stdout                         | `PostToolUse` on Bash, and on `apply_patch` through `dot_codex/hooks/apply-patch.ts`               |

The git pre-commit hook [`format-staged-files`](../../../dot_config/git/hooks/format-staged-files/README.md) also runs `command.ts`, once for each staged file.

## Why this is a separate hook

[`format-prettier`](../format-prettier/) formats the Prettier languages in its extension list, and Prettier has no Org parser, so `.org` is not in its extension list and never will be. Org table alignment is `org-table-align`, an Emacs function, so the tool, the invocation, and the failure modes share nothing with the Prettier hook. Keeping it standalone means it needs none of that hook's machinery (no git sweep, no markdown/code split, no `--print-width` reasoning) and can be turned off alone.

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

The hook runs after each Write, Edit, and Bash call. It tells them apart by whether the call names a file: a Write or an Edit names one in `file_path`, a Bash call names none. On both paths, anything that is not an existing `.org` file is a clean skip.

### Write and Edit (one file)

The call names exactly one file. The hook aligns that file.

### Bash (the paths the command names)

A Bash call carries no `file_path`, but a shell command (a heredoc, `sed`, a redirect) writes `.org` files often enough to matter. This hook used to skip them all: a literate Emacs configuration written through heredocs kept two misaligned tables until they were found by hand.

So on the Bash matcher the hook takes every `.org` path the command text names, absolute or relative to the session cwd, and aligns those. It asks git nothing, unlike the markdown sweep in [`format-prettier`](../format-prettier/README.md), because a command that writes an Org file names the file. A command that rewrites one without naming it (a script it calls, a `find -exec`) is still missed, and that file stays misaligned until the next `Edit` touches it.

Relative paths resolve against the session cwd, so a `cd` elsewhere in the command can resolve one wrong. The file check makes that a silent miss, or at worst a no-op pass over an already aligned file of the same name.

A command names a file it only reads as often as one it writes, and aligning a file the command read is an edit nobody asked for: `sed -n '1,20p' config.org > copy.org` names the live configuration and writes a copy. So a named path counts only when its mtime is inside a 120 s window, the test [`lint-all-languages`](../lint-all-languages/README.md) applies for the same reason. A command that writes early and then runs for minutes falls outside the window and is missed; the upgrade is a `PreToolUse` hook that stamps the start time of the matching call.

#### A Bash command that writes a file and then fails

A shell command that exits with a code other than 0 can still have written a file: `cat > notes.org <<'EOF' ... EOF && just fmt-check` writes the file, then fails the check. Measured on 2026-09-19 with the old command hook, which Claude Code ran only on `PostToolUse`: the exit 0 file came back realigned, the exit 1 file was untouched. The hook then got a second entry on `PostToolUseFailure`.

Each adapter now runs on a failed call too. The mod runs after `next` for each result, pi sends `tool_result` for each result, and Codex runs `PostToolUse` also after a Bash command that exits with a code other than 0. An interrupted command counts too: it can leave a half-written file, and `org-table-align` is safe to run on one.

`command.ts` sends the amend hint below as `hookSpecificOutput`, whose `hookEventName` is the discriminant of a schema for each event. So it reads `hook_event_name` from the payload and echoes it back, and uses `PostToolUse` only when the payload has none.

#### Write and commit in one command

A single Bash call can write a file, commit it, and push it. Aligning the file afterwards fixes the file, not the commit: the commit still holds the unaligned version, and the working tree is now dirty. Only the agent can amend, so the hook tells the model, with a hint that names the files Emacs changed: `context` in the mod, an appended text block in pi, and `hookSpecificOutput.additionalContext` in Codex. In an agent session, the [`format-staged-files`](../../../dot_config/git/hooks/format-staged-files/README.md) pre-commit hook aligns the file before the commit, so this notice appears only when that hook skipped the file: a file with unstaged changes, a `--no-verify` commit, or a machine with no `node` for git. A test of the notice must turn that hook off, or the notice never appears.

Two conditions gate the hint, and both are needed. The file has to be one Emacs itself rewrote, which is a compare of the text of each target before and after the run. And the file has to be one the last commit holds, which is `git diff-tree --no-commit-id --name-only -r --root HEAD`; `--root` is what makes the first commit of a repo answer, since it has no `HEAD~1`. A file outside a repo answers nothing and does not report.

The first condition replaced a `git diff --quiet` test on the working tree, which could not tell the hook's own alignment from a change that was already there. A second session editing the same file, or an unrelated edit of the same file earlier in the session, made the hook report a commit that held nothing to amend, and following the hint would have folded another author's work into the agent's commit.

## One Emacs run for every file

The Bash path can name several files, and the cost of alignment is Emacs startup, not the work. So every target goes into one `emacs --batch` call, through the `ORG_TABLE_FILES` environment variable, and the elisp loops over the list. Five files cost 1.6s in one run against 6.7s in five runs.

Passing the files as command line arguments would work as well, since batch Emacs visits each one, but then the elisp has to find them again in the buffer list. The variable is the list, so the loop reads it directly.

## Alignment only

The hook loops over the buffer and calls `org-table-align` on each table:

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

Org ships a one-call alternative, `org-table-recalculate-buffer-tables`, which produces byte-identical output and is not used here. It also **evaluates every `#+TBLFM` formula in the file**. Silently recomputing spreadsheet formulas on every edit is a real way to lose data, and it is not what a formatter was asked to do. The explicit loop is alignment and nothing else. It is also faster: ~1.4s versus ~3.3s on a ~1000 line file with ~90 tables.

The `org-at-table-p` guard matters because the regexp also matches `|` lines inside `#+begin_example` and similar blocks, where alignment must not apply. `(goto-char (org-table-end))` skips past each table so its body rows are not rescanned.

Alignment is Org's own, so it follows Org's conventions rather than Prettier's: display width is used for the padding, which is why `⌘ ⇧ ⌃ ⌥` glyphs line up correctly, and columns holding only numbers are right-aligned.

The pass is idempotent. An already-aligned file comes out byte-identical.

## Links count at their raw width

`org-link-descriptive` is `t` by default, and then Org hides the brackets and the target of a link such as `[[*Cache][Cache]]`, also in a batch Emacs. `org-table-align` measures a cell by its shown text, so the cell gets 12 fewer pad characters than its raw width needs. The table is straight in an Org buffer that hides links, and crooked in a diff, in Magit and in every other editor. The hook sets `org-link-descriptive` to `nil`, so a link counts at its raw width and each `|` is at the same column in the file. In Emacs, the `org-markup-kinds` package of the Doom config aligns the same way and pads the hidden link text on screen.

`make-backup-files` and `create-lockfiles` are switched off before the buffer is touched. Both default to on, and with backups on, `save-buffer` drops a `file.org~` next to every Org file the hook formats, which is exactly the kind of litter a background hook must not leave behind.

## Files without tables

Before starting Emacs at all, the hook reads the file and looks for a line that starts with `|`. No match means no table, so there is nothing to align and the hook stops: 0.02s instead of 1.4s. Most Org files are prose, so this is the common case. The test is deliberately loose (a `|` inside an `#+begin_example` block is enough to pass it); it only decides whether starting Emacs is worthwhile, and `org-at-table-p` makes the real per-table decision.

## Throwaway files

A path under `/tmp`, `/var/tmp` or `$TMPDIR` is skipped: the scratchpad of the agent lives there, and a file it is about to throw away is not project prose. macOS resolves `/tmp` to `/private/tmp` and `$TMPDIR` to `/private/var/folders/...`, and the path a payload carries holds that prefix while `$TMPDIR` does not, so both sides of the comparison drop a leading `/private`.

## `--no-init-file` is required

Without it, Emacs loads the user's full init (Doom, in this setup) on every hook run, and the hook goes from ~1.4s to far past its timeout. With it, only bundled Org loads. The ~1.4s is almost entirely Emacs startup; the alignment work itself is negligible, which is why the core stops Emacs after 10 s. Codex stops `command.ts` after 10 s, the `timeout` of its entry.

## Never blocks

The hook never blocks a call and never marks a result as an error. A missing `emacs` or a failed Emacs run leaves the file as it is. A formatter should reshape working files, not reject an edit.

| Adapter      | On a failure                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------- |
| Mod          | Claude Code skips a hook that throws, and the result stands.                                  |
| `pi.ts`      | The handler catches the error and returns nothing.                                            |
| `command.ts` | Node exits 1, which Codex shows as a failed hook and does not block. A missing Emacs exits 0. |

Emacs batch runs emit a harmless locale warning on `stderr` (`LANG=… cannot be used, using en_US.UTF-8 instead`); the hook drops the stderr of Emacs, so it never shows as hook noise.

## Installing Emacs

Any `emacs` on `PATH` works, and Org mode is bundled with it, so there is nothing else to install:

```sh
brew install emacs
```

Tested against GNU Emacs 30.1 and 30.2. Without Emacs installed the hook does nothing.

## Requirements

- **Emacs** on `PATH`, see above.
- **git**, for the amend hint.
- **Node 23.6 or later** for `command.ts`, which Codex and `format-staged-files` run. With no `node`, the Codex entry exits 0, and the `SessionStart` check of Codex shows a warning. The mod and `pi.ts` need no `node` of their own.

## Tests

```sh
node test/check.ts
```

[`test/check.ts`](test/check.ts) runs `command.ts` with the real Emacs and git, in a fixture under `$HOME`, because the hook skips `/tmp` and `$TMPDIR`:

- **A Write or Edit:** the named file, a file that is not `.org`, a path that does not exist, a second pass over an aligned file, no backup files, a file in a temp folder, a `|` line inside a block, a `#+TBLFM` formula, and a link at its raw width.
- **A Bash call:** a relative and two absolute paths in a command, a command that names no `.org` file, a path that does not exist, and a path the command only read.
- **The amend hint:** after a commit, and none for a file the run left alone or without a commit.
- **The adapters:** `pi.ts` and `hooks/register.ts` with stubs over the real files.

The check turns off `format-staged-files` with `GIT_CONFIG_*` variables, and skips with a message when git or Emacs is missing.

## Files

| File                                                             | Role                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------- |
| [`core.ts`](core.ts)                                             | Finds the files and runs Emacs. No Node imports.              |
| [`io.ts`](io.ts)                                                 | The file and process functions of the core under Node         |
| [`command.ts`](command.ts)                                       | The command hook for Codex and `format-staged-files`          |
| [`pi.ts`](pi.ts)                                                 | The pi and omp extension                                      |
| [`hooks/register.ts`](hooks/register.ts), `hooks/hooks.json`     | The Claude Code mod                                           |
| [`dot_claude-plugin/plugin.json`](dot_claude-plugin/plugin.json) | The plugin manifest, deployed as `.claude-plugin/plugin.json` |
