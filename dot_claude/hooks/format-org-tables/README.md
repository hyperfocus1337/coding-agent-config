# format-org-tables

Aligns the [Org mode](https://orgmode.org/) tables in the `.org` files that a Write, an Edit, or a Bash call changed, with Emacs in batch mode. The model writes files outside an editor, so nothing else runs `org-table-align`, and each table that the model touches stays without column padding.

One core, [`core.ts`](core.ts), serves four agents through three adapters:

| Agent       | Adapter                                                                                                                                                                 | Loaded by                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Claude Code | [`hooks/register.ts`](hooks/register.ts), a mod: `tool.call` on Write, Edit, and Bash aligns after `next`                                                               | `CLAUDE_CODE_PLUGIN_DIRS` in `settings.json.tmpl`                                    |
| pi          | [`pi.ts`](pi.ts): `tool_result` on write, edit, and bash                                                                                                                | `extensions` in `dot_pi/agent/modify_settings.json`                                  |
| omp         | [`pi.ts`](pi.ts) as in pi, and [`omp.ts`](omp.ts): `tool_result` on an omp edit of more than one file, an `ast_edit` that a write to `xd://resolve` applies, and `eval` | `extensions` in `dot_omp/private_agent/private_config.yml`                           |
| Codex       | [`command.ts`](command.ts): the amend hint as `hookSpecificOutput` JSON on stdout                                                                                       | `PostToolUse` on Bash, and on `apply_patch` through `dot_codex/hooks/apply-patch.ts` |

The git pre-commit hook [`format-staged-files`](../../../dot_config/git/hooks/format-staged-files/README.md) also runs `command.ts`, once for each staged file.

## What it checks

The hook runs after each Write, Edit, and Bash call. It also runs after a call that failed, because a Bash command that exits with a code other than 0 can still have written a file. An interrupted command counts too: it can leave a half-written file, and `org-table-align` is safe to run on one.

### Write and Edit

The call names one file in `file_path`. The hook aligns that file.

### Bash

A Bash call names no file, but a shell command (a heredoc, `sed`, a redirect) often writes `.org` files. The hook takes each `.org` path that the command text names, absolute or relative to the session cwd (the working folder of the session before the command). A relative path also resolves against each folder that a `cd` in the command moves to, in order: `cd pkg && cd sub && sed -i … notes.org` tries `notes.org` in the session cwd, in `pkg`, and in `pkg/sub`.

A named path counts only when its mtime is at most 120 s old. Thus a file that the command only read stays as it is, and so does a file of the same name in another folder. [`lint-code`](../lint-code/README.md) uses the same 120 s window.

The hook misses these Bash writes, and the file stays without alignment until the next Edit:

- A command that writes a `.org` file without its name, for example a script that it calls or a `find -exec`.
- A relative path after a `cd` to `~`, to `-`, or to a folder with a variable. The hook does not follow such a `cd`.
- A command that writes the file and then runs for more than 120 s.

### Skipped files

The hook skips each of these files, with no output:

- A file that is not `.org`.
- A path that does not exist or is not a regular file.
- A path under `/tmp`, `/var/tmp`, or `$TMPDIR`. The scratchpad of the agent is there, and a file that the agent will throw away is not project prose.
- A file with no line that starts with `|`. See [Files without tables](#files-without-tables).

## Requirements

- **Emacs** on `PATH`. Org mode comes with Emacs, so nothing else is necessary. Tested with GNU Emacs 30.1, 30.2, and 31.1. Without Emacs, the hook does nothing.
- **git**, for the amend hint.
- **Node 23.6 or later** for `command.ts`, which Codex and `format-staged-files` run. With no `node`, the Codex entry exits 0, and the `SessionStart` check of Codex shows a warning. The mod and `pi.ts` need no `node` of their own.

To install Emacs on macOS:

```sh
brew install emacs
```

## How it works

1. The hook stops when `CLAUDE_HOOKS_DISABLE` names it.
2. It finds the target files, as [What it checks](#what-it-checks) tells.
3. If the call is a Bash command that commits, it keeps the text of each target file.
4. It aligns all target files in one `emacs --batch --no-init-file` run, and stops Emacs after 10 s.
5. If it kept the text in step 3, it compares the text and sends the [amend hint](#write-and-commit-in-one-command) when necessary.

`--no-init-file` keeps your Emacs init (Doom, in this setup) out of the run, so only the Org mode that comes with Emacs loads. Without it, each run takes much longer than the timeout. One Emacs run costs about 1.4 s, and almost all of it is the start of Emacs, see [`docs/research.md`](docs/research.md).

### One Emacs run for every file

A Bash call can name several files. The hook gives all of them to one Emacs run, in the `ORG_TABLE_FILES` environment variable, one path for each line. Five files take 1.6 s in one run and 6.7 s in five runs.

### Files without tables

Before it starts Emacs, the hook reads each file and looks for a line that starts with `|`. A file with no such line has no table, so the hook does not start Emacs for it. Most Org files are prose, so this check keeps Emacs out of the common case.

### Alignment only

The hook calls `org-table-align` on each table, and does nothing else. It does not evaluate a `#+TBLFM` formula, because a formatter must not recalculate data. A `|` line in a `#+begin_example` block, or in a similar block, is not a table, and the hook does not change it.

The alignment follows the rules of Org, not of Prettier:

- The padding uses the display width, so wide glyphs such as `⌘ ⇧ ⌃ ⌥` align correctly.
- A column with only numbers is aligned to the right.
- A second pass over an aligned file changes no byte.

Emacs writes no backup file (`file.org~`) and no lock file next to the Org file.

### Links count at their raw width

By default, Org hides the brackets and the target of a link such as `[[*Cache][Cache]]`, and `org-table-align` measures only the text that it shows. The table is then straight in Emacs, but not straight in a diff, in Magit, or in a different editor. The hook counts each link at its raw width, so each `|` is at the same column in the file.

In Emacs, the `org-markup-kinds` package of the Doom config aligns the same way, and pads the hidden link text on the screen.

## What the model sees

Usually nothing. The hook changes the file and adds no output. The only output for the model is the amend hint.

### Write and commit in one command

A Bash call can write a file and commit it in one command. Alignment after the call fixes the file, but not the commit: the commit holds the version without alignment, and the working tree is dirty. Only the model can amend the commit, so the hook gives the model an amend hint that names the files.

The hook sends the amend hint only when all of these conditions are true:

- The call is a Bash command that commits: `git`, then optional global options such as `-C <dir>`, then `commit`. A Write or an Edit never gets the amend hint.
- Emacs changed the file in this run.
- The last commit holds the file: `git diff-tree --no-commit-id --name-only -r --root HEAD`. A file outside a git repository does not count.

The amend hint is this text, with the paths:

```text
Emacs realigned Org tables after your commit, so the commit holds the unaligned version and the working tree is now dirty: <files>. Fold the alignment into that commit (amend, or a fixup commit if it is already pushed).
```

Each adapter sends it in a different way:

| Adapter           | How the model gets the amend hint                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| Mod               | `context` on the tool result                                                                    |
| `pi.ts`, `omp.ts` | A text block added after the content of the tool result                                         |
| `command.ts`      | `hookSpecificOutput.additionalContext` on stdout, with `hookEventName` from the payload, exit 0 |

In an agent session, the [`format-staged-files`](../../../dot_config/git/hooks/format-staged-files/README.md) pre-commit hook aligns the file before the commit. Thus the amend hint appears only when that hook skipped the file: a file with unstaged changes, a `--no-verify` commit, or a machine with no `node` for git. A test of the amend hint must turn that hook off, or the amend hint never appears.

## What you see

Nothing, when the hook works. The aligned table shows in the diff of the file. The hook drops the stderr of Emacs, so the locale warning of Emacs batch runs (`LANG=… cannot be used, using en_US.UTF-8 instead`) does not show.

## Settings

To turn the hook off until you quit the agent, run [`/toggle-hook`](../toggle-hook/README.md), or add `format-org-tables` to `CLAUDE_HOOKS_DISABLE`. This variable holds a list of hook names, separated by spaces or commas. In Codex, set it before you start Codex.

To turn the hook off for good, remove it from the agent config:

| Agent       | Remove                                                                      |
| ----------- | --------------------------------------------------------------------------- |
| Claude Code | `format-org-tables` from `CLAUDE_CODE_PLUGIN_DIRS` in `settings.json.tmpl`  |
| pi          | The `format-org-tables/pi.ts` line in `dot_pi/agent/modify_settings.json`   |
| omp         | The `format-org-tables` lines in `dot_omp/private_agent/private_config.yml` |
| Codex       | The two `format-org-tables` entries in `dot_codex/modify_hooks.json`        |

The hook reads `TMPDIR` to find the scratch files that it skips. It has no config file.

## Failure behavior

The hook fails open: it never blocks a call and never marks a result as an error. A formatter changes working files, and must not reject an edit. A missing `emacs`, a failed Emacs run, or a run longer than 10 s leaves the file as it is. Codex also stops `command.ts` after 10 s, the `timeout` of its entry.

| Adapter           | On a failure                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Mod               | Claude Code skips a hook that throws, and the result stands.                                  |
| `pi.ts`, `omp.ts` | The handler catches the error and returns nothing.                                            |
| `command.ts`      | Node exits 1, which Codex shows as a failed hook and does not block. A missing Emacs exits 0. |

## Testing

`node test/check.ts` runs `command.ts` and the adapters with the real Emacs and git, see [`docs/testing.md`](docs/testing.md).
