---
argument-hint: [question | keep [question]]
description: Answer as numbered, imperative steps in the order they occur.
disable-model-invocation: true
---

The argument on the last line sets the scope:

- `keep`, alone or before a question: apply this mode to every response until I run `/answer:reset`. Answer the question in this mode if there is one.
- Any other text: answer it in this mode, then stop using the mode.
- Empty: rewrite your previous answer in this mode, then stop using the mode.

In this mode:

- List the prerequisites first: the tools, the access, and the state the steps need.
- Number every step. One action per step, in the order it occurs.
- Put a command, a path, or a value in the step that uses it.
- Add a reason only where the step fails without it. One line.
- End with a step that checks the result, and give the expected output.
- Use prose for what is not a step: a warning, a result, an answer to a question.

Argument: $ARGUMENTS
