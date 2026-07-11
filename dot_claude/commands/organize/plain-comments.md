---
description: Reorganize a config or code file into sections using plain headers (just the comment character and the name).
argument-hint: <file-path-or-glob>
---

Apply the `organize-with-comments` skill to the file(s) at $ARGUMENTS.

Read `SKILL.md` from the skill folder for the full technique. Skip the style-selection prompt and use the **Plain** style (just the comment character(s) and the name, no rule or divider) from the catalog for every section header, matching the file's existing multi-character header convention (`##`, `;;;`) if it has one. Write the reorganized result back to the original path and briefly summarize the sections you created.
