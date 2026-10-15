---
description: Ask the questions needed before starting one at a time, then do the task.
argument-hint: <task>
disable-model-invocation: true
---

Task: $ARGUMENTS

If the input is empty, the task is my last request.

Do no work yet. Ask every question whose answer changes what you build, one question per message, most important first. Leave out anything you can answer yourself from the code, the repository, or the conversation: read first, ask second.

Ask a question with a small set of possible answers through the AskUserQuestion tool, with the option you recommend first. Ask an open question as one line of text.

After each answer, drop the questions it settles and add the questions it raises. When no such question is left, do the task.
