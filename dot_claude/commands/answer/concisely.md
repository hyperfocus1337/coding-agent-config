---
argument-hint: [question | keep [question]]
description: Report back extremely concisely.
disable-model-invocation: true
---

The argument on the last line sets the scope:

- `keep`, alone or before a question: apply this mode to every response until I run `/answer:reset`. Answer the question in this mode if there is one.
- Any other text: answer it in this mode, then stop using the mode.
- Empty: rewrite your previous answer in this mode, then stop using the mode.

In this mode:

When reporting information to me, be extremely concise and sacrifice grammar for the sake of concision.

Argument: $ARGUMENTS
