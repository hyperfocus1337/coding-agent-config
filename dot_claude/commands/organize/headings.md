---
description: Add headings to a markdown file, or to the lines given.
argument-hint: <file-path>[:<start>-<end>]
disable-model-invocation: true
---

Add headings to $ARGUMENTS. If the path carries line numbers, change only those lines and leave the rest of the file as it is.

1. **Read** the target range. Mark each point where the topic changes.
2. **Draft** one heading per block. Match the heading levels already in the file, and skip no level.
3. **Ask** with `AskUserQuestion`. Show the outline before and after, then wait for the answer.
4. **Apply.** Insert the headings into the same file. A new heading often repeats the topic sentence below it. Cut that sentence, or rewrite the paragraph so it opens with new information.

Move no section. Say so and change nothing when the text already has the headings it needs.
