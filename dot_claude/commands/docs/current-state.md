---
description: Write docs describing only the current state, no change history.
argument-hint: [path... | topic]
disable-model-invocation: true
---

Input: $ARGUMENTS

Write documentation that describes only how things are now. Do not reference previous state or how anything changed: no "new", "updated", "now", "previously", "used to", "instead of", "no longer", "moved from", "renamed to", and no before/after comparisons or migration notes. A reader who has never seen an earlier version should notice nothing missing.

Keep this rule for the rest of the session. If the input names files, rewrite their prose to follow it now. If the input names a topic, write documentation about it that follows the rule.
