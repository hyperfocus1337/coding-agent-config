---
description: Reorganize a config or code file into sections using single-line trailing-rule headers.
argument-hint: <file-path-or-glob>
---

Apply the `organize-with-comments` skill to the file(s) at $ARGUMENTS.

Read `SKILL.md` from the skill folder for the full technique. Skip the style-selection prompt and use the **Trailing rule** style (`# ── Section name ──────`, the name flush-left with a box-drawing rule trailing to a fixed width) from the catalog for every section header. Write the reorganized result back to the original path and briefly summarize the sections you created.
