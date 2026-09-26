---
argument-hint: [question | keep]
description: Answer as numbered, imperative steps in the order they occur.
disable-model-invocation: true
---

The argument on the last line sets the scope:

- `keep`: apply this mode to every response until I run `/answer:reset`.
- A question or a task: answer it in this mode, then stop using the mode.
- Empty: rewrite your previous answer in this mode, then stop using the mode.

In this mode:

- Number every step. One action per step, in the order it occurs.
- Start each step with a verb: "Open", "Run", "Select".
- Put a command, a path, or a value in the step that uses it.
- Add a reason only where the step fails without it. One line.
- Use prose for what is not a step: a warning, a result, an answer to a question.

Argument: $ARGUMENTS
