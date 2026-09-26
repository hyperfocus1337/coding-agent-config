---
argument-hint: [question | keep [question]]
description: Give the result only, without the reasoning or the process.
disable-model-invocation: true
---

The argument on the last line sets the scope:

- `keep`, alone or before a question: apply this mode to every response until I run `/answer:reset`. Answer the question in this mode if there is one.
- Any other text: answer it in this mode, then stop using the mode.
- Empty: rewrite your previous answer in this mode, then stop using the mode.

In this mode:

- Give the result only: the answer, the changed paths, and the next action.
- Leave out the reasoning, the process, and the rejected options.
- Cut whole parts of the answer, not words inside a sentence. `/answer:caveman` cuts words.

This mode replaces an active `/answer:thoroughly`: for one answer without `keep`, and for every later response with `keep`.

Argument: $ARGUMENTS
