---
name: prose-cleanup
description: Fix the old prose alerts that the lint-prose hook does not report, across files, directories, the repository, or the files changed since HEAD. Scans with Vale and the hook's rules or another Vale config, asks which files to fix, and fixes them.
argument-hint: <path... | --changed> [--config FILE | --config repo] [--report]
disable-model-invocation: true
---

# prose-cleanup

The `lint-prose` hook reports only the paragraphs that a change touches. This skill finds and fixes the old alerts in the rest of the text, with the same Vale rules. With `--config`, it uses the rules of another Vale config instead, such as one that loads a [Vale package](https://vale.sh/explorer).

Input: $ARGUMENTS

## Input

| Input       | Files it checks                                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| Empty       | The `.md`, `.markdown`, `.org`, `.html`, and `.htm` files in the repository, or in the current directory outside git |
| Paths       | The named files, a `.txt` file too, and the prose files in the named directories                                     |
| `--changed` | The prose files that differ from `HEAD`                                                                              |

| Option          | Effect                                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--config FILE` | Lint with the rules of the Vale config `FILE` instead of the hook's rules. When the config lists `Packages`, the scan runs `vale sync` first to download them. |
| `--config repo` | Lint with the repository's own `.vale.ini` or `_vale.ini`.                                                                                                     |
| `--report`      | Scan and report, then stop: change no file. The skill handles this option itself, and does not pass it to the scan.                                            |

## Steps

1. Run the scan for the input, without `--report`. It prints one `path:line:column:rule:message` row per alert. For the hook's rules, `line` is the first line of the paragraph.

   ```sh
   bash ~/.claude/skills/prose-cleanup/scripts/scan.sh <input>
   ```

2. Act on the exit code:
   - 0: report that there is no alert, and stop.
   - 1: go to step 3.
   - 2: the scan did not run, for example because `vale` is missing, a rule is broken, or a config does not exist. Show the error, and stop.
3. Show the count of alerts per file and the count per rule. With `--report`, stop here. Otherwise ask which files to fix, and wait for the answer.
   - Four files or fewer: ask through the AskUserQuestion tool.
   - More than four files: ask with a numbered list.
4. Fix each alert in the chosen files. For `Writing.ParagraphLength`, split the paragraph as described under "How to split". For an alert on a score of the whole file, follow "How to raise a score". Leave the text without an alert as it is.
5. Run the scan again on the fixed files, with the same `--config`, and fix what it still reports.
6. Do not commit. Report the files you changed, and each alert you left, with the reason.

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
