---
description: Rewrite the text as one clean prompt, then wait for my confirmation.
argument-hint: <text>
disable-model-invocation: true
---

Rewrite the text below as a prompt. If it is empty, rewrite my previous message.

Do no work yet. Read the code, the repository, and the conversation first. Then write one prompt that says the same as the text, in this order: the goal, the context, the constraints, and what counts as done.

- Remove repeats, filler, and false starts.
- Replace a vague reference with the file, command, or name it points to.
- Keep every requirement, and add none that the text does not say.

Under the prompt, list each place where you had to choose between two readings, one line each. Do not start the work. Wait until I confirm or correct the prompt, then do the confirmed prompt as the task.

$ARGUMENTS
