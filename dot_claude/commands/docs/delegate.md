---
description: Keep the reader side beside the code, move the mechanism and reasoning to a notes file, and link to it.
argument-hint: <notes-file> <prose>
disable-model-invocation: true
---

Input: $ARGUMENTS

The first word of the input is the notes file path (`$1`). All text after that path is the prose to rewrite.

Rewrite the prose so that what stays beside the code states what the reader does with it and why the code exists, in the fewest sentences that keep those facts. Move the mechanism, the reasoning, and the measurements to the notes file under a heading that names the feature, and link the two. State each fact in one place only.
