---
description: Reorganize a config or code file into sections using full-box headers.
argument-hint: <file-path-or-glob>
---

Apply the `organize-with-comments` skill to the file(s) at $ARGUMENTS.

Read `SKILL.md` from the skill folder for the full technique. Skip the style-selection prompt and use the **Boxed** style (a full box around each name) from the catalog for every section header, falling back to plain ASCII (`+`, `-`, `|`) if the file avoids Unicode. Write the reorganized result back to the original path and briefly summarize the sections you created.
