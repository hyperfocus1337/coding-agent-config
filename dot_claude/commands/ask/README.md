---
disable-model-invocation: true
---

# ask slash commands

Four one-shot commands that ask questions before the work starts. Each takes the task, plan, or idea as its argument, and falls back to my last request when called with no argument. To check that the request was read correctly without questions, use the [restate commands](../restate/README.md).

| Command           | Description                                                                       |
| ----------------- | --------------------------------------------------------------------------------- |
| `/ask:questions`  | Ask every question whose answer changes the work in batches, then do the task.    |
| `/ask:one-by-one` | Ask the same questions one at a time, then do the task.                           |
| `/ask:grill`      | Grill me about the plan with the `mattpocock-skills:grilling` skill, then wait.   |
| `/ask:interview`  | Interview me in depth about an idea, then write a spec file to `.context/plans/`. |

The commands differ in what they start from, how far the questions go, and what they end with.

| Command      | Starts from | Questions                                  | Ends with                    |
| ------------ | ----------- | ------------------------------------------ | ---------------------------- |
| `questions`  | a task      | only the gaps that change the work         | the work done                |
| `one-by-one` | a task      | the same gaps, one per message             | the work done                |
| `grill`      | a plan      | challenges to each decision the plan makes | a confirmed shared plan      |
| `interview`  | an idea     | every area, including the non-obvious ones | a spec file, no work started |

`questions` turns each gap into a question with a recommended answer, then does the task. It delivers a question through the `AskUserQuestion` tool when the answer is a pick from a small set, and as a numbered list when it is open. The tool takes four questions per call, so `questions` asks in batches. Use it when the request is understood but leaves decisions open.

`one-by-one` asks one question per message. After each answer it drops the questions the answer settles and adds the questions it raises. Use it when the answers depend on each other.

`grill` hands the plan to the `mattpocock-skills:grilling` skill, which asks in rounds until every decision in the plan is settled. It does not start the work until I confirm the shared understanding. Use it to stress-test a plan, not to fill a few gaps.

`interview` starts from an idea that has no plan yet. It asks about every area that applies: implementation, UI and UX, data and state, failure modes, concerns, and tradeoffs. It leaves out questions with an obvious answer, and continues in rounds until no open decision is left. Then it writes the decisions to `<cwd>/.context/plans/<slug>-spec.md` and stops. Use it when you want a spec to keep, commit, or hand to a later session, not the work itself.

`questions`, `one-by-one`, and `interview` leave out what they can answer from the code, the repository, or the conversation.
