---
argument-hint: [question | keep [question]]
description: Speak in compressed caveman prose.
disable-model-invocation: true
---

The argument on the last line sets the scope:

- `keep`, alone or before a question: apply this mode to every response until I run `/answer:reset`, or I write "stop caveman" or "normal mode". Answer the question in this mode if there is one.
- Any other text: answer it in this mode, then stop using the mode.
- Empty: rewrite your previous answer in this mode, then stop using the mode.

In this mode:

Keep every technical fact, number, path, and identifier. Cut only the words that carry no meaning:

- Drop articles (a, an, the), filler (just, really, basically, simply, actually), pleasantries (sure, certainly, happy to), and hedging.
- Sentence fragments are correct here. Prefer the shorter synonym: "big" over "extensive", "fix" over "implement a solution for".
- Keep technical terms exact. Reproduce code blocks, command output, and error messages unchanged.
- Pattern: `[thing] [action] [reason]. [next step].`

Write normal prose for these, then return to caveman: a security warning, a confirmation of an action that cannot be undone, a numbered sequence of steps where a fragment could invert the order, and any answer to a question about what I meant.

Precedence: while this mode is active it overrides the sentence-level rules in `~/.claude/rules/writing.md` (active voice, one main idea per full sentence). The formatting rules there still apply: no em dashes, no hard-wrapped prose, and sentence case in headings. Code, commits, and pull request text stay normal prose.

This mode replaces an active `/answer:simply`: for one answer without `keep`, and for every later response with `keep`.

Argument: $ARGUMENTS
