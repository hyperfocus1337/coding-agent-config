---
disable-model-invocation: true
---

# ask slash commands

Two one-shot commands that check the request before the work starts. Each takes the task as its argument, and falls back to my last request when called with no argument.

| Command            | Description                                                         |
| ------------------ | ------------------------------------------------------------------- |
| `/ask:acknowledge` | State the request, the assumptions, and the gaps back, then wait.   |
| `/ask:clarify`     | Ask every question whose answer changes the work, then do the task. |

`acknowledge` asks no question: it writes back the goal, the assumptions it read into the request, and what it cannot settle, then stops until I confirm or correct it. Use it when the risk is a wrong reading of the request, not a missing decision. `clarify` delivers a question through the `AskUserQuestion` tool when the answer is a pick from a small set, and as a numbered list when it is open. The tool takes four questions per call, so `clarify` asks in batches. Both leave out what they can answer from the code, the repository, or the conversation.
