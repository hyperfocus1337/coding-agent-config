# lint-code implementation

This file holds the design detail that you do not need to use the hook. [`README.md`](../README.md) tells what the hook does and how to set it.

## Files

| File                                             | Deployed to `~/.claude/hooks/lint-code/` | Role                                                                      |
| ------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------- |
| `core.ts`                                        | Yes                                      | Finds the files, picks the linter, and runs it through an `Io`            |
| `hooks/register.ts`, `hooks/hooks.json`          | Yes                                      | Claude Code mod                                                           |
| `dot_claude-plugin/plugin.json`                  | Yes, as `.claude-plugin/plugin.json`     | Plugin manifest                                                           |
| `pi.ts`                                          | Yes                                      | The pi extension, which omp also loads                                    |
| `omp.ts`                                         | Yes                                      | The omp extension, after `pi.ts`: the omp calls that `pi.ts` does not see |
| `command.ts`                                     | Yes                                      | Codex command hook                                                        |
| `io.ts`                                          | Yes                                      | The `Io` and the settings under Node, for `pi.ts` and `command.ts`        |
| `config/dot_yamllint`, `config/dot_ansible-lint` | Yes, as `.yamllint` and `.ansible-lint`  | Linter configs                                                            |
| `README.md`, `docs/`, `test/`                    | No                                       | Kept in the repo by `.chezmoiignore`                                      |

## Paths in a Bash command

A `Write` or `Edit` payload names the file in `tool_input.file_path`. A Bash payload names none. Before the hook read the command text, a file that a shell command wrote (`cat > setup.py <<'EOF'`, a `sed -i`, a redirect) reached no linter, and the error showed only when a later `Edit` touched the same file.

The `NAMED` pattern in [`core.ts`](../core.ts) takes each word of the command that ends in a supported extension. A path ends at a space or at one of the characters ``: ; | & " ' ` ( ) < > =``.

A named path is not always a written path. `cat app.py` names the file too, and to block a read on an error that was already in the file helps nobody. So the hook lints a named file only when its mtime is within 120 seconds of the hook run, which separates a file that the command wrote from a file that it read.

A command that writes early and then runs for minutes falls outside that window and is missed. A `shortcut:` comment in `core.ts` marks this trade-off. The upgrade is a start time that a hook stamps before the call.

## Failed calls

A Bash call that exits with a code other than 0 can still have written a file, as in `cat > setup.py <<'EOF' ... EOF && python setup.py`. So the hook lints a failed call too:

- **Claude Code:** the mod runs after `next` for each result. It passes a call that a hook denied (`deny`) through without a lint.
- **pi and omp:** pi sends `tool_result` for each result.
- **Codex:** Codex sends `PostToolUse` for each Bash call.

## Temporary paths on macOS

macOS resolves `/tmp` to `/private/tmp` and `$TMPDIR` to `/private/var/folders/...`. The path in a payload holds that prefix, but `$TMPDIR` does not. So both sides of the comparison drop a leading `/private`. Before this fix, a scratchpad script blocked the tool result on lint errors that nobody had to fix.

## Ansible markers

`isAnsible` in [`core.ts`](../core.ts) matches the content of a file with the pattern `^\s*(- )?(hosts|tasks|roles|ansible\.builtin\.):`, line by line. A key can have spaces before it, so a nested `tasks:` also matches, not only a top-level key.

The pattern needs a colon right after `ansible.builtin.`. So a module key such as `ansible.builtin.copy:` does not match, and that branch of the pattern finds no real file. Such a file goes to `ansible-lint` only when its path or name matches.
