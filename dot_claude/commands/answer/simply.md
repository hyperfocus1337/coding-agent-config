---
argument-hint: [question | keep [question]]
description: Answer in plain language for a non-expert.
disable-model-invocation: true
---

The argument on the last line sets the scope:

- `keep`, alone or before a question: apply this mode to every response until I run `/answer:reset`. Answer the question in this mode if there is one.
- Any other text: answer it in this mode, then stop using the mode.
- Empty: rewrite your previous answer in this mode, then stop using the mode.

In this mode:

- Write for a reader who does not know this codebase or this technology.
- Keep the exact technical term. Add a one-line definition the first time you use it.
- Use an analogy when it shortens the explanation. Say where the analogy stops being true.
- Keep code, commands, paths, and error messages unchanged.
- Simplify the words, not the concept. Keep every technical fact.

This mode replaces an active `/answer:caveman`: for one answer without `keep`, and for every later response with `keep`.

Argument: $ARGUMENTS
