---
name: prose-cleanup
description: Fix the old prose alerts that the lint-prose hook does not report, across files, directories, the repository, or the files changed since HEAD. Scans with Vale and the hook's rules, asks which files to fix, and fixes them.
argument-hint: <path... | --changed>
disable-model-invocation: true
---

# prose-cleanup

The `lint-prose` hook reports only the paragraphs that a change touches. This skill finds and fixes the old alerts in the rest of the text, with the same Vale rules.

Input: $ARGUMENTS

## Steps

1. Run the scan for the input. It prints one `path:line:column:rule:message` row per alert, and `line` is the first line of the paragraph.

   ```sh
   bash ~/.claude/skills/prose-cleanup/scripts/scan.sh <input>
   ```

   | Input       | Files it checks                                                                                                      |
   | ----------- | -------------------------------------------------------------------------------------------------------------------- |
   | Empty       | The `.md`, `.markdown`, `.org`, `.html`, and `.htm` files in the repository, or in the current directory outside git |
   | Paths       | The named files, a `.txt` file too, and the prose files in the named directories                                     |
   | `--changed` | The prose files that differ from `HEAD`                                                                              |

2. Act on the exit code:
   - 0: report that there is no alert, and stop.
   - 1: go to step 3.
   - 2: the scan did not run, for example because `vale` is missing or a rule is broken. Show the error, and stop.
3. Show the count of alerts per file, and ask which files to fix. Wait for the answer.
   - Four files or fewer: ask through the AskUserQuestion tool.
   - More than four files: ask with a numbered list.
4. Fix each alert in the chosen files. For `Writing.ParagraphLength`, split the paragraph as described under "How to split". Leave the text without an alert as it is.
5. Run the scan again on the fixed files, and fix what it still reports.
6. Do not commit. Report the files you changed, and each alert you left, with the reason.

## How to split

- Insert a paragraph break where the topic, step, or subject changes, so each paragraph holds one idea.
- Turn a sequence of steps into a numbered list, and a comparison of items on shared attributes into a table.
- Rewrite a sentence only where the split needs it, for example to cut a run-on sentence in two or to drop a connector that no longer fits.
- Keep the technical meaning and every fact.
- Keep the markup of the file: Org syntax in an `.org` file, and tags in an `.html` file.
