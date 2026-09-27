---
description: Split long paragraphs into short ones, one idea each, in pasted prose or in markdown files.
argument-hint: <prose | path...>
disable-model-invocation: true
---

Input: $ARGUMENTS

What to do depends on the input:

- Prose: split it as described under "How to split", and return the result.
- File or directory paths: fix the markdown files there, in the steps below.
- Empty: fix the markdown files in the current repository, in the steps below.

Steps:

1. List the long paragraphs with the command for the input. It prints each paragraph that is too long as `path:line:`. If `vale` is not installed, stop and say so.
   - Files: `bash ~/.claude/hooks/lint-prose/check.sh <files>`
   - Directories: `fd -e md -e markdown . <directories> -X bash ~/.claude/hooks/lint-prose/check.sh`
   - The whole repository: the same `fd` command without `<directories>`.
2. Show the count per file, and ask which files to fix. Wait for the answer.
   - Four files or fewer: ask through the AskUserQuestion tool.
   - More than four files: ask with a numbered list.
3. Fix each reported paragraph in the chosen files, as described under "How to split". Leave the other paragraphs as they are.
4. Run the command from step 1 again on the fixed files, and fix what it still reports.
5. Do not commit. Report the files you changed, and each paragraph you left long, with the reason.

How to split:

- Insert a paragraph break where the topic, step, or subject changes, so each paragraph holds one idea.
- Turn a sequence of steps into a numbered list, and a comparison of items on shared attributes into a table.
- Rewrite a sentence only where the split needs it, for example to cut a run-on sentence in two or to drop a connector that no longer fits.
- Keep the technical meaning and every fact.
