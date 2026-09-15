---
description: Keep the reader side beside the code, move the mechanism and reasoning to a notes file, and link to it.
argument-hint: <notes-file...> <prose>
disable-model-invocation: true
---

Input: $ARGUMENTS

The input starts with one or more notes file paths, followed by the prose to rewrite. A word is a notes file path when it names a file, whether it exists or not: it contains a `/` or ends in a file extension such as `.md`. The prose starts at the first word that is not a path.

A notes file is a candidate destination for the delegated prose. Pick, per feature, the notes file whose subject matches that feature: read the existing headings when the file exists, and use the file name otherwise. When no notes file matches, stop and ask which file to use.

Rewrite the prose so that what stays beside the code states what the reader does with it and why the code exists, in the fewest sentences that keep those facts. Move the mechanism, the reasoning, and the measurements to the chosen notes file under a heading that names the feature, and link the two. State each fact in one place only.
