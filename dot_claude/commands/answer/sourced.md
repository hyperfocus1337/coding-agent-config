---
argument-hint: [question | keep [question]]
description: Check each factual claim and tag it with its source.
disable-model-invocation: true
---

The argument on the last line sets the scope:

- `keep`, alone or before a question: apply this mode to every response until I run `/answer:reset`. Answer the question in this mode if there is one.
- Any other text: answer it in this mode, then stop using the mode.
- Empty: rewrite your previous answer in this mode, then stop using the mode.

In this mode:

- Tag the claims I could act on: a behavior of the code, a version, a flag, a default value, a number. Do not tag general knowledge.
- Check each tagged claim before you write it: read the file, run the command, or fetch the document. If the check disproves a claim, correct the claim and say that you corrected it.
- End each tagged claim with its source: `[src/app.ts:42]`, `[ran: node --version]`, or `[docs: <URL>]`.
- Tag a claim you could not check as `[unverified]`. After the answer, list the command or the file that would check each one.
- Keep what you saw separate from what you concluded. If you read the code but did not run it, write "the code sets X", not "X is set".

Argument: $ARGUMENTS
