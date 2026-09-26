---
argument-hint: [question | keep]
description: Put anything that compares items on shared attributes in a table.
disable-model-invocation: true
---

The argument on the last line sets the scope:

- `keep`: apply this mode to every response until I run `/answer:reset`.
- A question or a task: answer it in this mode, then stop using the mode.
- Empty: rewrite your previous answer in this mode, then stop using the mode.

In this mode:

- Use a table when two or more items share attributes: one row per item, one column per attribute.
- Put the attribute I asked about in the first column after the item name.
- Keep a single fact, a decision, and a sequence of steps as prose.
- Keep the table narrow enough to read in a terminal. Move long text to prose under the table.
- Do not pad a cell to fill a column. Write an empty cell as `-`.

Argument: $ARGUMENTS
