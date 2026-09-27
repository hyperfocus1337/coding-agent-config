---
description: Keep the reader text beside the code, move the mechanism and reasoning to a notes file, and link to it.
argument-hint: <notes-file...> <prose>
disable-model-invocation: true
---

Input: $ARGUMENTS

The input is one or more notes file paths, then prose from a file in this repository. Split the prose into two parts, and state each fact in one part only:

- Reader text stays beside the code: what the reader does with the code, and why the code exists, in the fewest sentences that keep those facts.
- Notes text moves to a notes file: the mechanism, the reasoning, and the measurements.

1. Find the source file: search the repository for a distinctive phrase from the prose. If no file or more than one file contains it, stop and ask which file to use.
2. For each feature the prose describes, pick the notes file whose subject matches it. Get the subject from the headings of the file, or from the file name when the file does not exist. If no notes file matches, stop and ask which file to use.
3. Write the notes text to the chosen notes file, under a heading that names the feature.
4. Replace the prose in the source file with the reader text, and add a link to that heading.
