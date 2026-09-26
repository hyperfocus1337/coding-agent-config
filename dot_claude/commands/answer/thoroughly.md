---
argument-hint: [question | keep [question]]
description: Answer in full depth, with the reasoning, the edge cases, and the rejected options.
disable-model-invocation: true
---

The argument on the last line sets the scope:

- `keep`, alone or before a question: apply this mode to every response until I run `/answer:reset`. Answer the question in this mode if there is one.
- Any other text: answer it in this mode, then stop using the mode.
- Empty: rewrite your previous answer in this mode, then stop using the mode.

In this mode:

- Give the answer first, then the reasoning that produced it.
- Name the edge cases, and the input or the condition that breaks the answer.
- Name the options you rejected, and the reason for each one.
- Say what you verified and how, and what you did not verify.
- Length follows the question. Do not pad, and do not restate a point.

This mode replaces an active `/answer:concisely`: for one answer without `keep`, and for every later response with `keep`.

Argument: $ARGUMENTS
