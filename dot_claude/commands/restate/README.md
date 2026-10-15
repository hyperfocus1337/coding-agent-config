---
disable-model-invocation: true
---

# restate slash commands

Nine one-shot commands that write my text back in another form, then wait until I confirm or correct it. Use them after a long brain dump, to check what I wrote and get a clearer version of it. Each takes the text as its argument, and falls back to my previous message when called with no argument. None starts the work before I confirm. To ask questions instead, use the [ask commands](../ask/README.md).

| Command                | Description                                                                    |
| ---------------------- | ------------------------------------------------------------------------------ |
| `/restate:goal`        | The goal and what counts as done, in one or two lines.                         |
| `/restate:assumptions` | Only what was read into the text that it does not say, without the goal.       |
| `/restate:gaps`        | Only what the code and the conversation cannot settle, without the goal.       |
| `/restate:scope`       | The goal, what is in scope, what is out of scope, and what counts as done.     |
| `/restate:decisions`   | The goal, the decisions the text makes, and the decisions it leaves open.      |
| `/restate:outline`     | The text in order under short headings and bullets, nothing removed or added.  |
| `/restate:prompt`      | The text rewritten as one clean prompt, then done as the task after I confirm. |

Two commands combine parts of the commands above in one reply.

| Command         | Description                                                                      |
| --------------- | -------------------------------------------------------------------------------- |
| `/restate:core` | The goal, the assumptions, and what the code and the conversation cannot settle. |
| `/restate:full` | The goal, what is in and out of scope, the assumptions, and the gaps.            |

`goal`, `assumptions`, and `gaps` each give one part. `core` gives all three in one reply, and `full` adds what is in and out of scope. Use `goal` for the fastest check, and `full` when a wrong reading costs the most. `decisions` stays out of `full`: an implied decision is an assumption and an open decision is a gap, so it would only repeat them. `outline` and `prompt` change the form of the text, not only its summary: `outline` keeps every point, and `prompt` also removes repeats and replaces vague references.

Every command except `outline` reads the code, the repository, and the conversation before it writes back. The text goes on the last line of each command file, after the instructions, so a long dump cannot hide an instruction.
