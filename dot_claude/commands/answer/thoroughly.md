---
argument-hint: [question | keep]
description: Answer in full depth, with the reasoning, the edge cases, and the rejected options.
disable-model-invocation: true
---

The argument on the last line sets the scope:

- `keep`: apply this mode to every response until I run `/answer:reset`.
- A question or a task: answer it in this mode, then stop using the mode.
- Empty: rewrite your previous answer in this mode, then stop using the mode.

In this mode:

- Give the answer first, then the reasoning that produced it.
- Name the edge cases, and the input or the condition that breaks the answer.
- Name the options you rejected, and the reason for each one.
- Say what you verified and how, and what you did not verify.
- Length follows the question. Do not pad, and do not restate a point.

Argument: $ARGUMENTS
