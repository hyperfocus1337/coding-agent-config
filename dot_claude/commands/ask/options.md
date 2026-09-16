---
description: Turn every open decision into a multiple-choice question, then do the task.
argument-hint: <task>
disable-model-invocation: true
---

Task: $ARGUMENTS

If the input is empty, the task is my last request.

Do no work yet. Turn every open decision into a question through the AskUserQuestion tool: two to four concrete options each, the option you recommend first, and one line per option that says what it changes about the result. The tool takes four questions per call, so ask in batches until no decision is left.

Leave out any decision you can settle from the code, the repository, or the conversation. Wait for my picks, then do the task.
