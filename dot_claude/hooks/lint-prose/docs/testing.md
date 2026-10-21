# lint-prose tests

[`test/check.ts`](../test/check.ts) checks [`core.ts`](../core.ts) and its adapters. It runs `command.ts` with the real Vale, and it runs `pi.ts`, `omp.ts`, and `hooks/register.ts` with stubs over the real files.

## Run the tests

Run the check from the hook directory:

```sh
node test/check.ts
```

`just hooks-check` runs it, with the tests of the other hooks. The check prints `FAIL` and the case name for each case that fails, then the number of failures, and exits 1. When all cases pass, it prints `all pass`.

## Requirements

- **`vale` on `PATH`:** without Vale, the hook turns itself off and every case would pass. So the check prints `SKIP no vale on PATH` and exits 0.
- **`git` on `PATH`:** the changed-paragraph cases use a git repository.
- **Node 23.6 or later:** Node runs the `.ts` files without a flag.

## Test setup

- The check uses the Vale config in the chezmoi source, `dot_config/vale`, through `LINT_PROSE_VALE_DIR`. It does not use the applied copy in `~/.config/vale`.
- The fixtures go in a directory under `$HOME`, `~/.lint-prose-test.*`, because the hook skips `/tmp` and `$TMPDIR`. The check removes the directory at the end.
- The check removes `CLAUDE_HOOKS_DISABLE` and `CLAUDE_LINT_DISABLE`. So a hook that `/toggle-hook` turned off in the agent that runs the check still runs in the check.
- The fixture commits turn off the `format-staged-files` pre-commit hook, so each commit holds the fixture text.

## What the cases check

All groups but the first and the last run `command.ts` on a payload, as Codex does.

| Group                       | What it checks                                                                                                                                                                                                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE_HOOKS_DISABLE`      | When the list names `lint-prose`, `core.ts` runs nothing.                                                                                                                                                                                                                                     |
| Markdown                    | A paragraph or list item with more than 5 sentences blocks. 5 sentences pass. Frontmatter that is not valid YAML, code, and abbreviations are not counted.                                                                                                                                    |
| Org                         | A long paragraph blocks. Keyword lines, headings, and `#+begin_src` blocks are not counted.                                                                                                                                                                                                   |
| HTML                        | `<script>` and `<pre>` are not counted.                                                                                                                                                                                                                                                       |
| Plain text                  | A long paragraph blocks.                                                                                                                                                                                                                                                                      |
| Bash                        | A Bash payload, which names no file, does not block.                                                                                                                                                                                                                                          |
| Only the changed paragraphs | Before the first commit and for an untracked file, the hook checks the whole file. An old long paragraph that did not change is not reported. A change on a later line of a long paragraph, a 6th sentence from an Edit, and a deleted line report it.                                        |
| Once per session            | The first alert blocks. A repeat goes to you with exit code 1, also after the paragraph moves. A changed paragraph that is still too long blocks again. Another session blocks on the same alert.                                                                                             |
| Session record              | A session id with characters outside `A-Z a-z 0-9 _ -` keeps no record. `$TMPDIR` holds one record file for each session.                                                                                                                                                                     |
| Vale failure                | A broken rule and a missing Vale config give a message for you with exit code 1, and do not block.                                                                                                                                                                                            |
| Skips                       | A file that is not prose, `CLAUDE_LINT_DISABLE` with `prose` or `all`, a `vale` shim that fails, a file under `/tmp`, and a file that does not exist give exit code 0 and no output.                                                                                                          |
| Adapters                    | `pi.ts` appends the alerts and marks an error. `omp.ts` checks each file of an edit of more than one file, and leaves an edit of one file to `pi.ts`. `hooks/register.ts` adds the alerts as context. Each sends a repeat to a notification, and leaves a clean file and a failed call alone. |
