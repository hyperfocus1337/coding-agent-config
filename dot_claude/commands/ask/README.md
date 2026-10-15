---
disable-model-invocation: true
---

# ask slash commands

Three one-shot commands that ask questions before the work starts. Each takes the task or plan as its argument, and falls back to my last request when called with no argument. To check that the request was read correctly without questions, use the [restate commands](../restate/README.md).

| Command           | Description                                                                     |
| ----------------- | ------------------------------------------------------------------------------- |
| `/ask:questions`  | Ask every question whose answer changes the work in batches, then do the task.  |
| `/ask:one-by-one` | Ask the same questions one at a time, then do the task.                         |
| `/ask:grill`      | Grill me about the plan with the `mattpocock-skills:grilling` skill, then wait. |

`questions` turns each gap into a question with a recommended answer, then does the task. It delivers a question through the `AskUserQuestion` tool when the answer is a pick from a small set, and as a numbered list when it is open. The tool takes four questions per call, so `questions` asks in batches. Use it when the request is understood but leaves decisions open.

`one-by-one` asks one question per message. After each answer it drops the questions the answer settles and adds the questions it raises. Use it when the answers depend on each other.

`grill` hands the plan to the `mattpocock-skills:grilling` skill, which asks in rounds until every decision in the plan is settled. It does not start the work until I confirm the shared understanding. Use it to stress-test a plan, not to fill a few gaps.

`questions` and `one-by-one` leave out what they can answer from the code, the repository, or the conversation.
