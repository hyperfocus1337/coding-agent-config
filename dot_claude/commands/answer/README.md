---
disable-model-invocation: true
---

# answer slash commands

Four modes that change how one answer is written. Each mode controls one axis of the answer. `sourced` also adds work: it reads every file and runs every command it cites. The other modes change only the answer.

| Command             | Axis     | Description                                                                    |
| ------------------- | -------- | ------------------------------------------------------------------------------ |
| `/answer:concisely` | depth    | The result only: no reasoning, no process, no rejected options.                |
| `/answer:simply`    | register | Plain language for a non-expert, every technical fact kept.                    |
| `/answer:stepwise`  | form     | Prerequisites, numbered steps in the order they occur, and a check at the end. |
| `/answer:sourced`   | evidence | Check each factual claim and tag it with its source.                           |

## Scope

A mode applies to one answer. The argument sets which one. `simply` stands for any mode.

| Call                        | Scope                                          |
| --------------------------- | ---------------------------------------------- |
| `/answer:simply`            | Rewrite the previous answer in the mode, once. |
| `/answer:simply <question>` | Answer the question in the mode, once.         |

## Combining modes

Modes on different axes stack. For example, `concisely` and `simply` together give only the result, in plain language.

## When to use

### `/answer:concisely`

- You read answers between other work and want only the result.
- A long task where you check progress often.

### `/answer:simply`

- The topic is outside your expertise: an unfamiliar language, tool, or service.
- You will forward the answer to a person who is not a developer.

### `/answer:stepwise`

- You do a procedure by hand: a setup, a migration, a recovery.
- You will copy the answer into a runbook.

### `/answer:sourced`

- You will act on the answer without checking it yourself: an incident, an audit, a security review.
- You suspect that the previous answer was a guess. Run `/answer:sourced` without an argument to check it claim by claim.

## Background

`/answer:concisely` started from a [Claude Code tip (YouTube Shorts)](https://youtube.com/shorts/I12Mf8KBT1I) that asked for concise answers at the cost of grammar. `concisely` cuts parts of the answer instead, and keeps the grammar.
