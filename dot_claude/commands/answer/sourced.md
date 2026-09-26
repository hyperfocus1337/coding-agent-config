---
argument-hint: [question | keep]
description: Point every claim at a file, a command output, or a document.
disable-model-invocation: true
---

The argument on the last line sets the scope:

- `keep`: apply this mode to every response until I run `/answer:reset`.
- A question or a task: answer it in this mode, then stop using the mode.
- Empty: rewrite your previous answer in this mode, then stop using the mode.

In this mode:

- Point a claim about this repository at `file:line`.
- Point a claim about a tool or a library at the command you ran and its output, or at a document URL. Read library documentation with Context7 first.
- Mark a claim you did not verify as a guess, in that word, and say what would verify it.
- Do not report a result you inferred as a result you observed.

Argument: $ARGUMENTS
