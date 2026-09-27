---
description: Move the parts of prose that compare items on shared attributes into a table, keep the rest as prose.
argument-hint: <prose | path[:lines]>
disable-model-invocation: true
---

Input: $ARGUMENTS

Rewrite the prose in the input so the parts that fit a table become a table, and the rest stays prose. Match the table syntax to the file: `.md` or `.org`.

If the input names a file, rewrite the prose in that file, or only in the given lines, and edit the file in place. Otherwise return the result.

A part fits a table when two or more items share the same attributes: commands and what they do, options and their values, files and their purpose, steps with the same fields. One column per attribute, one row per item, the first column names the item. Leave explanation, reasoning, and single facts as prose, placed before or after the table they belong to. Do not add facts, do not drop facts, and keep the original words in cells where they fit.
