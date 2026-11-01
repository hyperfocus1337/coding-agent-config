---
name: prose-cleanup
description: Fix the old prose alerts that the lint-prose hook does not report, across files, directories, the repository, or the files changed since HEAD. Scans with Vale and the hook's rules or another Vale config, asks which files to fix, and fixes them.
argument-hint: "[FILE|DIR... | --changed | --all] [--config FILE] [--report]"
disable-model-invocation: true
---

# prose-cleanup

The `lint-prose` hook reports only the paragraphs that a change touches. This skill finds and fixes the old alerts in the rest of the text, with the same Vale rules. With `--config`, it uses the rules of another Vale config instead, such as one that loads a [Vale package](https://vale.sh/explorer).

## Input

Arguments: $ARGUMENTS

The scope sets which files the scan checks. Give at most one scope. Without a scope, the scan uses `--all`.

| Scope                 | Files it checks                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Paths: `FILE\|DIR...` | Each named file, `.txt` included, and the prose files in each named directory                                            |
| `--changed`           | The prose files that differ from `HEAD`                                                                                  |
| `--all`               | The prose files (`.md`, `.markdown`, `.org`, `.html`, `.htm`) in the repository, or in the current directory outside git |

The options set which Vale rules the scan uses, and whether the skill changes files. Add them to any scope.

| Option          | Effect                                                                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--config FILE` | Use the rules of the Vale config `FILE`, not the hook's rules. For the repository's own rules, give its `.vale.ini`. `--config=FILE` also works. If `FILE` lists `Packages`, the scan runs `vale sync` first. |
| `--report`      | Stop after the counts in step 3 and change no file.                                                                                                                                                           |

## Reports

Each scan writes a report file to this path:

```
~/.local/state/prose-cleanup/<repository>/<YYYYMMDD-HHMMSS>-<kind>[-<config>].txt
```

Two reports compare only with the same `<kind>`, `<config>`, and for `paths`, the same paths.

| Name part      | Value                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `<repository>` | The path of the repository under `$HOME`, with each `/` as `-`, such as `Repositories-agents-coding-agent-config`.            |
| `<kind>`       | `all` for `--all` or no scope, `changed` for `--changed`, `paths` for paths. The `scope:` line of the report gives the paths. |
| `<config>`     | The `--config` file name without `.ini` and a leading dot, such as `readability`. None for the hook's rules.                  |

A header gives the `root`, the `scope`, the `config`, and the `alerts` count. One `path:line:column:rule:message` row follows per alert, with an absolute path. Emacs opens the file in grep mode, so `RET` on a row opens the line of the alert.

The report of `/prose-cleanup docs`:

```
-*- mode: grep -*-
root:   /Users/me/project
scope:  docs
config: the lint-prose hook rules
alerts: 1 in 1 files

/Users/me/project/docs/setup.md:1:4:Writing.ParagraphLength:Paragraph over 5 sentences. Split it at its topic changes, and turn a sequence into a list.
```

A fix run writes two reports with the same input and config: one before the fixes, in step 1 **scan**, and one after, in step 5 **scan again**. The current alerts of the whole repository are in its newest report that ends in `-all.txt`, or in `-all-<config>.txt` for another config.

To find it for the hook's rules:

```sh
fd -- '-all.txt$' ~/.local/state/prose-cleanup/<repository> | sort | tail -1
```

## Steps

1. **Scan.** Run `scan.sh` with the input, but without `--report`: that is an option of the skill, and the scan stops on it. The scan writes the report file, and prints its path, the alert count, and the counts per file and per rule. For the hook's rules, `line` in a row is the first line of the paragraph.

   ```sh
   bash ~/.claude/skills/prose-cleanup/scripts/scan.sh <input>
   ```

2. **Check the exit code.**
   - 0: report that there is no alert, give the report path, and stop.
   - 1: go to step 3.
   - 2: the scan did not run, for example because `vale` is missing, a rule is broken, or a config does not exist. Show the error, and stop.
3. **Show the counts, and ask.** Show the report path, the count of alerts per file, and the count per rule. With `--report`, stop here. Otherwise ask which files to fix, and wait for the answer.
   - Four files or fewer: ask through the AskUserQuestion tool.
   - More than four files: ask with a numbered list.
4. **Fix.** Read the rows of the chosen files from the report, with `rg -F '<absolute path>:' <report>`. Fix each alert, and leave the text without an alert as it is.
   - `Writing.ParagraphLength`, `Writing.ParagraphWords`, `Writing.ListInDisguise`: split the paragraph as described under "How to split".
   - `Writing.SectionWords`: add subheadings where the topic of the section changes, or move detail into a list or table.
   - An alert on a score of the whole file: follow "How to raise a score".
5. **Scan again.** Use the same input and `--config`, so that the new report shows the state of the whole scope after the fix. Fix what it still reports in the chosen files.
6. **Report.** Do not commit. Report the files you changed, each alert you left, with the reason, and the paths of the two reports.

## How to split

- Insert a paragraph break where the topic, step, or subject changes, so each paragraph holds one idea.
- Turn a sequence of steps into a numbered list, and a comparison of items on shared attributes into a table.
- Rewrite a sentence only where the split needs it, for example to cut a run-on sentence in two or to drop a connector that no longer fits.
- Keep the technical meaning and every fact.
- Keep the markup of the file: Org syntax in an `.org` file, and tags in an `.html` file.

## How to raise a score

Some package rules, such as `Readability.FleschKincaid`, rate the whole file and report at line 1. No single edit fixes them.

- Cut long sentences in two, and swap a long word for a short one where the short word means the same.
- Start with the paragraphs that hold the most per-word alerts of the same package, such as `Readability.Polysyllables`.
- Keep technical terms, names, and every fact, even when they lower the score.
- Make one pass, then report the score before and after. Do not rewrite the file again to chase the threshold.
