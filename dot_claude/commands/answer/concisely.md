---
argument-hint: [question | keep]
description: Report back extremely concisely.
disable-model-invocation: true
---

The argument on the last line sets the scope:

- `keep`: apply this mode to every response until I run `/answer:reset`.
- A question or a task: answer it in this mode, then stop using the mode.
- Empty: rewrite your previous answer in this mode, then stop using the mode.

In this mode:

When reporting information to me, be extremely concise and sacrifice grammar for the sake of concision.

Argument: $ARGUMENTS
