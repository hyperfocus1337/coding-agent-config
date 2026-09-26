---
disable-model-invocation: true
---

# answer slash commands

Seven modes that change how an answer is written, and one command that clears them. A mode changes the shape of the answer, not the work behind it.

| Command              | Changes | Description                                                                      |
| -------------------- | ------- | -------------------------------------------------------------------------------- |
| `/answer:concisely`  | wording | Report back extremely concisely, sacrificing grammar for the sake of concision.  |
| `/answer:caveman`    | wording | Compressed prose: drop articles, filler, and hedging, keep every technical fact. |
| `/answer:thoroughly` | content | Full depth: the reasoning, the edge cases, and the rejected options.             |
| `/answer:simply`     | wording | Plain language for a non-expert, every technical fact kept.                      |
| `/answer:sourced`    | claims  | Every claim points at `file:line`, a command output, or a document.              |
| `/answer:stepwise`   | form    | Numbered imperative steps in the order they occur.                               |
| `/answer:tabular`    | form    | Anything that compares items on shared attributes goes in a table.               |
| `/answer:reset`      | -       | Clear every answer mode and return to `rules/writing.md` alone.                  |

## Scope

The argument sets how long a mode applies. `simply` stands for any mode.

| Call                        | Scope                                                        |
| --------------------------- | ------------------------------------------------------------ |
| `/answer:simply`            | Rewrite the previous answer in the mode, once.               |
| `/answer:simply <question>` | Answer the question in the mode, once.                       |
| `/answer:simply keep`       | Apply the mode to every response until `/answer:reset` runs. |

## When to use

### `/answer:concisely`

- You read answers between other work and want only the result.
- A long task where you check progress often.

### `/answer:caveman`

- You want short answers, but with every fact, number, and path kept. `concisely` can drop detail, `caveman` drops only filler words.
- A long session where reading time adds up.

### `/answer:thoroughly`

- Before an action you cannot undo: a history rewrite, a migration, a deletion.
- A decision you must defend to a reviewer. The rejected options are the questions they will ask.
- You want to learn the area, not only get the result.

### `/answer:simply`

- The topic is outside your expertise: an unfamiliar language, tool, or service.
- You will forward the answer to a person who is not a developer.

### `/answer:sourced`

- You will act on the answer without checking it yourself: an incident, an audit, a security review.
- You suspect that earlier answers were guesses.

### `/answer:stepwise`

- You do a procedure by hand: a setup, a migration, a recovery.
- You will copy the answer into a runbook.

### `/answer:tabular`

- A session that is mostly comparisons: libraries, a setting across environments, CLI flags.
- For one answer, run `/answer:tabular <question>`. For text you already have, use `/docs:table`.

### `/answer:reset`

- A mode you started with `keep` no longer fits. A one-off call needs no reset.
- Before you start a mode that contradicts the active one, for example `thoroughly` after `concisely`. Two such modes do not stack.

## Background

`/answer:concisely` comes from a [Claude Code tip (YouTube Shorts)](https://youtube.com/shorts/I12Mf8KBT1I).

`/answer:caveman` condenses the [caveman plugin](https://github.com/JuliusBrussee/caveman)'s `SessionStart` instructions into 9 directives, from about 22 across 4,180 characters. The plugin is not installed, so the mode is opt-in: the command carries `disable-model-invocation: true` and costs nothing until it is invoked, and it names the `rules/writing.md` rules it overrides while active. See `docs/research/context/instruction-load.md`.
