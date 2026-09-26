---
disable-model-invocation: true
---

# answer slash commands

Seven modes that change how an answer is written, and one command that clears them. Each mode controls one axis of the answer. `thoroughly` and `sourced` also add work: `thoroughly` looks for edge cases and alternatives, and `sourced` reads every file and runs every command it cites. The other modes change only the answer.

| Command              | Axis     | Description                                                                      |
| -------------------- | -------- | -------------------------------------------------------------------------------- |
| `/answer:concisely`  | depth    | The result only: no reasoning, no process, no rejected options.                  |
| `/answer:thoroughly` | depth    | Full depth: the reasoning, the edge cases, and the rejected options.             |
| `/answer:caveman`    | register | Compressed prose: drop articles, filler, and hedging, keep every technical fact. |
| `/answer:simply`     | register | Plain language for a non-expert, every technical fact kept.                      |
| `/answer:stepwise`   | form     | Prerequisites, numbered steps in the order they occur, and a check at the end.   |
| `/answer:tabular`    | form     | Anything that compares items on shared attributes goes in a table.               |
| `/answer:sourced`    | evidence | Every claim points at `file:line`, a command output, or a document.              |
| `/answer:reset`      | -        | Clear every answer mode and return to `rules/writing.md` alone.                  |

## Scope

The argument sets how long a mode applies. `simply` stands for any mode.

| Call                             | Scope                                                                     |
| -------------------------------- | ------------------------------------------------------------------------- |
| `/answer:simply`                 | Rewrite the previous answer in the mode, once.                            |
| `/answer:simply <question>`      | Answer the question in the mode, once.                                    |
| `/answer:simply keep`            | Apply the mode to every response until `/answer:reset` runs.              |
| `/answer:simply keep <question>` | Answer the question in the mode, and apply it to every response after it. |

## Combining modes

Modes on different axes stack. For example, `concisely` and `caveman` together cut both parts of the answer and words inside sentences.

The depth and register axes each hold two opposite modes. The later call replaces the earlier one: for one answer without `keep`, and for every later response with `keep`. No reset is necessary between them.

The two form modes do not conflict. `stepwise` writes a comparison as prose, and `tabular` writes a sequence of steps as prose, so each mode formats only its own content.

## When to use

### `/answer:concisely`

- You read answers between other work and want only the result.
- A long task where you check progress often.

### `/answer:thoroughly`

- Before an action you cannot undo: a history rewrite, a migration, a deletion.
- A decision you must defend to a reviewer. The rejected options are the questions they will ask.
- You want to learn the area, not only get the result.

### `/answer:caveman`

- You want short answers, with every fact, number, and path kept. `concisely` drops parts of the answer, `caveman` drops words. Run both for the shortest answer.
- A long session where reading time adds up.

### `/answer:simply`

- The topic is outside your expertise: an unfamiliar language, tool, or service.
- You will forward the answer to a person who is not a developer.

### `/answer:stepwise`

- You do a procedure by hand: a setup, a migration, a recovery.
- You will copy the answer into a runbook.

### `/answer:tabular`

- A session that is mostly comparisons: libraries, a setting across environments, CLI flags.
- For one answer, run `/answer:tabular <question>`. For text you already have, use `/docs:table`.

### `/answer:sourced`

- You will act on the answer without checking it yourself: an incident, an audit, a security review.
- You suspect that earlier answers were guesses.

### `/answer:reset`

- A mode you started with `keep` no longer fits. A one-off call needs no reset, and a mode on the same axis replaces the active one.

## Background

`/answer:concisely` started from a [Claude Code tip (YouTube Shorts)](https://youtube.com/shorts/I12Mf8KBT1I) that asked for concise answers at the cost of grammar. `/answer:caveman` now does the word-level cut, so `concisely` cuts parts of the answer instead.

`/answer:caveman` condenses the [caveman plugin](https://github.com/JuliusBrussee/caveman)'s `SessionStart` instructions into 9 directives, from about 22 across 4,180 characters. The plugin is not installed, so the mode is opt-in: the command carries `disable-model-invocation: true` and costs nothing until it is invoked, and it names the `rules/writing.md` rules it overrides while active. See `docs/research/context/instruction-load.md`.
