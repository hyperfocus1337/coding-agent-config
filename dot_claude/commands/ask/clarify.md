---
description: Ask every question needed before starting, then do the task.
argument-hint: <task>
disable-model-invocation: true
---

Task: $ARGUMENTS

If the input is empty, the task is my last request.

Do no work yet. First ask every question whose answer changes what you build. Leave out anything you can answer yourself from the code, the repository, or the conversation: read first, ask second.

Ask a question with a small set of possible answers through the AskUserQuestion tool, with the option you recommend first. The tool takes four questions per call, so ask in batches until no such question is left.

Ask an open question as a numbered list, one line each, most important first. Wait for my answers, then do the task.
