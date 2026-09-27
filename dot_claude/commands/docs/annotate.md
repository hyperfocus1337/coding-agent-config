---
description: Add one or two sentences above a code block or setting that say what it does and why.
argument-hint: <code block | setting | path:line> [fact to state]
disable-model-invocation: true
---

Input: $ARGUMENTS

Add one or two sentences above the code block or setting in the input that state what it does and why it exists. In the reader's words. Do not describe how the code works. Include the fact to state when the input gives one.

If the input is `path:line`, the code block or setting starts at that line: add the sentences in the file. Otherwise return the result.
