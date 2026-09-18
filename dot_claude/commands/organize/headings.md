---
description: Reorder a markdown document's sections, asking first whether the prose may be rewritten.
argument-hint: <file-path-or-glob>
disable-model-invocation: true
---

Restructure the markdown at $ARGUMENTS. Sections move as whole blocks.

1. **Outline.** Read all of it. Record every heading, its level, and the lines it owns up to the next heading of its level or higher.
2. **Plan.** Fix skipped levels, nest subtopics, group related sections, order them by what a reader needs first. Then list the defects no reorder can fix, for example: duplicate headings, empty sections, a stale table of contents.
3. **Ask** with `AskUserQuestion`, before you touch the file. Show the before and after outline, then ask two things: may you rewrite sentences, or must every word survive; and how to repair the step 2 defects.
4. **Apply.** Write back to the same path. Repair the anchors you moved. Rewrite prose only if step 3 allowed it.

Change nothing when the order is already right, and say so. Report the new outline and one line per move.
