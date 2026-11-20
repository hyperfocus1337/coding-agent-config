---
argument-hint: "[question]"
description: Give the result only, without the reasoning or the process.
disable-model-invocation: true
---

The argument on the last line sets what the mode applies to:

- A question: answer it in this mode, then stop using the mode.
- Empty: rewrite your previous answer in this mode, then stop using the mode.

In this mode:

- Give the result only: the answer, the changed paths, and the next action.
- Leave out the reasoning, the process, and the rejected options.
- Cut whole parts of the answer, not words inside a sentence.

Argument: $ARGUMENTS
