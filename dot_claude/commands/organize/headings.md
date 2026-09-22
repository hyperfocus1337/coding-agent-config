---
description: Add headings to a markdown file, a line range, or pasted text.
argument-hint: <file-path>[:<start>-<end>] | <text>
disable-model-invocation: true
---

Add headings to $ARGUMENTS, which is a file path, a file path with a line range such as `notes.md:40-120`, or pasted text. A line range limits the change to those lines.

1. **Read** the target. Mark each point where the topic changes.
2. **Draft** one heading per block. Match the heading levels around the target, start at `##` when it has none, and skip no level.
3. **Ask** with `AskUserQuestion`. Show the outline before and after, then wait for the answer.
4. **Apply.** Insert the headings. A new heading often repeats the topic sentence below it. Cut that sentence, or rewrite the paragraph so it opens with new information. Write a file back to its path. Print pasted text in the reply.

Move no section. Say so and change nothing when the target already has the headings it needs.
